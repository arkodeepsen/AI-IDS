/**
 * /api/detections — DB-backed detection feed used by Detection / Active
 * Learning views. POST runs a detection batch and returns the results.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { detectBatch, persistDetection } from '@/lib/services/detection';
import { generatePacketBatch } from '@/lib/utils';
import { DetectionMethod } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const anomalyOnly = searchParams.get('anomalyOnly') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 500);

    const where = anomalyOnly ? { isAnomaly: true } : {};
    const results = await prisma.detectionResult.findMany({
      where,
      include: { packet: true },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    // Hydrate JSON-serialised columns so the client doesn't need to parse them.
    const hydrated = results.map(r => ({
      ...r,
      threatLevel: r.threatLevel.toLowerCase(),
      recommendations: safeParse<string[]>(r.recommendations, []),
      modelScores: safeParse<Record<string, number>>(r.modelScores, {}),
    }));

    return NextResponse.json({ success: true, results: hydrated });
  } catch (error) {
    console.error('Failed to fetch detections:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch detections' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { count = 10, method = 'Ensemble', saveToDb = true } = body;

    const packets = generatePacketBatch(Math.min(count, 200));
    const results = detectBatch(packets, method as DetectionMethod);

    if (saveToDb) {
      await Promise.all(results.map(r => persistDetection(r)));
    }

    const anomalies = results.filter(r => r.isAnomaly);
    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: results.length,
        anomalies: anomalies.length,
        blocked: results.filter(r => r.autoResponseAction === 'blocked').length,
        critical: anomalies.filter(r => r.threatLevel === 'critical').length,
        high: anomalies.filter(r => r.threatLevel === 'high').length,
        medium: anomalies.filter(r => r.threatLevel === 'medium').length,
        low: anomalies.filter(r => r.threatLevel === 'low').length,
        savedToDb: saveToDb,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Detection error:', error);
    return NextResponse.json({ success: false, error: 'Detection failed' }, { status: 500 });
  }
}

function safeParse<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}
