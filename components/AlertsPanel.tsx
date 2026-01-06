'use client';

import { useState, useEffect } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip
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
    const initialAlerts = Array(5).fill(null).map(() => generateAlert(false));
    setAlerts(initialAlerts);
    updateThreatDistribution(initialAlerts);

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

    const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];
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
        return <XCircle className="w-3.5 h-3.5 text-red-500" />;
      case 'danger':
        return <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />;
      case 'warning':
        return <Shield className="w-3.5 h-3.5 text-yellow-500" />;
      default:
        return <CheckCircle className="w-3.5 h-3.5 text-blue-500" />;
    }
  };

  const updateAlertStatus = (id: string, status: Alert['status']) => {
    setAlerts(prev => prev.map(a =>
      a.id === id ? { ...a, status } : a
    ));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Threat Distribution */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="mb-4">
          <h2 className="text-base font-medium text-white">Threat Distribution</h2>
          <p className="text-xs text-zinc-500">Attack types detected</p>
        </div>

        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={threatData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {threatData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2">
          {threatData.slice(0, 4).map((item) => (
            <div
              key={item.name}
              className="flex items-center gap-2 p-2 bg-zinc-800/50 rounded"
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs text-zinc-400 truncate">{item.name}</span>
              <span className="text-xs text-zinc-500 ml-auto">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Alerts */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-medium text-white">Recent Alerts</h2>
            <p className="text-xs text-zinc-500">Security events</p>
          </div>
          <span className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded text-xs">
            {alerts.filter(a => a.status === 'new').length} New
          </span>
        </div>

        <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="p-2.5 border border-zinc-800 rounded bg-zinc-900/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  {getSeverityIcon(alert.severity)}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-white truncate">{alert.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{alert.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-zinc-600">
                        {alert.sourceIP}
                      </span>
                      <span className="text-xs text-zinc-700">-</span>
                      <span className="text-xs text-zinc-600">
                        {formatTime(alert.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
                <select
                  value={alert.status}
                  onChange={(e) => updateAlertStatus(alert.id, e.target.value as Alert['status'])}
                  className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-400 focus:outline-none focus:border-zinc-600"
                >
                  <option value="new">New</option>
                  <option value="investigating">Investigating</option>
                  <option value="resolved">Resolved</option>
                  <option value="false-positive">False Positive</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
