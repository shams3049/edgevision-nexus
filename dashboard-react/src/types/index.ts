export interface Device {
  id: string;
  name: string;
  url: string;
  status: 'online' | 'offline' | 'connecting';
  lastSeen: Date;
  model?: string;
  sdkVersion?: string;
  location?: string;
  resolution?: string;
  serialNumber?: string;
}

export interface ObjectDetection {
  [key: string]: number | string | undefined;
  timestamp?: string;
}

export interface DeviceMetrics {
  deviceId: string;
  fps: number;
  latency: number;
  objects: ObjectDetection;
  timestamp: Date;
}

export interface HistoricalData {
  timestamp: Date;
  deviceId: string;
  fps: number;
  latency: number;
  objects: ObjectDetection;
}

export interface DeviceHealth {
  status: string;
  camera_ready: boolean;
  sdk_version?: string;
}

export interface EdgeNodeMetrics {
  cpuUsage: number;
  cpuTemp?: number;
  memoryUsage: number;
  memoryTotal: number;
  diskUsage: number;
  diskTotal: number;
  networkTx: number;
  networkRx: number;
  uptime: number;
  timestamp: Date;
}

export interface EdgeNodeInfo {
  hostname: string;
  platform: string;
  arch: string;
  cores: number;
  nodeVersion: string;
  pythonVersion?: string;
}

export type ViewMode = 'overview' | 'camera-detail' | 'deployments';

// Deployment types (Phase 3)
export interface Deployment {
  id: string;
  deviceId: string;
  deviceName: string;
  appType: 'zed' | 'yolo' | 'custom';
  appUrl: string;
  status: 'pending' | 'accepted' | 'running' | 'success' | 'error';
  executionId: string;
  createdAt: string;
  updatedAt: string;
  output?: string;
  error?: string;
  progress?: number;
}

export interface DeploymentRequest {
  appType: 'zed' | 'yolo' | 'custom';
  appUrl: string;
  config?: Record<string, any>;
}

export interface DeploymentStatus {
  executionId: string;
  status: 'pending' | 'running' | 'success' | 'error';
  output?: string;
  error?: string;
  progress?: number;
}
