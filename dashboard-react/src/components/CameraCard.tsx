import { Device, DeviceMetrics } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Camera, Activity, Clock, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface CameraCardProps {
  device: Device;
  metrics?: DeviceMetrics;
  onClick?: () => void;
  isSelected?: boolean;
}

export function CameraCard({ device, metrics, onClick, isSelected }: CameraCardProps) {
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

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 ${
        isSelected ? 'ring-2 ring-primary' : ''
      }`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        {/* Preview/Thumbnail */}
        <div className="relative aspect-video rounded-md overflow-hidden bg-black mb-3 border border-border">
          {device.status === 'online' ? (
            <img
              src={`${device.url}/video_feed`}
              alt={`${device.name} preview`}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <Camera className="h-12 w-12 opacity-30" />
            </div>
          )}
          <div className="absolute top-2 right-2">
            <Badge
              variant="secondary"
              className={`${statusColor} text-white border-0 gap-1 px-2`}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              {statusText}
            </Badge>
          </div>
        </div>

        {/* Camera Info */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm truncate">{device.name}</h3>
              <p className="text-xs text-muted-foreground truncate">
                {device.location || device.id}
              </p>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <Activity className="h-3 w-3" />
              </div>
              {metrics ? (
                <p className="text-xs font-semibold">{metrics.fps.toFixed(0)} FPS</p>
              ) : (
                <Skeleton className="h-4 w-12 mx-auto" />
              )}
            </div>
            <div className="text-center border-x border-border">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <AlertCircle className="h-3 w-3" />
              </div>
              {metrics ? (
                <p className="text-xs font-semibold">{totalDetections} obj</p>
              ) : (
                <Skeleton className="h-4 w-12 mx-auto" />
              )}
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <Clock className="h-3 w-3" />
              </div>
              {metrics ? (
                <p className="text-xs font-semibold">{metrics.latency.toFixed(0)} ms</p>
              ) : (
                <Skeleton className="h-4 w-12 mx-auto" />
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
