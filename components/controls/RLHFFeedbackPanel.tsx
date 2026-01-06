'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  TrendingUp,
  Settings
} from 'lucide-react';

interface RLHFMetrics {
  totalFeedback: number;
  correctPredictions: number;
  incorrectPredictions: number;
  accuracyRate: number;
  weightAdjustments: number;
  lastUpdate: string | null;
}

interface ModelWeights {
  isolationForest: number;
  autoencoder: number;
  kMeans: number;
  knn: number;
}

export default function RLHFFeedbackPanel() {
  const [metrics, setMetrics] = useState<RLHFMetrics | null>(null);
  const [weights, setWeights] = useState<ModelWeights | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjusting, setAdjusting] = useState(false);

  const fetchRLHFData = useCallback(async () => {
    try {
      const response = await fetch('/api/rlhf');
      const data = await response.json();
      if (data.success) {
        setMetrics(data.metrics);
        setWeights(data.weights);
      }
    } catch (error) {
      console.error('Failed to fetch RLHF data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRLHFData();
    const interval = setInterval(fetchRLHFData, 10000);
    return () => clearInterval(interval);
  }, [fetchRLHFData]);

  const handleForceAdjust = async () => {
    setAdjusting(true);
    try {
      const response = await fetch('/api/rlhf', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'forceAdjust' })
      });
      const data = await response.json();
      if (data.success) {
        setWeights(data.weights);
        fetchRLHFData();
      }
    } catch (error) {
      console.error('Failed to adjust weights:', error);
    } finally {
      setAdjusting(false);
    }
  };

  const handleResetWeights = async () => {
    try {
      const response = await fetch('/api/rlhf', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' })
      });
      const data = await response.json();
      if (data.success) {
        setWeights(data.weights);
        fetchRLHFData();
      }
    } catch (error) {
      console.error('Failed to reset weights:', error);
    }
  };

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="text-center text-zinc-500 py-6 text-sm">Loading RLHF data...</div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-medium text-white">RLHF Feedback</h2>
          <p className="text-xs text-zinc-500">Reinforcement Learning from Human Feedback</p>
        </div>
        <button
          onClick={fetchRLHFData}
          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-zinc-800/50 rounded p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <ThumbsUp className="w-3.5 h-3.5 text-green-400" />
            <span className="text-xs text-zinc-500">Correct</span>
          </div>
          <p className="text-lg font-semibold text-green-400">
            {metrics?.correctPredictions || 0}
          </p>
        </div>

        <div className="bg-zinc-800/50 rounded p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <ThumbsDown className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs text-zinc-500">Incorrect</span>
          </div>
          <p className="text-lg font-semibold text-red-400">
            {metrics?.incorrectPredictions || 0}
          </p>
        </div>

        <div className="bg-zinc-800/50 rounded p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs text-zinc-500">Accuracy</span>
          </div>
          <p className="text-lg font-semibold text-blue-400">
            {((metrics?.accuracyRate || 0) * 100).toFixed(1)}%
          </p>
        </div>

        <div className="bg-zinc-800/50 rounded p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Settings className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-xs text-zinc-500">Adjustments</span>
          </div>
          <p className="text-lg font-semibold text-white">
            {metrics?.weightAdjustments || 0}
          </p>
        </div>
      </div>

      {/* Model Weights */}
      <div className="mb-4">
        <h3 className="text-xs text-zinc-500 mb-2">Model Weights</h3>
        <div className="space-y-2">
          {weights && Object.entries(weights).map(([model, weight]) => (
            <div key={model} className="flex items-center gap-3">
              <span className="text-xs text-zinc-400 w-24 capitalize">
                {model.replace(/([A-Z])/g, ' $1').trim()}
              </span>
              <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${weight * 100}%` }}
                />
              </div>
              <span className="text-xs text-white w-12 text-right">
                {(weight * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleForceAdjust}
          disabled={adjusting}
          className="flex-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs transition-colors disabled:opacity-50"
        >
          {adjusting ? 'Adjusting...' : 'Force Adjust'}
        </button>
        <button
          onClick={handleResetWeights}
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded text-xs transition-colors"
        >
          Reset
        </button>
      </div>

      {metrics?.lastUpdate && (
        <p className="text-xs text-zinc-600 mt-3 text-center">
          Last update: {new Date(metrics.lastUpdate).toLocaleString()}
        </p>
      )}
    </div>
  );
}
