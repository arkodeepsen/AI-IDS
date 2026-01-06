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
import { Cpu, Zap, Target, Shield } from 'lucide-react';

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
    'F1 Score': (m.f1Score * 100).toFixed(1),
  }));

  const radarData = [
    { metric: 'Accuracy', ...Object.fromEntries(metrics.map(m => [m.method, m.accuracy * 100])) },
    { metric: 'Precision', ...Object.fromEntries(metrics.map(m => [m.method, m.precision * 100])) },
    { metric: 'Recall', ...Object.fromEntries(metrics.map(m => [m.method, m.recall * 100])) },
    { metric: 'F1 Score', ...Object.fromEntries(metrics.map(m => [m.method, m.f1Score * 100])) },
    { metric: 'Speed', ...Object.fromEntries(metrics.map(m => [m.method, 100 - m.detectionTime * 10])) },
  ];

  const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#f97316', '#8b5cf6'];

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl">
          <p className="text-gray-400 text-sm mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: <span className="font-semibold">{entry.value}%</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">ML Model Comparison</h2>
          <p className="text-gray-400 text-sm">Performance metrics across detection methods</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView('bar')}
            className={`px-3 py-1 rounded-lg text-sm transition-colors ${view === 'bar'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
          >
            Bar Chart
          </button>
          <button
            onClick={() => setView('radar')}
            className={`px-3 py-1 rounded-lg text-sm transition-colors ${view === 'radar'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
          >
            Radar Chart
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {metrics.map((m, idx) => (
          <div key={m.method} className="bg-gray-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: colors[idx] }}
              />
              <span className="text-sm text-gray-300">{m.method.replace(' Clustering', '')}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500">Accuracy</span>
                <p className="text-white font-medium">{(m.accuracy * 100).toFixed(1)}%</p>
              </div>
              <div>
                <span className="text-gray-500">FPR</span>
                <p className="text-white font-medium">{(m.falsePositiveRate * 100).toFixed(2)}%</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          {view === 'bar' ? (
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} domain={[0, 100]} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="Accuracy" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Precision" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Recall" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="F1 Score" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : (
            <RadarChart data={radarData}>
              <PolarGrid stroke="#374151" />
              <PolarAngleAxis dataKey="metric" stroke="#6b7280" fontSize={12} />
              <PolarRadiusAxis stroke="#6b7280" fontSize={10} domain={[0, 100]} />
              {metrics.map((m, idx) => (
                <Radar
                  key={m.method}
                  name={m.method}
                  dataKey={m.method}
                  stroke={colors[idx]}
                  fill={colors[idx]}
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              ))}
              <Legend />
            </RadarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Research Insights */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <Target className="w-8 h-8 text-blue-400" />
          <div>
            <p className="text-xs text-gray-400">Best Accuracy</p>
            <p className="text-sm font-medium text-white">Ensemble (95.67%)</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
          <Shield className="w-8 h-8 text-green-400" />
          <div>
            <p className="text-xs text-gray-400">Lowest FPR</p>
            <p className="text-sm font-medium text-white">Ensemble (1.89%)</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <Zap className="w-8 h-8 text-yellow-400" />
          <div>
            <p className="text-xs text-gray-400">Fastest</p>
            <p className="text-sm font-medium text-white">K-Means (1.8ms)</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
          <Cpu className="w-8 h-8 text-purple-400" />
          <div>
            <p className="text-xs text-gray-400">Best F1</p>
            <p className="text-sm font-medium text-white">Ensemble (93.11%)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
