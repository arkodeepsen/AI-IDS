/**
 * /api/attack — fires a burst of a crafted attack pattern (DDoS, Port Scan,
 * Brute Force, Web Attack, SQL Injection, Botnet or Infiltration) and
 * persists the resulting detections. Used by the "Generate Attack" control.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateSyntheticAttack, SyntheticAttackKind } from '@/lib/utils';
import { detectBatch, persistDetection, getDetector } from '@/lib/services/detection';

const ALLOWED: SyntheticAttackKind[] = [
  'ddos',
  'portscan',
  'bruteforce',
  'webattack',
  'sqlinjection',
  'botnet',
  'infiltration',
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const kind = (body.kind ?? 'ddos') as SyntheticAttackKind;
    const count = Math.min(Math.max(parseInt(body.count ?? '40'), 1), 200);

    if (!ALLOWED.includes(kind)) {
      return NextResponse.json(
        { success: false, error: `Unsupported kind '${kind}'. Use one of ${ALLOWED.join(', ')}` },
        { status: 400 }
      );
    }

    getDetector();
    const packets = generateSyntheticAttack(kind, count);
    const results = detectBatch(packets, 'Ensemble');
    await Promise.all(results.map(r => persistDetection(r)));

    const anomalies = results.filter(r => r.isAnomaly);
    return NextResponse.json({
      success: true,
      kind,
      count: results.length,
      summary: {
        total: results.length,
        anomalies: anomalies.length,
        critical: anomalies.filter(r => r.threatLevel === 'critical').length,
        high: anomalies.filter(r => r.threatLevel === 'high').length,
        blocked: results.filter(r => r.autoResponseAction === 'blocked').length,
      },
      results: results.slice(0, 20), // preview a handful
    });
  } catch (err) {
    console.error('Attack endpoint error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to generate attack' },
      { status: 500 }
    );
  }
}
