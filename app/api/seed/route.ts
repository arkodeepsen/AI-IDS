/**
 * /api/seed — pre-populates the SQLite database with a week of synthetic
 * traffic so the dashboard never looks empty during evaluation. Idempotent:
 * if data already exists it short-circuits unless `?force=1` is passed.
 *
 * Authorisation: `?force=1` deletes the four primary tables (packets,
 * detections, alerts, blocked IPs) before re-seeding. To prevent accidental
 * or malicious wipes when the dashboard is hosted somewhere reachable,
 * destructive seeds are gated by environment:
 *
 *   - NODE_ENV !== 'production'   → always allowed (local dev)
 *   - NODE_ENV === 'production'   → SEED_TOKEN env var must be set, and
 *                                   the request must include
 *                                   `x-seed-token: <value>` matching it
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generatePacketBatch, generateSyntheticAttack } from '@/lib/utils';
import { detectBatch, persistDetection, getDetector } from '@/lib/services/detection';
import { autoResponseService } from '@/lib/services/auto-response';

const SEED_PACKETS = 1500;
const ATTACK_BURSTS = 5;

/**
 * Returns null if the request is allowed to perform a destructive seed,
 * or a NextResponse with the rejection reason if not.
 */
function checkDestructiveAuth(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV !== 'production') return null;
  const expected = process.env.SEED_TOKEN;
  if (!expected) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Destructive seed disabled in production. Set SEED_TOKEN env var to enable.',
      },
      { status: 403 }
    );
  }
  const supplied = request.headers.get('x-seed-token');
  if (supplied !== expected) {
    return NextResponse.json(
      { success: false, error: 'Invalid or missing x-seed-token header.' },
      { status: 403 }
    );
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get('force') === '1';
    if (force) {
      const rejection = checkDestructiveAuth(request);
      if (rejection) return rejection;
    }
    const existing = await prisma.networkPacket.count();
    if (existing >= 200 && !force) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: `Database already has ${existing} packets; pass ?force=1 to re-seed.`,
        existing,
      });
    }

    if (force) {
      await prisma.alert.deleteMany();
      await prisma.detectionResult.deleteMany();
      await prisma.networkPacket.deleteMany();
      await prisma.blockedIP.deleteMany();
    }

    getDetector();

    let total = 0;
    let anomalies = 0;
    let blocked = 0;

    // Spread the synthetic packets across the past week so the time-series
    // chart fills in with history, not a single spike.
    const benignBatch = generatePacketBatch(SEED_PACKETS);
    const benignResults = detectBatch(benignBatch, 'Ensemble');
    for (let i = 0; i < benignResults.length; i++) {
      const result = benignResults[i];
      const ageMs = Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000);
      result.timestamp = new Date(Date.now() - ageMs);
      result.packet.timestamp = result.timestamp;
    }
    await Promise.all(benignResults.map(r => persistDetection(r)));
    total += benignResults.length;
    anomalies += benignResults.filter(r => r.isAnomaly).length;
    blocked += benignResults.filter(r => r.autoResponseAction === 'blocked').length;

    const attackKinds = ['ddos', 'portscan', 'bruteforce'] as const;
    for (let i = 0; i < ATTACK_BURSTS; i++) {
      const kind = attackKinds[i % attackKinds.length];
      const packets = generateSyntheticAttack(kind, 30);
      const results = detectBatch(packets, 'Ensemble');
      for (const r of results) {
        const ageMs = Math.floor(Math.random() * 24 * 60 * 60 * 1000);
        r.timestamp = new Date(Date.now() - ageMs);
        r.packet.timestamp = r.timestamp;
      }
      await Promise.all(results.map(r => persistDetection(r)));
      total += results.length;
      anomalies += results.filter(r => r.isAnomaly).length;
      blocked += results.filter(r => r.autoResponseAction === 'blocked').length;
    }

    return NextResponse.json({
      success: true,
      seeded: { total, anomalies, blocked },
      blockedTotal: autoResponseService.getStats().totalBlocked,
    });
  } catch (err) {
    console.error('Seed error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Seed failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const counts = await Promise.all([
    prisma.networkPacket.count(),
    prisma.detectionResult.count(),
    prisma.alert.count(),
    prisma.blockedIP.count(),
  ]);
  return NextResponse.json({
    success: true,
    counts: {
      packets: counts[0],
      detections: counts[1],
      alerts: counts[2],
      blockedIPs: counts[3],
    },
    needsSeed: counts[0] < 200,
  });
}
