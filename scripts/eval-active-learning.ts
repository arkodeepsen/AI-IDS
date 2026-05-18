/**
 * Active Learning empirical evaluation.
 *
 * Closes the §5 contribution: we claim the AL loop turns operator clicks
 * into measured accuracy gain. This script PROVES it (or disproves it)
 * with an oracle-labelled simulation.
 *
 * Protocol:
 *   1. Load the trained ensemble + scaler from models/.
 *   2. Load KDDTest+ and vectorise with the trained scaler.
 *   3. Partition the test set into a "replay pool" (the rows we feed back
 *      as simulated operator clicks) and an "eval pool" (the held-out
 *      rows we measure ensemble F1 on after each rebalance). The two are
 *      disjoint so the measurement isn't contaminated by what we trained on.
 *   4. For each replay row, query the four individual model scores,
 *      compare each to the model's own tuned threshold (from
 *      models/metrics.json), and submit a per-model Confirm/Dismiss
 *      record to the RLHF service.
 *   5. Every BATCH_SIZE feedback samples, the RLHF service rebalances
 *      ensemble weights. We then evaluate the (rebalanced) ensemble on
 *      the eval pool and record (sample_count, weights, F1, ...).
 *   6. Dump the full trajectory to models/active-learning-curve.json
 *      and render a PNG plot via scripts/plot-al-curve.py.
 *
 * Run with: `npm run eval:al`
 *
 * Honesty notes:
 *   - Operator feedback is simulated with an ORACLE (we have ground truth
 *     for KDDTest+). Real operators will make mistakes; the AL update
 *     rule's gentle η = 0.05 is the mitigation. We do NOT claim the
 *     curve represents human-in-the-loop performance — we claim it
 *     represents "if the operator is correct, how much does this design
 *     gain per click?"
 *   - The replay pool is drawn IID from KDDTest+ to keep class
 *     distribution natural; we deliberately do NOT stratify replay so
 *     the curve reflects what an operator would actually see.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCsvText } from '../lib/ml/nsl-kdd';
import { EnsembleDetector, SerialisedEnsemble, EnsembleWeights } from '../lib/ml/ensemble';
import { FeatureScaler } from '../lib/ml/nsl-kdd';
import type { TrainedMetric, TrainedMetrics } from '../lib/ml/loader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const MODELS_DIR = path.join(ROOT, 'models');
const DATA_DIR = path.join(ROOT, 'data');

const TEST_PATH = path.join(DATA_DIR, 'KDDTest+.txt');
const ENSEMBLE_PATH = path.join(MODELS_DIR, 'ensemble.json');
const SCALER_PATH = path.join(MODELS_DIR, 'scaler.json');
const METRICS_PATH = path.join(MODELS_DIR, 'metrics.json');
const OUT_PATH = path.join(MODELS_DIR, 'active-learning-curve.json');

const REPLAY_SIZE = 1000;
const EVAL_SIZE = 5000;
const BATCH_SIZE = 10; // sync with rlhfService.minAdjustmentThreshold
const LEARNING_RATE = 0.05;
const ENSEMBLE_THRESHOLD = 0.35;

/**
 * Reward signal used to update ensemble weights:
 *   - 'accuracy' — the production rule. Shifts weight toward models that
 *     individually agree with ground truth more often. Class-imbalanced
 *     test sets bias this toward "predict normal always" if attacks are
 *     rare.
 *   - 'f1'       — alternative. Shifts weight toward models with higher
 *     per-model F1, which is the actual ensemble objective. We expected
 *     this to be a strictly better signal; the results below let the
 *     reader judge.
 *
 * Pass `--mode=f1` to override.
 */
const REWARD_MODE: 'accuracy' | 'f1' =
  process.argv.includes('--mode=f1') ? 'f1' : 'accuracy';

