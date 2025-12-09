import { useDashboardStore } from '@/store/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Gauge, Network, Video, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function MetricsOverview() {
  const { metrics, selectedDevices, devices } = useDashboardStore();

  const selectedMetrics = Array.from(metrics.entries())
    .filter(([deviceId]) => selectedDevices.includes(deviceId));

  const onlineDevices = devices.filter((d) => d.status === 'online').length;
  const offlineDevices = devices.filter((d) => d.status === 'offline').length;

  const avgFps = selectedMetrics.length > 0
    ? selectedMetrics.reduce((sum, [, m]) => sum + m.fps, 0) / selectedMetrics.length
    : 0;

  const avgLatency = selectedMetrics.length > 0
    ? selectedMetrics.reduce((sum, [, m]) => sum + m.latency, 0) / selectedMetrics.length
    : 0;

  const totalObjects = selectedMetrics.reduce((sum, [, m]) => {
    return sum + Object.entries(m.objects)
      .filter(([key]) => key !== 'timestamp')
      .reduce((s, [, v]) => s + (typeof v === 'number' ? v : 0), 0);
  }, 0);

  const MetricCard = ({ 
    icon: Icon, 
    label, 
    value, 
    suffix = '', 
    color = 'text-primary',
    subtitle,
    loading = false
  }: any) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-10 w-24" />
        ) : (
          <>
            <div className={`text-3xl font-bold ${color}`}>
              {value}
              {suffix && <span className="text-lg ml-1 text-muted-foreground">{suffix}</span>}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <MetricCard
        icon={Video}
        label="Total Cameras"
        value={devices.length}
        color="text-blue-500"
        subtitle={`${onlineDevices} online, ${offlineDevices} offline`}
      />
      <MetricCard
        icon={Gauge}
        label="Avg Frame Rate"
        value={avgFps > 0 ? avgFps.toFixed(1) : '—'}
        suffix={avgFps > 0 ? 'FPS' : ''}
        color="text-green-500"
        subtitle={selectedMetrics.length > 0 ? `${selectedMetrics.length} cameras active` : 'No active cameras'}
        loading={selectedMetrics.length > 0 && avgFps === 0}
      />
      <MetricCard
        icon={Network}
        label="Avg Latency"
        value={avgLatency > 0 ? avgLatency.toFixed(0) : '—'}
        suffix={avgLatency > 0 ? 'ms' : ''}
        color="text-blue-500"
        subtitle={avgLatency > 0 && avgLatency < 100 ? 'Excellent' : avgLatency > 200 ? 'High' : 'Good'}
        loading={selectedMetrics.length > 0 && avgLatency === 0}
      />
      <MetricCard
        icon={Activity}
        label="Total Detections"
        value={totalObjects}
        color="text-purple-500"
        subtitle={`Across ${selectedMetrics.length} camera${selectedMetrics.length !== 1 ? 's' : ''}`}
      />
      <MetricCard
        icon={TrendingUp}
        label="System Health"
        value="98%"
        color="text-green-500"
        subtitle="All systems operational"
      />
    </div>
  );
}
