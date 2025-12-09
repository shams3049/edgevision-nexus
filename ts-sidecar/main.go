package main

import (
    "context"
    "encoding/json"
    "fmt"
    "log"
    "net"
    "net/http"
    "os"
    "os/exec"
    "strings"
    "sync"
    "time"

    "tailscale.com/tsnet"
)

type healthResponse struct {
    Status   string `json:"status"`
    Version  string `json:"version"`
    TSNet    bool   `json:"tsnet_ready"`
    Message  string `json:"message"`
    Time     string `json:"time"`
}

type execRequest struct {
    DeviceID  string   `json:"device_id"`
    Command   []string `json:"command"`
    AppType   string   `json:"app_type,omitempty"`
    AppURL    string   `json:"app_url,omitempty"`
}

type execResponse struct {
    ExecutionID string `json:"execution_id"`
    Status      string `json:"status"`
    Message     string `json:"message"`
    Output      string `json:"output,omitempty"`
    Error       string `json:"error,omitempty"`
}

type deployStatusResponse struct {
    ExecutionID string `json:"execution_id"`
    Status      string `json:"status"`
    Message     string `json:"message"`
    Output      string `json:"output,omitempty"`
    Error       string `json:"error,omitempty"`
}

type execRecord struct {
    Status string
    Output string
    Error  string
}

var (
    tsServer *tsnet.Server
    execStore = struct {
        sync.Mutex
        data map[string]execRecord
    }{data: make(map[string]execRecord)}
)

func healthHandler(w http.ResponseWriter, r *http.Request) {
    ready := tsServer != nil
    writeJSON(w, http.StatusOK, healthResponse{
        Status:  "ok",
        Version: "0.1.0",
        TSNet:   ready,
        Message: "Sidecar running",
        Time:    time.Now().UTC().Format(time.RFC3339),
    })
}

func execHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
        return
    }

    var req execRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid JSON", http.StatusBadRequest)
        return
    }

    if req.DeviceID == "" {
        http.Error(w, "device_id is required", http.StatusBadRequest)
        return
    }

    // Support deployment (app_type + app_url) or direct command
    var command []string
    if req.AppType != "" && req.AppURL != "" {
        command = buildDeployCommand(req.AppType, req.AppURL)
    } else if len(req.Command) > 0 {
        command = req.Command
    } else {
        http.Error(w, "either (app_type + app_url) or command array is required", http.StatusBadRequest)
        return
    }

    execID := fmt.Sprintf("exec-%s-%d", req.DeviceID, time.Now().UnixNano())

    // Store as pending
    recordExec(execID, execRecord{Status: "pending"})

    go func() {
        output, err := runSSHCommand(req.DeviceID, command)
        if err != nil {
            recordExec(execID, execRecord{Status: "error", Error: err.Error(), Output: output})
            return
        }
        recordExec(execID, execRecord{Status: "success", Output: output})
    }()

    writeJSON(w, http.StatusAccepted, execResponse{
        ExecutionID: execID,
        Status:      "accepted",
        Message:     "Command dispatched",
    })
}

func deployStatusHandler(w http.ResponseWriter, r *http.Request) {
    // Stubbed deployment status
    execID := r.URL.Query().Get("id")
    if execID == "" {
        http.Error(w, "execution id required (query param id)", http.StatusBadRequest)
        return
    }
    record, ok := loadExec(execID)
    if !ok {
        http.Error(w, "execution id not found", http.StatusNotFound)
        return
    }

    writeJSON(w, http.StatusOK, deployStatusResponse{
        ExecutionID: execID,
        Status:      record.Status,
        Message:     "ok",
        Output:      record.Output,
        Error:       record.Error,
    })
}

// SSH execution via direct TCP connection through Tailscale network
func runSSHCommand(deviceID string, command []string) (string, error) {
    if len(command) == 0 {
        return "", fmt.Errorf("no command provided")
    }

    // Ensure tsnet is ready
    if tsServer == nil {
        return "", fmt.Errorf("tsnet not initialized")
    }

    target := deviceID
    user := "root"
    
    // Build the deploy command to run on remote
    var remoteCmd string
    if len(command) >= 3 && command[0] == "deploy" {
        appType := command[1]
        appURL := command[2]
        remoteCmd = fmt.Sprintf(
            "docker pull %s && docker run -d --name %s-instance --restart=unless-stopped %s",
            appURL, appType, appURL,
        )
    } else {
        // Fallback
        remoteCmd = "echo 'deployment command not recognized'"
    }
    
    ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
    defer cancel()
    
    // Try to connect to target via TCP (SSH port 22) to verify Tailscale connectivity
    log.Printf("[sidecar] Testing connectivity to %s:22...", target)
    conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:22", target), 20*time.Second)
    if err != nil {
        log.Printf("[sidecar] Direct TCP connection to %s failed: %v", target, err)
        // Fallback to system SSH command anyway
        return fallbackSSH(ctx, target, user, remoteCmd)
    }
    defer conn.Close()
    
    // TCP connection successful! Now use system SSH since network is reachable
    log.Printf("[sidecar] TCP connection to %s successful, attempting SSH...", target)
    return fallbackSSH(ctx, target, user, remoteCmd)
}

