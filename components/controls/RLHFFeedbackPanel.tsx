'use client';

import { useState, useEffect, useCallback } from 'react';
import { ThumbsUp, ThumbsDown, RefreshCw, TrendingUp, Settings } from 'lucide-react';

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
  randomForest: number;
  xgboost: number;
}

const MODEL_LABELS: Record<keyof ModelWeights, string> = {
  isolationForest: 'Isolation Forest',
  autoencoder: 'Autoencoder',
  randomForest: 'Random Forest',
  xgboost: 'XGBoost',
};

export default function RLHFFeedbackPanel() {
  const [metrics, setMetrics] = useState<RLHFMetrics | null>(null);
  const [weights, setWeights] = useState<ModelWeights | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjusting, setAdjusting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/rlhf');
      const data = await res.json();
      if (data.success) {
        setMetrics(data.metrics);
        setWeights(data.weights);
      }
    } catch (err) {
      console.error('Failed to fetch RLHF data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleForceAdjust = async () => {
    setAdjusting(true);
    try {
      const res = await fetch('/api/rlhf', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'forceAdjust' }),
      });
      const data = await res.json();
      if (data.success) {
        setWeights(data.weights);
        fetchData();
      }
    } finally {
      setAdjusting(false);
    }
  };

  const handleReset = async () => {
    try {
      const res = await fetch('/api/rlhf', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      const data = await res.json();
      if (data.success) {
        setWeights(data.weights);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="text-center text-zinc-500 py-6 text-sm">Loading Active Learning state…</div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-white tracking-wide uppercase">
            Active Learning (HITL)
          </h2>
          <p className="text-xs text-zinc-500">
            Per-model accuracy from operator feedback. Weights re-balance every 10 verified samples.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-zinc-800/50 rounded p-2.5 border border-zinc-800">
          <div className="flex items-center gap-1.5 mb-1">
            <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs text-zinc-500">Confirmed</span>
          </div>
          <p className="text-lg font-semibold text-emerald-400 tabular-nums">
            {metrics?.correctPredictions ?? 0}
          </p>
        </div>
        <div className="bg-zinc-800/50 rounded p-2.5 border border-zinc-800">
          <div className="flex items-center gap-1.5 mb-1">
            <ThumbsDown className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs text-zinc-500">Dismissed</span>
          </div>
          <p className="text-lg font-semibold text-red-400 tabular-nums">
            {metrics?.incorrectPredictions ?? 0}
          </p>
        </div>
        <div className="bg-zinc-800/50 rounded p-2.5 border border-zinc-800">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs text-zinc-500">Accuracy</span>
          </div>
          <p className="text-lg font-semibold text-cyan-400 tabular-nums">
            {((metrics?.accuracyRate ?? 0) * 100).toFixed(1)}%
          </p>
        </div>
        <div className="bg-zinc-800/50 rounded p-2.5 border border-zinc-800">
          <div className="flex items-center gap-1.5 mb-1">
            <Settings className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-xs text-zinc-500">Weight updates</span>
          </div>
          <p className="text-lg font-semibold text-white tabular-nums">
            {metrics?.weightAdjustments ?? 0}
          </p>
        </div>
      </div>

      <div className="mb-4">
        <h3 className="text-xs text-zinc-500 mb-2 uppercase tracking-wide">Model Weights</h3>
        <div className="space-y-2">
          {weights &&
            (Object.keys(MODEL_LABELS) as Array<keyof ModelWeights>).map(key => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs text-zinc-400 w-32">{MODEL_LABELS[key]}</span>
                <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 rounded-full transition-all duration-300"
                    style={{ width: `${weights[key] * 100}%` }}
                  />
                </div>
                <span className="text-xs text-white w-12 text-right tabular-nums">
                  {(weights[key] * 100).toFixed(1)}%
                </span>
              </div>
            ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleForceAdjust}
          disabled={adjusting}
          className="flex-1 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 text-cyan-300 rounded text-xs transition-colors disabled:opacity-50"
        >
          {adjusting ? 'Adjusting…' : 'Force re-balance'}
        </button>
        <button
          onClick={handleReset}
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded text-xs transition-colors"
        >
          Reset to defaults
        </button>
      </div>

      {metrics?.lastUpdate && (
        <p className="text-xs text-zinc-600 mt-3 text-center">
          Last weight update: {new Date(metrics.lastUpdate).toLocaleString()}
        </p>
      )}
    </div>
  );
}
