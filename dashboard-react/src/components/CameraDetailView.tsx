import { Device, DeviceMetrics, HistoricalData } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Camera, Activity, Clock, AlertCircle, Video, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface CameraDetailViewProps {
  device: Device;
  metrics?: DeviceMetrics;
  history: HistoricalData[];
  onBack: () => void;
}

export function CameraDetailView({ device, metrics, history, onBack }: CameraDetailViewProps) {
  const statusColor = {
    online: 'bg-green-500',
    offline: 'bg-red-500',
    connecting: 'bg-yellow-500',
  }[device.status];

  const statusText = {
    online: 'Online',
    offline: 'Offline',
    connecting: 'Connecting',
  }[device.status];

  const totalDetections = metrics
    ? Object.entries(metrics.objects)
        .filter(([key]) => key !== 'timestamp')
        .reduce((sum, [, v]) => sum + (typeof v === 'number' ? v : 0), 0)
    : 0;

  // Prepare chart data
  const chartData = history.map((h) => ({
    time: new Date(h.timestamp).toLocaleTimeString(),
    fps: h.fps,
    latency: h.latency,
  }));

  const objectTypes = metrics
    ? Object.entries(metrics.objects)
        .filter(([key]) => key !== 'timestamp' && typeof metrics.objects[key] === 'number')
        .map(([key, value]) => ({ type: key, count: value as number }))
    : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Overview
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Camera className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-2xl font-bold">{device.name}</h2>
              <p className="text-sm text-muted-foreground">{device.location || device.id}</p>
            </div>
            <Badge variant="secondary" className={`${statusColor} text-white border-0 ml-auto`}>
              {statusText}
            </Badge>
          </div>
        </div>
      </div>

      {/* Live Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Live Feed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="aspect-video rounded-lg overflow-hidden bg-black border border-border">
            {device.status === 'online' ? (
              <img
                src={`${device.url}/video_feed`}
                alt={`${device.name} feed`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                {device.status === 'connecting' ? 'Connecting...' : 'Camera Offline'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Metrics Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Activity className="h-4 w-4" />
              Frame Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics ? (
              <div className="text-2xl font-bold text-green-500">
                {metrics.fps.toFixed(1)} <span className="text-sm text-muted-foreground">FPS</span>
              </div>
            ) : (
              <Skeleton className="h-8 w-20" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              Latency
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics ? (
              <div className="text-2xl font-bold text-blue-500">
                {metrics.latency.toFixed(0)} <span className="text-sm text-muted-foreground">ms</span>
              </div>
            ) : (
              <Skeleton className="h-8 w-20" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              Detections
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics ? (
              <div className="text-2xl font-bold text-purple-500">{totalDetections}</div>
            ) : (
              <Skeleton className="h-8 w-20" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Info className="h-4 w-4" />
              Model
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{device.model || 'ZED Camera'}</div>
            <p className="text-xs text-muted-foreground">{device.sdkVersion || 'SDK v4.0'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performance Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="fps" stroke="#22c55e" name="FPS" strokeWidth={2} />
                  <Line type="monotone" dataKey="latency" stroke="#3b82f6" name="Latency (ms)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No historical data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Object Detections</CardTitle>
          </CardHeader>
          <CardContent>
            {objectTypes.length > 0 ? (
              <div className="space-y-3">
                {objectTypes.map(({ type, count }) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{type}</span>
                    <div className="flex items-center gap-3 flex-1 ml-4">
                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-purple-500 h-full transition-all duration-300"
                          style={{ width: `${Math.min((count / 10) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No detections yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Camera Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Camera Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Device ID</p>
              <p className="text-sm font-mono">{device.id}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Model</p>
              <p className="text-sm font-semibold">{device.model || 'ZED 2i'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">SDK Version</p>
              <p className="text-sm font-semibold">{device.sdkVersion || '4.0'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Resolution</p>
              <p className="text-sm font-semibold">{device.resolution || '1920x1080'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">URL</p>
              <p className="text-sm font-mono truncate">{device.url}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Last Seen</p>
              <p className="text-sm font-semibold">
                {new Date(device.lastSeen).toLocaleTimeString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Serial Number</p>
              <p className="text-sm font-mono">{device.serialNumber || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Location</p>
              <p className="text-sm font-semibold">{device.location || 'Not Set'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
