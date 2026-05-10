/**
 * /api/blocked-ips — surfaces blocked IPs from both the in-memory service
 * (hot, recent decisions) and the persisted DB (durable history).
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { autoResponseService } from '@/lib/services/auto-response';

export async function GET() {
  try {
    const dbBlocked = await prisma.blockedIP.findMany({
      orderBy: { blockedAt: 'desc' },
      take: 200,
    });
    const memBlocked = autoResponseService.getBlockedIPs();

    // Merge by IP address — DB wins on duplicates because it has authoritative
    // expiry timestamps.
    const map = new Map<string, unknown>();
    for (const b of memBlocked) {
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
    for (const b of dbBlocked) {
      map.set(b.ipAddress, b);
    }

    const merged = Array.from(map.values()).sort((a: unknown, b: unknown) => {
      const ta = new Date((a as { blockedAt: Date }).blockedAt).getTime();
      const tb = new Date((b as { blockedAt: Date }).blockedAt).getTime();
      return tb - ta;
    });

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
    const { ipAddress, reason, duration } = body;
    if (!ipAddress) {
      return NextResponse.json(
        { success: false, error: 'ipAddress required' },
        { status: 400 }
      );
    }

    const blocked = autoResponseService.blockIP(ipAddress, {
      reason: reason ?? 'Manual block',
      duration,
      autoBlocked: false,
    });

    await prisma.blockedIP.upsert({
      where: { ipAddress },
      update: { reason: blocked.reason, autoBlocked: false },
      create: {
        ipAddress,
        reason: blocked.reason,
        autoBlocked: false,
        expiresAt: blocked.expiresAt,
      },
    });

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
    const { ipAddress } = body;
    if (!ipAddress) {
      return NextResponse.json(
        { success: false, error: 'ipAddress required' },
        { status: 400 }
      );
    }

    autoResponseService.unblockIP(ipAddress, 'Manual unblock');
    await prisma.blockedIP.delete({ where: { ipAddress } }).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('blocked-ips DELETE error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to unblock IP' },
      { status: 500 }
    );
  }
}
