'use client';

import { useState, useEffect, useCallback } from 'react';
import { DetectionResult } from '@/lib/types';
import { 
  Shield, 
  AlertTriangle, 
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink
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
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'high':
        return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      case 'medium':
        return <Shield className="w-5 h-5 text-yellow-500" />;
      default:
        return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
  };

  const getThreatBg = (level: string) => {
    switch (level) {
      case 'critical':
        return 'bg-red-500/10 border-red-500/30';
      case 'high':
        return 'bg-orange-500/10 border-orange-500/30';
      case 'medium':
        return 'bg-yellow-500/10 border-yellow-500/30';
      default:
        return 'bg-green-500/10 border-green-500/30';
    }
  };

  const filteredResults = results.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'anomaly') return r.isAnomaly;
    return !r.isAnomaly;
  });

  return (
    <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Detection Feed</h2>
          <p className="text-gray-400 text-sm">Real-time intrusion detection results</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
            {(['all', 'anomaly', 'normal'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded text-sm capitalize transition-colors ${
                  filter === f 
                    ? 'bg-blue-500 text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isRunning 
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
            }`}
          >
            {isRunning ? 'Pause' : 'Resume'}
          </button>
        </div>
      </div>

      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
        {filteredResults.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No detections yet. Monitoring network traffic...</p>
          </div>
        ) : (
          filteredResults.map((result) => (
            <div
              key={result.id}
              className={`border rounded-lg transition-all ${getThreatBg(result.threatLevel)}`}
            >
              <div 
                className="p-4 cursor-pointer"
                onClick={() => setExpandedId(expandedId === result.id ? null : result.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getThreatIcon(result.threatLevel)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">
                          {result.isAnomaly ? result.attackType || 'Unknown Threat' : 'Normal Traffic'}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          result.isAnomaly 
                            ? 'bg-red-500/20 text-red-400' 
                            : 'bg-green-500/20 text-green-400'
                        }`}>
                          {result.isAnomaly ? 'ANOMALY' : 'NORMAL'}
                        </span>
                      </div>
                      <p className="text-gray-400 text-sm">
                        {result.packet.sourceIP}:{result.packet.sourcePort} → {result.packet.destIP}:{result.packet.destPort}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-400">{result.detectionMethod}</p>
                      <p className="text-xs text-gray-500">
                        {formatTime(result.timestamp)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16">
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              result.confidence > 80 ? 'bg-red-500' :
                              result.confidence > 50 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${result.confidence}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1 text-center">
                          {result.confidence.toFixed(0)}%
                        </p>
                      </div>
                      {expandedId === result.id ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {expandedId === result.id && (
                <div className="px-4 pb-4 border-t border-gray-700/50">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <div>
                      <p className="text-xs text-gray-500">Protocol</p>
                      <p className="text-sm text-white">{result.packet.protocol}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Packet Size</p>
                      <p className="text-sm text-white">{result.packet.packetSize} bytes</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Threat Level</p>
                      <p className={`text-sm capitalize ${
                        result.threatLevel === 'critical' ? 'text-red-400' :
                        result.threatLevel === 'high' ? 'text-orange-400' :
                        result.threatLevel === 'medium' ? 'text-yellow-400' : 'text-green-400'
                      }`}>
                        {result.threatLevel}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Flags</p>
                      <p className="text-sm text-white">{result.packet.flags || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs text-gray-500 mb-1">Description</p>
                    <p className="text-sm text-gray-300">{result.description}</p>
                  </div>

                  {result.isAnomaly && result.recommendations.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs text-gray-500 mb-2">Recommendations</p>
                      <ul className="space-y-1">
                        {result.recommendations.slice(0, 3).map((rec, idx) => (
                          <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                            <span className="text-blue-400 mt-1">•</span>
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
