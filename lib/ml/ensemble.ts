/**
 * Ensemble Detector
 *
 * Combines four models — Isolation Forest, Autoencoder, Random Forest and
 * Gradient Boosting (XGBoost-style) — using the weights from the project
 * deck (30 / 25 / 25 / 20). The weights normalise to 1.0, and Active
 * Learning can shift them based on per-model accuracy.
 */

import { IsolationForest } from './isolation-forest';
import { Autoencoder } from './autoencoder';
import { RandomForest } from './random-forest';
import { GradientBoosting } from './xgboost';

export interface EnsembleWeights {
  isolationForest: number;
  autoencoder: number;
  randomForest: number;
  xgboost: number;
}

export interface EnsembleScores {
  isolationForest: number;
  autoencoder: number;
  randomForest: number;
  xgboost: number;
}

export interface EnsemblePrediction {
  score: number;
  isAnomaly: boolean;
  scores: EnsembleScores;
  attackType?: string;
}

export const DEFAULT_WEIGHTS: EnsembleWeights = {
  isolationForest: 0.3,
  autoencoder: 0.25,
  randomForest: 0.25,
  xgboost: 0.2,
};

export class EnsembleDetector {
  private isolationForest: IsolationForest;
  private autoencoder: Autoencoder;
  private randomForest: RandomForest;
  private xgboost: GradientBoosting;
  private weights: EnsembleWeights;
  // 0.45 puts the threshold just below the default ensemble score for an
  // average-anomalous packet, which keeps recall high without making the
  // dashboard chatter on benign noise.
  private anomalyThreshold = 0.45;
  private trained = false;

  constructor(weights?: Partial<EnsembleWeights>) {
    this.isolationForest = new IsolationForest(50, 128);
    this.autoencoder = new Autoencoder(7, 3);
    this.randomForest = new RandomForest(25, 8, 4, 0.7);
    this.xgboost = new GradientBoosting(40, 0.1, 4);
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  fit(features: number[][], labels?: boolean[], attackTypes?: string[]): void {
    if (features.length === 0) return;

    this.isolationForest.fit(features);
    this.autoencoder.fit(features, 50, 0.01);

    // Supervised models need labels. If none provided, derive coarse labels by
    // running Isolation Forest, so a one-shot demo still works without ground truth.
    const derivedLabels =
      labels ??
      features.map(point => this.isolationForest.predict(point) > 0.55);

    this.randomForest.fit(features, derivedLabels, attackTypes);
    this.xgboost.fit(features, derivedLabels);

    this.trained = true;
  }

  predict(point: number[]): EnsemblePrediction {
    const ifScore = this.isolationForest.predict(point);
    const aeScore = Math.min(this.autoencoder.predict(point), 1);
    const rfOut = this.randomForest.predict(point);
    const xgbScore = this.xgboost.predict(point);

    const score =
      this.weights.isolationForest * ifScore +
      this.weights.autoencoder * aeScore +
      this.weights.randomForest * rfOut.attackProb +
      this.weights.xgboost * xgbScore;

    return {
      score,
      isAnomaly: score > this.anomalyThreshold,
      scores: {
        isolationForest: ifScore,
        autoencoder: aeScore,
        randomForest: rfOut.attackProb,
        xgboost: xgbScore,
      },
      attackType: rfOut.attackType,
    };
  }

  predictByMethod(point: number[], method: string): number {
    switch (method) {
      case 'Isolation Forest':
        return this.isolationForest.predict(point);
      case 'Autoencoder':
        return Math.min(this.autoencoder.predict(point), 1);
      case 'Random Forest':
        return this.randomForest.predict(point).attackProb;
      case 'XGBoost':
        return this.xgboost.predict(point);
      default:
        return this.predict(point).score;
    }
  }

  updateWeights(newWeights: Partial<EnsembleWeights>): void {
    this.weights = { ...this.weights, ...newWeights };
    this.normalize();
  }

  private normalize(): void {
    const total =
      this.weights.isolationForest +
      this.weights.autoencoder +
      this.weights.randomForest +
      this.weights.xgboost;
    if (total <= 0) return;
    this.weights.isolationForest /= total;
    this.weights.autoencoder /= total;
    this.weights.randomForest /= total;
    this.weights.xgboost /= total;
  }

  getWeights(): EnsembleWeights {
    return { ...this.weights };
  }

  setAnomalyThreshold(t: number): void {
    this.anomalyThreshold = Math.max(0, Math.min(1, t));
  }

  getModels() {
    return {
      isolationForest: this.isolationForest,
      autoencoder: this.autoencoder,
      randomForest: this.randomForest,
      xgboost: this.xgboost,
    };
  }

  isTrained(): boolean {
    return (
      this.trained &&
      this.isolationForest.isTrained() &&
      this.autoencoder.isTrained() &&
      this.randomForest.isTrained() &&
      this.xgboost.isTrained()
    );
  }
}
