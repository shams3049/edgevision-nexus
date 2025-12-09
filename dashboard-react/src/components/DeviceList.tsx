import { useDashboardStore } from '@/store/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Monitor, Trash2, Circle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function DeviceList() {
  const { devices, removeDevice, selectedDevices, toggleDeviceSelection } = useDashboardStore();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="h-5 w-5" />
          Connected Devices ({devices.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No devices connected. Add a device to start monitoring.
            </p>
          ) : (
            devices.map((device) => (
              <div
                key={device.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                  selectedDevices.includes(device.id)
                    ? 'bg-accent border-primary'
                    : 'hover:bg-accent/50'
                }`}
                onClick={() => toggleDeviceSelection(device.id)}
              >
                <div className="flex items-center gap-3 flex-1">
                  <Circle
                    className={`h-3 w-3 fill-current ${
                      device.status === 'online'
                        ? 'text-green-500'
                        : device.status === 'connecting'
                        ? 'text-yellow-500'
                        : 'text-red-500'
                    }`}
                  />
                  <div>
                    <div className="font-medium">{device.name}</div>
                    <div className="text-xs text-muted-foreground">{device.url}</div>
                    {device.model && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {device.model} • SDK {device.sdkVersion}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      device.status === 'online'
                        ? 'success'
                        : device.status === 'connecting'
                        ? 'secondary'
                        : 'destructive'
                    }
                  >
                    {device.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(device.lastSeen, { addSuffix: true })}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeDevice(device.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
