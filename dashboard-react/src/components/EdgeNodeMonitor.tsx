import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Cpu, HardDrive, Activity, Network, Clock, Server, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface EdgeNodeMetrics {
  cpuUsage: number;
  cpuTemp?: number;
  memoryUsage: number;
  memoryTotal: number;
  diskUsage: number;
  diskTotal: number;
  networkTx: number;
  networkRx: number;
  uptime: number;
}

export function EdgeNodeMonitor() {
  // Mock data - in production this would come from your API
  const [metrics] = useState<EdgeNodeMetrics>({
    cpuUsage: 45.3,
    cpuTemp: 58,
    memoryUsage: 2.4,
    memoryTotal: 8.0,
    diskUsage: 125,
    diskTotal: 512,
    networkTx: 1.2,
    networkRx: 3.5,
    uptime: 345600, // seconds
  });

  const [loading] = useState(false);

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return `${days}d ${hours}h`;
  };

  const formatBytes = (gb: number) => `${gb.toFixed(1)} GB`;
  const formatRate = (mbps: number) => `${mbps.toFixed(1)} MB/s`;

  const MetricCard = ({
    icon: Icon,
    label,
    value,
    total,
    percentage,
    color,
    unit,
  }: {
    icon: any;
    label: string;
    value: string | number;
    total?: string | number;
    percentage?: number;
    color: string;
    unit?: string;
  }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span>{label}</span>
        </div>
        {percentage !== undefined && (
          <span
            className={`text-xs font-semibold ${
              percentage > 80 ? 'text-red-500' : percentage > 60 ? 'text-yellow-500' : 'text-green-500'
            }`}
          >
            {percentage.toFixed(0)}%
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-full" />
      ) : (
        <>
          <div className="text-xl font-bold">
            {value} {unit}
            {total && <span className="text-sm text-muted-foreground ml-1">/ {total}</span>}
          </div>
          {percentage !== undefined && (
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${color}`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          Edge Node Monitor
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            icon={Cpu}
            label="CPU Usage"
            value={metrics.cpuUsage}
            unit="%"
            percentage={metrics.cpuUsage}
            color="bg-blue-500"
          />
          {metrics.cpuTemp && (
            <MetricCard
              icon={AlertTriangle}
              label="CPU Temperature"
              value={metrics.cpuTemp}
              unit="°C"
              percentage={(metrics.cpuTemp / 100) * 100}
              color="bg-orange-500"
            />
          )}
          <MetricCard
            icon={Activity}
            label="Memory"
            value={formatBytes(metrics.memoryUsage)}
            total={formatBytes(metrics.memoryTotal)}
            percentage={(metrics.memoryUsage / metrics.memoryTotal) * 100}
            color="bg-purple-500"
          />
          <MetricCard
            icon={HardDrive}
            label="Disk Usage"
            value={formatBytes(metrics.diskUsage)}
            total={formatBytes(metrics.diskTotal)}
            percentage={(metrics.diskUsage / metrics.diskTotal) * 100}
            color="bg-green-500"
          />
          <MetricCard
            icon={Network}
            label="Network TX"
            value={formatRate(metrics.networkTx)}
            color="bg-cyan-500"
          />
          <MetricCard
            icon={Network}
            label="Network RX"
            value={formatRate(metrics.networkRx)}
            color="bg-indigo-500"
          />
          <MetricCard
            icon={Clock}
            label="Uptime"
            value={formatUptime(metrics.uptime)}
            color="bg-teal-500"
          />
        </div>
      </CardContent>
    </Card>
  );
}
