'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Download,
  Upload,
  Trash2,
  Play,
  CheckCircle,
  Clock
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
    if (!confirm('Clear all training data?')) return;

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
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="text-center text-zinc-500 py-6 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Training Stats */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-medium text-white">Training Data</h2>
            <p className="text-xs text-zinc-500">Auto-training pipeline</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-xs">
              v{stats?.modelVersion || 1}
            </span>
            {stats?.pendingRetraining && (
              <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 rounded text-xs">
                Pending
              </span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-zinc-800/50 rounded p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Database className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs text-zinc-500">Total</span>
            </div>
            <p className="text-lg font-semibold text-blue-400">{stats?.totalSamples || 0}</p>
          </div>

          <div className="bg-zinc-800/50 rounded p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle className="w-3.5 h-3.5 text-green-400" />
              <span className="text-xs text-zinc-500">Normal</span>
            </div>
            <p className="text-lg font-semibold text-green-400">{stats?.normalSamples || 0}</p>
          </div>

          <div className="bg-zinc-800/50 rounded p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs text-zinc-500">Anomalies</span>
            </div>
            <p className="text-lg font-semibold text-red-400">{stats?.anomalySamples || 0}</p>
          </div>

          <div className="bg-zinc-800/50 rounded p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs text-zinc-500">Verified</span>
            </div>
            <p className="text-lg font-semibold text-white">{stats?.verifiedSamples || 0}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <button
            onClick={handleRetrain}
            disabled={retraining}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs transition-colors disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            {retraining ? 'Training...' : 'Retrain'}
          </button>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>

          <button
            onClick={handleImport}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Import
          </button>

          <button
            onClick={handleClearData}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-red-400 rounded text-xs transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>

        {/* Settings */}
        <div className="border-t border-zinc-800 pt-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Auto-Training</span>
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
            <span className="text-xs text-zinc-400">Auto-Retrain on Anomalies</span>
            <button
              onClick={() => updateConfig({ autoRetrainOnNewAnomalies: !config?.autoRetrainOnNewAnomalies })}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                config?.autoRetrainOnNewAnomalies ? 'bg-blue-500' : 'bg-zinc-700'
              }`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                config?.autoRetrainOnNewAnomalies ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
        </div>
      </div>

      {/* Training History */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-white mb-3">Training History</h3>

        <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
          {!stats?.trainingHistory?.length ? (
            <p className="text-center text-zinc-500 py-3 text-xs">No history</p>
          ) : (
            stats.trainingHistory.slice(-10).reverse().map((result) => (
              <div
                key={result.id}
                className="flex items-center justify-between p-2 bg-zinc-800/50 rounded"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white text-xs">v{result.modelVersion}</span>
                    <span className="text-xs text-zinc-600">
                      {result.samplesUsed} samples
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    {new Date(result.timestamp).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-green-400">
                    {((result.metrics.accuracy || 0) * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-zinc-600">{result.duration}ms</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
