import { useDashboardStore } from '@/store/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Box } from 'lucide-react';

export function ObjectDetectionChart() {
  const { metrics, selectedDevices, devices } = useDashboardStore();

  const selectedMetrics = Array.from(metrics.entries())
    .filter(([deviceId]) => selectedDevices.includes(deviceId));

  // Aggregate object counts
  const objectCounts: Record<string, any> = {};

  selectedMetrics.forEach(([deviceId, metric]) => {
    Object.entries(metric.objects).forEach(([key, value]) => {
      if (key === 'timestamp' || typeof value !== 'number') return;

      if (!objectCounts[key]) {
        objectCounts[key] = { name: key };
      }

      const device = devices.find((d) => d.id === deviceId);
      const deviceName = device?.name || deviceId;
      objectCounts[key][deviceName] = value;
    });
  });

  const chartData = Object.values(objectCounts);

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Box className="h-5 w-5" />
          Object Detections by Device
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No detections available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" stroke="#888" />
              <YAxis stroke="#888" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              {selectedDevices.map((deviceId, idx) => {
                const device = devices.find((d) => d.id === deviceId);
                return (
                  <Bar
                    key={deviceId}
                    dataKey={device?.name || deviceId}
                    fill={colors[idx % colors.length]}
                  />
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
