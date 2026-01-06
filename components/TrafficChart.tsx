'use client';

import { useState, useEffect } from 'react';
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
  Area
} from 'recharts';

interface ChartData {
  time: string;
  normal: number;
  anomaly: number;
  total: number;
}

export default function TrafficChart() {
  const [data, setData] = useState<ChartData[]>([]);
  const [chartType, setChartType] = useState<'line' | 'area'>('area');

  useEffect(() => {
    const initialData: ChartData[] = [];
    const now = new Date();

    for (let i = 30; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 2000);
      initialData.push({
        time: time.toLocaleTimeString('en-US', { hour12: false }),
        normal: Math.floor(Math.random() * 80) + 100,
        anomaly: Math.floor(Math.random() * 15),
        total: 0,
      });
    }
    initialData.forEach(d => d.total = d.normal + d.anomaly);
    setData(initialData);

    const interval = setInterval(() => {
      setData(prev => {
        const newData = [...prev.slice(1)];
        const now = new Date();
        const normal = Math.floor(Math.random() * 80) + 100;
        const anomaly = Math.floor(Math.random() * 15);
        newData.push({
          time: now.toLocaleTimeString('en-US', { hour12: false }),
          normal,
          anomaly,
          total: normal + anomaly,
        });
        return newData;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-zinc-900 border border-zinc-700 rounded-md p-2 text-sm">
          <p className="text-zinc-400 text-xs mb-1">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-xs" style={{ color: entry.color }}>
              {entry.name}: {entry.value}
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
          <h2 className="text-base font-medium text-white">Network Traffic</h2>
          <p className="text-xs text-zinc-500">Real-time monitoring</p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setChartType('area')}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              chartType === 'area'
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Area
          </button>
          <button
            onClick={() => setChartType('line')}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              chartType === 'line'
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Line
          </button>
        </div>
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'area' ? (
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="time"
                stroke="#52525b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#52525b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '12px' }}
                iconSize={8}
              />
              <Area
                type="monotone"
                dataKey="normal"
                name="Normal"
                stroke="#22c55e"
                fill="#22c55e"
                fillOpacity={0.1}
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="anomaly"
                name="Anomaly"
                stroke="#ef4444"
                fill="#ef4444"
                fillOpacity={0.1}
                strokeWidth={1.5}
              />
            </AreaChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="time"
                stroke="#52525b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#52525b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '12px' }}
                iconSize={8}
              />
              <Line
                type="monotone"
                dataKey="normal"
                name="Normal"
                stroke="#22c55e"
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="anomaly"
                name="Anomaly"
                stroke="#ef4444"
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
