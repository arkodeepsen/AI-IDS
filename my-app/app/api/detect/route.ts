import { NextRequest, NextResponse } from 'next/server';
import { 
  generatePacketBatch, 
} from '@/lib/utils';
import { 
  EnsembleDetector, 
  detectAnomaly, 
  generateTrainingData, 
  extractFeatures 
} from '@/lib/ml-detection';
import { DetectionMethod } from '@/lib/types';

// Initialize and train the detector
let detector: EnsembleDetector | null = null;

function getDetector(): EnsembleDetector {
  if (!detector) {
    detector = new EnsembleDetector();
    const trainingData = generateTrainingData(500);
    detector.fit(trainingData);
  }
  return detector;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { count = 10, method = 'Ensemble' } = body;
    
    const packets = generatePacketBatch(Math.min(count, 100));
    const det = getDetector();
    
    const results = packets.map(packet => 
      detectAnomaly(packet, method as DetectionMethod, det)
    );
    
    const anomalies = results.filter(r => r.isAnomaly);
    const summary = {
      total: results.length,
      anomalies: anomalies.length,
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
  // Generate a single packet detection for streaming
  try {
    const packets = generatePacketBatch(1);
    const det = getDetector();
    const result = detectAnomaly(packets[0], 'Ensemble', det);
    
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
