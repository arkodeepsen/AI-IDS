/**
 * Model loader.
 *
 * Reads the trained ensemble + scaler from `models/` (produced by
 * `npm run train`) and caches them in module scope. If the artefacts are
 * missing, the loader returns nulls and the detection service falls back to
 * synthetic-data training so the system still works during development.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  EnsembleDetector,
  SerialisedEnsemble,
} from './ensemble';
import { FeatureScaler } from './nsl-kdd';

const MODELS_DIR = path.resolve(process.cwd(), 'models');

interface LoadedArtefacts {
  ensemble: EnsembleDetector;
  scaler: FeatureScaler;
  metrics: TrainedMetrics;
}

export interface TrainedMetric {
  method: string;
  threshold: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

export interface TrainedMetrics {
  trainedAt: string;
  dataset: string;
  trainingSamples: number;
  testingSamples: number;
  perModel: TrainedMetric[];
  classDistribution: {
    train: Record<string, number>;
    test: Record<string, number>;
  };
}

let cached: LoadedArtefacts | null = null;
let loadAttempted = false;

export function loadTrainedArtefacts(): LoadedArtefacts | null {
  if (cached) return cached;
  if (loadAttempted) return null;
  loadAttempted = true;

  try {
    const ensemblePath = path.join(MODELS_DIR, 'ensemble.json');
    const scalerPath = path.join(MODELS_DIR, 'scaler.json');
    const metricsPath = path.join(MODELS_DIR, 'metrics.json');

    if (
      !fs.existsSync(ensemblePath) ||
      !fs.existsSync(scalerPath) ||
      !fs.existsSync(metricsPath)
    ) {
      console.warn(
        '[ml/loader] Trained artefacts missing. Run `npm run train` to produce them.'
      );
      return null;
    }

    const ensembleData = JSON.parse(fs.readFileSync(ensemblePath, 'utf8')) as SerialisedEnsemble;
    const scalerData = JSON.parse(fs.readFileSync(scalerPath, 'utf8')) as FeatureScaler;
    const metricsData = JSON.parse(fs.readFileSync(metricsPath, 'utf8')) as TrainedMetrics;

    cached = {
      ensemble: EnsembleDetector.deserialise(ensembleData),
      scaler: scalerData,
      metrics: metricsData,
    };

    console.log(
      `[ml/loader] Loaded trained ensemble (${metricsData.dataset}, trained ${new Date(metricsData.trainedAt).toLocaleString()})`
    );
    return cached;
  } catch (err) {
    console.error('[ml/loader] Failed to load trained artefacts:', err);
    return null;
  }
}

export function getCachedMetrics(): TrainedMetrics | null {
  return cached?.metrics ?? null;
}
