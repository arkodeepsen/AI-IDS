import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - Fetch system statistics
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '24h';
    
    // Calculate time range
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case '1h':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Aggregate stats
    const [
      totalPackets,
      totalAnomalies,
      alertsByStatus,
      alertsBySeverity,
      recentDetections,
      threatLevelDistribution
    ] = await Promise.all([
      prisma.networkPacket.count({
        where: { createdAt: { gte: startDate } }
      }),
      prisma.detectionResult.count({
        where: { 
          isAnomaly: true,
          createdAt: { gte: startDate } 
        }
      }),
      prisma.alert.groupBy({
        by: ['status'],
        _count: true,
        where: { createdAt: { gte: startDate } }
      }),
      prisma.alert.groupBy({
        by: ['severity'],
        _count: true,
        where: { createdAt: { gte: startDate } }
      }),
      prisma.detectionResult.findMany({
        where: { createdAt: { gte: startDate } },
        include: { packet: true },
        orderBy: { timestamp: 'desc' },
        take: 10
      }),
      prisma.detectionResult.groupBy({
        by: ['threatLevel'],
        _count: true,
        where: { 
          isAnomaly: true,
          createdAt: { gte: startDate } 
        }
      })
    ]);

    // Calculate detection rate
    const detectionRate = totalPackets > 0 
      ? ((totalAnomalies / totalPackets) * 100).toFixed(2) 
      : '0.00';

    return NextResponse.json({
      success: true,
      stats: {
        period,
        totalPackets,
        totalAnomalies,
        detectionRate: `${detectionRate}%`,
        alertsByStatus: alertsByStatus.reduce((acc, item) => {
          acc[item.status] = item._count;
          return acc;
        }, {} as Record<string, number>),
        alertsBySeverity: alertsBySeverity.reduce((acc, item) => {
          acc[item.severity] = item._count;
          return acc;
        }, {} as Record<string, number>),
        threatLevelDistribution: threatLevelDistribution.reduce((acc, item) => {
          acc[item.threatLevel] = item._count;
          return acc;
        }, {} as Record<string, number>),
        recentDetections: recentDetections.map(d => ({
          id: d.id,
          timestamp: d.timestamp,
          isAnomaly: d.isAnomaly,
          threatLevel: d.threatLevel,
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

// POST - Record system stats snapshot
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      totalPacketsAnalyzed,
      anomaliesDetected,
      falsePositives,
      truePositives,
      packetsPerSecond,
      cpuUsage,
      memoryUsage,
      uptime,
    } = body;

    const stats = await prisma.systemStats.create({
      data: {
        totalPacketsAnalyzed,
        anomaliesDetected,
        falsePositives,
        truePositives,
        packetsPerSecond,
        cpuUsage,
        memoryUsage,
        uptime,
      },
    });

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('Failed to save stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save statistics' },
      { status: 500 }
    );
  }
}
