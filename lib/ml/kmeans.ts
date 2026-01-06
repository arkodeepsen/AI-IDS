/**
 * K-Means Clustering Implementation
 * Anomaly detection using distance to nearest cluster centroid
 */

export class KMeansClustering {
    private k: number;
    private centroids: number[][] = [];
    private maxIterations: number;
    private distanceThreshold: number = 1.0;
    private trained: boolean = false;

    constructor(k: number = 5, maxIterations: number = 100) {
        this.k = k;
        this.maxIterations = maxIterations;
    }

    fit(data: number[][]): void {
        if (data.length === 0) return;

        // Initialize centroids using k-means++
        this.centroids = this.initializeCentroidsKMeansPP(data);

        for (let iter = 0; iter < this.maxIterations; iter++) {
            // Assign points to clusters
            const clusters: number[][][] = Array(this.k).fill(null).map(() => []);

            for (const point of data) {
                const nearestIdx = this.nearestCentroid(point);
                clusters[nearestIdx].push(point);
            }

            // Update centroids
            let converged = true;
            for (let i = 0; i < this.k; i++) {
                if (clusters[i].length > 0) {
                    const newCentroid = this.calculateCentroid(clusters[i]);
                    if (this.euclideanDistance(this.centroids[i], newCentroid) > 0.0001) {
                        converged = false;
                    }
                    this.centroids[i] = newCentroid;
                }
            }

            if (converged) break;
        }

        // Set threshold based on training data distances
        const distances = data.map(point => this.distanceToNearestCentroid(point));
        this.distanceThreshold = this.percentile(distances, 95);
        this.trained = true;
    }

    private initializeCentroidsKMeansPP(data: number[][]): number[][] {
        const centroids: number[][] = [];

        // Choose first centroid randomly
        centroids.push([...data[Math.floor(Math.random() * data.length)]]);

        // Choose remaining centroids with probability proportional to distance squared
        while (centroids.length < this.k) {
            const distances = data.map(point => {
                const minDist = Math.min(...centroids.map(c => this.euclideanDistance(point, c)));
                return minDist * minDist;
            });

            const totalDist = distances.reduce((a, b) => a + b, 0);
            let random = Math.random() * totalDist;

            for (let i = 0; i < data.length; i++) {
                random -= distances[i];
                if (random <= 0) {
                    centroids.push([...data[i]]);
                    break;
                }
            }
        }

        return centroids;
    }

    private calculateCentroid(cluster: number[][]): number[] {
        const numFeatures = cluster[0].length;
        const centroid = Array(numFeatures).fill(0);

        for (const point of cluster) {
            for (let i = 0; i < numFeatures; i++) {
                centroid[i] += point[i];
            }
        }

        return centroid.map(x => x / cluster.length);
    }

    private euclideanDistance(a: number[], b: number[]): number {
        return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - (b[i] || 0), 2), 0));
    }

    private nearestCentroid(point: number[]): number {
        let minDist = Infinity;
        let nearestIdx = 0;

        for (let i = 0; i < this.centroids.length; i++) {
            const dist = this.euclideanDistance(point, this.centroids[i]);
            if (dist < minDist) {
                minDist = dist;
                nearestIdx = i;
            }
        }

        return nearestIdx;
    }

    distanceToNearestCentroid(point: number[]): number {
        return Math.min(...this.centroids.map(c => this.euclideanDistance(point, c)));
    }

    predict(point: number[]): number {
        const distance = this.distanceToNearestCentroid(point);
        return distance / (this.distanceThreshold || 1);
    }

    private percentile(arr: number[], p: number): number {
        const sorted = [...arr].sort((a, b) => a - b);
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    isTrained(): boolean {
        return this.trained;
    }

    getCentroids(): number[][] {
        return this.centroids;
    }

    getClusterAssignment(point: number[]): number {
        return this.nearestCentroid(point);
    }
}
