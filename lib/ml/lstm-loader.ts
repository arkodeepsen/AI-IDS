/**
 * LSTM loader.
 *
 * Reads `models/lstm.json` and `models/lstm-metrics.json` and caches the
 * deserialised classifier. Kept separate from the main ensemble loader so
 * the sequence model can be enabled / disabled independently.
 */

import fs from 'node:fs';
import path from 'node:path';
import { LSTMClassifier, SerialisedLSTM } from './lstm';

const MODELS_DIR = path.resolve(process.cwd(), 'models');
const LSTM_PATH = path.join(MODELS_DIR, 'lstm.json');
const METRICS_PATH = path.join(MODELS_DIR, 'lstm-metrics.json');

export interface LSTMMetrics {
  trainedAt: string;
  dataset: string;
  sequenceLength: number;
  hiddenSize: number;
  epochs: number;
  trainSamples: number;
  testSamples: number;
  threshold: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  history: Array<{ epoch: number; loss: number; accuracy: number }>;
}

interface LoadedLSTM {
  model: LSTMClassifier;
  metrics: LSTMMetrics;
}

let cached: LoadedLSTM | null = null;
let attempted = false;

export function loadLSTM(): LoadedLSTM | null {
  if (cached) return cached;
  if (attempted) return null;
  attempted = true;

  try {
    if (!fs.existsSync(LSTM_PATH) || !fs.existsSync(METRICS_PATH)) return null;
    const modelData = JSON.parse(fs.readFileSync(LSTM_PATH, 'utf8')) as SerialisedLSTM;
    const metrics = JSON.parse(fs.readFileSync(METRICS_PATH, 'utf8')) as LSTMMetrics;
    cached = {
      model: LSTMClassifier.deserialise(modelData),
      metrics,
    };
    console.log(
      `[ml/lstm-loader] Loaded LSTM (hidden=${metrics.hiddenSize}, seq=${metrics.sequenceLength}, trained ${new Date(metrics.trainedAt).toLocaleString()})`
    );
    return cached;
  } catch (err) {
    console.error('[ml/lstm-loader] Failed to load LSTM:', err);
    return null;
  }
}

export function getLSTMMetrics(): LSTMMetrics | null {
  return cached?.metrics ?? null;
}
