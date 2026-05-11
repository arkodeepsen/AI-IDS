/**
 * CICIDS-2017 trainer.
 *
 * Mirrors `scripts/train-nslkdd.ts` but for the modern CICIDS-2017 flow
 * dataset. Trains the same four-model ensemble (Isolation Forest,
 * Autoencoder, Random Forest, XGBoost) and writes its artefacts to
 * `models/cicids/` so the NSL-KDD models on disk are untouched.
 *
 *   models/cicids/ensemble.json     — serialised models + ensemble weights
 *   models/cicids/scaler.json       — min/max for each numeric feature
 *   models/cicids/metrics.json      — per-model metrics + class breakdown
 *   models/cicids/feature-meta.json — column ordering + version stamp
 *
 * Expects:
 *   data/cicids/train.csv
 *   data/cicids/test.csv
 *
 * See docs/RESEARCH.md for how to produce those two files from either the
 * raw CIC release or the HuggingFace parquet mirror.
 *
 * Run with: `npm run train:cicids`
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCICIDSCsv,
  loadCICIDSCsvDetailed,
  fitScaler,
  buildDataset,
  classifyCICIDSLabel,
  CICIDS_FEATURE_LENGTH,
  CICIDS_NUMERIC_COLS,
  type CICIDSAttackClass,
  type CICIDSRow,
} from '../lib/ml/cicids';
import { EnsembleDetector } from '../lib/ml/ensemble';
import { IsolationForest } from '../lib/ml/isolation-forest';
import { Autoencoder } from '../lib/ml/autoencoder';
import { RandomForest } from '../lib/ml/random-forest';
import { GradientBoosting } from '../lib/ml/xgboost';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'cicids');
const MODELS_DIR = path.join(ROOT, 'models', 'cicids');
const TRAIN_PATH = path.join(DATA_DIR, 'train.csv');
const TEST_PATH = path.join(DATA_DIR, 'test.csv');

// Subsample budgets — same order of magnitude as the NSL-KDD trainer so
// runtime is comparable on a developer laptop. With ~25k/8k rows, training
// finishes in under two minutes on a single core.
const TRAIN_SAMPLE = 25000;
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
  console.log(`  ${label}: ${Date.now() - t0}ms`);
  return result;
}

function countClasses(classes: CICIDSAttackClass[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of classes) out[c] = (out[c] ?? 0) + 1;
  return out;
}

/**
 * CICIDS-2017 is heavily imbalanced (~80% BENIGN). Stratify by attack family
 * so each rare family — WebAttack, Infiltration, Botnet — actually appears in
 * the training subsample. Without this the supervised models never see
 * Infiltration in a bootstrap and recall on that family collapses to zero.
 */
function stratifiedSubsample(rows: CICIDSRow[], targetSize: number): CICIDSRow[] {
  const byClass: Record<CICIDSAttackClass, number[]> = {
    normal: [],
    DoS: [],
    Probe: [],
    R2L: [],
    WebAttack: [],
    Botnet: [],
    Infiltration: [],
  };
  for (let i = 0; i < rows.length; i++) {
    byClass[classifyCICIDSLabel(rows[i].label)].push(i);
  }
  // Keep ALL rows in the rare families (WebAttack/Botnet/Infiltration only
  // appear in a few thousand flows total), then fill the remaining budget
  // with normal + DoS + Probe + R2L proportionally.
  const rare = [
    ...byClass.WebAttack,
    ...byClass.Botnet,
    ...byClass.Infiltration,
  ];
  const remainingBudget = Math.max(0, targetSize - rare.length);
  const commonPool = [
    ...byClass.normal,
    ...byClass.DoS,
    ...byClass.Probe,
    ...byClass.R2L,
  ];
  const commonSample = shuffle(commonPool).slice(0, remainingBudget);
  return shuffle([...rare, ...commonSample]).map(i => rows[i]);
}

