import { NextResponse } from 'next/server';
import { getModelMetrics } from '@/lib/ml/metrics';
import { datasets } from '@/lib/utils';

export async function GET() {
  try {
    const metrics = getModelMetrics();

    return NextResponse.json({
      success: true,
      metrics,
      datasets,
      comparison: {
        bestAccuracy: metrics.reduce((best, m) => m.accuracy > best.accuracy ? m : best),
        lowestFPR: metrics.reduce((best, m) => m.falsePositiveRate < best.falsePositiveRate ? m : best),
        fastestDetection: metrics.reduce((best, m) => m.detectionTime < best.detectionTime ? m : best),
      },
      research: {
        title: 'Comparative Analysis of ML Techniques for Network Intrusion Detection',
        abstract: `This research compares three machine learning approaches for anomaly-based intrusion detection: 
        Isolation Forest, Autoencoders, and K-Means Clustering. Our ensemble approach with RLHF achieves 
        ${(metrics.find(m => m.method === 'Ensemble')?.accuracy ?? 0 * 100).toFixed(2)}% accuracy with a 
        false positive rate of ${(metrics.find(m => m.method === 'Ensemble')?.falsePositiveRate ?? 0 * 100).toFixed(2)}%.`,
        contributions: [
          'Novel ensemble method combining 3 ML techniques with dynamic RLHF weight adjustment',
          'Comprehensive comparison on NSL-KDD and CICIDS datasets',
          'False positive reduction through multi-model consensus',
          'Real-time detection capability with sub-10ms latency',
          'Automatic attack prevention without human intervention',
          'Auto-training pipeline for continuous model improvement',
        ],
      },
    });
  } catch (error) {
    console.error('Metrics error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve metrics' },
      { status: 500 }
    );
  }
}
