'use client';

import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from 'recharts';
import { MLModelMetrics } from '@/lib/types';
import { Loader2 } from 'lucide-react';

const MODEL_COLORS: Record<string, string> = {
  'Isolation Forest': '#22d3ee',
  Autoencoder: '#a78bfa',
  'Random Forest': '#34d399',
  XGBoost: '#f87171',
  Ensemble: '#facc15',
};

export default function ModelComparison() {
  const [metrics, setMetrics] = useState<MLModelMetrics[]>([]);
  const [view, setView] = useState<'bar' | 'radar'>('bar');
  const [retraining, setRetraining] = useState(false);
  const [retrainResult, setRetrainResult] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/metrics')
      .then(res => res.json())
      .then(data => {
        if (data.success) setMetrics(data.metrics);
      })
      .catch(console.error);
  }, []);

  const triggerRetrain = async () => {
    setRetraining(true);
    setRetrainResult(null);
    try {
      const res = await fetch('/api/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retrain' }),
      });
      const data = await res.json();
      if (data.success) {
        setRetrainResult(
          `Retrained on ${data.result.samplesUsed} samples in ${data.result.duration}ms · v${data.result.modelVersion}`
        );
      } else {
        setRetrainResult(`Retrain failed: ${data.error}`);
      }
    } catch (err) {
      setRetrainResult(`Retrain error: ${err}`);
    } finally {
      setRetraining(false);
    }
  };

  const barData = metrics.map(m => ({
    name: m.method.replace(' Clustering', ''),
    Accuracy: Number((m.accuracy * 100).toFixed(1)),
    Precision: Number((m.precision * 100).toFixed(1)),
    Recall: Number((m.recall * 100).toFixed(1)),
    F1: Number((m.f1Score * 100).toFixed(1)),
  }));

  const radarData = ['Accuracy', 'Precision', 'Recall', 'F1 Score', 'Speed'].map(metric => {
    const row: Record<string, number | string> = { metric };
    for (const m of metrics) {
      const score =
        metric === 'Accuracy'
          ? m.accuracy
          : metric === 'Precision'
          ? m.precision
          : metric === 'Recall'
          ? m.recall
          : metric === 'F1 Score'
          ? m.f1Score
          : Math.max(0, 1 - m.detectionTime / 10);
      row[m.method] = Number((score * 100).toFixed(1));
    }
    return row;
  });

  const ensembleMetric = metrics.find(m => m.method === 'Ensemble');

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-white tracking-wide uppercase">
            Model Comparison
          </h2>
          <p className="text-xs text-zinc-500">
            NSL-KDD baselines for the four ensemble members and the combined output.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={triggerRetrain}
            disabled={retraining}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 rounded text-xs transition-colors disabled:opacity-50"
          >
            {retraining ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            {retraining ? 'Retraining…' : 'Retrain Models'}
          </button>
          <div className="flex gap-1">
            <button
              onClick={() => setView('bar')}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                view === 'bar' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Bar
            </button>
            <button
              onClick={() => setView('radar')}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                view === 'radar' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Radar
            </button>
          </div>
        </div>
      </div>

      {retrainResult && (
        <div className="mb-3 px-3 py-2 bg-cyan-500/5 border border-cyan-500/30 rounded text-xs text-cyan-200">
          {retrainResult}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {metrics.map(m => (
          <div key={m.method} className="bg-zinc-800/50 rounded p-2.5 border border-zinc-800">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: MODEL_COLORS[m.method] ?? '#52525b' }}
              />
              <span className="text-xs text-zinc-300 truncate">{m.method}</span>
            </div>
            <div className="grid grid-cols-2 gap-1 text-xs">
              <div>
                <span className="text-zinc-600">Acc</span>
                <p className="text-white tabular-nums">{(m.accuracy * 100).toFixed(1)}%</p>
              </div>
              <div>
                <span className="text-zinc-600">FPR</span>
                <p className="text-white tabular-nums">{(m.falsePositiveRate * 100).toFixed(2)}%</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          {view === 'bar' ? (
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="name" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#52525b" fontSize={10} domain={[0, 100]} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#fafafa',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', color: '#a1a1aa' }} iconSize={8} />
              <Bar dataKey="Accuracy" fill="#22d3ee" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Precision" fill="#34d399" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Recall" fill="#facc15" radius={[2, 2, 0, 0]} />
              <Bar dataKey="F1" fill="#a78bfa" radius={[2, 2, 0, 0]} />
            </BarChart>
          ) : (
            <RadarChart data={radarData}>
              <PolarGrid stroke="#27272a" />
              <PolarAngleAxis dataKey="metric" stroke="#52525b" fontSize={10} />
              <PolarRadiusAxis stroke="#52525b" fontSize={9} domain={[0, 100]} />
              {metrics.map(m => (
                <Radar
                  key={m.method}
                  name={m.method}
                  dataKey={m.method}
                  stroke={MODEL_COLORS[m.method] ?? '#52525b'}
                  fill={MODEL_COLORS[m.method] ?? '#52525b'}
                  fillOpacity={0.15}
                  strokeWidth={1.5}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: '11px', color: '#a1a1aa' }} iconSize={8} />
            </RadarChart>
          )}
        </ResponsiveContainer>
      </div>

      {ensembleMetric && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-zinc-800/50 rounded p-2.5">
            <p className="text-xs text-zinc-500">Best Accuracy</p>
            <p className="text-sm text-white mt-0.5 tabular-nums">
              Ensemble {(ensembleMetric.accuracy * 100).toFixed(2)}%
            </p>
          </div>
          <div className="bg-zinc-800/50 rounded p-2.5">
            <p className="text-xs text-zinc-500">Lowest FPR</p>
            <p className="text-sm text-white mt-0.5 tabular-nums">
              Ensemble {(ensembleMetric.falsePositiveRate * 100).toFixed(2)}%
            </p>
          </div>
          <div className="bg-zinc-800/50 rounded p-2.5">
            <p className="text-xs text-zinc-500">Best F1</p>
            <p className="text-sm text-white mt-0.5 tabular-nums">
              Ensemble {(ensembleMetric.f1Score * 100).toFixed(2)}%
            </p>
          </div>
          <div className="bg-zinc-800/50 rounded p-2.5">
            <p className="text-xs text-zinc-500">Latency</p>
            <p className="text-sm text-white mt-0.5 tabular-nums">
              {ensembleMetric.detectionTime.toFixed(1)} ms
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
