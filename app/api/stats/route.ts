/**
 * /api/stats — aggregate counters that drive the dashboard summary cards.
 * Pulls from the SQLite database; the in-memory services contribute
 * blocked-IP / RLHF metrics that aren't tracked in tables.
 *
 * All "period" fields are scoped to the requested window. Fields suffixed
 * with `AllTime` are unfiltered totals.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { autoResponseService } from '@/lib/services/auto-response';
import { rlhfService } from '@/lib/services/rlhf';

type ThreatLevelBucket = { critical: number; high: number; medium: number; low: number };

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') ?? '24h';
    const startDate = startFromPeriod(period);
    const since = { gte: startDate };

    // Filter by event `timestamp` (when the packet was captured) rather than
    // `createdAt` (when we wrote the row). The seed script back-dates entries
    // across the past 7 days; without this distinction `?period=24h` and
    // `?period=7d` would return the same numbers.
    const [
      totalPackets,
      totalAnomalies,
      threatGroups,
      recentDetections,
      newAlertsPeriod,
      newAlertsAllTime,
      blockedDbPeriod,
      blockedDbAllTime,
    ] = await Promise.all([
      prisma.networkPacket.count({ where: { timestamp: since } }),
      prisma.detectionResult.count({ where: { isAnomaly: true, timestamp: since } }),
      prisma.detectionResult.groupBy({
        by: ['threatLevel'],
        where: { isAnomaly: true, timestamp: since },
        _count: { _all: true },
      }),
      prisma.detectionResult.findMany({
        where: { timestamp: since },
        include: { packet: true },
        orderBy: { timestamp: 'desc' },
        take: 10,
      }),
      prisma.alert.count({ where: { status: 'NEW', timestamp: since } }),
      prisma.alert.count({ where: { status: 'NEW' } }),
      prisma.blockedIP.count({ where: { blockedAt: since } }),
      prisma.blockedIP.count(),
    ]);

    const threatLevelDistribution: ThreatLevelBucket = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    for (const g of threatGroups) {
      const key = g.threatLevel.toLowerCase() as keyof ThreatLevelBucket;
      if (key in threatLevelDistribution) {
        threatLevelDistribution[key] = g._count._all;
      }
    }

    const blockedMemory = autoResponseService.getStats().totalBlocked;
    const detectionRate =
      totalPackets > 0 ? ((totalAnomalies / totalPackets) * 100).toFixed(2) : '0.00';

    return NextResponse.json({
      success: true,
      stats: {
        period,
        totalPackets,
        totalAnomalies,
        detectionRate: `${detectionRate}%`,
        threatLevelDistribution,
        newAlerts: newAlertsPeriod,
        newAlertsAllTime,
        // The dashboard "blocked IPs" card shows the active set (auto-response
        // service is authoritative). The DB count is exposed separately so
        // callers can distinguish current from historical.
        blockedIPs: Math.max(blockedDbPeriod, blockedMemory),
        blockedIPsAllTime: blockedDbAllTime,
        feedbackCount: rlhfService.getMetrics().totalFeedback,
        recentDetections: recentDetections.map(d => ({
          id: d.id,
          timestamp: d.timestamp,
          isAnomaly: d.isAnomaly,
          threatLevel: d.threatLevel.toLowerCase(),
          attackType: d.attackType,
          confidence: d.confidence,
          sourceIP: d.packet.sourceIP,
          destIP: d.packet.destIP,
        })),
      },
    });
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}

function startFromPeriod(period: string): Date {
  const now = new Date();
  switch (period) {
    case '1h':
      return new Date(now.getTime() - 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '24h':
    default:
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
}
