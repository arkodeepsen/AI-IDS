/**
 * /api/lstm — exposes the trained LSTM sequence model.
 *
 * GET     returns model metadata + test metrics from `models/lstm-metrics.json`
 * POST    scores the most recent N detections as a sliding window and
 *         returns the LSTM's anomaly probability. Useful as a "sequence
 *         model second opinion" for the operator.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { loadLSTM } from '@/lib/ml/lstm-loader';
import { loadTrainedArtefacts } from '@/lib/ml/loader';
import { packetToKddRow } from '@/lib/ml/packet-to-kdd';
import { vectorise } from '@/lib/ml/nsl-kdd';

export async function GET() {
  const lstm = loadLSTM();
  if (!lstm) {
    return NextResponse.json(
      {
        success: false,
        error: 'LSTM not trained. Run `npm run train:lstm` to produce models/lstm.json.',
      },
      { status: 503 }
    );
  }
  return NextResponse.json({
    success: true,
    metrics: lstm.metrics,
  });
}

export async function POST(request: NextRequest) {
  const lstm = loadLSTM();
  const artefacts = loadTrainedArtefacts();
  if (!lstm || !artefacts) {
    return NextResponse.json(
      { success: false, error: 'LSTM or ensemble artefacts missing.' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const limit = lstm.metrics.sequenceLength;

    const recent = await prisma.detectionResult.findMany({
      include: { packet: true },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    if (recent.length < limit) {
      return NextResponse.json(
        {
          success: false,
          error: `Need at least ${limit} detections in the DB to score a sequence. Have ${recent.length}.`,
        },
        { status: 400 }
      );
    }

    // Order oldest -> newest so the LSTM sees the events in time order.
    const ordered = recent.slice().reverse();
    const sequence = ordered.map(r =>
      vectorise(
        packetToKddRow({
          id: r.packet.id,
          timestamp: r.packet.timestamp,
          sourceIP: r.packet.sourceIP,
          destIP: r.packet.destIP,
          sourcePort: r.packet.sourcePort,
          destPort: r.packet.destPort,
          protocol: r.packet.protocol as
            | 'TCP'
            | 'UDP'
            | 'ICMP'
            | 'HTTP'
            | 'HTTPS'
            | 'DNS'
            | 'SSH'
            | 'FTP',
          packetSize: r.packet.packetSize,
          flags: r.packet.flags ?? undefined,
        }),
        artefacts.scaler
      )
    );

    const probability = lstm.model.predictProb(sequence);
    const verdict = probability > (body.threshold ?? lstm.metrics.threshold);

    return NextResponse.json({
      success: true,
      probability,
      threshold: body.threshold ?? lstm.metrics.threshold,
      verdict: verdict ? 'anomalous-sequence' : 'normal-sequence',
      sequenceLength: lstm.metrics.sequenceLength,
      window: ordered.map(r => ({
        id: r.id,
        timestamp: r.timestamp,
        isAnomaly: r.isAnomaly,
        threatLevel: r.threatLevel.toLowerCase(),
        attackType: r.attackType,
        sourceIP: r.packet.sourceIP,
      })),
    });
  } catch (err) {
    console.error('LSTM POST error:', err);
    return NextResponse.json(
      { success: false, error: 'LSTM evaluation failed.' },
      { status: 500 }
    );
  }
}