interface CurvePoint {
  samplesProcessed: number;
  weights: EnsembleWeights;
  ensembleF1: number;
  ensembleAccuracy: number;
  ensemblePrecision: number;
  ensembleRecall: number;
  ensembleFPR: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

function shuffle<T>(arr: T[], seed = 42): T[] {
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
  return { accuracy, precision, recall, f1Score: f1, falsePositiveRate: fpr, tp, fp, tn, fn };
}

function normalise(w: EnsembleWeights): EnsembleWeights {
  const total = w.isolationForest + w.autoencoder + w.randomForest + w.xgboost;
  if (total <= 0) return w;
  return {
    isolationForest: w.isolationForest / total,
    autoencoder: w.autoencoder / total,
    randomForest: w.randomForest / total,
    xgboost: w.xgboost / total,
  };
}

function blend(old: number, target: number): number {
  return old * (1 - LEARNING_RATE) + target * LEARNING_RATE;
}

type PerfStat = { tp: number; fp: number; tn: number; fn: number };

function scoreFromStat(s: PerfStat, mode: 'accuracy' | 'f1'): number {
  const total = s.tp + s.fp + s.tn + s.fn;
  if (total === 0) return 0.5;
  if (mode === 'accuracy') {
    return (s.tp + s.tn) / total;
  }
  // F1 — handle the all-negative-prediction degeneracy by mixing with
  // 0.5 baseline so a model that never fires doesn't get weight 0.
  const prec = s.tp + s.fp > 0 ? s.tp / (s.tp + s.fp) : 0;
  const rec = s.tp + s.fn > 0 ? s.tp / (s.tp + s.fn) : 0;
  const f1 = prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0;
  return f1 === 0 ? 0.05 : f1;
}

/**
 * Rebalance ensemble weights from per-model performance over recent
 * verified samples. The reward signal is configurable (see REWARD_MODE).
 *
 * Inlined rather than imported from lib/services/rlhf.ts so the script
 * can vary the reward signal without touching the production service.
 */
function rebalance(
  current: EnsembleWeights,
  perfBuffer: Record<'isolationForest' | 'autoencoder' | 'randomForest' | 'xgboost', PerfStat>,
  mode: 'accuracy' | 'f1',
): EnsembleWeights {
  const s = {
    isolationForest: scoreFromStat(perfBuffer.isolationForest, mode),
    autoencoder: scoreFromStat(perfBuffer.autoencoder, mode),
    randomForest: scoreFromStat(perfBuffer.randomForest, mode),
    xgboost: scoreFromStat(perfBuffer.xgboost, mode),
  };
  const total = s.isolationForest + s.autoencoder + s.randomForest + s.xgboost;
  if (total <= 0) return current;
  const target = {
    isolationForest: s.isolationForest / total,
    autoencoder: s.autoencoder / total,
    randomForest: s.randomForest / total,
    xgboost: s.xgboost / total,
  };
  return normalise({
    isolationForest: blend(current.isolationForest, target.isolationForest),
    autoencoder: blend(current.autoencoder, target.autoencoder),
    randomForest: blend(current.randomForest, target.randomForest),
    xgboost: blend(current.xgboost, target.xgboost),
  });
}

function thresholdsFromMetrics(metrics: TrainedMetrics): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of metrics.perModel) out[m.method] = m.threshold;
  return out;
}

function evaluateOnPool(
  ensemble: EnsembleDetector,
  evalPool: { vector: number[]; isAttack: boolean }[],
): CurvePoint['ensembleF1'] extends number ? Omit<CurvePoint, 'samplesProcessed' | 'weights'> : never {
  const preds = evalPool.map(r => ensemble.predict(r.vector).score > ENSEMBLE_THRESHOLD);
  const truth = evalPool.map(r => r.isAttack);
  const m = classMetrics(preds, truth);
  return {
    ensembleF1: m.f1Score,
    ensembleAccuracy: m.accuracy,
    ensemblePrecision: m.precision,
    ensembleRecall: m.recall,
    ensembleFPR: m.falsePositiveRate,
    tp: m.tp, fp: m.fp, tn: m.tn, fn: m.fn,
  };
}

