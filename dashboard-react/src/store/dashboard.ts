import { create, StateCreator } from 'zustand';
import { Device, DeviceMetrics, HistoricalData, EdgeNodeMetrics } from '@/types';

/**
 * DashboardStore - Central state management for EdgeVision Nexus Dashboard
 * 
 * RESPONSIBILITIES:
 * - Manage device list (add, remove, update)
 * - Track metrics for each device
 * - Maintain historical data for charts
 * - Persist device list to localStorage
 * - Normalize device URLs for browser access
 */
interface DashboardStore {
  // Device and metrics state
  devices: Device[];
  metrics: Map<string, DeviceMetrics>;  // deviceId -> latest metrics
  history: HistoricalData[];             // All historical metric points
  selectedDevices: string[];             // Currently selected devices
  maxHistoryPoints: number;              // Max points to keep (~100 = ~1.5 min at 1Hz)
  edgeNodeMetrics: EdgeNodeMetrics | null;

  // Device management actions
  addDevice: (device: Device) => void;
  removeDevice: (deviceId: string) => void;
  updateDevice: (deviceId: string, updates: Partial<Device>) => void;

  // Metrics and history actions
  updateMetrics: (deviceId: string, metrics: DeviceMetrics) => void;
  clearHistory: () => void;

  // Selection and initialization
  toggleDeviceSelection: (deviceId: string) => void;
  initializeDefaultDevice: () => void;

  // Persistence actions
  loadFromStorage: () => void;
  saveToStorage: () => void;

  // Edge node monitoring
  updateEdgeNodeMetrics: (metrics: EdgeNodeMetrics) => void;
}

/**
 * Default Device Configuration
 * 
 * This is the auto-added device when dashboard loads for first time.
 * It assumes a local ZED camera running on localhost:5000
 * Users can add more devices via the "Add Device" button.
 */
const DEFAULT_DEVICE: Device = {
  id: 'zed-camera-1',
  name: 'ZED 2i Camera',
  // localhost:5000 = the default edge node when running locally with docker-compose
  url: 'http://localhost:5000',
  status: 'connecting',
  lastSeen: new Date(),
};

/**
 * Normalize Device URLs
 * 
 * PROBLEM:
 * When docker-compose is used, device URL might be stored as:
 *   "http://zed_cv_edge_1:5000" (container hostname)
 * But browser can't resolve container hostnames, so it fails.
 * 
 * SOLUTION:
 * This function detects container hostnames and replaces them with
 * localhost:5000 (or the current window hostname for remote setups)
 * 
 * @param url Device API URL from storage or input
 * @returns Browser-accessible URL
 */
const normalizeDeviceUrl = (url: string): string => {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    // If URL contains container hostname, replace with localhost
    if (parsed.hostname.includes('zed_cv_edge')) {
      parsed.hostname = window.location.hostname || 'localhost';
      parsed.port = '5000';
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url;  // Return as-is if URL parsing fails
  }
};

// LocalStorage key for persisting device list
const STORAGE_KEY = 'zed-dashboard-devices';

// Zustand type helpers for better TypeScript support
type DashboardSet = (
  partial:
    | DashboardStore
    | Partial<DashboardStore>
    | ((state: DashboardStore) => DashboardStore | Partial<DashboardStore>),
  replace?: boolean
) => void;

type DashboardGet = () => DashboardStore;

/**
 * Zustand Store Creator
 * 
 * Defines all state and actions for the dashboard.
 * Zustand handles reactive updates and triggers React re-renders.
 */
