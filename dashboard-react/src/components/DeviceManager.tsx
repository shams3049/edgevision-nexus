import { useState } from 'react';
import { useDashboardStore } from '@/store/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export function DeviceManager() {
  const [deviceUrl, setDeviceUrl] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const { addDevice } = useDashboardStore();

  const handleAddDevice = () => {
    if (!deviceUrl || !deviceName) return;

    const newDevice = {
      id: `device-${Date.now()}`,
      name: deviceName,
      url: deviceUrl,
      status: 'connecting' as const,
      lastSeen: new Date(),
    };

    addDevice(newDevice);
    setDeviceUrl('');
    setDeviceName('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          Add Edge Node
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          <Input
            placeholder="Node Name (e.g., Jetson-1)"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
          />
          <Input
            placeholder="Edge URL (e.g., http://localhost:5000 or http://192.168.1.100:5000)"
            value={deviceUrl}
            onChange={(e) => setDeviceUrl(e.target.value)}
          />
          <Button onClick={handleAddDevice} className="w-full">
            Add Node
          </Button>
          <p className="text-xs text-muted-foreground">
            Metrics are always collected; video is pulled on demand to save bandwidth.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
