/**
 * /api/blocked-ips — surfaces blocked IPs from both the in-memory service
 * (hot, recent decisions) and the persisted DB (durable history).
 */

import { NextRequest, NextResponse } from 'next/server';
import { isIP } from 'node:net';
import prisma from '@/lib/prisma';
import { autoResponseService } from '@/lib/services/auto-response';

interface BlockedIPRecord {
  id: string;
  ipAddress: string;
  reason: string;
  attackType: string | null;
  confidence: number;
  blockedAt: Date | string;
  expiresAt: Date | string | null;
  autoBlocked: boolean;
}

/**
 * Validate an IP-address request body. Returns the normalised address
 * (trimmed) on success, or a NextResponse with the rejection on failure.
 * Uses node:net's isIP() so we accept both IPv4 and IPv6 and reject
 * everything else — preventing garbage records and log/UI injection from
 * arbitrary string values.
 */
function validateIPAddress(raw: unknown): { ok: true; ip: string } | { ok: false; res: NextResponse } {
  if (typeof raw !== 'string' || !raw.trim()) {
    return {
      ok: false,
      res: NextResponse.json(
        { success: false, error: 'ipAddress required' },
        { status: 400 }
      ),
    };
  }
  const trimmed = raw.trim();
  if (isIP(trimmed) === 0) {
    return {
      ok: false,
      res: NextResponse.json(
        { success: false, error: `Invalid IP address: ${trimmed}` },
        { status: 400 }
      ),
    };
  }
  return { ok: true, ip: trimmed };
}

export async function GET() {
  try {
    const dbBlocked = await prisma.blockedIP.findMany({
      orderBy: { blockedAt: 'desc' },
      take: 200,
    });
    const memBlocked = autoResponseService.getBlockedIPs();

    // Merge by IP address — DB wins on duplicates because it has authoritative
    // expiry timestamps after persistence.
    const map = new Map<string, BlockedIPRecord>();
    for (const b of memBlocked) {
      map.set(b.ipAddress, {
        id: b.id,
        ipAddress: b.ipAddress,
        reason: b.reason,
        attackType: b.attackType ?? null,
        confidence: b.confidence,
        blockedAt: b.blockedAt,
        expiresAt: b.expiresAt,
        autoBlocked: b.autoBlocked,
      });
    }
    for (const b of dbBlocked) {
      map.set(b.ipAddress, {
        id: b.id,
        ipAddress: b.ipAddress,
        reason: b.reason,
        attackType: b.attackType,
        confidence: b.confidence,
        blockedAt: b.blockedAt,
        expiresAt: b.expiresAt,
        autoBlocked: b.autoBlocked,
      });
    }

    const merged = Array.from(map.values()).sort(
      (a, b) => new Date(b.blockedAt).getTime() - new Date(a.blockedAt).getTime()
    );

    return NextResponse.json({ success: true, blockedIPs: merged });
  } catch (err) {
    console.error('blocked-ips GET error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to load blocked IPs' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reason, duration, attackType, confidence } = body;
    const validation = validateIPAddress(body.ipAddress);
    if (!validation.ok) return validation.res;
    const ipAddress = validation.ip;

    const blocked = autoResponseService.blockIP(ipAddress, {
      reason: reason ?? 'Manual block',
      duration,
      attackType,
      confidence,
      autoBlocked: false,
    });

    try {
      await prisma.blockedIP.upsert({
        where: { ipAddress },
        update: {
          reason: blocked.reason,
          attackType: blocked.attackType ?? null,
          confidence: blocked.confidence,
          autoBlocked: false,
          blockedAt: blocked.blockedAt,
          expiresAt: blocked.expiresAt,
        },
        create: {
          ipAddress,
          reason: blocked.reason,
          attackType: blocked.attackType ?? null,
          confidence: blocked.confidence,
          autoBlocked: false,
          blockedAt: blocked.blockedAt,
          expiresAt: blocked.expiresAt,
        },
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'P2002') {
        console.error('blockedIP upsert (manual) failed:', err);
      }
    }

    return NextResponse.json({ success: true, blocked });
  } catch (err) {
    console.error('blocked-ips POST error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to block IP' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateIPAddress(body.ipAddress);
    if (!validation.ok) return validation.res;
    const ipAddress = validation.ip;

    autoResponseService.unblockIP(ipAddress, 'Manual unblock');
    try {
      await prisma.blockedIP.delete({ where: { ipAddress } });
    } catch (err) {
      const code = (err as { code?: string }).code;
      // P2025 = record not found. Safe to ignore — the in-memory unblock above
      // already covers the case where the IP existed only in the hot cache.
      if (code !== 'P2025') {
        console.error('blockedIP delete failed:', err);
      }
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('blocked-ips DELETE error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to unblock IP' },
      { status: 500 }
    );
  }
}