const dashboardCreator: StateCreator<DashboardStore, [], [], DashboardStore> = (
  set: DashboardSet,
  get: DashboardGet
) => ({
  // Initial state
  devices: [],
  metrics: new Map(),
  history: [],
  selectedDevices: [],
  maxHistoryPoints: 100,  // ~1.5 minutes of history at 1Hz polling
  edgeNodeMetrics: null,

  // ============================================================================
  // PERSISTENCE ACTIONS - Save/Load from Browser LocalStorage
  // ============================================================================

  loadFromStorage: () => {
    /**
     * Load device list from browser storage.
     * 
     * Called on app startup to restore previously configured devices.
     * If storage is empty or corrupted, this is a no-op (empty device list).
     */
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        // Normalize all device URLs to ensure browser compatibility
        const migratedDevices: Device[] = (data.devices as Device[]).map((d: Device) => ({
          ...d,
          url: normalizeDeviceUrl(d.url),
          lastSeen: new Date(d.lastSeen),  // Convert string back to Date
        }));

        set({
          devices: migratedDevices,
          selectedDevices: data.selectedDevices || migratedDevices.map((d) => d.id),
        });
        console.log(`[Dashboard] Loaded ${migratedDevices.length} devices from storage`);
      }
    } catch (error) {
      console.error('[Dashboard] Failed to load from storage:', error);
      // Continue without persisted devices - start fresh
    }
  },

  saveToStorage: () => {
    /**
     * Save device list to browser storage.
     * 
     * Called after any device add/remove/update.
     * Only saves device list and selection, not metrics (too large).
     * Metrics are ephemeral and recalculated on reload.
     */
    try {
      const state = get();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          devices: state.devices,
          selectedDevices: state.selectedDevices,
        })
      );
      console.log(`[Dashboard] Saved ${state.devices.length} devices to storage`);
    } catch (error) {
      console.error('[Dashboard] Failed to save to storage:', error);
    }
  },

  // ============================================================================
  // DEVICE MANAGEMENT ACTIONS
  // ============================================================================

  initializeDefaultDevice: () => {
    /**
     * Add default device on first load.
     * 
     * If no devices are configured, adds a default ZED camera at localhost:5000.
     * This allows first-time users to see the dashboard working immediately.
     * Users can delete this and add their own devices.
     */
    const state = get();
    if (state.devices.length === 0) {
      state.addDevice(DEFAULT_DEVICE);
      console.log('[Dashboard] Initialized with default device');
    }
  },

  addDevice: (device: Device) => {
    /**
     * Register a new edge device.
     * 
     * FLOW:
     * 1. Normalize device URL (fix container hostnames)
     * 2. Check for duplicates
     * 3. Add to device list
     * 4. Add to selected devices
     * 5. Save to storage
     * 
     * The device will appear in the dashboard immediately.
     * Its status will update after first health check from polling hook.
     */
    set((state: DashboardStore) => {
      const normalized = {
        ...device,
        url: normalizeDeviceUrl(device.url),
      };

      // Prevent duplicate devices with same ID
      if (state.devices.some((d: Device) => d.id === normalized.id)) {
        console.warn(`[Dashboard] Device ${normalized.id} already exists, skipping`);
        return state;
      }

      const updatedDevices = [...state.devices, normalized];
      const updatedState = {
        devices: updatedDevices,
        selectedDevices: [...state.selectedDevices, normalized.id],
      };

      // Async save to storage (doesn't block state update)
      setTimeout(() => get().saveToStorage(), 0);
      console.log(`[Dashboard] Added device: ${normalized.id}`);
      return updatedState;
    });
  },

  removeDevice: (deviceId: string) => {
    /**
     * Deregister and remove an edge device.
     * 
     * Removes:
     * - Device from device list
     * - All metrics for this device
     * - All historical data for this device
     * - From selected devices
     * 
     * Saves changes to storage.
     */
    set((state: DashboardStore) => {
      const updatedState = {
        devices: state.devices.filter((d: Device) => d.id !== deviceId),
        selectedDevices: state.selectedDevices.filter((id: string) => id !== deviceId),
        metrics: new Map<string, DeviceMetrics>(
          Array.from(state.metrics.entries()).filter(
            ([id]: [string, DeviceMetrics]) => id !== deviceId
          )
        ),
        history: state.history.filter((h: HistoricalData) => h.deviceId !== deviceId),
      };

      setTimeout(() => get().saveToStorage(), 0);
      console.log(`[Dashboard] Removed device: ${deviceId}`);
      return updatedState;
    });
  },

  updateDevice: (deviceId: string, updates: Partial<Device>) => {
    /**
     * Update device metadata.
     * 
     * Used for:
     * - Updating device status (online/offline/connecting)
     * - Updating lastSeen timestamp
     * - Storing camera info (model, SDK version)
     * 
     * Saves changes to storage after update.
     */
    set((state: DashboardStore) => {
      const updatedState = {
        devices: state.devices.map((d: Device) =>
          d.id === deviceId ? { ...d, ...updates } : d
        ),
      };
      setTimeout(() => get().saveToStorage(), 0);
      return updatedState;
    });
  },

  // ============================================================================
  // METRICS AND HISTORY ACTIONS
  // ============================================================================

  updateMetrics: (deviceId: string, metrics: DeviceMetrics) => {
    /**
     * Store latest metrics for a device.
     * 
     * Called once per second by the polling hook.
     * Updates:
     * - Latest metrics (for gauge display)
     * - Historical data (for line charts)
     * 
     * Keeps only last 100 points (~1.5 minutes at 1Hz).
     * Older points are discarded to manage memory.
     */
    set((state: DashboardStore) => {
      const newMetrics = new Map(state.metrics);
      newMetrics.set(deviceId, metrics);

      // Add to history and keep only last maxHistoryPoints
      const newHistory = [
        ...state.history,
        {
          timestamp: metrics.timestamp,
          deviceId: metrics.deviceId,
          fps: metrics.fps,
          latency: metrics.latency,
          objects: metrics.objects,
        },
      ].slice(-state.maxHistoryPoints);

      return {
        metrics: newMetrics,
        history: newHistory,
      };
    });
  },

  clearHistory: () => {
    /**
     * Clear all historical data.
     * 
     * Used when resetting charts or freeing memory.
     * Latest metrics are kept (only history is cleared).
     */
    set({ history: [] });
  },

  // ============================================================================
  // SELECTION ACTIONS
  // ============================================================================

  toggleDeviceSelection: (deviceId: string) => {
    /**
     * Toggle device selection state.
     * 
     * Used for:
     * - Multi-select in camera list
     * - Showing/hiding device in dashboard
     * 
     * Saves to storage so selection persists across reloads.
     */
    set((state: DashboardStore) => {
      const updatedState = {
        selectedDevices: state.selectedDevices.includes(deviceId)
          ? state.selectedDevices.filter((id: string) => id !== deviceId)
          : [...state.selectedDevices, deviceId],
      };
      setTimeout(() => get().saveToStorage(), 0);
      return updatedState;
    });
  },

  // ============================================================================
  // EDGE NODE MONITORING
  // ============================================================================

  updateEdgeNodeMetrics: (metrics: EdgeNodeMetrics) => {
    /**
     * Update system-level metrics from edge node.
     * 
     * Used for:
     * - CPU/Memory/Disk usage display
     * - Temperature monitoring
     * - Uptime tracking
     * 
     * Separate from device metrics (these are system-wide).
     */
    set({ edgeNodeMetrics: metrics });
  },
});

/**
 * Dashboard Store Hook
 * 
 * Usage:
 * const { devices, addDevice, updateMetrics } = useDashboardStore();
 * 
 * This is the main hook for all dashboard state access.
 */
export const useDashboardStore = create<DashboardStore>(dashboardCreator);
