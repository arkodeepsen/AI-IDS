import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ThreatLevel } from '@prisma/client';
import { 
  EnsembleDetector, 
  detectAnomaly, 
  generateTrainingData 
} from '@/lib/ml-detection';
import { generatePacketBatch } from '@/lib/utils';
import { DetectionMethod } from '@/lib/types';

// Initialize detector
let detector: EnsembleDetector | null = null;

function getDetector(): EnsembleDetector {
  if (!detector) {
    detector = new EnsembleDetector();
    const trainingData = generateTrainingData(500);
    detector.fit(trainingData);
  }
  return detector;
}

// Helper to convert threat level to Prisma enum
function mapThreatLevel(level: string): ThreatLevel {
  switch (level) {
    case 'critical': return ThreatLevel.CRITICAL;
    case 'high': return ThreatLevel.HIGH;
    case 'medium': return ThreatLevel.MEDIUM;
    default: return ThreatLevel.LOW;
  }
}

// GET - Fetch detection results from database
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const anomalyOnly = searchParams.get('anomalyOnly') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');

    const where = anomalyOnly ? { isAnomaly: true } : {};

    const results = await prisma.detectionResult.findMany({
      where,
      include: { packet: true },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Failed to fetch detections:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch detections' },
      { status: 500 }
    );
  }
}

// POST - Run detection and optionally save to database
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      count = 10, 
      method = 'Ensemble', 
      saveToDb = false 
    } = body;

    const packets = generatePacketBatch(Math.min(count, 100));
    const det = getDetector();

    const results = packets.map(packet => 
      detectAnomaly(packet, method as DetectionMethod, det)
    );

    // Save to database if requested
    if (saveToDb) {
      for (const result of results) {
        const savedPacket = await prisma.networkPacket.create({
          data: {
            sourceIP: result.packet.sourceIP,
            destIP: result.packet.destIP,
            sourcePort: result.packet.sourcePort,
            destPort: result.packet.destPort,
            protocol: result.packet.protocol,
            packetSize: result.packet.packetSize,
            flags: result.packet.flags,
          },
        });

        await prisma.detectionResult.create({
          data: {
            packetId: savedPacket.id,
            isAnomaly: result.isAnomaly,
            threatLevel: mapThreatLevel(result.threatLevel),
            attackType: result.attackType,
            confidence: result.confidence,
            detectionMethod: result.detectionMethod,
            description: result.description,
            recommendations: result.recommendations,
          },
        });
      }
    }

    const anomalies = results.filter(r => r.isAnomaly);
    const summary = {
      total: results.length,
      anomalies: anomalies.length,
      critical: anomalies.filter(r => r.threatLevel === 'critical').length,
      high: anomalies.filter(r => r.threatLevel === 'high').length,
      medium: anomalies.filter(r => r.threatLevel === 'medium').length,
      low: anomalies.filter(r => r.threatLevel === 'low').length,
      savedToDb: saveToDb,
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
