import { useEffect, useRef } from 'react';
import { useDashboardStore } from '@/store/dashboard';
import axios from 'axios';

/**
 * useDevicePolling - Background Polling Hook for Device Metrics
 *
 * WHAT IT DOES:
 * - Runs in background every N milliseconds (default 1 second)
 * - Fetches health and metrics from each registered device
 * - Updates device status (online/offline)
 * - Stores metrics for display in dashboard
 *
 * CALLED BY:
 * - App.tsx on component mount
 * - Runs for lifetime of app (until unmount)
 *
 * FREQUENCY:
 * - Default: 1000ms (1 second)
 * - Can be adjusted via intervalMs parameter
 * - Low overhead: ~200 bytes per device per poll
 *
 * @param intervalMs Poll interval in milliseconds (default: 1000)
 */
export function useDevicePolling(intervalMs: number = 1000) {
  const { devices, updateDevice, updateMetrics } = useDashboardStore();
  const intervalRef = useRef<number>();

  useEffect(() => {
    /**
     * Poll all registered devices
     *
     * FLOW FOR EACH DEVICE:
     * 1. Call /health endpoint
     *    - Get status (healthy, camera_ready, sdk_version)
     *    - Update device as 'online' or 'offline'
     *    - Store camera model and SDK version
     * 2. Call /metrics endpoint
     *    - Get detection counts (Person: 5, Vehicle: 2, etc)
     *    - Calculate latency from round-trip time
     *    - Estimate FPS
     *    - Store in metrics map for charts
     * 3. Handle errors gracefully
     *    - Mark device as offline if unreachable
     *    - Log errors to console
     *    - Continue polling other devices
     */
    const pollDevices = async () => {
      for (const device of devices) {
        try {
          // STEP 1: Get health status
          const healthStartTime = Date.now();
          const healthResponse = await axios.get(`${device.url}/health`, {
            timeout: 2000,  // 2 second timeout
          });
          const healthLatency = Date.now() - healthStartTime;

          if (healthResponse.data) {
            // Device is responding, mark as online
            updateDevice(device.id, {
              status: 'online',
              lastSeen: new Date(),
              model: healthResponse.data.camera_model,
              sdkVersion: healthResponse.data.sdk_version,
            });
            console.log(`[Poll] ${device.id}: online (${healthLatency}ms)`);
          }

          // STEP 2: Get current metrics
          const metricsStartTime = Date.now();
          const metricsResponse = await axios.get(`${device.url}/metrics`, {
            timeout: 2000,
          });
          const metricsLatency = Date.now() - metricsStartTime;

          if (metricsResponse.data) {
            // Extract detection counts from response
            const objects = { ...metricsResponse.data };
            delete objects.timestamp;  // Remove timestamp from counts

            // Update metrics store
            // FPS is estimated at 30 (typical for ZED)
            // Latency is actual round-trip time to device
            updateMetrics(device.id, {
              deviceId: device.id,
              fps: 30,  // TODO: Calculate from ZED camera actual FPS
              latency: metricsLatency,
              objects,  // { "Person": 5, "Vehicle": 2, ... }
              timestamp: new Date(),
            });

            console.log(
              `[Poll] ${device.id}: metrics (${metricsLatency}ms) - ${JSON.stringify(objects)}`
            );
          }
        } catch (error) {
          // Device is offline or unreachable
          updateDevice(device.id, {
            status: 'offline',
            lastSeen: device.lastSeen,  // Keep previous lastSeen
          });

          // Log error but don't throw (continue polling other devices)
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.warn(`[Poll] ${device.id}: offline (${errorMsg})`);
        }
      }
    };

    // Run poll immediately on startup
    pollDevices();

    // Set up recurring poll at specified interval
    intervalRef.current = window.setInterval(pollDevices, intervalMs);

    // Cleanup: stop polling when component unmounts or devices change
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [devices, intervalMs, updateDevice, updateMetrics]);
}

