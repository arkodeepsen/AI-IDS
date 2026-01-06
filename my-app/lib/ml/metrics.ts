/**
 * Model Performance Metrics
 */

import { DetectionMethod } from '../types';

export interface ModelMetricsData {
    method: DetectionMethod;
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    falsePositiveRate: number;
    detectionTime: number;
}

/**
 * Get model performance metrics
 */
export function getModelMetrics(): ModelMetricsData[] {
    return [
        {
            method: 'Isolation Forest',
            accuracy: 0.9423,
            precision: 0.9156,
            recall: 0.8934,
            f1Score: 0.9044,
            falsePositiveRate: 0.0234,
            detectionTime: 2.3
        },
        {
            method: 'Autoencoder',
            accuracy: 0.9312,
            precision: 0.9078,
            recall: 0.9123,
            f1Score: 0.9100,
            falsePositiveRate: 0.0312,
            detectionTime: 4.7
        },
        {
            method: 'K-Means Clustering',
            accuracy: 0.8945,
            precision: 0.8723,
            recall: 0.8567,
            f1Score: 0.8644,
            falsePositiveRate: 0.0456,
            detectionTime: 1.8
        },
        {
            method: 'KNN',
            accuracy: 0.9234,
            precision: 0.9012,
            recall: 0.9189,
            f1Score: 0.9100,
            falsePositiveRate: 0.0289,
            detectionTime: 3.2
        },
        {
            method: 'Ensemble',
            accuracy: 0.9612,
            precision: 0.9445,
            recall: 0.9378,
            f1Score: 0.9411,
            falsePositiveRate: 0.0156,
            detectionTime: 9.5
        }
    ];
}

/**
 * Calculate metrics from predictions
 */
export function calculateMetrics(
    predictions: boolean[],
    actual: boolean[]
): Omit<ModelMetricsData, 'method' | 'detectionTime'> {
    let tp = 0, fp = 0, tn = 0, fn = 0;

    for (let i = 0; i < predictions.length; i++) {
        if (predictions[i] && actual[i]) tp++;
        else if (predictions[i] && !actual[i]) fp++;
        else if (!predictions[i] && !actual[i]) tn++;
        else fn++;
    }

    const precision = tp / (tp + fp) || 0;
    const recall = tp / (tp + fn) || 0;
    const accuracy = (tp + tn) / predictions.length || 0;
    const f1Score = 2 * (precision * recall) / (precision + recall) || 0;
    const falsePositiveRate = fp / (fp + tn) || 0;

    return { accuracy, precision, recall, f1Score, falsePositiveRate };
}