func fallbackSSH(ctx context.Context, target, user, cmd string) (string, error) {
    // First try system SSH with Tailscale (simpler, may respect ACLs better)
    log.Printf("[sidecar] Attempting system SSH to %s@%s: %s", user, target, cmd)
    
    sshArgs := []string{
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "ConnectTimeout=25",
        "-o", "ServerAliveInterval=10",
        "-o", "BatchMode=yes",
        fmt.Sprintf("%s@%s", user, target),
        cmd,
    }
    
    execCmd := exec.CommandContext(ctx, "ssh", sshArgs...)
    out, err := execCmd.CombinedOutput()
    outputStr := string(out)
    
    // If succeeded, return
    if err == nil {
        log.Printf("[sidecar] SSH completed successfully: %s", outputStr)
        return outputStr, nil
    }
    
    // If SSH failed with ACL error, try tailscale ssh (no args support, just host and command)
    if strings.Contains(outputStr, "policy does not permit") {
        log.Printf("[sidecar] SSH blocked by policy, trying tailscale ssh instead")
        // tailscale ssh doesn't support -o flags, so call it directly
        tsArgs := []string{
            fmt.Sprintf("%s@%s", user, target),
            cmd,
        }
        execCmd = exec.CommandContext(ctx, "tailscale", append([]string{"ssh"}, tsArgs...)...)
        out, err = execCmd.CombinedOutput()
        outputStr = string(out)
        log.Printf("[sidecar] Tailscale SSH completed with status: %v, output: %s", err, outputStr)
        return outputStr, err
    }
    
    log.Printf("[sidecar] SSH completed with status: %v, output: %s", err, outputStr)
    return outputStr, err
}

// Build Docker deploy command string
func buildDeployCommandString(command []string) string {
    if len(command) == 0 {
        return ""
    }
    // For deploy commands, assume format: ["deploy", "zed", "dummy-zed:latest"]
    if len(command) >= 3 && command[0] == "deploy" {
        appType := command[1]
        appURL := command[2]
        // Build Docker deploy command
        return fmt.Sprintf(
            "docker pull %s && docker run -d --name %s-instance --restart=unless-stopped %s",
            appURL,
            appType,
            appURL,
        )
    }
    // Fallback: shouldn't reach here for normal deployments
    return "echo 'command conversion failed'"
}

// Build Docker deploy command based on app_type and app_url
func buildDeployCommand(appType, appURL string) []string {
    // e.g., docker pull docker.io/namespace/app:latest && docker run -d --name app-instance docker.io/namespace/app:latest
    return []string{
        "/bin/sh", "-c",
        fmt.Sprintf(
            "docker pull %s && docker run -d --name %s-instance --restart=unless-stopped %s",
            appURL,
            appType,
            appURL,
        ),
    }
}


func recordExec(id string, rec execRecord) {
    execStore.Lock()
    defer execStore.Unlock()
    execStore.data[id] = rec
}

func loadExec(id string) (execRecord, bool) {
    execStore.Lock()
    defer execStore.Unlock()
    rec, ok := execStore.data[id]
    return rec, ok
}

func writeJSON(w http.ResponseWriter, status int, v any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    _ = json.NewEncoder(w).Encode(v)
}

func initTSNet() error {
    authKey := os.Getenv("TS_AUTHKEY")
    if authKey == "" {
        return fmt.Errorf("TS_AUTHKEY not set")
    }
    tsServer = &tsnet.Server{
        Hostname: "ts-sidecar",
        Dir:      "/tmp/tsnet-sidecar",
        AuthKey:  authKey,
    }
    _, err := tsServer.Up(context.Background())
    if err != nil {
        return fmt.Errorf("tsnet up failed: %w", err)
    }
    log.Printf("[sidecar] tsnet initialized successfully")
    return nil
}

func main() {
    // Initialize tsnet on startup
    if err := initTSNet(); err != nil {
        log.Printf("[sidecar] tsnet init warning: %v (will retry on exec)", err)
    }

    mux := http.NewServeMux()
    mux.HandleFunc("/health", healthHandler)
    mux.HandleFunc("/ssh/exec", execHandler)
    mux.HandleFunc("/deployments/status", deployStatusHandler)
    mux.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
        writeJSON(w, http.StatusOK, map[string]any{
            "status": "pending",
            "message": "Metrics not implemented yet",
            "timestamp": time.Now().UTC().Format(time.RFC3339),
        })
    })

    port := os.Getenv("SIDECAR_PORT")
    if port == "" {
        port = "9000"
    }

    addr := ":" + port
    log.Printf("[sidecar] starting on %s", addr)
    if err := http.ListenAndServe(addr, mux); err != nil {
        log.Fatalf("server error: %v", err)
    }
}
