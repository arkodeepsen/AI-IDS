'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { AlertTriangle, X, ShieldAlert } from 'lucide-react';

interface ToastEvent {
  id: string;
  timestamp: string;
  threatLevel: string;
  attackType: string | null;
  confidence: number;
  detectionMethod: string;
  autoResponse: string | null;
  packet: {
    sourceIP: string;
    destIP: string;
    destPort: number;
    protocol: string;
  };
}

interface Toast {
  id: string;
  level: string;
  attack: string;
  source: string;
  dest: string;
  confidence: number;
  blocked: boolean;
  ttl: number;
}

const TOAST_DURATION_MS = 6000;
const MAX_TOASTS = 3;

/**
 * Live toast feed driven by Server-Sent Events from /api/events.
 *
 * Mounted once in the root layout; auto-reconnects on disconnect and skips
 * its own initial backlog so the user only sees fresh events.
 */
export default function LiveToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [connected, setConnected] = useState(false);
  const initial = useRef(true);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleEvent = useCallback(
    (event: ToastEvent) => {
      // Only surface high/critical detections as toasts to avoid noise.
      if (event.threatLevel !== 'high' && event.threatLevel !== 'critical') {
        return;
      }
      const toast: Toast = {
        id: event.id,
        level: event.threatLevel,
        attack: event.attackType ?? 'Anomaly',
        source: event.packet.sourceIP,
        dest: `${event.packet.destIP}:${event.packet.destPort}`,
        confidence: event.confidence,
        blocked: event.autoResponse === 'blocked',
        ttl: Date.now() + TOAST_DURATION_MS,
      };
      setToasts(prev => [toast, ...prev].slice(0, MAX_TOASTS));
    },
    []
  );

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;

    const connect = () => {
      es = new EventSource('/api/events');
      es.addEventListener('open', () => setConnected(true));
      es.addEventListener('error', () => {
        setConnected(false);
        // EventSource auto-reconnects but we manually reopen too if the browser closes it.
        if (es && es.readyState === EventSource.CLOSED && !cancelled) {
          setTimeout(connect, 1500);
        }
      });
      es.addEventListener('init', () => {
        initial.current = false; // ignore the historical backlog
      });
      es.addEventListener('detection', e => {
        if (initial.current) return;
        try {
          const data = JSON.parse((e as MessageEvent).data) as ToastEvent;
          handleEvent(data);
        } catch {
          /* malformed event */
        }
      });
    };

    connect();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [handleEvent]);

  // Sweep expired toasts.
  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setInterval(() => {
      const now = Date.now();
      setToasts(prev => prev.filter(toast => toast.ttl > now));
    }, 500);
    return () => clearInterval(t);
  }, [toasts.length]);

  return (
    <div className="fixed top-16 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto w-80 rounded-lg border p-3 shadow-xl backdrop-blur transition-all fade-in ${
            t.level === 'critical'
              ? 'bg-red-950/80 border-red-500/50 text-red-100'
              : 'bg-amber-950/80 border-amber-500/50 text-amber-100'
          }`}
        >
          <div className="flex items-start gap-2">
            <div className="mt-0.5">
              {t.level === 'critical' ? (
                <ShieldAlert className="w-4 h-4 text-red-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide">
                  {t.attack}
                </span>
                <span className="text-[10px] text-white/60">
                  {t.confidence.toFixed(0)}%
                </span>
              </div>
              <p className="text-xs mt-1 text-white/80 truncate">
                {t.source} → {t.dest}
              </p>
              {t.blocked && (
                <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-white/10">
                  Auto-blocked
                </span>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-white/40 hover:text-white"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
      {connected && (
        <span className="sr-only" aria-live="polite">
          Live event stream connected
        </span>
      )}
    </div>
  );
}
