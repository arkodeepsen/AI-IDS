'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Play, Square, Zap, ChevronDown, RefreshCw, Loader2 } from 'lucide-react';

type AttackKind = 'ddos' | 'portscan' | 'bruteforce';

const ATTACK_LABELS: Record<AttackKind, string> = {
  ddos: 'DDoS Burst',
  portscan: 'Port Scan',
  bruteforce: 'Brute Force',
};

interface SummaryEvent {
  id: string;
  time: string;
  message: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
}

/**
 * Demo control panel. Lives at the top of the dashboard so the evaluator can
 * trigger live detection and synthetic attacks without leaving the page.
 */
export default function LiveControl({ onChange }: { onChange?: () => void }) {
  const [streaming, setStreaming] = useState(false);
  const [busyAttack, setBusyAttack] = useState<AttackKind | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [needsSeed, setNeedsSeed] = useState(false);
  const [events, setEvents] = useState<SummaryEvent[]>([]);
  const [showAttackMenu, setShowAttackMenu] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pushEvent = useCallback((message: string, tone: SummaryEvent['tone']) => {
    setEvents(prev =>
      [
        {
          id: crypto.randomUUID(),
          time: new Date().toLocaleTimeString('en-US', { hour12: false }),
          message,
          tone,
        },
        ...prev,
      ].slice(0, 6)
    );
  }, []);

  const checkSeed = useCallback(async () => {
    try {
      const res = await fetch('/api/seed', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setNeedsSeed(Boolean(data.needsSeed));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const runSeed = useCallback(async () => {
    setSeeding(true);
    pushEvent('Seeding 7 days of synthetic baseline traffic…', 'info');
    try {
      const res = await fetch('/api/seed?force=1', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        if (data.skipped) {
          pushEvent(`Database already seeded (${data.existing} packets).`, 'info');
        } else {
          pushEvent(
            `Seeded ${data.seeded.total} packets (${data.seeded.anomalies} anomalies, ${data.seeded.blocked} auto-blocked).`,
            'success'
          );
        }
        setNeedsSeed(false);
        onChange?.();
      } else {
        pushEvent(`Seed failed: ${data.error}`, 'danger');
      }
    } catch (err) {
      console.error(err);
      pushEvent('Seed request failed.', 'danger');
    } finally {
      setSeeding(false);
    }
  }, [onChange, pushEvent]);

  useEffect(() => {
    checkSeed();
  }, [checkSeed]);

  const tickReplay = useCallback(async () => {
    try {
      const res = await fetch('/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 6, persist: true }),
      });
      const data = await res.json();
      if (data.success) {
        const { summary } = data;
        if (summary.anomalies > 0) {
          pushEvent(
            `Replay tick: ${summary.total} packets · ${summary.anomalies} anomalies (${summary.critical} critical).`,
            summary.critical > 0 ? 'warning' : 'info'
          );
        }
        onChange?.();
      }
    } catch (err) {
      console.error('Replay tick failed:', err);
    }
  }, [onChange, pushEvent]);

  const toggleStream = () => {
    if (streaming) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setStreaming(false);
      pushEvent('Live replay stopped.', 'info');
    } else {
      setStreaming(true);
      pushEvent('Live replay started — 6 packets every 2.5s.', 'success');
      tickReplay();
      intervalRef.current = setInterval(tickReplay, 2500);
    }
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const launchAttack = async (kind: AttackKind) => {
    setBusyAttack(kind);
    setShowAttackMenu(false);
    pushEvent(`Generating ${ATTACK_LABELS[kind]} burst…`, 'warning');
    try {
      const res = await fetch('/api/attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, count: 40 }),
      });
      const data = await res.json();
      if (data.success) {
        pushEvent(
          `${ATTACK_LABELS[kind]}: ${data.summary.anomalies}/${data.count} flagged · ${data.summary.critical} critical · ${data.summary.blocked} auto-blocked.`,
          'danger'
        );
        onChange?.();
      } else {
        pushEvent(`Attack failed: ${data.error}`, 'danger');
      }
    } catch (err) {
      console.error(err);
      pushEvent('Attack generation failed.', 'danger');
    } finally {
      setBusyAttack(null);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-white tracking-wide uppercase">
            Live Control Center
          </h2>
          <p className="text-xs text-zinc-500">
            Replay benign traffic or launch a synthetic attack to demo the ensemble in real time.
          </p>
        </div>
        {needsSeed && (
          <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
            Database empty
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={toggleStream}
          disabled={seeding}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            streaming
              ? 'bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/40'
              : 'bg-cyan-500 text-zinc-950 hover:bg-cyan-400 border border-cyan-400'
          }`}
        >
          {streaming ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {streaming ? 'Stop Replay' : 'Start Replay'}
        </button>

        <div className="relative">
          <button
            onClick={() => setShowAttackMenu(prev => !prev)}
            disabled={busyAttack !== null}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-red-500/10 text-red-300 border border-red-500/40 hover:bg-red-500/20 transition-colors"
          >
            {busyAttack ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {busyAttack ? `Generating ${ATTACK_LABELS[busyAttack]}…` : 'Generate Attack'}
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {showAttackMenu && (
            <div className="absolute right-0 mt-1 w-44 bg-zinc-900 border border-zinc-700 rounded-md shadow-lg z-10 overflow-hidden">
              {(Object.keys(ATTACK_LABELS) as AttackKind[]).map(k => (
                <button
                  key={k}
                  onClick={() => launchAttack(k)}
                  className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
                >
                  {ATTACK_LABELS[k]}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={runSeed}
          disabled={seeding}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700 transition-colors disabled:opacity-50"
        >
          {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {seeding ? 'Seeding…' : needsSeed ? 'Seed Database' : 'Re-seed (force)'}
        </button>
      </div>

      <div className="border-t border-zinc-800 pt-3">
        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Activity Log</p>
        {events.length === 0 ? (
          <p className="text-xs text-zinc-600 italic">No activity yet — start replay to see events.</p>
        ) : (
          <ul className="space-y-1.5">
            {events.map(e => (
              <li key={e.id} className="flex items-start gap-2 text-xs">
                <span className="text-zinc-600 font-mono">{e.time}</span>
                <span
                  className={`flex-1 ${
                    e.tone === 'danger'
                      ? 'text-red-300'
                      : e.tone === 'warning'
                      ? 'text-amber-300'
                      : e.tone === 'success'
                      ? 'text-emerald-300'
                      : 'text-zinc-300'
                  }`}
                >
                  {e.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
