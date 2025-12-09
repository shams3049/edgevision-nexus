import { useDashboardStore } from '@/store/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CameraCard } from '@/components/CameraCard';
import { Camera, Plus, Grid, List } from 'lucide-react';
import { useState } from 'react';

interface CameraOverviewProps {
  onCameraClick: (deviceId: string) => void;
  onAddCamera: () => void;
}

export function CameraOverview({ onCameraClick, onAddCamera }: CameraOverviewProps) {
  const { devices, metrics, selectedDevices } = useDashboardStore();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  if (devices.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Camera className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h3 className="text-lg font-semibold mb-2">No Cameras Connected</h3>
          <p className="text-muted-foreground mb-6">
            Add your first ZED camera to start monitoring
          </p>
          <Button onClick={onAddCamera}>
            <Plus className="h-4 w-4 mr-2" />
            Add Camera
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Cameras ({devices.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex border border-border rounded-md">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="rounded-r-none border-r border-border"
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="rounded-l-none"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={onAddCamera} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Camera
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className={
            viewMode === 'grid'
              ? 'grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              : 'space-y-3'
          }
        >
          {devices.map((device) => (
            <CameraCard
              key={device.id}
              device={device}
              metrics={metrics.get(device.id)}
              onClick={() => onCameraClick(device.id)}
              isSelected={selectedDevices.includes(device.id)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
