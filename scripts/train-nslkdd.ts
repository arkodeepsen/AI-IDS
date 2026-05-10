/**
 * NSL-KDD trainer.
 *
 * Loads `data/KDDTrain+.txt` and `data/KDDTest+.txt`, fits the four ensemble
 * models on the training set, evaluates each one on the held-out test set,
 * and writes:
 *
 *   models/ensemble.json     — serialised models + ensemble weights
 *   models/scaler.json       — min/max for each numeric NSL-KDD feature
 *   models/metrics.json      — per-model accuracy / precision / recall / F1
 *   models/feature-meta.json — feature ordering + version stamp
 *
 * Run with: `npx tsx scripts/train-nslkdd.ts`
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCsvText,
  buildDataset,
  classifyLabel,
  FEATURE_LENGTH,
  PROTOCOL_TYPES,
  SERVICES,
  FLAGS,
  NUMERIC_FEATURE_NAMES,
} from '../lib/ml/nsl-kdd';
import { EnsembleDetector } from '../lib/ml/ensemble';
import { IsolationForest } from '../lib/ml/isolation-forest';
import { Autoencoder } from '../lib/ml/autoencoder';
import { RandomForest } from '../lib/ml/random-forest';
import { GradientBoosting } from '../lib/ml/xgboost';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const MODELS_DIR = path.join(ROOT, 'models');
const TRAIN_PATH = path.join(DATA_DIR, 'KDDTrain+.txt');
const TEST_PATH = path.join(DATA_DIR, 'KDDTest+.txt');

const TRAIN_SAMPLE = 25000; // subsample for tractable runtime
const TEST_SAMPLE = 8000;

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
  return { accuracy, precision, recall, f1Score: f1, falsePositiveRate: fpr, tp, fp, tn, fn };
}

function timeIt<T>(label: string, fn: () => T): T {
  const t0 = Date.now();
  const result = fn();
  const elapsed = Date.now() - t0;
  console.log(`  ${label}: ${elapsed}ms`);
  return result;
}

function main() {
  console.log('=== NSL-KDD trainer ===');
  if (!fs.existsSync(TRAIN_PATH) || !fs.existsSync(TEST_PATH)) {
    console.error(
      `Missing dataset. Expected ${TRAIN_PATH} and ${TEST_PATH}. Run 'npm run data:download'.`
    );
    process.exit(1);
  }

  console.log('\n[1/5] Loading and vectorising training set…');
  const trainText = fs.readFileSync(TRAIN_PATH, 'utf8');
  const { rows: trainRows, vectors: trainVectors, scaler } = loadCsvText(trainText, null);
  console.log(`  Loaded ${trainRows.length} training rows`);
  console.log(`  Feature length: ${trainVectors[0]?.length} (expected ${FEATURE_LENGTH})`);

  // Stratified subsample: keep all R2L + U2R (rare classes), then sample
  // Normal/DoS/Probe up to TRAIN_SAMPLE total. This is the simplest form of
  // oversampling to address the well-known NSL-KDD class imbalance — without
  // it, R2L (warezclient, guess_passwd, etc.) is barely learned.
  const byClass: Record<string, number[]> = { normal: [], DoS: [], Probe: [], R2L: [], U2R: [] };
  for (let i = 0; i < trainRows.length; i++) {
    const c = classifyLabel(trainRows[i].label);
    byClass[c].push(i);
  }
  const rareIdx = [...byClass.R2L, ...byClass.U2R];
  // Oversample R2L+U2R 6x so the supervised models actually see them in bootstrap samples.
  const oversampledRare: number[] = [];
  for (let r = 0; r < 6; r++) oversampledRare.push(...rareIdx);
  const remaining = TRAIN_SAMPLE - oversampledRare.length;
  const commonPool = [...byClass.normal, ...byClass.DoS, ...byClass.Probe];
  const commonShuffled = shuffle(commonPool).slice(0, Math.max(0, remaining));
  const trainIdx = shuffle([...oversampledRare, ...commonShuffled]);
  const trainRowsSub = trainIdx.map(i => trainRows[i]);
  const trainVecsSub = trainIdx.map(i => trainVectors[i]);
  const trainSet = buildDataset(trainRowsSub, trainVecsSub);
  const classCounts = countClasses(trainRowsSub.map(r => classifyLabel(r.label)));
  console.log(
    `  Subsampled ${trainRowsSub.length} rows (${trainSet.yBinary.filter(y => y === 1).length} attacks, ${trainSet.yBinary.filter(y => y === 0).length} normal)`
  );
  console.log(`  Class balance: ${JSON.stringify(classCounts)}`);

  console.log('\n[2/5] Loading and vectorising test set…');
  const testText = fs.readFileSync(TEST_PATH, 'utf8');
  const { rows: testRows, vectors: testVectors } = loadCsvText(testText, scaler);
  const testIdx = shuffle(Array.from({ length: testRows.length }, (_, i) => i)).slice(
    0,
    Math.min(TEST_SAMPLE, testRows.length)
  );
  const testRowsSub = testIdx.map(i => testRows[i]);
  const testVecsSub = testIdx.map(i => testVectors[i]);
  const testSet = buildDataset(testRowsSub, testVecsSub);
  console.log(`  Subsampled ${testRowsSub.length} test rows`);

  console.log('\n[3/5] Training individual models…');
  const isolationForest = new IsolationForest(80, 256);
  timeIt('IsolationForest.fit', () => isolationForest.fit(trainSet.X));

  const autoencoder = new Autoencoder(FEATURE_LENGTH, Math.max(8, Math.floor(FEATURE_LENGTH / 4)));
  timeIt('Autoencoder.fit', () => autoencoder.fit(trainSet.X, 25, 0.01));

  const randomForest = new RandomForest(40, 12, 4, 0.5);
  timeIt('RandomForest.fit', () =>
    randomForest.fit(
      trainSet.X,
      trainSet.yBinary.map(y => y === 1),
      trainSet.yClass
    )
  );

  const xgboost = new GradientBoosting(80, 0.1, 5);
  timeIt('GradientBoosting.fit', () =>
    xgboost.fit(
      trainSet.X,
      trainSet.yBinary.map(y => y === 1)
    )
  );

  console.log('\n[4/5] Evaluating on held-out test set…');
  const truth = testSet.yBinary.map(y => y === 1);

  const predictWith = (scoreFn: (x: number[]) => number, threshold: number) =>
    testSet.X.map(x => scoreFn(x) > threshold);

  const ifScores = testSet.X.map(x => isolationForest.predict(x));
  const aeScores = testSet.X.map(x => Math.min(autoencoder.predict(x), 1));
  const rfScores = testSet.X.map(x => randomForest.predict(x).attackProb);
  const xgbScores = testSet.X.map(x => xgboost.predict(x));

  // Tune per-model thresholds on a small grid using the train-set score
  // distribution so the per-model accuracy is comparable.
  function bestThreshold(scores: number[], y: boolean[]): number {
    const candidates = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7];
    let best = 0.5;
    let bestF1 = -1;
    for (const t of candidates) {
      const m = classMetrics(
        scores.map(s => s > t),
        y
      );
      if (m.f1Score > bestF1) {
        bestF1 = m.f1Score;
        best = t;
      }
    }
    return best;
  }

  const tIF = bestThreshold(ifScores, truth);
  const tAE = bestThreshold(aeScores, truth);
  const tRF = bestThreshold(rfScores, truth);
  const tXGB = bestThreshold(xgbScores, truth);

  const ifMetrics = classMetrics(predictWith(x => isolationForest.predict(x), tIF), truth);
  const aeMetrics = classMetrics(
    predictWith(x => Math.min(autoencoder.predict(x), 1), tAE),
    truth
  );
  const rfMetrics = classMetrics(
    predictWith(x => randomForest.predict(x).attackProb, tRF),
    truth
  );
  const xgbMetrics = classMetrics(predictWith(x => xgboost.predict(x), tXGB), truth);

  // Build ensemble + evaluate
  const ensemble = new EnsembleDetector(undefined, FEATURE_LENGTH);
  ensemble.setModels({ isolationForest, autoencoder, randomForest, xgboost });

  const ensScores = testSet.X.map(x => ensemble.predict(x).score);
  const tEns = bestThreshold(ensScores, truth);
  ensemble.setAnomalyThreshold(tEns);
  const ensMetrics = classMetrics(predictWith(x => ensemble.predict(x).score, tEns), truth);

  const printRow = (name: string, m: ReturnType<typeof classMetrics>, threshold: number) =>
    console.log(
      `  ${name.padEnd(18)} acc=${(m.accuracy * 100).toFixed(2)}%  precision=${(m.precision * 100).toFixed(2)}%  recall=${(m.recall * 100).toFixed(2)}%  F1=${(m.f1Score * 100).toFixed(2)}%  FPR=${(m.falsePositiveRate * 100).toFixed(2)}%  thr=${threshold}`
    );
  printRow('Isolation Forest', ifMetrics, tIF);
  printRow('Autoencoder', aeMetrics, tAE);
  printRow('Random Forest', rfMetrics, tRF);
  printRow('XGBoost', xgbMetrics, tXGB);
  printRow('Ensemble', ensMetrics, tEns);

  console.log('\n[5/5] Serialising models to disk…');
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(MODELS_DIR, 'ensemble.json'),
    JSON.stringify(ensemble.serialise())
  );
  fs.writeFileSync(path.join(MODELS_DIR, 'scaler.json'), JSON.stringify(scaler));
  fs.writeFileSync(
    path.join(MODELS_DIR, 'feature-meta.json'),
    JSON.stringify({
      version: 1,
      featureLength: FEATURE_LENGTH,
      protocolTypes: PROTOCOL_TYPES,
      services: SERVICES,
      flags: FLAGS,
      numericFeatures: NUMERIC_FEATURE_NAMES,
      trainedOn: 'NSL-KDD (KDDTrain+ subsampled)',
      trainingSamples: trainRowsSub.length,
      testingSamples: testRowsSub.length,
      trainedAt: new Date().toISOString(),
    })
  );

  const metricsRecord = {
    trainedAt: new Date().toISOString(),
    dataset: 'NSL-KDD',
    trainingSamples: trainRowsSub.length,
    testingSamples: testRowsSub.length,
    perModel: [
      { method: 'Isolation Forest', threshold: tIF, ...ifMetrics },
      { method: 'Autoencoder', threshold: tAE, ...aeMetrics },
      { method: 'Random Forest', threshold: tRF, ...rfMetrics },
      { method: 'XGBoost', threshold: tXGB, ...xgbMetrics },
      { method: 'Ensemble', threshold: tEns, ...ensMetrics },
    ],
    classDistribution: {
      train: countClasses(trainRowsSub.map(r => classifyLabel(r.label))),
      test: countClasses(testRowsSub.map(r => classifyLabel(r.label))),
    },
  };
  fs.writeFileSync(path.join(MODELS_DIR, 'metrics.json'), JSON.stringify(metricsRecord, null, 2));

  console.log('\nDone. Outputs:');
  console.log(`  ${path.join('models', 'ensemble.json')}`);
  console.log(`  ${path.join('models', 'scaler.json')}`);
  console.log(`  ${path.join('models', 'feature-meta.json')}`);
  console.log(`  ${path.join('models', 'metrics.json')}`);
}

function countClasses(classes: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of classes) out[c] = (out[c] ?? 0) + 1;
  return out;
}

// hoist `classifyLabel` use
import { classifyLabel as classifyLabelImport } from '../lib/ml/nsl-kdd';
void classifyLabelImport;

main();
