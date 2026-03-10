/**
 * RLHF (Reinforcement Learning from Human Feedback) Service
 * Collects user feedback to improve model weights dynamically
 */

import { EnsembleWeights } from '../ml/ensemble';

export interface RLHFFeedback {
    id: string;
    detectionId: string;
    isCorrect: boolean;
    correctLabel?: string;
    attackType?: string;
    feedbackAt: Date;
    modelMethod?: string;
}

export interface RLHFMetrics {
    totalFeedback: number;
    correctPredictions: number;
    incorrectPredictions: number;
    accuracyRate: number;
    weightAdjustments: number;
    lastUpdate: Date | null;
}

export interface WeightHistory {
    timestamp: Date;
    weights: EnsembleWeights;
    reason: string;
}

class RLHFService {
    private feedbackHistory: RLHFFeedback[] = [];
    private weightHistory: WeightHistory[] = [];
    private currentWeights: EnsembleWeights = {
        isolationForest: 0.35,
        autoencoder: 0.30,
        kMeans: 0.35
    };
    private learningRate: number = 0.05;
    private minAdjustmentThreshold: number = 10; // Min feedback before adjusting

    /**
     * Record user feedback for a detection
     */
    addFeedback(feedback: Omit<RLHFFeedback, 'id' | 'feedbackAt'>): RLHFFeedback {
        const newFeedback: RLHFFeedback = {
            ...feedback,
            id: crypto.randomUUID(),
            feedbackAt: new Date()
        };

        this.feedbackHistory.push(newFeedback);

        // Check if we should adjust weights
        if (this.feedbackHistory.length % this.minAdjustmentThreshold === 0) {
            this.adjustWeights();
        }

        return newFeedback;
    }

    /**
     * Adjust model weights based on feedback
     */
    adjustWeights(): EnsembleWeights {
        const recentFeedback = this.feedbackHistory.slice(-100);

        if (recentFeedback.length < this.minAdjustmentThreshold) {
            return this.currentWeights;
        }

        // Calculate performance by method
        const methodPerformance: Record<string, { correct: number; total: number }> = {
            'Isolation Forest': { correct: 0, total: 0 },
            'Autoencoder': { correct: 0, total: 0 },
            'K-Means Clustering': { correct: 0, total: 0 }
        };

        for (const fb of recentFeedback) {
            if (fb.modelMethod && methodPerformance[fb.modelMethod]) {
                methodPerformance[fb.modelMethod].total++;
                if (fb.isCorrect) {
                    methodPerformance[fb.modelMethod].correct++;
                }
            }
        }

        // Calculate new weights based on accuracy
        const accuracies: Record<string, number> = {};
        let totalAccuracy = 0;

        for (const [method, perf] of Object.entries(methodPerformance)) {
            const accuracy = perf.total > 0 ? perf.correct / perf.total : 0.5;
            accuracies[method] = accuracy;
            totalAccuracy += accuracy;
        }

        // Only adjust if we have meaningful data
        if (totalAccuracy > 0) {
            const oldWeights = { ...this.currentWeights };

            // Blend current weights with performance-based weights
            this.currentWeights.isolationForest = this.blend(
                oldWeights.isolationForest,
                accuracies['Isolation Forest'] / totalAccuracy
            );
            this.currentWeights.autoencoder = this.blend(
                oldWeights.autoencoder,
                accuracies['Autoencoder'] / totalAccuracy
            );
            this.currentWeights.kMeans = this.blend(
                oldWeights.kMeans,
                accuracies['K-Means Clustering'] / totalAccuracy
            );

            // Normalize weights
            this.normalizeWeights();

            // Record history
            this.weightHistory.push({
                timestamp: new Date(),
                weights: { ...this.currentWeights },
                reason: `Based on ${recentFeedback.length} feedback entries`
            });
        }

        return this.currentWeights;
    }

    private blend(current: number, target: number): number {
        return current * (1 - this.learningRate) + target * this.learningRate;
    }

    private normalizeWeights(): void {
        const total =
            this.currentWeights.isolationForest +
            this.currentWeights.autoencoder +
            this.currentWeights.kMeans;

        if (total > 0) {
            this.currentWeights.isolationForest /= total;
            this.currentWeights.autoencoder /= total;
            this.currentWeights.kMeans /= total;
        }
    }

    /**
     * Get current weights
     */
    getWeights(): EnsembleWeights {
        return { ...this.currentWeights };
    }

    /**
     * Set learning rate
     */
    setLearningRate(rate: number): void {
        this.learningRate = Math.max(0.01, Math.min(0.5, rate));
    }

    /**
     * Get RLHF metrics
     */
    getMetrics(): RLHFMetrics {
        const correct = this.feedbackHistory.filter(f => f.isCorrect).length;
        const total = this.feedbackHistory.length;

        return {
            totalFeedback: total,
            correctPredictions: correct,
            incorrectPredictions: total - correct,
            accuracyRate: total > 0 ? correct / total : 0,
            weightAdjustments: this.weightHistory.length,
            lastUpdate: this.weightHistory.length > 0
                ? this.weightHistory[this.weightHistory.length - 1].timestamp
                : null
        };
    }

    /**
     * Get feedback history
     */
    getFeedbackHistory(limit: number = 50): RLHFFeedback[] {
        return this.feedbackHistory.slice(-limit);
    }

    /**
     * Get weight adjustment history
     */
    getWeightHistory(): WeightHistory[] {
        return [...this.weightHistory];
    }

    /**
     * Reset to default weights
     */
    resetWeights(): void {
        this.currentWeights = {
            isolationForest: 0.35,
            autoencoder: 0.30,
            kMeans: 0.35
        };

        this.weightHistory.push({
            timestamp: new Date(),
            weights: { ...this.currentWeights },
            reason: 'Manual reset to defaults'
        });
    }

    /**
     * Export data for persistence
     */
    exportData(): {
        feedback: RLHFFeedback[];
        weights: EnsembleWeights;
        history: WeightHistory[];
    } {
        return {
            feedback: this.feedbackHistory,
            weights: this.currentWeights,
            history: this.weightHistory
        };
    }

    /**
     * Import persisted data
     */
    importData(data: {
        feedback?: RLHFFeedback[];
        weights?: EnsembleWeights;
        history?: WeightHistory[];
    }): void {
        if (data.feedback) this.feedbackHistory = data.feedback;
        if (data.weights) this.currentWeights = data.weights;
        if (data.history) this.weightHistory = data.history;
    }
}

// Singleton instance
export const rlhfService = new RLHFService();
