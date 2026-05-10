'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Shield,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
} from 'lucide-react';

interface DBDetection {
  id: string;
  timestamp: string;
  isAnomaly: boolean;
  threatLevel: string;
  attackType: string | null;
  confidence: number;
  detectionMethod: string;
  description: string;
  recommendations: string[];
  modelScores: {
    isolationForest?: number;
    autoencoder?: number;
    randomForest?: number;
    xgboost?: number;
  };
  ipEntropy?: {
    source: number;
    destination: number;
    sourceFanout: number;
  };
  autoResponse: string | null;
  packet: {
    sourceIP: string;
    destIP: string;
    sourcePort: number;
    destPort: number;
    protocol: string;
    packetSize: number;
    flags: string | null;
  };
}

interface Props {
  /** When true, only show anomalies (used by /detection tab Active Learning view). */
  anomalyOnly?: boolean;
  /** When true, show Confirm/Dismiss action buttons for Active Learning. */
  showFeedback?: boolean;
  /** Refresh interval in ms (default 4000). */
  intervalMs?: number;
  refreshKey?: number;
}

export default function DetectionFeed({
  anomalyOnly = false,
  showFeedback = false,
  intervalMs = 4000,
  refreshKey,
}: Props) {
  const [results, setResults] = useState<DBDetection[]>([]);
  const [filter, setFilter] = useState<'all' | 'anomaly' | 'normal'>(anomalyOnly ? 'anomaly' : 'all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedbackTouched, setFeedbackTouched] = useState<Set<string>>(new Set());

  const fetchDetections = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter === 'anomaly') params.set('anomalyOnly', 'true');
      params.set('limit', '50');
      const res = await fetch(`/api/detections?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setResults(data.results);
      }
    } catch (err) {
      console.error('Detection fetch failed:', err);
    }
  }, [filter]);

  useEffect(() => {
    fetchDetections();
    const t = setInterval(fetchDetections, intervalMs);
    return () => clearInterval(t);
  }, [fetchDetections, intervalMs, refreshKey]);

  const sendFeedback = async (detection: DBDetection, isCorrect: boolean) => {
    setFeedbackTouched(prev => new Set(prev).add(detection.id));
    try {
      await fetch('/api/rlhf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detectionId: detection.id,
          isCorrect,
          modelMethod: detection.detectionMethod,
        }),
      });
    } catch (err) {
      console.error('Feedback failed:', err);
    }
  };

  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString();

  const getThreatIcon = (level: string) => {
    switch (level) {
      case 'critical':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'high':
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'medium':
        return <Shield className="w-4 h-4 text-yellow-500" />;
      default:
        return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    }
  };

  const filtered = results.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'anomaly') return r.isAnomaly;
    return !r.isAnomaly;
  });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-white tracking-wide uppercase">
            {showFeedback ? 'Active Learning Queue' : 'Detection Feed'}
          </h2>
          <p className="text-xs text-zinc-500">
            {showFeedback
              ? 'Validate, dismiss or correct each detection. Verified samples power retrain.'
              : 'Live results from the SQLite-backed detection log.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!anomalyOnly && (
            <div className="flex gap-0.5 bg-zinc-800 rounded p-0.5">
              {(['all', 'anomaly', 'normal'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2 py-1 rounded text-xs capitalize transition-colors ${
                    filter === f ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={fetchDetections}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-zinc-500">
            <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No detections to show.</p>
            <p className="text-xs text-zinc-600 mt-1">
              Use the Live Control panel above to start replay.
            </p>
          </div>
        ) : (
          filtered.map(result => (
            <div
              key={result.id}
              className={`border rounded-md bg-zinc-900/50 transition-colors ${
                feedbackTouched.has(result.id)
                  ? 'border-cyan-500/30'
                  : 'border-zinc-800'
              }`}
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
                          {result.isAnomaly ? result.attackType ?? 'Unknown' : 'Normal'}
                        </span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            result.isAnomaly
                              ? 'bg-red-500/10 text-red-400'
                              : 'bg-emerald-500/10 text-emerald-400'
                          }`}
                        >
                          {result.isAnomaly ? 'Anomaly' : 'Normal'}
                        </span>
                        {result.autoResponse === 'blocked' && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300">
                            Auto-blocked
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {result.packet.sourceIP}:{result.packet.sourcePort} →{' '}
                        {result.packet.destIP}:{result.packet.destPort}
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
                              result.confidence > 80
                                ? 'bg-red-500'
                                : result.confidence > 50
                                ? 'bg-yellow-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${result.confidence}%` }}
                          />
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5 text-center tabular-nums">
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
                      <p className="text-xs text-white mt-0.5">{result.packet.packetSize} B</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Threat</p>
                      <p className="text-xs text-white mt-0.5 capitalize">{result.threatLevel}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Flags</p>
                      <p className="text-xs text-white mt-0.5">{result.packet.flags ?? 'N/A'}</p>
                    </div>
                  </div>

                  {Object.keys(result.modelScores).length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-zinc-500 mb-1.5">Per-model scores</p>
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        {Object.entries(result.modelScores).map(([model, score]) => (
                          <div key={model} className="bg-zinc-800/60 rounded px-2 py-1">
                            <p className="text-zinc-500 truncate text-[10px] uppercase">
                              {model.replace(/([A-Z])/g, ' $1').trim()}
                            </p>
                            <p className="text-white tabular-nums">
                              {((score ?? 0) * 100).toFixed(1)}%
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.ipEntropy && (
                    <div className="mt-3">
                      <p className="text-xs text-zinc-500 mb-1.5">IP entropy signals</p>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-zinc-800/60 rounded px-2 py-1">
                          <p className="text-zinc-500 text-[10px] uppercase">Src octet</p>
                          <p className="text-white tabular-nums">
                            {(result.ipEntropy.source * 100).toFixed(0)}%
                          </p>
                        </div>
                        <div className="bg-zinc-800/60 rounded px-2 py-1">
                          <p className="text-zinc-500 text-[10px] uppercase">Dst octet</p>
                          <p className="text-white tabular-nums">
                            {(result.ipEntropy.destination * 100).toFixed(0)}%
                          </p>
                        </div>
                        <div className="bg-zinc-800/60 rounded px-2 py-1">
                          <p className="text-zinc-500 text-[10px] uppercase">Src fan-out</p>
                          <p className="text-white tabular-nums">
                            {(result.ipEntropy.sourceFanout * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

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
                            <span className="text-cyan-400 mt-0.5">·</span>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {showFeedback && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => sendFeedback(result, true)}
                        disabled={feedbackTouched.has(result.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors disabled:opacity-50"
                      >
                        <ThumbsUp className="w-3 h-3" /> Confirm
                      </button>
                      <button
                        onClick={() => sendFeedback(result, false)}
                        disabled={feedbackTouched.has(result.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/30 transition-colors disabled:opacity-50"
                      >
                        <ThumbsDown className="w-3 h-3" /> Dismiss
                      </button>
                      {feedbackTouched.has(result.id) && (
                        <span className="text-xs text-cyan-300 self-center ml-1">
                          Recorded — Active Learning will reweight after every 10 samples.
                        </span>
                      )}
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