function main() {
  console.log('=== Active Learning empirical evaluation ===\n');

  // ---- Load artefacts ----
  for (const p of [ENSEMBLE_PATH, SCALER_PATH, METRICS_PATH, TEST_PATH]) {
    if (!fs.existsSync(p)) {
      console.error(`Missing: ${p}`);
      console.error('Run `npm run data:download` and `npm run train` first.');
      process.exit(1);
    }
  }

  const ensembleData = JSON.parse(fs.readFileSync(ENSEMBLE_PATH, 'utf8')) as SerialisedEnsemble;
  const scaler = JSON.parse(fs.readFileSync(SCALER_PATH, 'utf8')) as FeatureScaler;
  const metrics = JSON.parse(fs.readFileSync(METRICS_PATH, 'utf8')) as TrainedMetrics;
  const ensemble = EnsembleDetector.deserialise(ensembleData);
  const perModelThr = thresholdsFromMetrics(metrics);
  console.log(`Loaded ensemble (trained ${metrics.trainedAt})`);
  console.log(`Per-model thresholds: ${JSON.stringify(perModelThr)}\n`);

  // ---- Load + vectorise test set ----
  const testText = fs.readFileSync(TEST_PATH, 'utf8');
  const { rows: testRows, vectors: testVectors } = loadCsvText(testText, scaler);
  console.log(`Loaded ${testRows.length} test rows`);

  // ---- Partition into replay + eval pools ----
  const pool = shuffle(
    testRows.map((row, i) => ({
      vector: testVectors[i],
      isAttack: row.label.trim().toLowerCase() !== 'normal',
    })),
    42,
  );
  const replayPool = pool.slice(0, REPLAY_SIZE);
  const evalPool = pool.slice(REPLAY_SIZE, REPLAY_SIZE + EVAL_SIZE);
  console.log(`Replay pool: ${replayPool.length} rows (${replayPool.filter(r => r.isAttack).length} attacks)`);
  console.log(`Eval pool:   ${evalPool.length} rows (${evalPool.filter(r => r.isAttack).length} attacks)\n`);

  // ---- Initial measurement (before any feedback) ----
  const startingMetrics = evaluateOnPool(ensemble, evalPool);
  const curve: CurvePoint[] = [
    { samplesProcessed: 0, weights: ensemble.getWeights(), ...startingMetrics },
  ];
  console.log(`[0]    F1=${(startingMetrics.ensembleF1 * 100).toFixed(2)}%  acc=${(startingMetrics.ensembleAccuracy * 100).toFixed(2)}%  FPR=${(startingMetrics.ensembleFPR * 100).toFixed(2)}%`);

  console.log(`Reward mode: ${REWARD_MODE}\n`);

  // ---- Replay loop ----
  const perfBuffer: Record<'isolationForest' | 'autoencoder' | 'randomForest' | 'xgboost', PerfStat> = {
    isolationForest: { tp: 0, fp: 0, tn: 0, fn: 0 },
    autoencoder: { tp: 0, fp: 0, tn: 0, fn: 0 },
    randomForest: { tp: 0, fp: 0, tn: 0, fn: 0 },
    xgboost: { tp: 0, fp: 0, tn: 0, fn: 0 },
  };
  const bump = (s: PerfStat, pred: boolean, truth: boolean) => {
    if (pred && truth) s.tp++;
    else if (pred && !truth) s.fp++;
    else if (!pred && !truth) s.tn++;
    else s.fn++;
  };
  let currentWeights = ensemble.getWeights();

  for (let i = 0; i < replayPool.length; i++) {
    const { vector, isAttack } = replayPool[i];

    // Per-model "would this model alone have been correct?" using each model's tuned threshold.
    const ifScore = ensemble.predictByMethod(vector, 'Isolation Forest');
    const aeScore = ensemble.predictByMethod(vector, 'Autoencoder');
    const rfScore = ensemble.predictByMethod(vector, 'Random Forest');
    const xgbScore = ensemble.predictByMethod(vector, 'XGBoost');

    bump(perfBuffer.isolationForest, ifScore > (perModelThr['Isolation Forest'] ?? 0.5), isAttack);
    bump(perfBuffer.autoencoder,     aeScore > (perModelThr['Autoencoder']      ?? 0.5), isAttack);
    bump(perfBuffer.randomForest,    rfScore > (perModelThr['Random Forest']    ?? 0.5), isAttack);
    bump(perfBuffer.xgboost,         xgbScore > (perModelThr['XGBoost']         ?? 0.5), isAttack);

    // Every BATCH_SIZE rows: rebalance + measure.
    if ((i + 1) % BATCH_SIZE === 0) {
      currentWeights = rebalance(currentWeights, perfBuffer, REWARD_MODE);
      ensemble.updateWeights(currentWeights);
      const m = evaluateOnPool(ensemble, evalPool);
      curve.push({ samplesProcessed: i + 1, weights: { ...currentWeights }, ...m });
      if ((i + 1) % 50 === 0 || i === replayPool.length - 1) {
        console.log(`[${i + 1}]  F1=${(m.ensembleF1 * 100).toFixed(2)}%  acc=${(m.ensembleAccuracy * 100).toFixed(2)}%  FPR=${(m.ensembleFPR * 100).toFixed(2)}%  ` +
          `w=[IF ${(currentWeights.isolationForest * 100).toFixed(1)} AE ${(currentWeights.autoencoder * 100).toFixed(1)} RF ${(currentWeights.randomForest * 100).toFixed(1)} XGB ${(currentWeights.xgboost * 100).toFixed(1)}]`);
      }
    }
  }

  // ---- Summary ----
  const first = curve[0];
  const last = curve[curve.length - 1];
  console.log('\n--- Summary ---');
  console.log(`F1 start: ${(first.ensembleF1 * 100).toFixed(2)}%  → end: ${(last.ensembleF1 * 100).toFixed(2)}%  (Δ ${((last.ensembleF1 - first.ensembleF1) * 100).toFixed(2)} pts)`);
  console.log(`FPR start: ${(first.ensembleFPR * 100).toFixed(2)}%  → end: ${(last.ensembleFPR * 100).toFixed(2)}%  (Δ ${((last.ensembleFPR - first.ensembleFPR) * 100).toFixed(2)} pts)`);
  console.log(`Recall start: ${(first.ensembleRecall * 100).toFixed(2)}%  → end: ${(last.ensembleRecall * 100).toFixed(2)}%  (Δ ${((last.ensembleRecall - first.ensembleRecall) * 100).toFixed(2)} pts)`);
  console.log(`\nWeight trajectory:`);
  console.log(`  IF:  ${(first.weights.isolationForest * 100).toFixed(2)}% → ${(last.weights.isolationForest * 100).toFixed(2)}%`);
  console.log(`  AE:  ${(first.weights.autoencoder * 100).toFixed(2)}% → ${(last.weights.autoencoder * 100).toFixed(2)}%`);
  console.log(`  RF:  ${(first.weights.randomForest * 100).toFixed(2)}% → ${(last.weights.randomForest * 100).toFixed(2)}%`);
  console.log(`  XGB: ${(first.weights.xgboost * 100).toFixed(2)}% → ${(last.weights.xgboost * 100).toFixed(2)}%`);

  // ---- Persist ----
  const outPath = REWARD_MODE === 'f1'
    ? OUT_PATH.replace(/\.json$/, '-f1.json')
    : OUT_PATH;
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        protocol: {
          replaySize: REPLAY_SIZE,
          evalSize: EVAL_SIZE,
          batchSize: BATCH_SIZE,
          learningRate: LEARNING_RATE,
          ensembleThreshold: ENSEMBLE_THRESHOLD,
          rewardMode: REWARD_MODE,
          generatedAt: new Date().toISOString(),
          dataset: 'NSL-KDD (KDDTest+)',
        },
        curve,
      },
      null,
      2,
    ),
  );
  console.log(`\nWrote ${curve.length} curve points to ${outPath}`);
  console.log('Plot with: python3 scripts/plot-al-curve.py');
}

main();
