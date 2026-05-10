/**
 * /api/detect — runs the ensemble on a fresh batch of synthetic packets and
 * (optionally) persists each detection so the rest of the dashboard updates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generatePacketBatch, generateSyntheticAttack, SyntheticAttackKind } from '@/lib/utils';
import { detectAnomaly, detectBatch, getDetector, persistDetection } from '@/lib/services/detection';
import { DetectionMethod } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      count = 10,
      method = 'Ensemble',
      persist = true,
      attack,
    }: {
      count?: number;
      method?: DetectionMethod;
      persist?: boolean;
      attack?: SyntheticAttackKind;
    } = body;

    getDetector();

    const packets = attack
      ? generateSyntheticAttack(attack, Math.min(count, 200))
      : generatePacketBatch(Math.min(count, 200));

    const results = detectBatch(packets, method);

    if (persist) {
      // Don't block on persistence — fire all writes off in parallel.
      await Promise.all(results.map(r => persistDetection(r)));
    }

    const anomalies = results.filter(r => r.isAnomaly);
    const blocked = results.filter(r => r.autoResponseAction === 'blocked');

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: results.length,
        anomalies: anomalies.length,
        blocked: blocked.length,
        critical: anomalies.filter(r => r.threatLevel === 'critical').length,
        high: anomalies.filter(r => r.threatLevel === 'high').length,
        medium: anomalies.filter(r => r.threatLevel === 'medium').length,
        low: anomalies.filter(r => r.threatLevel === 'low').length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Detection error:', error);
    return NextResponse.json({ success: false, error: 'Detection failed' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const packets = generatePacketBatch(1);
    const result = detectAnomaly(packets[0], 'Ensemble');
    return NextResponse.json({ success: true, result, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Detection error:', error);
    return NextResponse.json({ success: false, error: 'Detection failed' }, { status: 500 });
  }
}
