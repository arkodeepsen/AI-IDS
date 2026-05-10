/**
 * /api/stats — aggregate counters that drive the dashboard summary cards.
 * Pulls from the SQLite database; the in-memory services contribute
 * blocked-IP / RLHF metrics that aren't tracked in tables.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { autoResponseService } from '@/lib/services/auto-response';
import { rlhfService } from '@/lib/services/rlhf';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') ?? '24h';
    const startDate = startFromPeriod(period);

    const [
      totalPackets,
      totalAnomalies,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      recentDetections,
      newAlerts,
      blockedDb,
    ] = await Promise.all([
      prisma.networkPacket.count({ where: { createdAt: { gte: startDate } } }),
      prisma.detectionResult.count({
        where: { isAnomaly: true, createdAt: { gte: startDate } },
      }),
      prisma.detectionResult.count({
        where: { threatLevel: 'CRITICAL', createdAt: { gte: startDate } },
      }),
      prisma.detectionResult.count({
        where: { threatLevel: 'HIGH', createdAt: { gte: startDate } },
      }),
      prisma.detectionResult.count({
        where: { threatLevel: 'MEDIUM', createdAt: { gte: startDate } },
      }),
      prisma.detectionResult.count({
        where: { threatLevel: 'LOW', createdAt: { gte: startDate } },
      }),
      prisma.detectionResult.findMany({
        where: { createdAt: { gte: startDate } },
        include: { packet: true },
        orderBy: { timestamp: 'desc' },
        take: 10,
      }),
      prisma.alert.count({ where: { status: 'NEW' } }),
      prisma.blockedIP.count(),
    ]);

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
        threatLevelDistribution: {
          critical: criticalCount,
          high: highCount,
          medium: mediumCount,
          low: lowCount,
        },
        newAlerts,
        blockedIPs: Math.max(blockedDb, blockedMemory),
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
