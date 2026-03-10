/**
 * Ensemble Detector
 * Combines all ML methods for robust anomaly detection
 */

import { IsolationForest } from './isolation-forest';
import { Autoencoder } from './autoencoder';
import { KMeansClustering } from './kmeans';

export interface EnsembleWeights {
    isolationForest: number;
    autoencoder: number;
    kMeans: number;
}

export interface EnsemblePrediction {
    score: number;
    isAnomaly: boolean;
    scores: {
        isolationForest: number;
        autoencoder: number;
        kMeans: number;
    };
    attackType?: string;
}

export class EnsembleDetector {
    private isolationForest: IsolationForest;
    private autoencoder: Autoencoder;
    private kMeans: KMeansClustering;
    private weights: EnsembleWeights;
    private anomalyThreshold: number = 0.5;

    constructor(weights?: Partial<EnsembleWeights>) {
        this.isolationForest = new IsolationForest(50, 128);
        this.autoencoder = new Autoencoder(7, 3);
        this.kMeans = new KMeansClustering(5, 50);

        // Default weights - can be adjusted via RLHF
        this.weights = {
            isolationForest: 0.35,
            autoencoder: 0.30,
            kMeans: 0.35,
            ...weights
        };
    }

    /**
     * Train all models with the provided data
     */
    fit(data: number[][], labels?: boolean[], attackTypes?: string[]): void {
        // Train unsupervised models
        this.isolationForest.fit(data);
        this.autoencoder.fit(data, 50, 0.01);
        this.kMeans.fit(data);
    }

    /**
     * Predict anomaly score and classification
     */
    predict(point: number[]): EnsemblePrediction {
        const ifScore = this.isolationForest.predict(point);
        const aeScore = Math.min(this.autoencoder.predict(point), 1);
        const kmScore = Math.min(this.kMeans.predict(point), 1);

        // Weighted ensemble score
        const ensembleScore =
            this.weights.isolationForest * ifScore +
            this.weights.autoencoder * aeScore +
            this.weights.kMeans * kmScore;

        const isAnomaly = ensembleScore > this.anomalyThreshold;

        return {
            score: ensembleScore,
            isAnomaly,
            scores: {
                isolationForest: ifScore,
                autoencoder: aeScore,
                kMeans: kmScore
            }
        };
    }

    /**
     * Get prediction from a specific method
     */
    predictByMethod(point: number[], method: string): number {
        switch (method) {
            case 'Isolation Forest':
                return this.isolationForest.predict(point);
            case 'Autoencoder':
                return Math.min(this.autoencoder.predict(point), 1);
            case 'K-Means Clustering':
                return Math.min(this.kMeans.predict(point), 1);
            default:
                return this.predict(point).score;
        }
    }

    /**
     * Update weights (used by RLHF)
     */
    updateWeights(newWeights: Partial<EnsembleWeights>): void {
        this.weights = { ...this.weights, ...newWeights };

        // Normalize weights to sum to 1
        const total = Object.values(this.weights).reduce((a, b) => a + b, 0);
        if (total > 0) {
            this.weights.isolationForest /= total;
            this.weights.autoencoder /= total;
            this.weights.kMeans /= total;
        }
    }

    /**
     * Get current weights
     */
    getWeights(): EnsembleWeights {
        return { ...this.weights };
    }

    /**
     * Set anomaly threshold
     */
    setAnomalyThreshold(threshold: number): void {
        this.anomalyThreshold = Math.max(0, Math.min(1, threshold));
    }

    /**
     * Get individual model instances for advanced operations
     */
    getModels() {
        return {
            isolationForest: this.isolationForest,
            autoencoder: this.autoencoder,
            kMeans: this.kMeans
        };
    }

    /**
     * Check if all models are trained
     */
    isTrained(): boolean {
        return (
            this.isolationForest.isTrained() &&
            this.autoencoder.isTrained() &&
            this.kMeans.isTrained()
        );
    }
}
