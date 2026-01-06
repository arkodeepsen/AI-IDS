'use client';

import { useState, useEffect } from 'react';
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
  Legend
} from 'recharts';
import { MLModelMetrics } from '@/lib/types';

export default function ModelComparison() {
  const [metrics, setMetrics] = useState<MLModelMetrics[]>([]);
  const [view, setView] = useState<'bar' | 'radar'>('bar');

  useEffect(() => {
    fetch('/api/metrics')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setMetrics(data.metrics);
        }
      })
      .catch(console.error);
  }, []);

  const barData = metrics.map(m => ({
    name: m.method.replace(' Clustering', ''),
    Accuracy: (m.accuracy * 100).toFixed(1),
    Precision: (m.precision * 100).toFixed(1),
    Recall: (m.recall * 100).toFixed(1),
    F1: (m.f1Score * 100).toFixed(1),
  }));

  const radarData = [
    { metric: 'Accuracy', ...Object.fromEntries(metrics.map(m => [m.method, m.accuracy * 100])) },
    { metric: 'Precision', ...Object.fromEntries(metrics.map(m => [m.method, m.precision * 100])) },
    { metric: 'Recall', ...Object.fromEntries(metrics.map(m => [m.method, m.recall * 100])) },
    { metric: 'F1 Score', ...Object.fromEntries(metrics.map(m => [m.method, m.f1Score * 100])) },
    { metric: 'Speed', ...Object.fromEntries(metrics.map(m => [m.method, 100 - m.detectionTime * 10])) },
  ];

  const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-zinc-900 border border-zinc-700 rounded-md p-2 text-sm">
          <p className="text-zinc-400 text-xs mb-1">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-xs" style={{ color: entry.color }}>
              {entry.name}: {entry.value}%
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-medium text-white">Model Comparison</h2>
          <p className="text-xs text-zinc-500">Performance metrics</p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setView('bar')}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              view === 'bar'
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Bar
          </button>
          <button
            onClick={() => setView('radar')}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              view === 'radar'
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Radar
          </button>
        </div>
      </div>

      {/* Model Stats */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {metrics.map((m, idx) => (
          <div key={m.method} className="bg-zinc-800/50 rounded p-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: colors[idx] }}
              />
              <span className="text-xs text-zinc-400 truncate">
                {m.method.replace(' Clustering', '')}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1 text-xs">
              <div>
                <span className="text-zinc-600">Acc</span>
                <p className="text-white">{(m.accuracy * 100).toFixed(1)}%</p>
              </div>
              <div>
                <span className="text-zinc-600">FPR</span>
                <p className="text-white">{(m.falsePositiveRate * 100).toFixed(2)}%</p>
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
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '11px' }} iconSize={8} />
              <Bar dataKey="Accuracy" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Precision" fill="#22c55e" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Recall" fill="#f59e0b" radius={[2, 2, 0, 0]} />
              <Bar dataKey="F1" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
            </BarChart>
          ) : (
            <RadarChart data={radarData}>
              <PolarGrid stroke="#27272a" />
              <PolarAngleAxis dataKey="metric" stroke="#52525b" fontSize={10} />
              <PolarRadiusAxis stroke="#52525b" fontSize={9} domain={[0, 100]} />
              {metrics.map((m, idx) => (
                <Radar
                  key={m.method}
                  name={m.method}
                  dataKey={m.method}
                  stroke={colors[idx]}
                  fill={colors[idx]}
                  fillOpacity={0.1}
                  strokeWidth={1.5}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: '11px' }} iconSize={8} />
            </RadarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Summary Stats */}
      <div className="mt-4 grid grid-cols-4 gap-3">
        <div className="bg-zinc-800/50 rounded p-2.5">
          <p className="text-xs text-zinc-500">Best Accuracy</p>
          <p className="text-sm text-white mt-0.5">Ensemble 95.67%</p>
        </div>
        <div className="bg-zinc-800/50 rounded p-2.5">
          <p className="text-xs text-zinc-500">Lowest FPR</p>
          <p className="text-sm text-white mt-0.5">Ensemble 1.89%</p>
        </div>
        <div className="bg-zinc-800/50 rounded p-2.5">
          <p className="text-xs text-zinc-500">Fastest</p>
          <p className="text-sm text-white mt-0.5">K-Means 1.8ms</p>
        </div>
        <div className="bg-zinc-800/50 rounded p-2.5">
          <p className="text-xs text-zinc-500">Best F1</p>
          <p className="text-sm text-white mt-0.5">Ensemble 93.11%</p>
        </div>
      </div>
    </div>
  );
}
