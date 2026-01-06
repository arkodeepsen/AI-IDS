/**
 * Ensemble Detector
 * Combines all ML methods for robust anomaly detection
 */

import { IsolationForest } from './isolation-forest';
import { Autoencoder } from './autoencoder';
import { KMeansClustering } from './kmeans';
import { KNNClassifier } from './knn';

export interface EnsembleWeights {
    isolationForest: number;
    autoencoder: number;
    kMeans: number;
    knn: number;
}

export interface EnsemblePrediction {
    score: number;
    isAnomaly: boolean;
    scores: {
        isolationForest: number;
        autoencoder: number;
        kMeans: number;
        knn: number;
    };
    attackType?: string;
}

export class EnsembleDetector {
    private isolationForest: IsolationForest;
    private autoencoder: Autoencoder;
    private kMeans: KMeansClustering;
    private knn: KNNClassifier;
    private weights: EnsembleWeights;
    private anomalyThreshold: number = 0.5;

    constructor(weights?: Partial<EnsembleWeights>) {
        this.isolationForest = new IsolationForest(50, 128);
        this.autoencoder = new Autoencoder(7, 3);
        this.kMeans = new KMeansClustering(5, 50);
        this.knn = new KNNClassifier(5);

        // Default weights - can be adjusted via RLHF
        this.weights = {
            isolationForest: 0.30,
            autoencoder: 0.25,
            kMeans: 0.20,
            knn: 0.25,
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

        // Train KNN with labels (if available) or generate pseudo-labels
        if (labels && labels.length === data.length) {
            this.knn.fit(data, labels, attackTypes);
        } else {
            // Generate pseudo-labels from unsupervised models
            const pseudoLabels = data.map(point => {
                const ifScore = this.isolationForest.predict(point);
                const aeScore = Math.min(this.autoencoder.predict(point), 1);
                const kmScore = Math.min(this.kMeans.predict(point), 1);
                const avgScore = (ifScore + aeScore + kmScore) / 3;
                return avgScore > 0.5;
            });
            this.knn.fit(data, pseudoLabels);
        }
    }

    /**
     * Predict anomaly score and classification
     */
    predict(point: number[]): EnsemblePrediction {
        const ifScore = this.isolationForest.predict(point);
        const aeScore = Math.min(this.autoencoder.predict(point), 1);
        const kmScore = Math.min(this.kMeans.predict(point), 1);
        const knnResult = this.knn.predict(point);
        const knnScore = knnResult.confidence;

        // Weighted ensemble score
        const ensembleScore =
            this.weights.isolationForest * ifScore +
            this.weights.autoencoder * aeScore +
            this.weights.kMeans * kmScore +
            this.weights.knn * knnScore;

        const isAnomaly = ensembleScore > this.anomalyThreshold;

        return {
            score: ensembleScore,
            isAnomaly,
            scores: {
                isolationForest: ifScore,
                autoencoder: aeScore,
                kMeans: kmScore,
                knn: knnScore
            },
            attackType: knnResult.attackType
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
            case 'KNN':
                return this.knn.getAnomalyScore(point);
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
            this.weights.knn /= total;
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
            kMeans: this.kMeans,
            knn: this.knn
        };
    }

    /**
     * Check if all models are trained
     */
    isTrained(): boolean {
        return (
            this.isolationForest.isTrained() &&
            this.autoencoder.isTrained() &&
            this.kMeans.isTrained() &&
            this.knn.isTrained()
        );
    }

    /**
     * Add training data to KNN (for online learning)
     */
    addKNNSample(features: number[], isAnomaly: boolean, attackType?: string): void {
        this.knn.addTrainingPoint(features, isAnomaly, attackType);
    }
}
