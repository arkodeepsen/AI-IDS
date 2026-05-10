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
 *   - `detection`   when new anomalies land (via the shared broadcaster)
 *   - `heartbeat`   every 15 s so proxies don't close idle connections
 *
 * Polling is centralised in `lib/services/sse-broadcaster.ts` so multiple
 * connected clients share a single DB poll instead of each running their
 * own timer.
 */

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { sseBroadcaster, type BroadcastDetection } from '@/lib/services/sse-broadcaster';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_INTERVAL_MS = 15000;

function format(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: NextRequest) {
  // Optional ?since=<ISO> lets a reconnecting client request backfill
  // without missing events that landed during the gap.
  const since = req.nextUrl.searchParams.get('since');
  const sinceDate = since ? new Date(since) : null;

  const encoder = new TextEncoder();
  let heartbeatHandle: ReturnType<typeof setInterval> | undefined;
  let subscriberId: number | null = null;
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

      // Initial payload: the most recent anomalies so the client UI hydrates.
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

      // Backfill for reconnecting clients: anything since their last-seen
      // cursor. Subscribe BEFORE running this so we don't miss events that
      // land between the backfill query and the subscription handler taking
      // over — subscribers can dedupe by id on the client.
      const seenInBackfill = new Set<string>();
      subscriberId = sseBroadcaster.subscribe(event => {
        if (seenInBackfill.has(event.id)) return;
        send('detection', event);
      });

      if (sinceDate && !Number.isNaN(sinceDate.getTime())) {
        try {
          const backfill = await prisma.detectionResult.findMany({
            where: { isAnomaly: true, timestamp: { gt: sinceDate } },
            include: { packet: true },
            orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
            take: 100,
          });
          for (const d of backfill) {
            seenInBackfill.add(d.id);
            send('detection', serialise(d));
          }
        } catch (err) {
          console.error('SSE backfill failed:', err);
        }
      }

      heartbeatHandle = setInterval(() => {
        send('heartbeat', { ts: new Date().toISOString() });
      }, HEARTBEAT_INTERVAL_MS);

      req.signal.addEventListener('abort', () => {
        closed = true;
        if (heartbeatHandle) clearInterval(heartbeatHandle);
        if (subscriberId !== null) sseBroadcaster.unsubscribe(subscriberId);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      closed = true;
      if (heartbeatHandle) clearInterval(heartbeatHandle);
      if (subscriberId !== null) sseBroadcaster.unsubscribe(subscriberId);
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
  packet: {
    sourceIP: string;
    destIP: string;
    destPort: number;
    protocol: string;
  };
}): BroadcastDetection {
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
