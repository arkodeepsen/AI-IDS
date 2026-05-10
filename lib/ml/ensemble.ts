/**
 * Ensemble Detector
 *
 * Combines four models — Isolation Forest, Autoencoder, Random Forest, and
 * XGBoost-style Gradient Boosting — using the deck weights (30 / 25 / 25 / 20).
 * Active Learning can shift them based on per-model accuracy.
 *
 * The class supports serialise/deserialise so that trained weights can be
 * saved to disk after running the NSL-KDD trainer and loaded at server
 * startup — no live retraining needed.
 */

import {
  IsolationForest,
  SerialisedIsolationForest,
} from './isolation-forest';
import { Autoencoder, SerialisedAutoencoder } from './autoencoder';
import { RandomForest, SerialisedRandomForest } from './random-forest';
import { GradientBoosting, SerialisedGradientBoosting } from './xgboost';

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

export interface SerialisedEnsemble {
  weights: EnsembleWeights;
  anomalyThreshold: number;
  isolationForest: SerialisedIsolationForest;
  autoencoder: SerialisedAutoencoder;
  randomForest: SerialisedRandomForest;
  xgboost: SerialisedGradientBoosting;
  inputSize: number;
}

export class EnsembleDetector {
  private isolationForest: IsolationForest;
  private autoencoder: Autoencoder;
  private randomForest: RandomForest;
  private xgboost: GradientBoosting;
  private weights: EnsembleWeights;
  private anomalyThreshold = 0.45;
  private trained = false;
  private inputSize: number;

  constructor(weights?: Partial<EnsembleWeights>, inputSize = 7) {
    this.inputSize = inputSize;
    this.isolationForest = new IsolationForest(50, 256);
    this.autoencoder = new Autoencoder(inputSize, Math.max(3, Math.floor(inputSize / 3)));
    this.randomForest = new RandomForest(30, 12, 4, 0.5);
    this.xgboost = new GradientBoosting(60, 0.1, 5);
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  fit(features: number[][], labels?: boolean[], attackTypes?: string[]): void {
    if (features.length === 0) return;
    if (features[0].length !== this.inputSize) {
      this.inputSize = features[0].length;
      this.autoencoder = new Autoencoder(
        this.inputSize,
        Math.max(3, Math.floor(this.inputSize / 3))
      );
    }

    this.isolationForest.fit(features);
    this.autoencoder.fit(features, 30, 0.01);

    const derivedLabels =
      labels ?? features.map(point => this.isolationForest.predict(point) > 0.55);

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

  getInputSize(): number {
    return this.inputSize;
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

  /** Inject already-trained sub-models (used by the NSL-KDD trainer). */
  setModels(models: {
    isolationForest: IsolationForest;
    autoencoder: Autoencoder;
    randomForest: RandomForest;
    xgboost: GradientBoosting;
  }): void {
    this.isolationForest = models.isolationForest;
    this.autoencoder = models.autoencoder;
    this.randomForest = models.randomForest;
    this.xgboost = models.xgboost;
    this.trained = true;
  }

  serialise(): SerialisedEnsemble {
    return {
      weights: { ...this.weights },
      anomalyThreshold: this.anomalyThreshold,
      isolationForest: this.isolationForest.serialise(),
      autoencoder: this.autoencoder.serialise(),
      randomForest: this.randomForest.serialise(),
      xgboost: this.xgboost.serialise(),
      inputSize: this.inputSize,
    };
  }

  static deserialise(data: SerialisedEnsemble): EnsembleDetector {
    const e = new EnsembleDetector(data.weights, data.inputSize);
    e.weights = data.weights;
    e.anomalyThreshold = data.anomalyThreshold;
    e.isolationForest = IsolationForest.deserialise(data.isolationForest);
    e.autoencoder = Autoencoder.deserialise(data.autoencoder);
    e.randomForest = RandomForest.deserialise(data.randomForest);
    e.xgboost = GradientBoosting.deserialise(data.xgboost);
    e.trained = true;
    return e;
  }
}
