'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Ban,
  CheckCircle,
  AlertTriangle,
  Clock,
  Plus,
  Trash2,
  RefreshCw
} from 'lucide-react';

interface BlockedIP {
  id: string;
  ipAddress: string;
  reason: string;
  attackType?: string;
  confidence: number;
  blockedAt: string;
  expiresAt: string | null;
  autoBlocked: boolean;
}

interface AutoResponseConfig {
  enabled: boolean;
  threatThreshold: number;
  autoBlockDuration: number;
  blockOnCritical: boolean;
  blockOnHigh: boolean;
  blockOnMedium: boolean;
  notifyOnBlock: boolean;
  whitelistedIPs: string[];
}

interface Stats {
  totalBlocked: number;
  autoBlocked: number;
  manualBlocked: number;
  totalEvents: number;
}

export default function AutoResponseControl() {
  const [config, setConfig] = useState<AutoResponseConfig | null>(null);
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [newIP, setNewIP] = useState('');
  const [showAddIP, setShowAddIP] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/auto-response');
      const data = await response.json();
      if (data.success) {
        setConfig(data.config);
        setBlockedIPs(data.blockedIPs || []);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch auto-response data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const updateConfig = async (updates: Partial<AutoResponseConfig>) => {
    try {
      const response = await fetch('/api/auto-response', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await response.json();
      if (data.success) {
        setConfig(data.config);
      }
    } catch (error) {
      console.error('Failed to update config:', error);
    }
  };

  const blockIP = async () => {
    if (!newIP.trim()) return;

    try {
      const response = await fetch('/api/auto-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'block',
          ipAddress: newIP.trim(),
          reason: 'Manual block'
        })
      });
      const data = await response.json();
      if (data.success) {
        setNewIP('');
        setShowAddIP(false);
        fetchData();
      }
    } catch (error) {
      console.error('Failed to block IP:', error);
    }
  };

  const unblockIP = async (ipAddress: string) => {
    try {
      const response = await fetch('/api/auto-response', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unblock', ipAddress })
      });
      const data = await response.json();
      if (data.success) {
        fetchData();
      }
    } catch (error) {
      console.error('Failed to unblock IP:', error);
    }
  };

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="text-center text-zinc-500 py-6 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Control Panel */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-medium text-white">Auto-Response</h2>
            <p className="text-xs text-zinc-500">Automatic attack prevention</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
            </button>
            <span className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
              config?.enabled
                ? 'bg-green-500/10 text-green-400'
                : 'bg-zinc-800 text-zinc-400'
            }`}>
              {config?.enabled ? (
                <>
                  <CheckCircle className="w-3 h-3" />
                  Active
                </>
              ) : (
                <>
                  <Ban className="w-3 h-3" />
                  Off
                </>
              )}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-zinc-800/50 rounded p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Ban className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs text-zinc-500">Blocked</span>
            </div>
            <p className="text-lg font-semibold text-red-400">{stats?.totalBlocked || 0}</p>
          </div>

          <div className="bg-zinc-800/50 rounded p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Shield className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs text-zinc-500">Auto</span>
            </div>
            <p className="text-lg font-semibold text-white">{stats?.autoBlocked || 0}</p>
          </div>

          <div className="bg-zinc-800/50 rounded p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-xs text-zinc-500">Threshold</span>
            </div>
            <p className="text-lg font-semibold text-yellow-400">
              {((config?.threatThreshold || 0.85) * 100).toFixed(0)}%
            </p>
          </div>

          <div className="bg-zinc-800/50 rounded p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs text-zinc-500">Duration</span>
            </div>
            <p className="text-lg font-semibold text-blue-400">
              {config?.autoBlockDuration || 60}m
            </p>
          </div>
        </div>

        {/* Settings */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Enable Auto-Response</span>
            <button
              onClick={() => updateConfig({ enabled: !config?.enabled })}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                config?.enabled ? 'bg-green-500' : 'bg-zinc-700'
              }`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                config?.enabled ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Block Critical Threats</span>
            <button
              onClick={() => updateConfig({ blockOnCritical: !config?.blockOnCritical })}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                config?.blockOnCritical ? 'bg-blue-500' : 'bg-zinc-700'
              }`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                config?.blockOnCritical ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Block High Threats</span>
            <button
              onClick={() => updateConfig({ blockOnHigh: !config?.blockOnHigh })}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                config?.blockOnHigh ? 'bg-blue-500' : 'bg-zinc-700'
              }`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                config?.blockOnHigh ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Threat Threshold</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="50"
                max="99"
                value={(config?.threatThreshold || 0.85) * 100}
                onChange={(e) => updateConfig({ threatThreshold: parseInt(e.target.value) / 100 })}
                className="w-24 accent-blue-500 h-1"
              />
              <span className="text-xs text-white w-10 text-right">
                {((config?.threatThreshold || 0.85) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Blocked IPs */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-white">Blocked IPs</h3>
          <button
            onClick={() => setShowAddIP(!showAddIP)}
            className="flex items-center gap-1.5 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded text-xs transition-colors"
          >
            <Plus className="w-3 h-3" />
            Block IP
          </button>
        </div>

        {showAddIP && (
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newIP}
              onChange={(e) => setNewIP(e.target.value)}
              placeholder="Enter IP address"
              className="flex-1 px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-xs focus:outline-none focus:border-zinc-600"
            />
            <button
              onClick={blockIP}
              className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-xs transition-colors"
            >
              Block
            </button>
          </div>
        )}

        <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
          {blockedIPs.length === 0 ? (
            <p className="text-center text-zinc-500 py-3 text-xs">No blocked IPs</p>
          ) : (
            blockedIPs.map((ip) => (
              <div
                key={ip.id}
                className="flex items-center justify-between p-2 bg-zinc-800/50 rounded"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono text-xs">{ip.ipAddress}</span>
                    {ip.autoBlocked && (
                      <span className="text-xs px-1.5 py-0.5 bg-zinc-700 text-zinc-400 rounded">
                        Auto
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-600 mt-0.5">{ip.reason}</p>
                </div>
                <button
                  onClick={() => unblockIP(ip.ipAddress)}
                  className="p-1.5 hover:bg-zinc-700 rounded transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 text-zinc-500 hover:text-red-400" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
