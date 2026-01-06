'use client';

import { useState, useEffect } from 'react';
import {
  Shield,
  AlertTriangle,
  Activity,
  Cpu,
  Database,
  Clock
} from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
}

function StatsCard({ title, value, subtitle, icon }: StatsCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-zinc-500">{icon}</span>
      </div>
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="text-sm text-zinc-400 mt-1">{title}</p>
      {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

interface SystemStats {
  totalPackets: number;
  anomalies: number;
  threatLevel: string;
  uptime: number;
  packetsPerSec: number;
  detectionLatency: number;
}

export default function StatsCards() {
  const [stats, setStats] = useState<SystemStats>({
    totalPackets: 0,
    anomalies: 0,
    threatLevel: 'Low',
    uptime: 0,
    packetsPerSec: 0,
    detectionLatency: 0,
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => {
      setStats(prev => ({
        totalPackets: prev.totalPackets + Math.floor(Math.random() * 50) + 10,
        anomalies: prev.anomalies + (Math.random() < 0.1 ? 1 : 0),
        threatLevel: Math.random() < 0.95 ? 'Low' : Math.random() < 0.8 ? 'Medium' : 'High',
        uptime: prev.uptime + 1,
        packetsPerSec: Math.floor(Math.random() * 500) + 200,
        detectionLatency: Math.random() * 5 + 2,
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number): string => {
    if (!mounted) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatsCard
        title="Total Packets"
        value={stats.totalPackets.toLocaleString()}
        subtitle="Analyzed"
        icon={<Database className="w-4 h-4" />}
      />
      <StatsCard
        title="Anomalies"
        value={stats.anomalies}
        subtitle="Detected"
        icon={<AlertTriangle className="w-4 h-4" />}
      />
      <StatsCard
        title="Threat Level"
        value={stats.threatLevel}
        subtitle="Current"
        icon={<Shield className="w-4 h-4" />}
      />
      <StatsCard
        title="Packets/sec"
        value={stats.packetsPerSec}
        subtitle="Processing"
        icon={<Activity className="w-4 h-4" />}
      />
      <StatsCard
        title="Latency"
        value={`${stats.detectionLatency.toFixed(1)}ms`}
        subtitle="Detection"
        icon={<Cpu className="w-4 h-4" />}
      />
      <StatsCard
        title="Uptime"
        value={formatUptime(stats.uptime)}
        subtitle="Session"
        icon={<Clock className="w-4 h-4" />}
      />
    </div>
  );
}
