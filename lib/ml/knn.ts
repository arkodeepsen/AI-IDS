/**
 * K-Nearest Neighbors (KNN) Implementation
 * Anomaly detection using neighbor-based classification
 */

export interface KNNDataPoint {
    features: number[];
    isAnomaly: boolean;
    attackType?: string;
}

export class KNNClassifier {
    private k: number;
    private trainingData: KNNDataPoint[] = [];
    private trained: boolean = false;
    private distanceThreshold: number = 1.0;

    constructor(k: number = 5) {
        this.k = k;
    }

    /**
     * Fit the model with labeled data
     */
    fit(data: number[][], labels: boolean[], attackTypes?: string[]): void {
        this.trainingData = data.map((features, i) => ({
            features,
            isAnomaly: labels[i],
            attackType: attackTypes?.[i]
        }));

        // Calculate distance threshold from training data
        if (this.trainingData.length > 0) {
            const distances: number[] = [];
            for (let i = 0; i < Math.min(100, this.trainingData.length); i++) {
                const point = this.trainingData[i];
                const neighbors = this.findKNearestNeighbors(point.features, this.k + 1);
                if (neighbors.length > 1) {
                    distances.push(neighbors[1].distance); // Exclude self
                }
            }
            if (distances.length > 0) {
                this.distanceThreshold = this.percentile(distances, 95);
            }
        }

        this.trained = true;
    }

    /**
     * Calculate Euclidean distance between two points
     */
    private euclideanDistance(a: number[], b: number[]): number {
        return Math.sqrt(
            a.reduce((sum, val, i) => sum + Math.pow(val - (b[i] || 0), 2), 0)
        );
    }

    /**
     * Find K nearest neighbors for a given point
     */
    private findKNearestNeighbors(point: number[], k: number): Array<{ point: KNNDataPoint; distance: number }> {
        const distances = this.trainingData.map(dataPoint => ({
            point: dataPoint,
            distance: this.euclideanDistance(point, dataPoint.features)
        }));

        return distances
            .sort((a, b) => a.distance - b.distance)
            .slice(0, k);
    }

    /**
     * Predict if a point is an anomaly
     */
    predict(point: number[]): { isAnomaly: boolean; confidence: number; attackType?: string } {
        if (!this.trained || this.trainingData.length === 0) {
            return { isAnomaly: false, confidence: 0.5 };
        }

        const neighbors = this.findKNearestNeighbors(point, this.k);

        if (neighbors.length === 0) {
            return { isAnomaly: false, confidence: 0.5 };
        }

        // Count anomalies among neighbors (weighted by distance)
        let anomalyWeight = 0;
        let totalWeight = 0;
        const attackTypeCounts: Record<string, number> = {};

        for (const neighbor of neighbors) {
            const weight = 1 / (neighbor.distance + 0.0001); // Avoid division by zero
            totalWeight += weight;

            if (neighbor.point.isAnomaly) {
                anomalyWeight += weight;
                if (neighbor.point.attackType) {
                    attackTypeCounts[neighbor.point.attackType] =
                        (attackTypeCounts[neighbor.point.attackType] || 0) + weight;
                }
            }
        }

        const anomalyRatio = anomalyWeight / totalWeight;
        const isAnomaly = anomalyRatio > 0.5;

        // Find most common attack type among anomaly neighbors
        let attackType: string | undefined;
        if (isAnomaly && Object.keys(attackTypeCounts).length > 0) {
            attackType = Object.entries(attackTypeCounts)
                .sort((a, b) => b[1] - a[1])[0][0];
        }

        // Calculate average distance to neighbors
        const avgDistance = neighbors.reduce((sum, n) => sum + n.distance, 0) / neighbors.length;
        const distanceScore = Math.min(avgDistance / this.distanceThreshold, 1);

        // Combine voting and distance for confidence
        const confidence = (anomalyRatio * 0.7) + (distanceScore * 0.3);

        return {
            isAnomaly,
            confidence: Math.min(confidence, 1),
            attackType
        };
    }

    /**
     * Get anomaly score (0-1 range)
     */
    getAnomalyScore(point: number[]): number {
        const result = this.predict(point);
        return result.confidence;
    }

    private percentile(arr: number[], p: number): number {
        const sorted = [...arr].sort((a, b) => a - b);
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    isTrained(): boolean {
        return this.trained;
    }

    getTrainingDataSize(): number {
        return this.trainingData.length;
    }

    /**
     * Add new training data point
     */
    addTrainingPoint(features: number[], isAnomaly: boolean, attackType?: string): void {
        this.trainingData.push({ features, isAnomaly, attackType });
    }

    /**
     * Export training data for persistence
     */
    exportTrainingData(): KNNDataPoint[] {
        return [...this.trainingData];
    }

    /**
     * Import training data
     */
    importTrainingData(data: KNNDataPoint[]): void {
        this.trainingData = data;
        this.trained = data.length > 0;
    }
}
