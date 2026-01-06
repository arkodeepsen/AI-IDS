/**
 * Detection API Route
 * POST: Detect anomalies in network packets
 * GET: Get single detection result
 */

import { NextRequest, NextResponse } from 'next/server';
import { generatePacketBatch } from '@/lib/utils';
import { detectAnomaly, detectBatch, getDetector } from '@/lib/services/detection';
import { DetectionMethod } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { count = 10, method = 'Ensemble' } = body;

    // Initialize detector if needed
    getDetector();

    const packets = generatePacketBatch(Math.min(count, 100));
    const results = detectBatch(packets, method as DetectionMethod);

    const anomalies = results.filter(r => r.isAnomaly);
    const blocked = results.filter(r => r.autoResponseAction === 'blocked');

    const summary = {
      total: results.length,
      anomalies: anomalies.length,
      blocked: blocked.length,
      critical: anomalies.filter(r => r.threatLevel === 'critical').length,
      high: anomalies.filter(r => r.threatLevel === 'high').length,
      medium: anomalies.filter(r => r.threatLevel === 'medium').length,
      low: anomalies.filter(r => r.threatLevel === 'low').length,
    };

    return NextResponse.json({
      success: true,
      results,
      summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Detection error:', error);
    return NextResponse.json(
      { success: false, error: 'Detection failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const packets = generatePacketBatch(1);
    const result = detectAnomaly(packets[0], 'Ensemble');

    return NextResponse.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Detection error:', error);
    return NextResponse.json(
      { success: false, error: 'Detection failed' },
      { status: 500 }
    );
  }
}
