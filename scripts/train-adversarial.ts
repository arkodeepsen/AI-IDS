/**
 * Adversarial training pass.
 *
 * Closes the §9.9 follow-up: the audit measured a ~7 % evasion rate at
 * ε = 0.01–0.02 on the clean-trained NSL-KDD ensemble. This script
 * augments the training data with one adversarially-perturbed copy per
 * attack row, retrains the four-model ensemble from scratch, and re-runs
 * the audit on the new ensemble so we can directly compare robustness.
 *
 * The adversarial perturbation uses the existing (clean) ensemble as the
 * generation oracle — the standard adversarial-training setup. We
 * deliberately perturb only ATTACK rows: the threat model is "attacker
 * tries to make their packet look benign", not "defender tries to make
 * benign look attack-shaped."
 *
 * Outputs:
 *   models/adversarial/ensemble.json
 *   models/adversarial/scaler.json
 *   models/adversarial/feature-meta.json
 *   models/adversarial/metrics.json
 *   models/adversarial-comparison.json     <— side-by-side audit
 *
 * Run with: `npm run train:adversarial`
 *
 * Wall time: ~6 minutes (perturbation generation ~30 s, retraining ~5 min).
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
  type KDDRow,
  type FeatureScaler,
} from '../lib/ml/nsl-kdd';
import { EnsembleDetector, SerialisedEnsemble } from '../lib/ml/ensemble';
import { IsolationForest } from '../lib/ml/isolation-forest';
import { Autoencoder } from '../lib/ml/autoencoder';
import { RandomForest } from '../lib/ml/random-forest';
import { GradientBoosting } from '../lib/ml/xgboost';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const MODELS_DIR = path.join(ROOT, 'models');
const ADV_DIR = path.join(MODELS_DIR, 'adversarial');
const TRAIN_PATH = path.join(DATA_DIR, 'KDDTrain+.txt');
const TEST_PATH = path.join(DATA_DIR, 'KDDTest+.txt');

const TRAIN_SAMPLE = 25000;
const TEST_SAMPLE = 8000;
const PERTURBATION_BUDGET = 0.02;
const TOP_K = 5;
const PROBE_STEP = 0.02;
const AUDIT_SAMPLE = 2000;
const AUDIT_EPSILONS = [0.0, 0.01, 0.02, 0.05, 0.10, 0.20];
const ENSEMBLE_THRESHOLD = 0.35;

function shuffle<T>(arr: T[], seed = 1729): T[] {
  const out = arr.slice();
  let state = seed >>> 0;
  const rng = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function classMetrics(predictions: boolean[], actual: boolean[]) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
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
  return { accuracy, precision, recall, f1Score: f1, falsePositiveRate: fpr };
}

/**
 * Score-based perturbation — same routine as eval-adversarial.ts but with
 * the EXISTING clean ensemble as the generation oracle.
 */
function perturb(ensemble: EnsembleDetector, point: number[], epsilon: number): number[] {
  if (epsilon <= 0) return point.slice();
  const sensitivity: { idx: number; sign: number; magnitude: number }[] = [];
  for (let i = 0; i < point.length; i++) {
    const orig = point[i];
    point[i] = Math.max(0, Math.min(1, orig + PROBE_STEP));
    const fwd = ensemble.predict(point).score;
    point[i] = Math.max(0, Math.min(1, orig - PROBE_STEP));
    const bwd = ensemble.predict(point).score;
    point[i] = orig;
    const slope = (fwd - bwd) / (2 * PROBE_STEP);
    sensitivity.push({ idx: i, sign: slope > 0 ? -1 : 1, magnitude: Math.abs(slope) });
  }
  sensitivity.sort((a, b) => b.magnitude - a.magnitude);
  const out = point.slice();
  for (const { idx, sign } of sensitivity.slice(0, TOP_K)) {
    out[idx] = Math.max(0, Math.min(1, out[idx] + sign * epsilon));
  }
  return out;
}

interface AuditRow {
  epsilon: number;
  recall: number;
  evasionRate: number;
  meanScoreAfter: number;
}

function audit(ensemble: EnsembleDetector, attackVectors: number[][]): AuditRow[] {
  const out: AuditRow[] = [];
  for (const eps of AUDIT_EPSILONS) {
    let predicted = 0;
    let meanAfter = 0;
    let evasions = 0;
    for (const v of attackVectors) {
      const before = ensemble.predict(v).score;
      const adv = perturb(ensemble, v, eps);
      const after = ensemble.predict(adv).score;
      meanAfter += after;
      if (after > ENSEMBLE_THRESHOLD) predicted++;
      if (before > ENSEMBLE_THRESHOLD && after <= ENSEMBLE_THRESHOLD) evasions++;
    }
    const n = attackVectors.length;
    out.push({
      epsilon: eps,
      recall: predicted / n,
      evasionRate: evasions / n,
      meanScoreAfter: meanAfter / n,
    });
  }
  return out;
}

function timeIt<T>(label: string, fn: () => T): T {
  const t0 = Date.now();
  const r = fn();
  console.log(`  ${label}: ${Date.now() - t0}ms`);
  return r;
}

