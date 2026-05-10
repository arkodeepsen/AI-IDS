'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';

interface ModelWeights {
  isolationForest: number;
  autoencoder: number;
  randomForest: number;
  xgboost: number;
}

const COLORS = {
  isolationForest: '#22d3ee', // cyan-400 — Statistical Outliers
  autoencoder: '#a78bfa',     // violet-400 — Complex Anomalies
  randomForest: '#34d399',    // emerald-400 — Attack Prediction
  xgboost: '#f87171',         // red-400 — High-speed Boosting
};

const LABELS = {
  isolationForest: 'Isolation Forest',
  autoencoder: 'Autoencoder NN',
  randomForest: 'Random Forest',
  xgboost: 'XGBoost',
};

const SUBTITLES = {
  isolationForest: 'Statistical Outliers',
  autoencoder: 'Complex Anomalies',
  randomForest: 'Attack Prediction',
  xgboost: 'Gradient Boosting',
};

/**
 * Donut chart of the live ensemble weights, mirroring the project deck slide
 * "ML Ensemble Detection Pipeline".
 */
export default function EnsembleDonut() {
  const [weights, setWeights] = useState<ModelWeights | null>(null);

  const fetchWeights = useCallback(async () => {
    try {
      const res = await fetch('/api/rlhf', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.weights) {
        setWeights(data.weights);
      }
    } catch (err) {
      console.error('Weights fetch failed:', err);
    }
  }, []);

  useEffect(() => {
    fetchWeights();
    const t = setInterval(fetchWeights, 8000);
    return () => clearInterval(t);
  }, [fetchWeights]);

  const data = weights
    ? (Object.keys(LABELS) as Array<keyof ModelWeights>).map(key => ({
        key,
        name: LABELS[key],
        value: Number((weights[key] * 100).toFixed(1)),
        color: COLORS[key],
      }))
    : [];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 h-full">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-white tracking-wide uppercase">
          ML Ensemble Pipeline
        </h2>
        <p className="text-xs text-zinc-500">
          Weighted voting across four detectors. Updated by Active Learning.
        </p>
      </div>

      <div className="h-[220px]">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-zinc-500">
            Loading weights…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={88}
                paddingAngle={3}
                dataKey="value"
                stroke="#0a0a0a"
                strokeWidth={2}
              >
                {data.map(entry => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#fafafa',
                }}
                formatter={(value) => [`${value}%`, 'Weight']}
              />
              <Legend
                verticalAlign="bottom"
                wrapperStyle={{ fontSize: '11px', color: '#a1a1aa' }}
                iconSize={8}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {data.map(d => (
          <div key={d.key} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="text-zinc-300 truncate">{d.name}</span>
            <span className="ml-auto text-zinc-500">{SUBTITLES[d.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
