'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Shield,
    Ban,
    CheckCircle,
    AlertTriangle,
    Clock,
    Settings,
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
                    reason: 'Manual block from dashboard'
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
            <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-xl p-6">
                <div className="text-center text-gray-400 py-8">Loading auto-response data...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Control Panel */}
            <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-xl font-semibold text-white">Auto-Response Control</h2>
                        <p className="text-gray-400 text-sm">Automatic attack prevention system</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={fetchData}
                            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            <RefreshCw className="w-4 h-4 text-gray-400" />
                        </button>
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${config?.enabled
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}>
                            {config?.enabled ? (
                                <>
                                    <CheckCircle className="w-4 h-4" />
                                    Active
                                </>
                            ) : (
                                <>
                                    <Ban className="w-4 h-4" />
                                    Disabled
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gray-800/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Ban className="w-4 h-4 text-red-400" />
                            <span className="text-xs text-gray-400">Blocked IPs</span>
                        </div>
                        <p className="text-2xl font-bold text-red-400">{stats?.totalBlocked || 0}</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Shield className="w-4 h-4 text-purple-400" />
                            <span className="text-xs text-gray-400">Auto-Blocked</span>
                        </div>
                        <p className="text-2xl font-bold text-purple-400">{stats?.autoBlocked || 0}</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-4 h-4 text-yellow-400" />
                            <span className="text-xs text-gray-400">Threshold</span>
                        </div>
                        <p className="text-2xl font-bold text-yellow-400">
                            {((config?.threatThreshold || 0.85) * 100).toFixed(0)}%
                        </p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Clock className="w-4 h-4 text-blue-400" />
                            <span className="text-xs text-gray-400">Block Duration</span>
                        </div>
                        <p className="text-2xl font-bold text-blue-400">
                            {config?.autoBlockDuration || 60}m
                        </p>
                    </div>
                </div>

                {/* Settings */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Settings className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-300">Enable Auto-Response</span>
                        </div>
                        <button
                            onClick={() => updateConfig({ enabled: !config?.enabled })}
                            className={`relative w-12 h-6 rounded-full transition-colors ${config?.enabled ? 'bg-green-500' : 'bg-gray-600'
                                }`}
                        >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${config?.enabled ? 'translate-x-7' : 'translate-x-1'
                                }`} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-300">Block on Critical Threats</span>
                        <button
                            onClick={() => updateConfig({ blockOnCritical: !config?.blockOnCritical })}
                            className={`relative w-12 h-6 rounded-full transition-colors ${config?.blockOnCritical ? 'bg-purple-500' : 'bg-gray-600'
                                }`}
                        >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${config?.blockOnCritical ? 'translate-x-7' : 'translate-x-1'
                                }`} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-300">Block on High Threats</span>
                        <button
                            onClick={() => updateConfig({ blockOnHigh: !config?.blockOnHigh })}
                            className={`relative w-12 h-6 rounded-full transition-colors ${config?.blockOnHigh ? 'bg-red-500' : 'bg-gray-600'
                                }`}
                        >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${config?.blockOnHigh ? 'translate-x-7' : 'translate-x-1'
                                }`} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-300">Threat Threshold</span>
                        <div className="flex items-center gap-2">
                            <input
                                type="range"
                                min="50"
                                max="99"
                                value={(config?.threatThreshold || 0.85) * 100}
                                onChange={(e) => updateConfig({ threatThreshold: parseInt(e.target.value) / 100 })}
                                className="w-32 accent-blue-500"
                            />
                            <span className="text-sm text-white w-12 text-right">
                                {((config?.threatThreshold || 0.85) * 100).toFixed(0)}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Blocked IPs */}
            <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-white">Blocked IPs</h3>
                    <button
                        onClick={() => setShowAddIP(!showAddIP)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Block IP
                    </button>
                </div>

                {showAddIP && (
                    <div className="flex gap-2 mb-4">
                        <input
                            type="text"
                            value={newIP}
                            onChange={(e) => setNewIP(e.target.value)}
                            placeholder="Enter IP address"
                            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                        />
                        <button
                            onClick={blockIP}
                            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                        >
                            Block
                        </button>
                    </div>
                )}

                <div className="space-y-2 max-h-60 overflow-y-auto">
                    {blockedIPs.length === 0 ? (
                        <p className="text-center text-gray-500 py-4">No blocked IPs</p>
                    ) : (
                        blockedIPs.map((ip) => (
                            <div
                                key={ip.id}
                                className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
                            >
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-white font-mono text-sm">{ip.ipAddress}</span>
                                        {ip.autoBlocked && (
                                            <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                                                Auto
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500">{ip.reason}</p>
                                </div>
                                <button
                                    onClick={() => unblockIP(ip.ipAddress)}
                                    className="p-2 hover:bg-gray-700 rounded transition-colors"
                                >
                                    <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-400" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
