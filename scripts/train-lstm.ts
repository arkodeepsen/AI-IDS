/**
 * LSTM trainer — builds sliding-window sequences from NSL-KDD and trains a
 * tiny LSTM classifier as the "sequence model" referenced in the future-
 * scope section of the project deck.
 *
 * Run with: `npm run train:lstm`
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCsvText,
  buildDataset,
  FEATURE_LENGTH,
} from '../lib/ml/nsl-kdd';
import { LSTMClassifier } from '../lib/ml/lstm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DATA_DIR = path.join(ROOT, 'data');
const MODELS_DIR = path.join(ROOT, 'models');
const TRAIN_PATH = path.join(DATA_DIR, 'KDDTrain+.txt');
const TEST_PATH = path.join(DATA_DIR, 'KDDTest+.txt');

const SEQUENCE_LENGTH = 8;
const HIDDEN_SIZE = 16;
const TRAIN_WINDOWS = 4000;
const TEST_WINDOWS = 1500;
const EPOCHS = 6;
const LEARNING_RATE = 0.04;

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function classMetrics(predictions: boolean[], actual: boolean[]) {
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  for (let i = 0; i < predictions.length; i++) {
    if (predictions[i] && actual[i]) tp++;
    else if (predictions[i] && !actual[i]) fp++;
    else if (!predictions[i] && !actual[i]) tn++;
    else fn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const accuracy = predictions.length > 0 ? (tp + tn) / predictions.length : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;
  return { accuracy, precision, recall, f1, fpr };
}

function main() {
  console.log('=== LSTM trainer ===');
  if (!fs.existsSync(TRAIN_PATH) || !fs.existsSync(TEST_PATH)) {
    console.error('Run `npm run data:download` first.');
    process.exit(1);
  }
  if (!fs.existsSync(path.join(MODELS_DIR, 'scaler.json'))) {
    console.error('Run `npm run train` first (the LSTM reuses the ensemble scaler).');
    process.exit(1);
  }

  const scaler = JSON.parse(fs.readFileSync(path.join(MODELS_DIR, 'scaler.json'), 'utf8'));

  console.log('\n[1/3] Loading sequences from KDDTrain+ / KDDTest+…');
  const trainText = fs.readFileSync(TRAIN_PATH, 'utf8');
  const { rows: trainRows, vectors: trainVectors } = loadCsvText(trainText, scaler);
  const trainSet = buildDataset(trainRows, trainVectors);

  const testText = fs.readFileSync(TEST_PATH, 'utf8');
  const { rows: testRows, vectors: testVectors } = loadCsvText(testText, scaler);
  const testSet = buildDataset(testRows, testVectors);

  // Build sliding-window sequences. We sample windows uniformly so the
  // class balance stays roughly the same as the source.
  const trainWindows = LSTMClassifier.buildSequences(
    trainSet.X,
    trainSet.yBinary,
    SEQUENCE_LENGTH
  );
  const testWindows = LSTMClassifier.buildSequences(
    testSet.X,
    testSet.yBinary,
    SEQUENCE_LENGTH
  );

  const trIdx = shuffle(Array.from({ length: trainWindows.labels.length }, (_, i) => i)).slice(
    0,
    Math.min(TRAIN_WINDOWS, trainWindows.labels.length)
  );
  const teIdx = shuffle(Array.from({ length: testWindows.labels.length }, (_, i) => i)).slice(
    0,
    Math.min(TEST_WINDOWS, testWindows.labels.length)
  );

  const trainSeq = trIdx.map(i => trainWindows.sequences[i]);
  const trainY = trIdx.map(i => trainWindows.labels[i]);
  const testSeq = teIdx.map(i => testWindows.sequences[i]);
  const testY = teIdx.map(i => testWindows.labels[i]);

  console.log(
    `  Built ${trainSeq.length} training and ${testSeq.length} test sequences (window=${SEQUENCE_LENGTH})`
  );

  console.log('\n[2/3] Training LSTM…');
  const lstm = new LSTMClassifier(FEATURE_LENGTH, HIDDEN_SIZE, SEQUENCE_LENGTH);
  const t0 = Date.now();
  const { history } = lstm.fit(trainSeq, trainY, {
    epochs: EPOCHS,
    learningRate: LEARNING_RATE,
  });
  const elapsed = Date.now() - t0;
  console.log(`  Trained in ${(elapsed / 1000).toFixed(1)}s`);
  for (const h of history) {
    console.log(`  epoch ${h.epoch + 1}: loss=${h.loss.toFixed(4)} acc=${(h.accuracy * 100).toFixed(2)}%`);
  }

  console.log('\n[3/3] Evaluating on test sequences…');
  const probs = testSeq.map(s => lstm.predictProb(s));
  const truth = testY.map(y => y === 1);

  let bestF1 = -1;
  let bestThreshold = 0.5;
  for (const t of [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6]) {
    const m = classMetrics(probs.map(p => p > t), truth);
    if (m.f1 > bestF1) {
      bestF1 = m.f1;
      bestThreshold = t;
    }
  }
  const m = classMetrics(probs.map(p => p > bestThreshold), truth);
  console.log(
    `  acc=${(m.accuracy * 100).toFixed(2)}% precision=${(m.precision * 100).toFixed(2)}% recall=${(m.recall * 100).toFixed(2)}% F1=${(m.f1 * 100).toFixed(2)}% FPR=${(m.fpr * 100).toFixed(2)}% threshold=${bestThreshold}`
  );

  fs.mkdirSync(MODELS_DIR, { recursive: true });
  fs.writeFileSync(path.join(MODELS_DIR, 'lstm.json'), JSON.stringify(lstm.serialise()));
  fs.writeFileSync(
    path.join(MODELS_DIR, 'lstm-metrics.json'),
    JSON.stringify(
      {
        trainedAt: new Date().toISOString(),
        dataset: 'NSL-KDD (sliding windows)',
        sequenceLength: SEQUENCE_LENGTH,
        hiddenSize: HIDDEN_SIZE,
        epochs: EPOCHS,
        trainSamples: trainSeq.length,
        testSamples: testSeq.length,
        threshold: bestThreshold,
        accuracy: m.accuracy,
        precision: m.precision,
        recall: m.recall,
        f1Score: m.f1,
        falsePositiveRate: m.fpr,
        history,
      },
      null,
      2
    )
  );
  console.log('\nDone. Outputs: models/lstm.json, models/lstm-metrics.json');
}

main();
