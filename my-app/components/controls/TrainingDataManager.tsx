'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Database,
    Download,
    Upload,
    Trash2,
    RefreshCw,
    Play,
    CheckCircle,
    Clock,
    FileJson
} from 'lucide-react';

interface TrainingStats {
    totalSamples: number;
    normalSamples: number;
    anomalySamples: number;
    verifiedSamples: number;
    modelVersion: number;
    pendingRetraining: boolean;
    trainingHistory: TrainingResult[];
}

interface TrainingResult {
    id: string;
    timestamp: string;
    samplesUsed: number;
    modelVersion: number;
    metrics: {
        accuracy?: number;
        precision?: number;
        recall?: number;
    };
    duration: number;
}

interface TrainingConfig {
    enabled: boolean;
    minSamplesForRetrain: number;
    autoRetrainOnNewAnomalies: boolean;
    maxStoredSamples: number;
}

export default function TrainingDataManager() {
    const [stats, setStats] = useState<TrainingStats | null>(null);
    const [config, setConfig] = useState<TrainingConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [retraining, setRetraining] = useState(false);
    const [exporting, setExporting] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const response = await fetch('/api/training');
            const data = await response.json();
            if (data.success) {
                setStats(data.stats);
                setConfig(data.config);
            }
        } catch (error) {
            console.error('Failed to fetch training data:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleExport = async () => {
        setExporting(true);
        try {
            const response = await fetch('/api/training?type=export');
            const data = await response.json();
            if (data.success) {
                const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `training-data-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Failed to export:', error);
        } finally {
            setExporting(false);
        }
    };

    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = JSON.parse(event.target?.result as string);
                    const response = await fetch('/api/training', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'import', data })
                    });
                    if (response.ok) {
                        fetchData();
                    }
                } catch (error) {
                    console.error('Failed to import:', error);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const handleRetrain = async () => {
        setRetraining(true);
        try {
            const response = await fetch('/api/training', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'retrain' })
            });
            if (response.ok) {
                fetchData();
            }
        } catch (error) {
            console.error('Failed to retrain:', error);
        } finally {
            setRetraining(false);
        }
    };

    const handleClearData = async () => {
        if (!confirm('Are you sure you want to clear all training data?')) return;

        try {
            const response = await fetch('/api/training', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'clearAll' })
            });
            if (response.ok) {
                fetchData();
            }
        } catch (error) {
            console.error('Failed to clear data:', error);
        }
    };

    const updateConfig = async (updates: Partial<TrainingConfig>) => {
        try {
            const response = await fetch('/api/training', {
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

    if (loading) {
        return (
            <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-xl p-6">
                <div className="text-center text-gray-400 py-8">Loading training data...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Training Stats */}
            <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-xl font-semibold text-white">Training Data Manager</h2>
                        <p className="text-gray-400 text-sm">Auto-training pipeline for continuous learning</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-full text-sm">
                            Model v{stats?.modelVersion || 1}
                        </span>
                        {stats?.pendingRetraining && (
                            <span className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded-full text-sm animate-pulse">
                                Retraining Pending
                            </span>
                        )}
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gray-800/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Database className="w-4 h-4 text-blue-400" />
                            <span className="text-xs text-gray-400">Total Samples</span>
                        </div>
                        <p className="text-2xl font-bold text-blue-400">{stats?.totalSamples || 0}</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <CheckCircle className="w-4 h-4 text-green-400" />
                            <span className="text-xs text-gray-400">Normal</span>
                        </div>
                        <p className="text-2xl font-bold text-green-400">{stats?.normalSamples || 0}</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Clock className="w-4 h-4 text-red-400" />
                            <span className="text-xs text-gray-400">Anomalies</span>
                        </div>
                        <p className="text-2xl font-bold text-red-400">{stats?.anomalySamples || 0}</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <CheckCircle className="w-4 h-4 text-purple-400" />
                            <span className="text-xs text-gray-400">Verified</span>
                        </div>
                        <p className="text-2xl font-bold text-purple-400">{stats?.verifiedSamples || 0}</p>
                    </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <button
                        onClick={handleRetrain}
                        disabled={retraining}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <Play className="w-4 h-4" />
                        {retraining ? 'Retraining...' : 'Retrain Model'}
                    </button>

                    <button
                        onClick={handleExport}
                        disabled={exporting}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <Download className="w-4 h-4" />
                        {exporting ? 'Exporting...' : 'Export JSON'}
                    </button>

                    <button
                        onClick={handleImport}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors"
                    >
                        <Upload className="w-4 h-4" />
                        Import JSON
                    </button>

                    <button
                        onClick={handleClearData}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                        Clear Data
                    </button>
                </div>

                {/* Settings */}
                <div className="border-t border-gray-700 pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-300">Auto-Training Enabled</span>
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
                        <span className="text-sm text-gray-300">Auto-Retrain on Anomalies</span>
                        <button
                            onClick={() => updateConfig({ autoRetrainOnNewAnomalies: !config?.autoRetrainOnNewAnomalies })}
                            className={`relative w-12 h-6 rounded-full transition-colors ${config?.autoRetrainOnNewAnomalies ? 'bg-blue-500' : 'bg-gray-600'
                                }`}
                        >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${config?.autoRetrainOnNewAnomalies ? 'translate-x-7' : 'translate-x-1'
                                }`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Training History */}
            <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                    <FileJson className="w-5 h-5 text-gray-400" />
                    <h3 className="text-lg font-medium text-white">Training History</h3>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                    {!stats?.trainingHistory?.length ? (
                        <p className="text-center text-gray-500 py-4">No training history</p>
                    ) : (
                        stats.trainingHistory.slice(-10).reverse().map((result) => (
                            <div
                                key={result.id}
                                className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
                            >
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-white text-sm">Model v{result.modelVersion}</span>
                                        <span className="text-xs text-gray-500">
                                            {result.samplesUsed} samples
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        {new Date(result.timestamp).toLocaleString()}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-green-400">
                                        {((result.metrics.accuracy || 0) * 100).toFixed(1)}% accuracy
                                    </p>
                                    <p className="text-xs text-gray-500">{result.duration}ms</p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
