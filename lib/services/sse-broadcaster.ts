/**
 * SSE broadcaster — single shared poller for the /api/events stream.
 *
 * Originally each connected client opened its own setInterval that hit the
 * database every 3 seconds. With multiple dashboards / Chrome-extension
 * popups / reverse-proxy reconnect churn that becomes N-clients × poll-rate
 * worth of identical queries.
 *
 * The broadcaster fixes that by running ONE timer regardless of subscriber
 * count and fanning each fresh detection to every subscriber. Per-client
 * work is just queue management.
 *
 * The cursor is composite (timestamp, id) so that detections sharing the
 * same millisecond — common when persisting batches — are not silently
 * dropped after the first one in the same tick is emitted.
 */

import prisma from '@/lib/prisma';

const POLL_INTERVAL_MS = 3000;

export interface BroadcastDetection {
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
}

type Subscriber = (event: BroadcastDetection) => void;

class SSEBroadcaster {
  private subscribers = new Map<number, Subscriber>();
  private nextId = 1;
  private pollHandle: NodeJS.Timeout | null = null;
  // Composite cursor: never drop events that share a timestamp with the
  // last-seen one. We start the cursor 5 minutes in the past so the first
  // poll after a server restart catches recent activity.
  private lastSeenAt: Date = new Date(Date.now() - 5 * 60 * 1000);
  private lastSeenId: string = '';

  subscribe(handler: Subscriber): number {
    const id = this.nextId++;
    this.subscribers.set(id, handler);
    if (!this.pollHandle) this.startPolling();
    return id;
  }

  unsubscribe(id: number): void {
    this.subscribers.delete(id);
    if (this.subscribers.size === 0 && this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  /**
   * Newest event timestamp the broadcaster has emitted. Subscribers can
   * use this for backfill on connect (query everything between their
   * own last-seen marker and this).
   */
  getCursor(): { lastSeenAt: Date; lastSeenId: string } {
    return { lastSeenAt: this.lastSeenAt, lastSeenId: this.lastSeenId };
  }

  private startPolling() {
    // Poll once immediately so the first subscriber sees fresh data without
    // having to wait POLL_INTERVAL_MS.
    void this.poll();
    this.pollHandle = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  private async poll(): Promise<void> {
    if (this.subscribers.size === 0) return;
    try {
      // Composite cursor: timestamp > lastSeenAt OR (timestamp = lastSeenAt
      // AND id > lastSeenId). The OR shape lets Prisma index-scan the
      // timestamp column and only fall back to id comparison at the boundary.
      const fresh = await prisma.detectionResult.findMany({
        where: {
          isAnomaly: true,
          OR: [
            { timestamp: { gt: this.lastSeenAt } },
            { timestamp: this.lastSeenAt, id: { gt: this.lastSeenId } },
          ],
        },
        include: { packet: true },
        orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
        take: 50,
      });
      for (const d of fresh) {
        const event: BroadcastDetection = {
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
        for (const handler of this.subscribers.values()) {
          try {
            handler(event);
          } catch (err) {
            console.error('SSE subscriber error:', err);
          }
        }
        this.lastSeenAt = d.timestamp;
        this.lastSeenId = d.id;
      }
    } catch (err) {
      console.error('SSE broadcaster poll failed:', err);
    }
  }
}

// Module-scoped singleton — Next.js route handlers share this in the same
// process. Edge runtime is opted out by the route's `runtime = 'nodejs'`.
export const sseBroadcaster = new SSEBroadcaster();
