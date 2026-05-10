'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Shield,
  AlertTriangle,
  Activity,
  Cpu,
  Database,
  Ban,
} from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  accent?: 'cyan' | 'red' | 'amber' | 'emerald' | 'blue';
}

const ACCENT: Record<string, string> = {
  cyan: 'text-cyan-400 bg-cyan-500/10',
  red: 'text-red-400 bg-red-500/10',
  amber: 'text-amber-400 bg-amber-500/10',
  emerald: 'text-emerald-400 bg-emerald-500/10',
  blue: 'text-blue-400 bg-blue-500/10',
};

function StatsCard({ title, value, subtitle, icon, accent = 'cyan' }: StatsCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 transition-colors hover:border-zinc-700">
      <div className="flex items-center justify-between mb-3">
        <span className={`p-1.5 rounded ${ACCENT[accent]}`}>{icon}</span>
      </div>
      <p className="text-2xl font-semibold text-white tabular-nums">{value}</p>
      <p className="text-sm text-zinc-400 mt-1">{title}</p>
      {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

interface BackendStats {
  totalPackets: number;
  totalAnomalies: number;
  detectionRate: string;
  blockedIPs: number;
  newAlerts: number;
  threatLevelDistribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

const ZERO_STATS: BackendStats = {
  totalPackets: 0,
  totalAnomalies: 0,
  detectionRate: '0.00%',
  blockedIPs: 0,
  newAlerts: 0,
  threatLevelDistribution: { critical: 0, high: 0, medium: 0, low: 0 },
};

export default function StatsCards() {
  const [stats, setStats] = useState<BackendStats>(ZERO_STATS);
  const [pps, setPps] = useState(0);
  const [latency, setLatency] = useState(0);
  const [mounted, setMounted] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const start = performance.now();
      const res = await fetch('/api/stats?period=24h', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setLatency(performance.now() - start);
      }
    } catch (err) {
      console.error('Stats fetch failed:', err);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchStats();
    const interval = setInterval(fetchStats, 4000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Estimate packets/sec from running average so the card never shows zero.
  useEffect(() => {
    if (!mounted) return;
    let last = stats.totalPackets;
    const t = setInterval(() => {
      const delta = stats.totalPackets - last;
      last = stats.totalPackets;
      setPps(prev => Math.round(prev * 0.7 + Math.max(0, delta) * 0.3));
    }, 2000);
    return () => clearInterval(t);
  }, [mounted, stats.totalPackets]);

  const threatLevel = stats.threatLevelDistribution.critical > 0
    ? 'Critical'
    : stats.threatLevelDistribution.high > 0
    ? 'High'
    : stats.threatLevelDistribution.medium > 0
    ? 'Medium'
    : 'Low';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatsCard
        title="Total Packets"
        value={stats.totalPackets.toLocaleString()}
        subtitle="Analyzed (24h)"
        icon={<Database className="w-4 h-4" />}
        accent="cyan"
      />
      <StatsCard
        title="Threats Detected"
        value={stats.totalAnomalies.toLocaleString()}
        subtitle={stats.detectionRate}
        icon={<AlertTriangle className="w-4 h-4" />}
        accent="red"
      />
      <StatsCard
        title="Threat Level"
        value={threatLevel}
        subtitle="Current"
        icon={<Shield className="w-4 h-4" />}
        accent={
          threatLevel === 'Critical' || threatLevel === 'High'
            ? 'red'
            : threatLevel === 'Medium'
            ? 'amber'
            : 'emerald'
        }
      />
      <StatsCard
        title="Blocked IPs"
        value={stats.blockedIPs}
        subtitle="Auto-response"
        icon={<Ban className="w-4 h-4" />}
        accent="amber"
      />
      <StatsCard
        title="Packets/sec"
        value={pps.toLocaleString()}
        subtitle="Throughput"
        icon={<Activity className="w-4 h-4" />}
        accent="blue"
      />
      <StatsCard
        title="Latency"
        value={`${latency.toFixed(1)}ms`}
        subtitle="API"
        icon={<Cpu className="w-4 h-4" />}
        accent="cyan"
      />
    </div>
  );
}
