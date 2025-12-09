import { useDashboardStore } from '@/store/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Video } from 'lucide-react';

export function VideoStreams() {
  const { devices, selectedDevices } = useDashboardStore();

  const selectedDeviceList = devices.filter((d) => selectedDevices.includes(d.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          Live Camera Feeds
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`grid gap-4 ${
          selectedDeviceList.length === 1 ? 'grid-cols-1' :
          selectedDeviceList.length === 2 ? 'grid-cols-2' :
          selectedDeviceList.length === 3 ? 'grid-cols-3' :
          'grid-cols-2 md:grid-cols-3'
        }`}>
          {selectedDeviceList.length === 0 ? (
            <div className="col-span-full text-center py-8 text-muted-foreground">
              Select devices to pull on-demand video streams (metrics stay live even without video)
            </div>
          ) : (
            selectedDeviceList.map((device) => (
              <div key={device.id} className="relative group">
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
                      {device.status === 'connecting' ? 'Connecting...' : 'Offline'}
                    </div>
                  )}
                </div>
                <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded text-xs font-medium">
                  {device.name}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
