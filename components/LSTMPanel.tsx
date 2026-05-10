'use client';

import { useEffect, useState, useCallback } from 'react';
import { Activity, Loader2, Network } from 'lucide-react';

interface LSTMMetrics {
  trainedAt: string;
  dataset: string;
  sequenceLength: number;
  hiddenSize: number;
  epochs: number;
  trainSamples: number;
  testSamples: number;
  threshold: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  history: Array<{ epoch: number; loss: number; accuracy: number }>;
}

interface LSTMScoreResult {
  success: boolean;
  probability?: number;
  threshold?: number;
  verdict?: string;
  sequenceLength?: number;
  window?: Array<{
    id: string;
    timestamp: string;
    isAnomaly: boolean;
    threatLevel: string;
    attackType: string | null;
    sourceIP: string;
  }>;
  error?: string;
}

export default function LSTMPanel() {
  const [metrics, setMetrics] = useState<LSTMMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<LSTMScoreResult | null>(null);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/lstm')
      .then(r => r.json())
      .then(d => {
        if (d.success) setMetrics(d.metrics);
        else setError(d.error || 'LSTM unavailable');
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const scoreSequence = useCallback(async () => {
    setScoring(true);
    setError(null);
    try {
      const res = await fetch('/api/lstm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as LSTMScoreResult;
      if (data.success) setScore(data);
      else setError(data.error || 'LSTM scoring failed');
    } catch (e) {
      setError(String(e));
    } finally {
      setScoring(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="text-center text-zinc-500 py-6 text-sm">Loading LSTM state…</div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <h2 className="text-base font-semibold text-white tracking-wide uppercase mb-2">
          LSTM Sequence Model
        </h2>
        <p className="text-xs text-zinc-500">
          {error ?? 'LSTM artefacts not present. Run `npm run train:lstm` to train.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-white tracking-wide uppercase">
            LSTM Sequence Model
          </h2>
          <p className="text-xs text-zinc-500">
            Recurrent classifier over windows of {metrics.sequenceLength} consecutive flows · hidden
            ={metrics.hiddenSize} · trained on NSL-KDD.
          </p>
        </div>
        <button
          onClick={scoreSequence}
          disabled={scoring}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-300 rounded text-xs transition-colors disabled:opacity-50"
        >
          {scoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
          {scoring ? 'Scoring…' : 'Score Recent Window'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Accuracy" value={`${(metrics.accuracy * 100).toFixed(2)}%`} tone="emerald" />
        <Stat label="F1" value={`${(metrics.f1Score * 100).toFixed(2)}%`} tone="cyan" />
        <Stat label="Recall" value={`${(metrics.recall * 100).toFixed(2)}%`} tone="violet" />
        <Stat
          label="FPR"
          value={`${(metrics.falsePositiveRate * 100).toFixed(2)}%`}
          tone="amber"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-zinc-500 mb-3">
        <span>Window: {metrics.sequenceLength}</span>
        <span>Hidden: {metrics.hiddenSize}</span>
        <span>Train samples: {metrics.trainSamples.toLocaleString()}</span>
        <span>Trained: {new Date(metrics.trainedAt).toLocaleDateString()}</span>
      </div>

      {score && (
        <div
          className={`mt-3 px-3 py-2 rounded border text-xs ${
            score.verdict === 'anomalous-sequence'
              ? 'bg-red-500/10 border-red-500/30 text-red-200'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <Network className="w-3.5 h-3.5" />
            <span className="font-medium uppercase tracking-wide">
              {score.verdict?.replace('-', ' ')}
            </span>
            <span className="ml-auto tabular-nums">
              p = {((score.probability ?? 0) * 100).toFixed(2)}%
            </span>
          </div>
          <p className="text-[11px] mt-1 text-white/70">
            Threshold {((score.threshold ?? 0) * 100).toFixed(0)}% on a window of{' '}
            {score.sequenceLength} flows.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'emerald' | 'cyan' | 'violet' | 'amber';
}) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-400',
    cyan: 'text-cyan-400',
    violet: 'text-violet-400',
    amber: 'text-amber-400',
  };
  return (
    <div className="bg-zinc-800/50 rounded p-2.5 border border-zinc-800">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${colors[tone]}`}>{value}</p>
    </div>
  );
}
