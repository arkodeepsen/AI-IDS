'use client';

import { useState, useEffect, useCallback } from 'react';
import { DetectionResult } from '@/lib/types';
import {
  Shield,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export default function DetectionFeed() {
  const [results, setResults] = useState<DetectionResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'anomaly' | 'normal'>('all');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsRunning(true);
  }, []);

  const fetchDetections = useCallback(async () => {
    try {
      const response = await fetch('/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 5, method: 'Ensemble' }),
      });
      const data = await response.json();
      if (data.success && data.results) {
        setResults(prev => [...data.results, ...prev].slice(0, 50));
      }
    } catch (error) {
      console.error('Detection fetch error:', error);
    }
  }, []);

  useEffect(() => {
    if (!isRunning || !mounted) return;

    fetchDetections();
    const interval = setInterval(fetchDetections, 3000);
    return () => clearInterval(interval);
  }, [isRunning, fetchDetections, mounted]);

  const formatTime = (timestamp: Date | string) => {
    if (!mounted) return '';
    return new Date(timestamp).toLocaleTimeString();
  };

  const getThreatIcon = (level: string) => {
    switch (level) {
      case 'critical':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'high':
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'medium':
        return <Shield className="w-4 h-4 text-yellow-500" />;
      default:
        return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
  };

  const filteredResults = results.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'anomaly') return r.isAnomaly;
    return !r.isAnomaly;
  });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-medium text-white">Detection Feed</h2>
          <p className="text-xs text-zinc-500">Real-time results</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-zinc-800 rounded p-0.5">
            {(['all', 'anomaly', 'normal'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-1 rounded text-xs capitalize transition-colors ${
                  filter === f
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              isRunning
                ? 'bg-zinc-800 text-red-400 hover:bg-zinc-700'
                : 'bg-zinc-800 text-green-400 hover:bg-zinc-700'
            }`}
          >
            {isRunning ? 'Pause' : 'Resume'}
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1 custom-scrollbar">
        {filteredResults.length === 0 ? (
          <div className="text-center py-8 text-zinc-500">
            <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No detections yet</p>
          </div>
        ) : (
          filteredResults.map((result) => (
            <div
              key={result.id}
              className="border border-zinc-800 rounded-md bg-zinc-900/50"
            >
              <div
                className="p-3 cursor-pointer"
                onClick={() => setExpandedId(expandedId === result.id ? null : result.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getThreatIcon(result.threatLevel)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white">
                          {result.isAnomaly ? result.attackType || 'Unknown' : 'Normal'}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          result.isAnomaly
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-green-500/10 text-green-400'
                        }`}>
                          {result.isAnomaly ? 'Anomaly' : 'Normal'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {result.packet.sourceIP} → {result.packet.destIP}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-zinc-400">{result.detectionMethod}</p>
                      <p className="text-xs text-zinc-500">{formatTime(result.timestamp)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-12">
                        <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              result.confidence > 80 ? 'bg-red-500' :
                              result.confidence > 50 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${result.confidence}%` }}
                          />
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5 text-center">
                          {result.confidence.toFixed(0)}%
                        </p>
                      </div>
                      {expandedId === result.id ? (
                        <ChevronUp className="w-4 h-4 text-zinc-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-zinc-500" />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {expandedId === result.id && (
                <div className="px-3 pb-3 border-t border-zinc-800">
                  <div className="grid grid-cols-4 gap-3 mt-3">
                    <div>
                      <p className="text-xs text-zinc-500">Protocol</p>
                      <p className="text-xs text-white mt-0.5">{result.packet.protocol}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Size</p>
                      <p className="text-xs text-white mt-0.5">{result.packet.packetSize} bytes</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Threat</p>
                      <p className="text-xs text-white mt-0.5 capitalize">{result.threatLevel}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Flags</p>
                      <p className="text-xs text-white mt-0.5">{result.packet.flags || 'N/A'}</p>
                    </div>
                  </div>

                  {result.description && (
                    <div className="mt-3">
                      <p className="text-xs text-zinc-500">Description</p>
                      <p className="text-xs text-zinc-300 mt-0.5">{result.description}</p>
                    </div>
                  )}

                  {result.isAnomaly && result.recommendations.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-zinc-500 mb-1">Recommendations</p>
                      <ul className="space-y-1">
                        {result.recommendations.slice(0, 3).map((rec, idx) => (
                          <li key={idx} className="text-xs text-zinc-400 flex items-start gap-1.5">
                            <span className="text-blue-400 mt-0.5">-</span>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
