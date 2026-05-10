'use client';

import { useEffect, useState, useCallback } from 'react';
import { Ban, Trash2, Plus, RefreshCw, Loader2 } from 'lucide-react';

interface BlockedIP {
  id: string;
  ipAddress: string;
  reason: string;
  attackType?: string | null;
  confidence: number;
  blockedAt: string;
  expiresAt: string | null;
  autoBlocked: boolean;
}

/**
 * Blocked-IP panel surfaced on the dashboard and Auto-Response tab.
 * Combines auto-block decisions made by the live detector with manual blocks.
 */
export default function BlockedIPsPanel({ refreshKey }: { refreshKey?: number }) {
  const [blocks, setBlocks] = useState<BlockedIP[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newIp, setNewIp] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchBlocks = useCallback(async () => {
    try {
      const res = await fetch('/api/blocked-ips', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setBlocks(data.blockedIPs);
      }
    } catch (err) {
      console.error('Blocked IPs fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlocks();
    const t = setInterval(fetchBlocks, 5000);
    return () => clearInterval(t);
  }, [fetchBlocks, refreshKey]);

  const blockIp = async () => {
    if (!newIp.trim()) return;
    setBusy(true);
    try {
      await fetch('/api/blocked-ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ipAddress: newIp.trim(), reason: 'Manual block' }),
      });
      setNewIp('');
      setAdding(false);
      await fetchBlocks();
    } finally {
      setBusy(false);
    }
  };

  const unblock = async (ip: string) => {
    setBusy(true);
    try {
      await fetch('/api/blocked-ips', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ipAddress: ip }),
      });
      await fetchBlocks();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-white tracking-wide uppercase">
            Blocked IPs
          </h2>
          <p className="text-xs text-zinc-500">
            Auto-response blocks generated from critical and high severity detections.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchBlocks}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
          </button>
          <button
            onClick={() => setAdding(prev => !prev)}
            className="flex items-center gap-1.5 px-2 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded text-xs transition-colors"
          >
            <Plus className="w-3 h-3" />
            Block IP
          </button>
        </div>
      </div>

      {adding && (
        <div className="flex gap-2 mb-3">
          <input
            value={newIp}
            onChange={e => setNewIp(e.target.value)}
            placeholder="e.g. 203.0.113.42"
            className="flex-1 px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-xs focus:outline-none focus:border-cyan-500"
          />
          <button
            onClick={blockIp}
            disabled={busy || !newIp.trim()}
            className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-xs transition-colors disabled:opacity-50"
          >
            Block
          </button>
        </div>
      )}

      <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-zinc-500 text-xs">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        ) : blocks.length === 0 ? (
          <div className="text-center py-6 text-zinc-500">
            <Ban className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No blocked IPs yet.</p>
            <p className="text-xs text-zinc-600 mt-1">
              Trigger an attack from the dashboard to populate this list.
            </p>
          </div>
        ) : (
          blocks.map(ip => (
            <div
              key={ip.ipAddress}
              className="flex items-center justify-between p-2.5 bg-zinc-800/50 border border-zinc-800 rounded"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-white font-mono text-xs">{ip.ipAddress}</span>
                  {ip.autoBlocked && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 bg-cyan-500/10 text-cyan-300 rounded">
                      Auto
                    </span>
                  )}
                  {ip.attackType && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-red-500/10 text-red-300 rounded">
                      {ip.attackType}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5 truncate">{ip.reason}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-zinc-600">
                    {new Date(ip.blockedAt).toLocaleString()}
                  </span>
                  {ip.expiresAt ? (
                    <span className="text-[10px] text-amber-400">
                      Expires {new Date(ip.expiresAt).toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-[10px] text-red-400">Permanent</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => unblock(ip.ipAddress)}
                disabled={busy}
                className="p-1.5 hover:bg-zinc-700 rounded transition-colors"
                title="Unblock"
              >
                <Trash2 className="w-3.5 h-3.5 text-zinc-500 hover:text-red-400" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
