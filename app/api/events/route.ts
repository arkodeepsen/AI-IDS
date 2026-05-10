/**
 * /api/events — Server-Sent Events stream of detection activity.
 *
 * Replaces the original "WebSocket-powered alert notifications" claim from
 * the project deck with the modern, Next.js-native equivalent. SSE works
 * over plain HTTP, plays well with edge runtimes, and is supported by
 * EventSource in the browser without any client-side polyfill.
 *
 * The stream emits:
 *   - `init`        on connect, with the latest 5 detections
 *   - `detection`   every poll cycle when new anomalies are persisted
 *   - `heartbeat`   every 15 s so proxies don't close idle connections
 */

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 15000;

interface PacketRef {
  sourceIP: string;
  destIP: string;
  destPort: number;
  protocol: string;
}

interface DetectionEvent {
  id: string;
  timestamp: Date;
  isAnomaly: boolean;
  threatLevel: string;
  attackType: string | null;
  confidence: number;
  detectionMethod: string;
  autoResponse: string | null;
  packet: PacketRef;
}

function format(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: NextRequest) {
  // Optional ?since=<ISO> lets a reconnecting client resume without missing
  // events that landed during the gap.
  const since = req.nextUrl.searchParams.get('since');
  let lastSeen = since ? new Date(since) : new Date(Date.now() - 5 * 60 * 1000);

  const encoder = new TextEncoder();
  let pollHandle: ReturnType<typeof setInterval> | undefined;
  let heartbeatHandle: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(format(event, data)));
        } catch {
          closed = true;
        }
      };

      // Initial payload: the most recent anomalies so the client UI can hydrate.
      try {
        const recent = await prisma.detectionResult.findMany({
          where: { isAnomaly: true },
          include: { packet: true },
          orderBy: { timestamp: 'desc' },
          take: 5,
        });
        send('init', {
          events: recent.map(serialise),
          serverTime: new Date().toISOString(),
        });
      } catch (err) {
        console.error('SSE init failed:', err);
      }

      const poll = async () => {
        if (closed) return;
        try {
          const fresh = await prisma.detectionResult.findMany({
            where: { isAnomaly: true, timestamp: { gt: lastSeen } },
            include: { packet: true },
            orderBy: { timestamp: 'asc' },
            take: 20,
          });
          for (const d of fresh) {
            send('detection', serialise(d));
            lastSeen = d.timestamp;
          }
        } catch (err) {
          console.error('SSE poll failed:', err);
        }
      };

      pollHandle = setInterval(poll, POLL_INTERVAL_MS);
      heartbeatHandle = setInterval(() => {
        send('heartbeat', { ts: new Date().toISOString() });
      }, HEARTBEAT_INTERVAL_MS);

      // First poll runs immediately so the client gets fresh data fast.
      void poll();

      req.signal.addEventListener('abort', () => {
        closed = true;
        if (pollHandle) clearInterval(pollHandle);
        if (heartbeatHandle) clearInterval(heartbeatHandle);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      closed = true;
      if (pollHandle) clearInterval(pollHandle);
      if (heartbeatHandle) clearInterval(heartbeatHandle);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function serialise(d: {
  id: string;
  timestamp: Date;
  isAnomaly: boolean;
  threatLevel: string;
  attackType: string | null;
  confidence: number;
  detectionMethod: string;
  autoResponse: string | null;
  packet: PacketRef;
}): DetectionEvent {
  return {
    id: d.id,
    timestamp: d.timestamp,
    isAnomaly: d.isAnomaly,
    threatLevel: d.threatLevel.toLowerCase(),
    attackType: d.attackType,
    confidence: d.confidence,
    detectionMethod: d.detectionMethod,
    autoResponse: d.autoResponse,
    packet: {
      sourceIP: d.packet.sourceIP,
      destIP: d.packet.destIP,
      destPort: d.packet.destPort,
      protocol: d.packet.protocol,
    },
  };
}
