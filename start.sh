#!/bin/bash

# EdgeVision Nexus - Clean Start Script
# Always cleans up and starts fresh for reliable demos
# No glitches, no leftover state - perfect for presentations!

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

clear
echo ""
echo -e "${BOLD}${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║                                                               ║${NC}"
echo -e "${BOLD}${CYAN}║           EdgeVision Nexus - Fresh Start                      ║${NC}"
echo -e "${BOLD}${CYAN}║           Demo-Ready Clean Startup                            ║${NC}"
echo -e "${BOLD}${CYAN}║                                                               ║${NC}"
echo -e "${BOLD}${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
echo -e "${BLUE}🔍 Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker is not installed${NC}"
    echo "Install from: https://docs.docker.com/get-docker/"
    exit 1
fi
echo -e "${GREEN}✓ Docker found${NC}"

# Check for Docker Compose (v1 or v2)
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
    echo -e "${GREEN}✓ Docker Compose V2 found${NC}"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
    echo -e "${GREEN}✓ Docker Compose V1 found${NC}"
else
    echo -e "${RED}✗ Docker Compose not installed${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}🧹 Cleaning up previous runs...${NC}"

# Stop and remove all containers with volumes
echo "  → Stopping containers..."
$DOCKER_COMPOSE down -v --remove-orphans 2>&1 | grep -v "WARN" || true

# Kill any lingering Python/Node processes (non-Docker)
echo "  → Checking for lingering processes..."
pkill -f "python.*gateway.py" 2>/dev/null || true
pkill -f "python.*zed_app.py" 2>/dev/null || true
pkill -f "npm.*dev" 2>/dev/null || true
pkill -f "node.*vite" 2>/dev/null || true

# Clean up old logs and temp files
echo "  → Cleaning old logs..."
rm -f /tmp/gateway.log /tmp/edge.log /tmp/dashboard.log 2>/dev/null || true
rm -f /tmp/*.pid 2>/dev/null || true

# Clean up docker system (optional - uncomment for deep clean)
# echo "  → Cleaning Docker system..."
# docker system prune -f > /dev/null 2>&1 || true

# Small pause to ensure ports are released
sleep 2

echo -e "${GREEN}✓ Cleanup complete${NC}"

echo ""
echo -e "${BLUE}🔨 Building and starting services...${NC}"

# Build with progress output
$DOCKER_COMPOSE build --no-cache 2>&1 | while read line; do
    # Filter out verbose build output, show only important lines
    if echo "$line" | grep -qE "Building|Sending|exporting|naming|Step|RUN|COPY|FROM"; then
        echo "  $line" | head -c 100
    fi
done

echo ""
echo -e "${BLUE}🚀 Starting containers...${NC}"
$DOCKER_COMPOSE up -d

echo ""
echo -e "${BLUE}⏳ Waiting for services to initialize...${NC}"

# Wait for services with better feedback
max_wait=60
waited=0

# Function to check service
check_service() {
    local url=$1
    local name=$2
    local port=$3
    
    echo -n "  → Waiting for $name (port $port)..."
    
    for i in {1..30}; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            echo -e " ${GREEN}✓${NC}"
            return 0
        fi
        echo -n "."
        sleep 2
    done
    
    echo -e " ${YELLOW}⚠ Still starting${NC}"
    return 1
}

# Check each service
gateway_ok=false
edge_ok=false
dashboard_ok=false

check_service "http://localhost:8000/health" "API Gateway" "8000" && gateway_ok=true
check_service "http://localhost:5000/health" "Edge Node" "5000" && edge_ok=true
check_service "http://localhost:3000" "Dashboard" "3000" && dashboard_ok=true

echo ""
echo "=========================================="

# Show final status
if [ "$gateway_ok" = true ] && [ "$edge_ok" = true ] && [ "$dashboard_ok" = true ]; then
    echo -e "${GREEN}✅ All services running successfully!${NC}"
else
    echo -e "${YELLOW}⚠️  Some services still starting...${NC}"
    echo ""
    echo "Check status with:"
    echo "  $DOCKER_COMPOSE ps"
    echo "  $DOCKER_COMPOSE logs -f"
fi

echo "=========================================="
echo ""
echo -e "${BLUE}📊 Service URLs:${NC}"
echo "  Dashboard:    http://localhost:3000"
echo "  API Gateway:  http://localhost:8000"
echo "  Edge Node:    http://localhost:5000"
echo ""
echo -e "${BLUE}🔧 Useful commands:${NC}"
echo "  View logs:     $DOCKER_COMPOSE logs -f"
echo "  View logs (service): $DOCKER_COMPOSE logs -f [gateway|edge|dashboard]"
echo "  Stop all:      $DOCKER_COMPOSE down"
echo "  Restart:       ./start.sh"
echo "  Check status:  $DOCKER_COMPOSE ps"
echo ""
echo -e "${BLUE}📱 Container Status:${NC}"
$DOCKER_COMPOSE ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""

# Show any Tailscale devices if available
echo -e "${BLUE}🌐 Configuring Tailscale integration...${NC}"

# Read Tailscale config from .env
if [ -f ".env" ]; then
    TAILSCALE_API_KEY=$(grep "^APIKey=" .env | cut -d'=' -f2)
    TAILSCALE_TAILNET=$(grep "^TailnetID=" .env | cut -d'=' -f2)
    
    if [ -n "$TAILSCALE_API_KEY" ] && [ -n "$TAILSCALE_TAILNET" ]; then
        # Configure Tailscale via API
        curl -s -X POST http://localhost:8000/api/tailscale/config \
            -H "Content-Type: application/json" \
            -d "{\"api_key\": \"$TAILSCALE_API_KEY\", \"tailnet\": \"$TAILSCALE_TAILNET\"}" \
            > /dev/null 2>&1
        
        sleep 1
        
        # Check if devices are available
        device_response=$(curl -s http://localhost:8000/api/tailscale/devices 2>/dev/null)
        if echo "$device_response" | grep -q '"status":"success"'; then
            device_count=$(echo "$device_response" | grep -o '"name"' | wc -l)
            echo -e "${GREEN}✓ Tailscale configured: $device_count devices available${NC}"
        else
            echo -e "${YELLOW}⚠ Tailscale configured but no devices found${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ Tailscale API keys not found in .env${NC}"
        echo "  Add APIKey and TailnetID to .env to enable remote device management"
    fi
else
    echo -e "${YELLOW}⚠ .env file not found${NC}"
fi

echo ""
echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║                                                               ║${NC}"
echo -e "${BOLD}${GREEN}║     🎉 EdgeVision Nexus is Ready for Demo! 🎉                ║${NC}"
echo -e "${BOLD}${GREEN}║                                                               ║${NC}"
echo -e "${BOLD}${GREEN}║     👉 Open http://localhost:3000 in your browser            ║${NC}"
echo -e "${BOLD}${GREEN}║                                                               ║${NC}"
echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}💡 Tip: Run ${BOLD}./start.sh${NC}${CYAN} again anytime for a fresh restart${NC}"
echo ""
