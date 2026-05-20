/**
 * Auto-Training Service
 * Automatic model retraining when anomalies are detected
 */

import { DetectionResult, AttackType } from '../types';
import { extractFeatures } from '../ml/features';

export interface TrainingDataPoint {
    id: string;
    features: number[];
    label: 'normal' | 'anomaly';
    attackType?: AttackType;
    confidence: number;
    verified: boolean;
    createdAt: Date;
    detectionId?: string;
}

export interface TrainingConfig {
    enabled: boolean;
    minSamplesForRetrain: number;
    autoRetrainOnNewAnomalies: boolean;
    maxStoredSamples: number;
    includeNormalTraffic: boolean;
    normalTrafficRatio: number; // Ratio of normal to anomaly samples
}

export interface TrainingResult {
    id: string;
    timestamp: Date;
    samplesUsed: number;
    modelVersion: number;
    metrics: {
        accuracy?: number;
        precision?: number;
        recall?: number;
    };
    duration: number; // ms
}

export interface TrainingDataExport {
    version: string;
    exportedAt: string;
    samples: TrainingDataPoint[];
    modelVersion: number;
    totalSamples: {
        normal: number;
        anomaly: number;
    };
}

class AutoTrainingService {
    private trainingData: TrainingDataPoint[] = [];
    private trainingHistory: TrainingResult[] = [];
    private modelVersion: number = 1;
    private config: TrainingConfig = {
        enabled: true,
        minSamplesForRetrain: 100,
        autoRetrainOnNewAnomalies: true,
        maxStoredSamples: 10000,
        includeNormalTraffic: true,
        normalTrafficRatio: 0.5
    };
    private pendingRetraining: boolean = false;

    /**
     * Add a detection result to training data
     */
    addDetectionData(detection: DetectionResult): TrainingDataPoint {
        const features = extractFeatures(detection.packet);

        const dataPoint: TrainingDataPoint = {
            id: crypto.randomUUID(),
            features,
            label: detection.isAnomaly ? 'anomaly' : 'normal',
            attackType: detection.attackType,
            confidence: detection.confidence,
            verified: false,
            createdAt: new Date(),
            detectionId: detection.id
        };

        // Check if we should add normal traffic
        if (!detection.isAnomaly && !this.config.includeNormalTraffic) {
            return dataPoint; // Don't store normal traffic
        }

        // Maintain ratio of normal to anomaly
        if (!detection.isAnomaly) {
            const anomalyCount = this.trainingData.filter(d => d.label === 'anomaly').length;
            const normalCount = this.trainingData.filter(d => d.label === 'normal').length;

            if (normalCount >= anomalyCount * this.config.normalTrafficRatio) {
                return dataPoint; // Skip to maintain ratio
            }
        }

        this.trainingData.push(dataPoint);

        // Enforce max samples limit
        if (this.trainingData.length > this.config.maxStoredSamples) {
            // Remove oldest non-anomaly samples first
            const normalSamples = this.trainingData
                .filter(d => d.label === 'normal')
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

            if (normalSamples.length > 0) {
                const toRemove = normalSamples[0].id;
                this.trainingData = this.trainingData.filter(d => d.id !== toRemove);
            }
        }

        // Check if we should trigger retraining
        if (this.config.autoRetrainOnNewAnomalies && detection.isAnomaly) {
            this.checkRetrainingNeeded();
        }

        return dataPoint;
    }

    /**
     * Mark a training data point as verified
     */
    verifyDataPoint(id: string, isCorrect: boolean, correctLabel?: 'normal' | 'anomaly'): void {
        const dataPoint = this.trainingData.find(d => d.id === id);
        if (dataPoint) {
            dataPoint.verified = true;
            if (!isCorrect && correctLabel) {
                dataPoint.label = correctLabel;
            }
        }
    }

    /**
     * Check if retraining is needed
     */
    private checkRetrainingNeeded(): boolean {
        const unverifiedAnomalies = this.trainingData.filter(
            d => d.label === 'anomaly' && !d.verified
        ).length;

        if (unverifiedAnomalies >= this.config.minSamplesForRetrain && !this.pendingRetraining) {
            this.pendingRetraining = true;
            return true;
        }

        return false;
    }

