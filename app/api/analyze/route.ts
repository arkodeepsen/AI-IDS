import { NextRequest, NextResponse } from 'next/server';
import { analyzeWithGemini, explainDetection, getSecurityAdvice } from '@/lib/gemini';
import { DetectionResult } from '@/lib/types';
import prisma from '@/lib/prisma';

/**
 * Compact snapshot of current dashboard data, passed to the assistant so it
 * can answer questions about the live system state instead of guessing.
 */
async function buildLiveContext(): Promise<string> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [total, anomalies, blocked, recent] = await Promise.all([
    prisma.detectionResult.count({ where: { timestamp: { gte: since } } }),
    prisma.detectionResult.count({ where: { timestamp: { gte: since }, isAnomaly: true } }),
    prisma.blockedIP.count(),
    prisma.detectionResult.findMany({
      where: { isAnomaly: true },
      orderBy: { timestamp: 'desc' },
      take: 5,
      include: { packet: true },
    }),
  ]);
  const recentLines = recent
    .map(
      (d) =>
        `  - ${d.attackType ?? 'Anomaly'} (${d.threatLevel.toLowerCase()}, ${d.confidence.toFixed(0)}% confidence) ` +
        `${d.packet.sourceIP} -> ${d.packet.destIP}:${d.packet.destPort}`
    )
    .join('\n');
  return `- Packets analysed (last 24h): ${total}
- Anomalies flagged (last 24h): ${anomalies}
- IP addresses currently blocked: ${blocked}
- Most recent anomalies:
${recentLines || '  (none yet)'}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, data } = body;

    switch (action) {
      case 'analyze': {
        const { detectionResults, systemContext } = data;
        const analysis = await analyzeWithGemini(
          detectionResults as DetectionResult[],
          systemContext as string
        );
        return NextResponse.json({ success: true, analysis });
      }
      
      case 'explain': {
        const { detection } = data;
        const explanation = await explainDetection(detection as DetectionResult);
        return NextResponse.json({ success: true, explanation });
      }
      
      case 'advice': {
        const { query } = data;
        const liveContext = await buildLiveContext().catch(() => undefined);
        const advice = await getSecurityAdvice(query as string, liveContext);
        return NextResponse.json({ success: true, advice });
      }
      
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Gemini API error:', error);
    return NextResponse.json(
      { success: false, error: 'AI analysis failed' },
      { status: 500 }
    );
  }
}
