import { useEffect, useState } from 'react';
import { useDevicePolling } from '@/hooks/useDevicePolling';
import { useDashboardStore } from '@/store/dashboard';
import { Device, HistoricalData } from '@/types';
import { CameraOverview } from '@/components/CameraOverview';
import { CameraDetailView } from '@/components/CameraDetailView';
import { EdgeNodeMonitor } from '@/components/EdgeNodeMonitor';
import { DeploymentManager } from '@/components/DeploymentManager';
import { AddCameraModal } from '@/components/AddCameraModal';
import { MetricsOverview } from '@/components/MetricsOverview';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Camera, Activity, Rocket } from 'lucide-react';

/**
 * EdgeVision Nexus Dashboard - Main Application Component
 *
 * ARCHITECTURE:
 * - Uses Zustand for global state (devices, metrics, history)
 * - Uses custom useDevicePolling hook for background metric collection
 * - Renders tab-based UI with camera overview and detail views
 *
 * LIFECYCLE:
 * 1. On mount: Load stored devices, initialize default device
 * 2. Start polling: Background thread fetches metrics every 1s
 * 3. Render: Display cameras, metrics, and detail views
 * 4. On unmount: Stop polling, cleanup
 */
function App() {
  // Access dashboard state
  const { loadFromStorage, initializeDefaultDevice, devices, metrics, history } =
    useDashboardStore();

  // Local UI state
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [isAddCameraModalOpen, setIsAddCameraModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('cameras');

  // ============================================================================
  // INITIALIZATION EFFECTS
  // ============================================================================

  useEffect(() => {
    /**
     * Initialize dashboard on first mount
     *
     * STEPS:
     * 1. Load previously saved devices from localStorage
     * 2. If no devices exist, add the default ZED camera
     *
     * This allows:
     * - First-time users to see a working demo immediately
     * - Returning users to see their previous configuration
     */
    loadFromStorage();
    initializeDefaultDevice();
  }, [loadFromStorage, initializeDefaultDevice]);

  /**
   * Start background polling for device metrics
   *
   * The hook automatically:
   * - Fetches health status from each device every 1 second
   * - Fetches current metrics (detection counts, FPS, latency)
   * - Updates device online/offline status
   * - Stores metrics for charts and displays
   *
   * Hook stops on unmount and when devices change.
   */
  useDevicePolling(1000);

  // ============================================================================
  // DERIVED STATE - Get Data for Selected Camera
  // ============================================================================

  /**
   * If a camera is selected, get its data:
   * - Device metadata (name, URL, status)
   * - Latest metrics (detections, FPS, latency)
   * - Historical data (for trend charts)
   */
  const selectedDevice = selectedCameraId
    ? devices.find((d: Device) => d.id === selectedCameraId)
    : null;
  const selectedMetrics = selectedCameraId ? metrics.get(selectedCameraId) : undefined;
  const selectedHistory = selectedCameraId
    ? history.filter((h: HistoricalData) => h.deviceId === selectedCameraId)
    : [];

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-background">
      {/* ====== HEADER ====== */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
              <Camera className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">EdgeVision Nexus</h1>
              <p className="text-sm text-muted-foreground">
                Production-grade edge surveillance & analytics platform
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ====== MAIN CONTENT ====== */}
      <main className="container mx-auto px-6 py-6">
        {selectedDevice ? (
          /**
           * DETAIL VIEW - Show single camera with full information
           *
           * When user clicks on a camera card, show:
           * - Full live video stream
           * - Detailed metrics (FPS, latency, specific detections)
           * - Historical charts (trends over time)
           * - Back button to return to overview
           */
          <CameraDetailView
            device={selectedDevice}
            metrics={selectedMetrics}
            history={selectedHistory}
            onBack={() => setSelectedCameraId(null)}
          />
        ) : (
          /**
           * OVERVIEW VIEW - Show all cameras and dashboard
           *
           * Displays:
           * - Quick stats cards (total cameras, average FPS, etc)
           * - Tabbed interface for different views:
           *   * Cameras: Grid of camera cards
           *   * Edge Node: System metrics from main node
           *   * Deployments: Multi-device management
           */
          <div className="space-y-6">
            {/* Quick Stats */}
            <MetricsOverview />

            {/* Tabbed Content */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="cameras">
                  <Camera className="h-4 w-4 mr-2" />
                  Cameras
                </TabsTrigger>
                <TabsTrigger value="edge-node">
                  <Activity className="h-4 w-4 mr-2" />
                  Edge Node
                </TabsTrigger>
                <TabsTrigger value="deployments">
                  <Rocket className="h-4 w-4 mr-2" />
                  Deployments
                </TabsTrigger>
              </TabsList>

              {/* CAMERAS TAB - Grid of camera cards with add button */}
              <TabsContent value="cameras" className="mt-6">
                <CameraOverview
                  onCameraClick={setSelectedCameraId}
                  onAddCamera={() => setIsAddCameraModalOpen(true)}
                />
              </TabsContent>

              {/* EDGE NODE TAB - System-level metrics from gateway */}
              <TabsContent value="edge-node" className="mt-6">
                <EdgeNodeMonitor />
              </TabsContent>

              {/* DEPLOYMENTS TAB - Multi-device management and deployment status */}
              <TabsContent value="deployments" className="mt-6">
                <DeploymentManager />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>

      {/* ====== ADD CAMERA MODAL ====== */}
      {/**
       * Modal Dialog for Adding New Devices
       *
       * Opens when user clicks "Add Device" button.
       * User enters:
       * - Device ID (unique identifier)
       * - Device Name (display name)
       * - Device URL (IP:port where device is running)
       *
       * On submit:
       * - Device is added to store
       * - Automatically saved to localStorage
       * - Polling hook starts fetching metrics from it
       * - Device appears in dashboard
       */}
      <AddCameraModal
        open={isAddCameraModalOpen}
        onOpenChange={setIsAddCameraModalOpen}
      />
    </div>
  );
}

export default App;