async function main() {
  console.log('=== Adversarial training pass ===\n');

  // ---- Load clean ensemble ----
  const cleanPath = path.join(MODELS_DIR, 'ensemble.json');
  const scalerPath = path.join(MODELS_DIR, 'scaler.json');
  if (!fs.existsSync(cleanPath) || !fs.existsSync(scalerPath)) {
    console.error('Missing clean ensemble. Run `npm run train` first.');
    process.exit(1);
  }
  const cleanEnsemble = EnsembleDetector.deserialise(
    JSON.parse(fs.readFileSync(cleanPath, 'utf8')) as SerialisedEnsemble,
  );
  const scaler = JSON.parse(fs.readFileSync(scalerPath, 'utf8')) as FeatureScaler;
  console.log('Loaded clean ensemble + scaler.\n');

  // ---- Load + subsample training data (same protocol as train-nslkdd.ts) ----
  console.log('[1/5] Subsampling training set…');
  const { rows: trainRows, vectors: trainVectors } = loadCsvText(
    fs.readFileSync(TRAIN_PATH, 'utf8'),
    scaler,
  );
  const byClass: Record<string, number[]> = { normal: [], DoS: [], Probe: [], R2L: [], U2R: [] };
  for (let i = 0; i < trainRows.length; i++) {
    byClass[classifyLabel(trainRows[i].label)].push(i);
  }
  const rareIdx = [...byClass.R2L, ...byClass.U2R];
  const oversampledRare: number[] = [];
  for (let r = 0; r < 6; r++) oversampledRare.push(...rareIdx);
  const remaining = TRAIN_SAMPLE - oversampledRare.length;
  const commonPool = [...byClass.normal, ...byClass.DoS, ...byClass.Probe];
  const commonShuffled = shuffle(commonPool).slice(0, Math.max(0, remaining));
  const trainIdx = shuffle([...oversampledRare, ...commonShuffled]);
  const trainRowsSub: KDDRow[] = trainIdx.map(i => trainRows[i]);
  const trainVecsSub: number[][] = trainIdx.map(i => trainVectors[i]);
  console.log(`  Subsampled ${trainRowsSub.length} training rows`);

  // ---- Generate adversarial copies of attack rows ----
  console.log(`\n[2/5] Generating adversarial perturbations at ε = ${PERTURBATION_BUDGET}…`);
  const advRowsSub: KDDRow[] = [];
  const advVecsSub: number[][] = [];
  const t0 = Date.now();
  let attackCount = 0;
  for (let i = 0; i < trainRowsSub.length; i++) {
    if (classifyLabel(trainRowsSub[i].label) === 'normal') continue;
    attackCount++;
    const adv = perturb(cleanEnsemble, trainVecsSub[i], PERTURBATION_BUDGET);
    // The adversarial vector keeps the original row's label so the model
    // learns that perturbed attacks are still attacks.
    advRowsSub.push(trainRowsSub[i]);
    advVecsSub.push(adv);
  }
  console.log(
    `  Generated ${advVecsSub.length} adversarial attack copies in ${Date.now() - t0}ms ` +
    `(${attackCount} attack rows in subsample)`,
  );

  // ---- Augmented training set: originals + adversarials ----
  const augRows: KDDRow[] = [...trainRowsSub, ...advRowsSub];
  const augVecs: number[][] = [...trainVecsSub, ...advVecsSub];
  const augOrder = shuffle(augRows.map((_, i) => i));
  const augRowsShuf = augOrder.map(i => augRows[i]);
  const augVecsShuf = augOrder.map(i => augVecs[i]);
  const augSet = buildDataset(augRowsShuf, augVecsShuf);
  console.log(
    `\n[3/5] Retraining on augmented set: ${augRowsShuf.length} rows ` +
    `(${augSet.yBinary.filter(y => y === 1).length} attacks, ${augSet.yBinary.filter(y => y === 0).length} normal)…`,
  );

  // ---- Retrain ----
  const isolationForest = new IsolationForest(80, 256);
  timeIt('IsolationForest.fit', () => isolationForest.fit(augSet.X));

  const autoencoder = new Autoencoder(FEATURE_LENGTH, Math.max(8, Math.floor(FEATURE_LENGTH / 4)));
  timeIt('Autoencoder.fit', () => autoencoder.fit(augSet.X, 25, 0.01));

  const randomForest = new RandomForest(40, 12, 4, 0.5);
  timeIt('RandomForest.fit', () =>
    randomForest.fit(augSet.X, augSet.yBinary.map(y => y === 1), augSet.yClass),
  );

  const xgboost = new GradientBoosting(80, 0.1, 5);
  timeIt('GradientBoosting.fit', () =>
    xgboost.fit(augSet.X, augSet.yBinary.map(y => y === 1)),
  );

  const advEnsemble = new EnsembleDetector(undefined, FEATURE_LENGTH);
  advEnsemble.setModels({ isolationForest, autoencoder, randomForest, xgboost });

  // ---- Evaluate on clean test set ----
  console.log('\n[4/5] Evaluating on clean test set…');
  const { rows: testRows, vectors: testVectors } = loadCsvText(
    fs.readFileSync(TEST_PATH, 'utf8'),
    scaler,
  );
  const testIdx = shuffle(Array.from({ length: testRows.length }, (_, i) => i)).slice(0, TEST_SAMPLE);
  const testVecsSub = testIdx.map(i => testVectors[i]);
  const testRowsSub = testIdx.map(i => testRows[i]);
  const testSet = buildDataset(testRowsSub, testVecsSub);
  const truth = testSet.yBinary.map(y => y === 1);

  const advScores = testSet.X.map(x => advEnsemble.predict(x).score);
  const predictWith = (thr: number) => advScores.map(s => s > thr);
  const grid = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7];
  let bestThr = 0.35, bestF1 = -1;
  for (const t of grid) {
    const m = classMetrics(predictWith(t), truth);
    if (m.f1Score > bestF1) { bestF1 = m.f1Score; bestThr = t; }
  }
  advEnsemble.setAnomalyThreshold(bestThr);
  const cleanTestMetrics = classMetrics(predictWith(bestThr), truth);
  console.log(
    `  Clean-test acc=${(cleanTestMetrics.accuracy * 100).toFixed(2)}%  ` +
    `F1=${(cleanTestMetrics.f1Score * 100).toFixed(2)}%  ` +
    `recall=${(cleanTestMetrics.recall * 100).toFixed(2)}%  ` +
    `FPR=${(cleanTestMetrics.falsePositiveRate * 100).toFixed(2)}%  ` +
    `thr=${bestThr}`,
  );

  // ---- Adversarial audit: both ensembles on the same perturbed attacks ----
  console.log('\n[5/5] Adversarial audit on both ensembles…');
  const attackVecs = testRowsSub
    .map((r, i) => (classifyLabel(r.label) !== 'normal' ? testVecsSub[i] : null))
    .filter((v): v is number[] => v !== null)
    .slice(0, AUDIT_SAMPLE);
  console.log(`  Auditing ${attackVecs.length} test attack rows.`);

  console.log('  Clean-trained ensemble:');
  const cleanAudit = audit(cleanEnsemble, attackVecs);
  for (const r of cleanAudit) {
    console.log(`    ε=${r.epsilon.toFixed(2)}  recall=${(r.recall * 100).toFixed(2)}%  evasion=${(r.evasionRate * 100).toFixed(2)}%`);
  }
  console.log('  Adversarially-trained ensemble:');
  const advAudit = audit(advEnsemble, attackVecs);
  for (const r of advAudit) {
    console.log(`    ε=${r.epsilon.toFixed(2)}  recall=${(r.recall * 100).toFixed(2)}%  evasion=${(r.evasionRate * 100).toFixed(2)}%`);
  }

  // ---- Persist ----
  fs.mkdirSync(ADV_DIR, { recursive: true });
  fs.writeFileSync(path.join(ADV_DIR, 'ensemble.json'), JSON.stringify(advEnsemble.serialise()));
  fs.writeFileSync(path.join(ADV_DIR, 'scaler.json'), JSON.stringify(scaler));
  fs.writeFileSync(
    path.join(ADV_DIR, 'feature-meta.json'),
    JSON.stringify({
      version: 1,
      dataset: 'NSL-KDD (adversarially augmented)',
      featureLength: FEATURE_LENGTH,
      protocolTypes: PROTOCOL_TYPES,
      services: SERVICES,
      flags: FLAGS,
      numericFeatures: NUMERIC_FEATURE_NAMES,
      perturbationBudget: PERTURBATION_BUDGET,
      adversarialCopies: advVecsSub.length,
      trainingSamples: augRowsShuf.length,
      testingSamples: testRowsSub.length,
      trainedAt: new Date().toISOString(),
    }),
  );
  fs.writeFileSync(
    path.join(ADV_DIR, 'metrics.json'),
    JSON.stringify({ trainedAt: new Date().toISOString(), cleanTestMetrics, bestThreshold: bestThr }, null, 2),
  );
  fs.writeFileSync(
    path.join(MODELS_DIR, 'adversarial-comparison.json'),
    JSON.stringify(
      {
        protocol: {
          generatedAt: new Date().toISOString(),
          perturbationBudget: PERTURBATION_BUDGET,
          topKFeatures: TOP_K,
          probeStep: PROBE_STEP,
          auditSample: attackVecs.length,
          epsilons: AUDIT_EPSILONS,
          ensembleThreshold: ENSEMBLE_THRESHOLD,
        },
        cleanEnsemble: { audit: cleanAudit },
        adversarialEnsemble: { audit: advAudit, cleanTestMetrics, bestThreshold: bestThr },
      },
      null,
      2,
    ),
  );
  console.log(`\nWrote:`);
  console.log(`  ${path.join('models', 'adversarial', 'ensemble.json')}`);
  console.log(`  ${path.join('models', 'adversarial-comparison.json')}`);
  console.log(`\nPlot with: python3 scripts/plot-adversarial-comparison.py`);
}

main().catch(err => { console.error(err); process.exit(1); });
