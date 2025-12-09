import React, { useState, useEffect } from 'react';
import { Deployment } from '../types';
import { useDashboardStore } from '../store/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Check, Clock, Play, RefreshCw, XCircle, Loader2, Server, AlertTriangle } from 'lucide-react';

interface TailscaleDevice {
  id: string;
  hostname: string;
  addresses: string[];
  os: string;
  lastSeen: string;
  authorized: boolean;
}

export const DeploymentManager: React.FC = () => {
  const { addDevice } = useDashboardStore();
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [appType, setAppType] = useState<'zed' | 'yolo' | 'custom'>('zed');
  const [appUrl, setAppUrl] = useState('dummy-zed:latest');
  const [isDeploying, setIsDeploying] = useState(false);
  const [tailscaleDevices, setTailscaleDevices] = useState<TailscaleDevice[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTailscaleDevices();
  }, []);

  const loadTailscaleDevices = async () => {
    setIsLoadingDevices(true);
    setError(null);
    try {
      const res = await fetch('http://localhost:8000/api/tailscale/devices');
      if (res.ok) {
        const data = await res.json();
        console.log('Loaded devices:', data);
        setTailscaleDevices(data.devices || []);
        if (data.devices && data.devices.length === 0) {
          setError('No devices found in Tailscale network');
        }
      } else {
        const errorData = await res.json();
        setError(errorData.error || 'Failed to load devices');
      }
    } catch (err: any) {
      console.error('Failed to load Tailscale devices:', err);
      setError(`Connection error: ${err.message}`);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      deployments.forEach((dep: Deployment) => {
        if (dep.status === 'accepted' || dep.status === 'pending') {
          pollStatus(dep.executionId, dep.deviceId);
        }
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [deployments]);

  const pollStatus = async (executionId: string, deviceId: string) => {
    try {
      const res = await fetch(
        `http://localhost:8000/api/tailscale/devices/${deviceId}/deployment/${executionId}`
      );
      if (res.ok) {
        const status = await res.json();
        console.log('Deployment status:', status);
        setDeployments((prevs: Deployment[]) =>
          prevs.map((d: Deployment) =>
            d.executionId === executionId
              ? { 
                  ...d, 
                  status: status.status || d.status, 
                  output: status.output || d.output, 
                  error: status.error || d.error 
                }
              : d
          )
        );
      }
    } catch (err) {
      console.error('Failed to poll status:', err);
    }
  };

  const handleDeploy = async () => {
    if (!selectedDevice || !appUrl) {
      setError('Please select device and app URL');
      return;
    }

    setIsDeploying(true);
    setError(null);
    
    try {
      console.log('Deploying:', { selectedDevice, appType, appUrl });
      
      const res = await fetch(
        `http://localhost:8000/api/tailscale/devices/${selectedDevice}/deploy`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app_type: appType, app_url: appUrl }),
        }
      );

      const result = await res.json();
      console.log('Deploy response:', result);

      if (res.ok) {
        const tailDevice = tailscaleDevices.find((d: TailscaleDevice) => d.id === selectedDevice);
        const deviceName = tailDevice?.hostname || selectedDevice;
        const deviceIp = tailDevice?.addresses?.[0] || 'unknown';

        const newDeploy: Deployment = {
          id: `${selectedDevice}-${Date.now()}`,
          deviceId: selectedDevice,
          deviceName,
          appType,
          appUrl,
          status: result.status || 'accepted',
          executionId: result.execution_id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        setDeployments((prevs: Deployment[]) => [newDeploy, ...prevs]);

        // Register as dashboard device after successful deployment
        if (result.status === 'success' || result.status === 'accepted') {
          setTimeout(() => {
            addDevice({
              id: `deployed-${selectedDevice}`,
              name: `${deviceName} - ${appType.toUpperCase()}`,
              url: `http://${deviceIp}:5000`,
              status: 'connecting',
              lastSeen: new Date(),
            });
          }, 2000);
        }

        setAppUrl('dummy-zed:latest');
        setSelectedDevice('');
      } else {
        setError(result.error || result.message || 'Deployment failed');
      }
    } catch (err: any) {
      console.error('Deploy failed:', err);
      setError(`Deployment error: ${err.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <Check className="w-5 h-5 text-green-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'running':
      case 'accepted':
        return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
      default:
        return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  return (
    <div className="space-y-6 p-4">
      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">Deployment Error</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Deploy Form */}
      <Card className="bg-white shadow-lg border-2 border-gray-200">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
          <CardTitle className="flex items-center gap-2 text-gray-900">
            <Server className="w-6 h-6 text-blue-600" />
            Deploy Application to Device
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-semibold text-gray-900">
                Target Device
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={loadTailscaleDevices}
                disabled={isLoadingDevices}
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingDevices ? 'animate-spin' : ''}`} />
                {isLoadingDevices ? 'Loading...' : 'Refresh Devices'}
              </Button>
            </div>
            <select
              value={selectedDevice}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedDevice(e.target.value)}
              className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 font-medium"
            >
              <option value="" className="text-gray-500">-- Select a Tailscale Device --</option>
              {tailscaleDevices.map((d: TailscaleDevice) => (
                <option key={d.id} value={d.id} className="text-gray-900">
                  {d.hostname} ({d.os}) • {d.addresses[0]}
                </option>
              ))}
            </select>
            <p className="text-sm text-gray-600 mt-2 font-medium">
              {tailscaleDevices.length > 0 ? (
                `✓ ${tailscaleDevices.length} device${tailscaleDevices.length !== 1 ? 's' : ''} available`
              ) : (
                '⚠ No devices found - check Tailscale configuration'
              )}
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Application Type
            </label>
            <select
              value={appType}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAppType(e.target.value as 'zed' | 'yolo' | 'custom')}
              className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 font-medium"
            >
              <option value="zed">�� ZED SDK App (Simulator)</option>
              <option value="yolo">🔍 YOLO Detection</option>
              <option value="custom">⚙️ Custom Application</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Docker Image URL
            </label>
            <input
              type="text"
              value={appUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAppUrl(e.target.value)}
              placeholder="e.g., docker.io/namespace/app:latest"
              className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 font-mono"
            />
            <p className="text-sm text-gray-600 mt-2">
              💡 Default: <span className="font-mono">dummy-zed:latest</span> (local simulator)
            </p>
          </div>

          <Button
            onClick={handleDeploy}
            disabled={isDeploying || !selectedDevice || !appUrl}
            className="w-full py-6 text-lg font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeploying ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Deploying...
              </>
            ) : (
              <>
                <Play className="w-5 h-5 mr-2" />
                Deploy Application
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Deployment History */}
      <div>
        <h3 className="text-xl font-bold mb-4 text-gray-900">Deployment History</h3>
        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
          {deployments.length === 0 ? (
            <Card className="bg-gray-50 border-2 border-dashed border-gray-300">
              <CardContent className="py-12 text-center">
                <Clock className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">No deployments yet</p>
                <p className="text-sm text-gray-500 mt-1">Deploy an application to get started</p>
              </CardContent>
            </Card>
          ) : (
            deployments.map((dep: Deployment) => (
              <Card key={dep.id} className="bg-white shadow-md border-2 border-gray-200 hover:shadow-lg transition-shadow">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(dep.status)}
                        <div>
                          <span className="font-bold text-lg text-gray-900">{dep.deviceName}</span>
                          <p className="text-sm text-gray-600 mt-1">
                            {dep.appType.toUpperCase()} → <span className="font-mono">{dep.appUrl}</span>
                          </p>
                        </div>
                      </div>
                      <Badge
                        className={`text-sm px-3 py-1 font-bold ${
                          dep.status === 'success'
                            ? 'bg-green-100 text-green-800 border-2 border-green-300'
                            : dep.status === 'error'
                            ? 'bg-red-100 text-red-800 border-2 border-red-300'
                            : dep.status === 'running' || dep.status === 'accepted'
                            ? 'bg-blue-100 text-blue-800 border-2 border-blue-300'
                            : 'bg-gray-100 text-gray-800 border-2 border-gray-300'
                        }`}
                      >
                        {dep.status.charAt(0).toUpperCase() + dep.status.slice(1)}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Clock className="w-4 h-4" />
                      {new Date(dep.createdAt).toLocaleString()}
                    </div>

                    {dep.output && (
                      <div className="mt-3 p-3 bg-gray-900 rounded-lg border-2 border-gray-700">
                        <p className="text-xs font-semibold text-gray-300 mb-2">Output:</p>
                        <pre className="text-xs font-mono text-green-400 max-h-32 overflow-y-auto whitespace-pre-wrap">
                          {dep.output}
                        </pre>
                      </div>
                    )}
                    
                    {dep.error && (
                      <div className="mt-3 p-3 bg-red-900 rounded-lg border-2 border-red-700">
                        <p className="text-xs font-semibold text-red-200 mb-2">Error:</p>
                        <pre className="text-xs font-mono text-red-300 whitespace-pre-wrap">
                          {dep.error}
                        </pre>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
