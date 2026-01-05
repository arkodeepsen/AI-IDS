'use client';

import { useState, useEffect } from 'react';
import { 
  Shield, 
  AlertTriangle, 
  Activity, 
  Cpu, 
  Database,
  TrendingUp,
  Clock
} from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  color: 'blue' | 'green' | 'red' | 'yellow' | 'purple';
}

function StatsCard({ title, value, subtitle, icon, trend, color }: StatsCardProps) {
  const colorClasses = {
    blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    green: 'bg-green-500/10 text-green-500 border-green-500/20',
    red: 'bg-red-500/10 text-red-500 border-red-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  };

  return (
    <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center text-sm ${trend.isPositive ? 'text-green-400' : 'text-red-400'}`}>
            <TrendingUp className={`w-4 h-4 mr-1 ${!trend.isPositive && 'rotate-180'}`} />
            {trend.value}%
          </div>
        )}
      </div>
      <h3 className="text-gray-400 text-sm font-medium">{title}</h3>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
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
    // Simulate real-time stats updates
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <StatsCard
        title="Total Packets"
        value={stats.totalPackets.toLocaleString()}
        subtitle="Analyzed this session"
        icon={<Database className="w-5 h-5" />}
        trend={{ value: 12, isPositive: true }}
        color="blue"
      />
      <StatsCard
        title="Anomalies"
        value={stats.anomalies}
        subtitle="Detected threats"
        icon={<AlertTriangle className="w-5 h-5" />}
        color="red"
      />
      <StatsCard
        title="Threat Level"
        value={stats.threatLevel}
        subtitle="Current system status"
        icon={<Shield className="w-5 h-5" />}
        color={stats.threatLevel === 'Low' ? 'green' : stats.threatLevel === 'Medium' ? 'yellow' : 'red'}
      />
      <StatsCard
        title="Packets/sec"
        value={stats.packetsPerSec}
        subtitle="Processing rate"
        icon={<Activity className="w-5 h-5" />}
        trend={{ value: 8, isPositive: true }}
        color="purple"
      />
      <StatsCard
        title="Detection Latency"
        value={`${stats.detectionLatency.toFixed(1)}ms`}
        subtitle="Avg response time"
        icon={<Cpu className="w-5 h-5" />}
        color="yellow"
      />
      <StatsCard
        title="Uptime"
        value={formatUptime(stats.uptime)}
        subtitle="System running"
        icon={<Clock className="w-5 h-5" />}
        color="green"
      />
    </div>
  );
}
