'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from 'recharts';

interface ChartData {
  time: string;
  normal: number;
  anomaly: number;
}

interface ApiDetection {
  timestamp: string;
  isAnomaly: boolean;
}

const BUCKETS = 24;

/**
 * Aggregates the last N detections into rolling buckets and renders them as
 * an area / line chart. Pulls from /api/detections so the chart reflects the
 * actual database, not a random simulation.
 */
export default function TrafficChart({ refreshKey }: { refreshKey?: number }) {
  const [data, setData] = useState<ChartData[]>([]);
  const [chartType, setChartType] = useState<'line' | 'area'>('area');

  const fetchAndBucket = useCallback(async () => {
    try {
      const res = await fetch('/api/detections?limit=500', { cache: 'no-store' });
      const body = await res.json();
      if (!body.success) return;

      const all: ApiDetection[] = body.results;
      if (all.length === 0) {
        setData([]);
        return;
      }

      // Use the timestamp of the newest entry as the right edge.
      const newest = new Date(all[0].timestamp).getTime();
      const oldest = new Date(all[all.length - 1].timestamp).getTime();
      const span = Math.max(newest - oldest, 60_000);
      const bucketSpan = span / BUCKETS;

      const buckets: ChartData[] = Array.from({ length: BUCKETS }, (_, i) => {
        const bucketEnd = newest - (BUCKETS - 1 - i) * bucketSpan;
        return {
          time: new Date(bucketEnd).toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
          }),
          normal: 0,
          anomaly: 0,
        };
      });

      for (const d of all) {
        const t = new Date(d.timestamp).getTime();
        const idx = Math.min(
          BUCKETS - 1,
          Math.max(0, Math.floor(((t - oldest) / span) * (BUCKETS - 1)))
        );
        if (d.isAnomaly) buckets[idx].anomaly += 1;
        else buckets[idx].normal += 1;
      }

      setData(buckets);
    } catch (err) {
      console.error('Traffic chart fetch failed:', err);
    }
  }, []);

  useEffect(() => {
    fetchAndBucket();
    const t = setInterval(fetchAndBucket, 5000);
    return () => clearInterval(t);
  }, [fetchAndBucket, refreshKey]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-white tracking-wide uppercase">
            Detections Over Time
          </h2>
          <p className="text-xs text-zinc-500">
            Bucketed from the SQLite detection log. Anomalies in red, normal in cyan.
          </p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setChartType('area')}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              chartType === 'area' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Area
          </button>
          <button
            onClick={() => setChartType('line')}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              chartType === 'line' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Line
          </button>
        </div>
      </div>

      <div className="h-[280px]">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-zinc-500">
            No detections yet — start the live replay to populate.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'area' ? (
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="time" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#fafafa',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', color: '#a1a1aa' }} iconSize={8} />
                <Area
                  type="monotone"
                  dataKey="normal"
                  name="Normal"
                  stroke="#22d3ee"
                  fill="#22d3ee"
                  fillOpacity={0.15}
                  strokeWidth={1.5}
                />
                <Area
                  type="monotone"
                  dataKey="anomaly"
                  name="Anomaly"
                  stroke="#f87171"
                  fill="#f87171"
                  fillOpacity={0.25}
                  strokeWidth={1.5}
                />
              </AreaChart>
            ) : (
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="time" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#fafafa',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', color: '#a1a1aa' }} iconSize={8} />
                <Line
                  type="monotone"
                  dataKey="normal"
                  name="Normal"
                  stroke="#22d3ee"
                  strokeWidth={1.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="anomaly"
                  name="Anomaly"
                  stroke="#f87171"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
