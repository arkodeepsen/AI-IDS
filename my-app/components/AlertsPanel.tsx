'use client';

import { useState, useEffect } from 'react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer,
  Tooltip,
  Legend
} from 'recharts';
import { AlertTriangle, Shield, XCircle, CheckCircle } from 'lucide-react';
import { Alert } from '@/lib/types';
import { generateAlert } from '@/lib/utils';

export default function AlertsPanel() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [threatData, setThreatData] = useState<{ name: string; value: number; color: string }[]>([]);
  const [mounted, setMounted] = useState(false);

  const formatTime = (timestamp: Date | string) => {
    if (!mounted) return '';
    return new Date(timestamp).toLocaleTimeString();
  };

  useEffect(() => {
    setMounted(true);
    // Generate initial alerts
    const initialAlerts = Array(5).fill(null).map(() => generateAlert(false));
    setAlerts(initialAlerts);

    // Update threat distribution
    updateThreatDistribution(initialAlerts);

    // Simulate new alerts
    const interval = setInterval(() => {
      if (Math.random() < 0.3) {
        const newAlert = generateAlert(true);
        setAlerts(prev => {
          const updated = [newAlert, ...prev].slice(0, 20);
          updateThreatDistribution(updated);
          return updated;
        });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const updateThreatDistribution = (alertList: Alert[]) => {
    const distribution: Record<string, number> = {};
    alertList.forEach(alert => {
      distribution[alert.attackType] = (distribution[alert.attackType] || 0) + 1;
    });

    const colors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
    setThreatData(
      Object.entries(distribution).map(([name, value], idx) => ({
        name,
        value,
        color: colors[idx % colors.length],
      }))
    );
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="w-4 h-4 text-purple-500" />;
      case 'danger':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <Shield className="w-4 h-4 text-yellow-500" />;
      default:
        return <CheckCircle className="w-4 h-4 text-blue-500" />;
    }
  };

  const getSeverityBg = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'border-l-purple-500 bg-purple-500/5';
      case 'danger':
        return 'border-l-red-500 bg-red-500/5';
      case 'warning':
        return 'border-l-yellow-500 bg-yellow-500/5';
      default:
        return 'border-l-blue-500 bg-blue-500/5';
    }
  };

  const updateAlertStatus = (id: string, status: Alert['status']) => {
    setAlerts(prev => prev.map(a => 
      a.id === id ? { ...a, status } : a
    ));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Threat Distribution */}
      <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white mb-2">Threat Distribution</h2>
        <p className="text-gray-400 text-sm mb-4">Attack types detected this session</p>
        
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={threatData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {threatData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px'
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          {threatData.slice(0, 4).map((item) => (
            <div 
              key={item.name}
              className="flex items-center gap-2 p-2 bg-gray-800/50 rounded-lg"
            >
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-sm text-gray-300">{item.name}</span>
              <span className="text-sm text-gray-500 ml-auto">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Alerts */}
      <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Recent Alerts</h2>
            <p className="text-gray-400 text-sm">Security events requiring attention</p>
          </div>
          <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm">
            {alerts.filter(a => a.status === 'new').length} New
          </span>
        </div>

        <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3 border-l-4 rounded-r-lg ${getSeverityBg(alert.severity)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  {getSeverityIcon(alert.severity)}
                  <div>
                    <p className="text-sm font-medium text-white">{alert.title}</p>
                    <p className="text-xs text-gray-400 mt-1">{alert.message}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-gray-500">
                        {alert.sourceIP} → {alert.destIP}
                      </span>
                      <span className="text-xs text-gray-600">•</span>
                      <span className="text-xs text-gray-500">
                        {formatTime(alert.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={alert.status}
                    onChange={(e) => updateAlertStatus(alert.id, e.target.value as Alert['status'])}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
                  >
                    <option value="new">New</option>
                    <option value="investigating">Investigating</option>
                    <option value="resolved">Resolved</option>
                    <option value="false-positive">False Positive</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