    /**
     * Record a completed retraining run. The actual model fit and held-out
     * evaluation happen in detection.ts::retrainDetector(); this logs the
     * real, measured outcome to the training history — no simulated numbers.
     */
    recordRetraining(outcome: {
        samplesUsed: number;
        accuracy: number;
        precision: number;
        recall: number;
        durationMs: number;
    }): TrainingResult {
        this.modelVersion++;

        const result: TrainingResult = {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            samplesUsed: outcome.samplesUsed,
            modelVersion: this.modelVersion,
            metrics: {
                accuracy: outcome.accuracy,
                precision: outcome.precision,
                recall: outcome.recall,
            },
            duration: outcome.durationMs,
        };

        this.trainingHistory.push(result);
        this.pendingRetraining = false;

        return result;
    }

    /**
     * Get current training data
     */
    getTrainingData(options?: {
        label?: 'normal' | 'anomaly';
        verified?: boolean;
        limit?: number;
    }): TrainingDataPoint[] {
        let data = [...this.trainingData];

        if (options?.label) {
            data = data.filter(d => d.label === options.label);
        }
        if (options?.verified !== undefined) {
            data = data.filter(d => d.verified === options.verified);
        }
        if (options?.limit) {
            data = data.slice(-options.limit);
        }

        return data;
    }

    /**
     * Export training data as JSON
     */
    exportTrainingData(): TrainingDataExport {
        const normalCount = this.trainingData.filter(d => d.label === 'normal').length;
        const anomalyCount = this.trainingData.filter(d => d.label === 'anomaly').length;

        return {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            samples: this.trainingData,
            modelVersion: this.modelVersion,
            totalSamples: {
                normal: normalCount,
                anomaly: anomalyCount
            }
        };
    }

    /**
     * Import training data from JSON
     */
    importTrainingData(json: string | TrainingDataExport): void {
        const data = typeof json === 'string' ? JSON.parse(json) : json;

        if (data.samples && Array.isArray(data.samples)) {
            // Merge with existing data, avoiding duplicates
            const existingIds = new Set(this.trainingData.map(d => d.id));

            for (const sample of data.samples) {
                if (!existingIds.has(sample.id)) {
                    this.trainingData.push({
                        ...sample,
                        createdAt: new Date(sample.createdAt)
                    });
                }
            }

            // Update model version if imported is higher
            if (data.modelVersion && data.modelVersion > this.modelVersion) {
                this.modelVersion = data.modelVersion;
            }
        }
    }

    /**
     * Get training statistics
     */
    getStats(): {
        totalSamples: number;
        normalSamples: number;
        anomalySamples: number;
        verifiedSamples: number;
        modelVersion: number;
        pendingRetraining: boolean;
        trainingHistory: TrainingResult[];
    } {
        return {
            totalSamples: this.trainingData.length,
            normalSamples: this.trainingData.filter(d => d.label === 'normal').length,
            anomalySamples: this.trainingData.filter(d => d.label === 'anomaly').length,
            verifiedSamples: this.trainingData.filter(d => d.verified).length,
            modelVersion: this.modelVersion,
            pendingRetraining: this.pendingRetraining,
            trainingHistory: this.trainingHistory
        };
    }

    /**
     * Update configuration
     */
    updateConfig(updates: Partial<TrainingConfig>): TrainingConfig {
        this.config = { ...this.config, ...updates };
        return this.config;
    }

    /**
     * Get current configuration
     */
    getConfig(): TrainingConfig {
        return { ...this.config };
    }

    /**
     * Clear all training data
     */
    clearTrainingData(): void {
        this.trainingData = [];
        this.pendingRetraining = false;
    }

    /**
     * Delete specific training sample
     */
    deleteTrainingSample(id: string): boolean {
        const index = this.trainingData.findIndex(d => d.id === id);
        if (index !== -1) {
            this.trainingData.splice(index, 1);
            return true;
        }
        return false;
    }
}

// Singleton instance
export const autoTrainingService = new AutoTrainingService();
