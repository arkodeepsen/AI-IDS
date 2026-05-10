/**
 * Active Learning / RLHF service.
 *
 * Tracks human feedback on detections, computes per-model accuracy, and
 * shifts ensemble weights toward methods that performed better on recent
 * verified samples.
 */

import { EnsembleWeights, DEFAULT_WEIGHTS } from '../ml/ensemble';

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
  private currentWeights: EnsembleWeights = { ...DEFAULT_WEIGHTS };
  private learningRate = 0.05;
  private minAdjustmentThreshold = 10;

  addFeedback(feedback: Omit<RLHFFeedback, 'id' | 'feedbackAt'>): RLHFFeedback {
    const entry: RLHFFeedback = {
      ...feedback,
      id: crypto.randomUUID(),
      feedbackAt: new Date(),
    };
    this.feedbackHistory.push(entry);

    if (this.feedbackHistory.length % this.minAdjustmentThreshold === 0) {
      this.adjustWeights();
    }
    return entry;
  }

  adjustWeights(): EnsembleWeights {
    const recent = this.feedbackHistory.slice(-100);
    if (recent.length < this.minAdjustmentThreshold) {
      return this.currentWeights;
    }

    const perf: Record<string, { correct: number; total: number }> = {
      'Isolation Forest': { correct: 0, total: 0 },
      Autoencoder: { correct: 0, total: 0 },
      'Random Forest': { correct: 0, total: 0 },
      XGBoost: { correct: 0, total: 0 },
    };

    for (const fb of recent) {
      if (fb.modelMethod && perf[fb.modelMethod]) {
        perf[fb.modelMethod].total++;
        if (fb.isCorrect) perf[fb.modelMethod].correct++;
      }
    }

    const accuracies: Record<string, number> = {};
    let totalAccuracy = 0;
    for (const [m, p] of Object.entries(perf)) {
      const acc = p.total > 0 ? p.correct / p.total : 0.5;
      accuracies[m] = acc;
      totalAccuracy += acc;
    }
    if (totalAccuracy <= 0) return this.currentWeights;

    const old = { ...this.currentWeights };
    this.currentWeights.isolationForest = this.blend(
      old.isolationForest,
      accuracies['Isolation Forest'] / totalAccuracy
    );
    this.currentWeights.autoencoder = this.blend(
      old.autoencoder,
      accuracies['Autoencoder'] / totalAccuracy
    );
    this.currentWeights.randomForest = this.blend(
      old.randomForest,
      accuracies['Random Forest'] / totalAccuracy
    );
    this.currentWeights.xgboost = this.blend(
      old.xgboost,
      accuracies['XGBoost'] / totalAccuracy
    );

    this.normalize();
    this.weightHistory.push({
      timestamp: new Date(),
      weights: { ...this.currentWeights },
      reason: `Adjusted from ${recent.length} feedback entries`,
    });

    return this.currentWeights;
  }

  private blend(current: number, target: number): number {
    return current * (1 - this.learningRate) + target * this.learningRate;
  }

  private normalize(): void {
    const total =
      this.currentWeights.isolationForest +
      this.currentWeights.autoencoder +
      this.currentWeights.randomForest +
      this.currentWeights.xgboost;
    if (total > 0) {
      this.currentWeights.isolationForest /= total;
      this.currentWeights.autoencoder /= total;
      this.currentWeights.randomForest /= total;
      this.currentWeights.xgboost /= total;
    }
  }

  getWeights(): EnsembleWeights {
    return { ...this.currentWeights };
  }

  setLearningRate(rate: number): void {
    this.learningRate = Math.max(0.01, Math.min(0.5, rate));
  }

  getMetrics(): RLHFMetrics {
    const correct = this.feedbackHistory.filter(f => f.isCorrect).length;
    const total = this.feedbackHistory.length;
    return {
      totalFeedback: total,
      correctPredictions: correct,
      incorrectPredictions: total - correct,
      accuracyRate: total > 0 ? correct / total : 0,
      weightAdjustments: this.weightHistory.length,
      lastUpdate:
        this.weightHistory.length > 0
          ? this.weightHistory[this.weightHistory.length - 1].timestamp
          : null,
    };
  }

  getFeedbackHistory(limit = 50): RLHFFeedback[] {
    return this.feedbackHistory.slice(-limit);
  }

  getWeightHistory(): WeightHistory[] {
    return [...this.weightHistory];
  }

  resetWeights(): void {
    this.currentWeights = { ...DEFAULT_WEIGHTS };
    this.weightHistory.push({
      timestamp: new Date(),
      weights: { ...this.currentWeights },
      reason: 'Manual reset to defaults',
    });
  }

  exportData() {
    return {
      feedback: this.feedbackHistory,
      weights: this.currentWeights,
      history: this.weightHistory,
    };
  }

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

export const rlhfService = new RLHFService();
