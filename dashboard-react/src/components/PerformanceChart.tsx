import { useDashboardStore } from '@/store/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

export function PerformanceChart() {
  const { history, selectedDevices, devices } = useDashboardStore();

  const filteredHistory = history.filter((h) => selectedDevices.includes(h.deviceId));

  const chartData = filteredHistory.reduce((acc, item) => {
    const timeKey = format(item.timestamp, 'HH:mm:ss');
    const existing = acc.find((d) => d.time === timeKey);

    if (existing) {
      existing[`fps-${item.deviceId}`] = item.fps;
      existing[`latency-${item.deviceId}`] = item.latency;
    } else {
      acc.push({
        time: timeKey,
        [`fps-${item.deviceId}`]: item.fps,
        [`latency-${item.deviceId}`]: item.latency,
      });
    }

    return acc;
  }, [] as any[]);

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Performance Metrics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="time" stroke="#888" />
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
                <Line
                  key={`fps-${deviceId}`}
                  type="monotone"
                  dataKey={`fps-${deviceId}`}
                  stroke={colors[idx % colors.length]}
                  name={`${device?.name} FPS`}
                  dot={false}
                  strokeWidth={2}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