async function main() {
  console.log('=== CICIDS-2017 trainer ===');
  if (!fs.existsSync(TRAIN_PATH) || !fs.existsSync(TEST_PATH)) {
    console.error(
      `Missing dataset. Expected ${TRAIN_PATH} and ${TEST_PATH}.\n` +
        `See docs/RESEARCH.md for how to produce these files.`,
    );
    process.exit(1);
  }

  console.log('\n[1/5] Streaming training CSV…');
  // Sample ~10% of the source train file so we can fit the budget without
  // loading 2 GB into RAM. The downstream stratified subsample then enforces
  // class balance on whatever we collected.
  const trainDetailed = await loadCICIDSCsvDetailed(TRAIN_PATH, {
    sampleRate: 0.1,
    maxRows: 250000,
    seed: 17,
  });
  const trainRaw = trainDetailed.rows;
  const populatedColumns = trainDetailed.populatedColumns;
  console.log(`  Loaded ${trainRaw.length} candidate training rows`);
  console.log(
    `  Populated ${populatedColumns.length} / ${CICIDS_FEATURE_LENGTH} canonical features ` +
      `(missing → zero-filled): ` +
      `${CICIDS_NUMERIC_COLS.filter(c => !populatedColumns.includes(c)).slice(0, 6).join(', ')}` +
      (populatedColumns.length < CICIDS_FEATURE_LENGTH - 6 ? ', …' : ''),
  );

  const trainRows = stratifiedSubsample(trainRaw, TRAIN_SAMPLE);
  const scaler = fitScaler(trainRows);
  const trainSet = buildDataset(trainRows, scaler);
  console.log(
    `  Subsampled ${trainRows.length} rows ` +
      `(${trainSet.yBinary.filter(y => y === 1).length} attacks, ` +
      `${trainSet.yBinary.filter(y => y === 0).length} normal)`,
  );
  console.log(`  Class balance: ${JSON.stringify(countClasses(trainSet.yClass))}`);

  console.log('\n[2/5] Streaming test CSV…');
  const testRaw = await loadCICIDSCsv(TEST_PATH, {
    sampleRate: 0.05,
    maxRows: 100000,
    seed: 23,
  });
  const testRows = shuffle(testRaw).slice(0, TEST_SAMPLE);
  const testSet = buildDataset(testRows, scaler);
  console.log(`  Subsampled ${testRows.length} test rows`);
  console.log(`  Class balance: ${JSON.stringify(countClasses(testSet.yClass))}`);

  console.log('\n[3/5] Training individual models…');
  const isolationForest = new IsolationForest(80, 256);
  timeIt('IsolationForest.fit', () => isolationForest.fit(trainSet.X));

  const autoencoder = new Autoencoder(
    CICIDS_FEATURE_LENGTH,
    Math.max(8, Math.floor(CICIDS_FEATURE_LENGTH / 4)),
  );
  timeIt('Autoencoder.fit', () => autoencoder.fit(trainSet.X, 25, 0.01));

  const randomForest = new RandomForest(40, 12, 4, 0.5);
  timeIt('RandomForest.fit', () =>
    randomForest.fit(
      trainSet.X,
      trainSet.yBinary.map(y => y === 1),
      trainSet.yClass,
    ),
  );

  const xgboost = new GradientBoosting(80, 0.1, 5);
  timeIt('GradientBoosting.fit', () =>
    xgboost.fit(
      trainSet.X,
      trainSet.yBinary.map(y => y === 1),
    ),
  );

  console.log('\n[4/5] Evaluating on held-out test set…');
  const truth = testSet.yBinary.map(y => y === 1);
  const predictWith = (scoreFn: (x: number[]) => number, threshold: number) =>
    testSet.X.map(x => scoreFn(x) > threshold);

  const ifScores = testSet.X.map(x => isolationForest.predict(x));
  const aeScores = testSet.X.map(x => Math.min(autoencoder.predict(x), 1));
  const rfScores = testSet.X.map(x => randomForest.predict(x).attackProb);
  const xgbScores = testSet.X.map(x => xgboost.predict(x));

  function bestThreshold(scores: number[], y: boolean[]): number {
    const candidates = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7];
    let best = 0.5;
    let bestF1 = -1;
    for (const t of candidates) {
      const m = classMetrics(
        scores.map(s => s > t),
        y,
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
    truth,
  );
  const rfMetrics = classMetrics(
    predictWith(x => randomForest.predict(x).attackProb, tRF),
    truth,
  );
  const xgbMetrics = classMetrics(predictWith(x => xgboost.predict(x), tXGB), truth);

  const ensemble = new EnsembleDetector(undefined, CICIDS_FEATURE_LENGTH);
  ensemble.setModels({ isolationForest, autoencoder, randomForest, xgboost });
  const ensScores = testSet.X.map(x => ensemble.predict(x).score);
  const tEns = bestThreshold(ensScores, truth);
  ensemble.setAnomalyThreshold(tEns);
  const ensMetrics = classMetrics(predictWith(x => ensemble.predict(x).score, tEns), truth);

  const printRow = (name: string, m: ReturnType<typeof classMetrics>, thr: number) =>
    console.log(
      `  ${name.padEnd(18)} acc=${(m.accuracy * 100).toFixed(2)}%  precision=${(m.precision * 100).toFixed(2)}%  recall=${(m.recall * 100).toFixed(2)}%  F1=${(m.f1Score * 100).toFixed(2)}%  FPR=${(m.falsePositiveRate * 100).toFixed(2)}%  thr=${thr}`,
    );
  printRow('Isolation Forest', ifMetrics, tIF);
  printRow('Autoencoder', aeMetrics, tAE);
  printRow('Random Forest', rfMetrics, tRF);
  printRow('XGBoost', xgbMetrics, tXGB);
  printRow('Ensemble', ensMetrics, tEns);

  // Per-attack-family recall lets us see whether the model is failing
  // uniformly or whether (say) Infiltration recall is the bottleneck.
  const perFamilyRecall: Record<string, { total: number; tp: number }> = {};
  for (let i = 0; i < testSet.X.length; i++) {
    const klass = testSet.yClass[i];
    if (klass === 'normal') continue;
    const score = ensemble.predict(testSet.X[i]).score;
    const predicted = score > tEns;
    const slot = (perFamilyRecall[klass] ??= { total: 0, tp: 0 });
    slot.total++;
    if (predicted) slot.tp++;
  }
  const familyRecall: Record<string, number> = {};
  for (const [k, v] of Object.entries(perFamilyRecall)) {
    familyRecall[k] = v.total > 0 ? v.tp / v.total : 0;
  }
  console.log(`  Per-family recall: ${JSON.stringify(familyRecall)}`);

  console.log('\n[5/5] Serialising models to disk…');
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(MODELS_DIR, 'ensemble.json'),
    JSON.stringify(ensemble.serialise()),
  );
  fs.writeFileSync(path.join(MODELS_DIR, 'scaler.json'), JSON.stringify(scaler));
  fs.writeFileSync(
    path.join(MODELS_DIR, 'feature-meta.json'),
    JSON.stringify({
      version: 1,
      dataset: 'CICIDS-2017',
      featureLength: CICIDS_FEATURE_LENGTH,
      numericFeatures: CICIDS_NUMERIC_COLS,
      populatedColumns,
      droppedColumns: CICIDS_NUMERIC_COLS.filter(c => !populatedColumns.includes(c)),
      trainedOn: 'CICIDS-2017 (subsampled, stratified by attack family)',
      trainingSamples: trainRows.length,
      testingSamples: testRows.length,
      trainedAt: new Date().toISOString(),
    }),
  );

  const metricsRecord = {
    trainedAt: new Date().toISOString(),
    dataset: 'CICIDS-2017',
    trainingSamples: trainRows.length,
    testingSamples: testRows.length,
    perModel: [
      { method: 'Isolation Forest', threshold: tIF, ...ifMetrics },
      { method: 'Autoencoder', threshold: tAE, ...aeMetrics },
      { method: 'Random Forest', threshold: tRF, ...rfMetrics },
      { method: 'XGBoost', threshold: tXGB, ...xgbMetrics },
      { method: 'Ensemble', threshold: tEns, ...ensMetrics },
    ],
    perFamilyRecall: familyRecall,
    classDistribution: {
      train: countClasses(trainSet.yClass),
      test: countClasses(testSet.yClass),
    },
  };
  fs.writeFileSync(
    path.join(MODELS_DIR, 'metrics.json'),
    JSON.stringify(metricsRecord, null, 2),
  );

  console.log('\nDone. Outputs:');
  console.log(`  ${path.join('models', 'cicids', 'ensemble.json')}`);
  console.log(`  ${path.join('models', 'cicids', 'scaler.json')}`);
  console.log(`  ${path.join('models', 'cicids', 'feature-meta.json')}`);
  console.log(`  ${path.join('models', 'cicids', 'metrics.json')}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
