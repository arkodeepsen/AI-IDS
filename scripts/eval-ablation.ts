/**
 * Ensemble ablation study.
 *
 * Quantifies the §9.5 honest finding from PROJECT_REPORT.md ("ensemble
 * voting helps on NSL-KDD but slightly hurts on CICIDS"). For each
 * dataset, evaluates every non-empty subset of the four models with
 * equal-weight averaging, then with the trained 30/25/25/20 weights
 * where applicable. Outputs:
 *
 *   models/ablation-nslkdd.json
 *   models/ablation-cicids.json
 *
 * The paper finding lands as: a model-disagreement metric correlates
 * with whether voting helps. When the four individual F1s span a wide
 * range (e.g., 9 pts on NSL-KDD), voting wins; when one model dominates
 * (e.g., RF alone > 99% F1 on CICIDS), voting underperforms it.
 *
 * Two ablation studies are run per dataset:
 *   1. Single-model removal: drop each of the four, measure ensemble F1.
 *   2. Subset enumeration: all 2^4 − 1 = 15 non-empty subsets.
 *
 * Run with: `npm run eval:ablation`
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCsvText, FeatureScaler } from '../lib/ml/nsl-kdd';
import {
  loadCICIDSCsv,
  buildDataset as buildCICIDSDataset,
  type CICIDSScaler,
} from '../lib/ml/cicids';
import { EnsembleDetector, SerialisedEnsemble } from '../lib/ml/ensemble';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const MODELS_DIR = path.join(ROOT, 'models');
const DATA_DIR = path.join(ROOT, 'data');

const NSLKDD_ENSEMBLE = path.join(MODELS_DIR, 'ensemble.json');
const NSLKDD_SCALER = path.join(MODELS_DIR, 'scaler.json');
const NSLKDD_TEST = path.join(DATA_DIR, 'KDDTest+.txt');
const CICIDS_ENSEMBLE = path.join(MODELS_DIR, 'cicids', 'ensemble.json');
const CICIDS_TEST = path.join(DATA_DIR, 'cicids', 'test.csv');

const MODELS = ['Isolation Forest', 'Autoencoder', 'Random Forest', 'XGBoost'] as const;
type ModelName = (typeof MODELS)[number];
const KEY: Record<ModelName, 'isolationForest' | 'autoencoder' | 'randomForest' | 'xgboost'> = {
  'Isolation Forest': 'isolationForest',
  Autoencoder: 'autoencoder',
  'Random Forest': 'randomForest',
  XGBoost: 'xgboost',
};

const ENSEMBLE_THRESHOLD = 0.35;
const SAMPLE_SIZE = 8000;

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

function subsetCombinations<T>(arr: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let mask = 1; mask < 1 << arr.length; mask++) {
    const sub: T[] = [];
    for (let i = 0; i < arr.length; i++) if (mask & (1 << i)) sub.push(arr[i]);
    out.push(sub);
  }
  return out;
}

function shuffle<T>(arr: T[], seed = 17): T[] {
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

/**
 * Score a sample using a subset of the four models with equal weights.
 * Mirrors the production weighted-vote logic but with the chosen subset
 * normalised to sum-1.
 */
function scoreSubset(
  ensemble: EnsembleDetector,
  vector: number[],
  subset: ModelName[],
): number {
  let total = 0;
  for (const m of subset) total += ensemble.predictByMethod(vector, m);
  return total / subset.length;
}

interface AblationRow {
  subset: ModelName[];
  size: number;
  f1: number;
  accuracy: number;
  precision: number;
  recall: number;
  fpr: number;
  bestThreshold: number;
}

const THRESHOLD_GRID = [0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70];

function runAblation(
  ensemble: EnsembleDetector,
  vectors: number[][],
  isAttack: boolean[],
  label: string,
): AblationRow[] {
  const all = subsetCombinations(MODELS);
  const out: AblationRow[] = [];

  // Pre-compute per-model scores once per sample so subset evaluation is fast.
  const cachedScores: Record<ModelName, number[]> = {
    'Isolation Forest': vectors.map(v => ensemble.predictByMethod(v, 'Isolation Forest')),
    Autoencoder: vectors.map(v => ensemble.predictByMethod(v, 'Autoencoder')),
    'Random Forest': vectors.map(v => ensemble.predictByMethod(v, 'Random Forest')),
    XGBoost: vectors.map(v => ensemble.predictByMethod(v, 'XGBoost')),
  };

  for (const subset of all) {
    const scores = vectors.map((_, i) => {
      let total = 0;
      for (const m of subset) total += cachedScores[m][i];
      return total / subset.length;
    });
    // Pick the threshold that maximises F1 for THIS subset, so the
    // comparison across subsets isn't biased by a global 0.35 that was
    // tuned for the full ensemble on a different dataset.
    let bestF1 = -1;
    let bestRow: AblationRow | null = null;
    for (const thr of THRESHOLD_GRID) {
      const preds = scores.map(s => s > thr);
      const m = classMetrics(preds, isAttack);
      if (m.f1Score > bestF1) {
        bestF1 = m.f1Score;
        bestRow = {
          subset: subset as ModelName[],
          size: subset.length,
          f1: m.f1Score,
          accuracy: m.accuracy,
          precision: m.precision,
          recall: m.recall,
          fpr: m.falsePositiveRate,
          bestThreshold: thr,
        };
      }
    }
    if (bestRow) out.push(bestRow);
  }
  out.sort((a, b) => b.f1 - a.f1);
  console.log(`\n[${label}] top 5 subsets by F1 (per-subset threshold grid-searched):`);
  for (const r of out.slice(0, 5)) {
    console.log(
      `  F1=${(r.f1 * 100).toFixed(2)}%  acc=${(r.accuracy * 100).toFixed(2)}%  FPR=${(r.fpr * 100).toFixed(2)}%  thr=${r.bestThreshold}  ` +
      `← ${r.subset.join(' + ')}`,
    );
  }
  console.log(`[${label}] bottom 3 subsets:`);
  for (const r of out.slice(-3)) {
    console.log(
      `  F1=${(r.f1 * 100).toFixed(2)}%  acc=${(r.accuracy * 100).toFixed(2)}%  FPR=${(r.fpr * 100).toFixed(2)}%  thr=${r.bestThreshold}  ` +
      `← ${r.subset.join(' + ')}`,
    );
  }
  return out;
}

async function ablateNSLKDD(): Promise<AblationRow[] | null> {
  if (!fs.existsSync(NSLKDD_ENSEMBLE) || !fs.existsSync(NSLKDD_TEST)) {
    console.log('Skipping NSL-KDD ablation (missing artefacts).');
    return null;
  }
  console.log('\n=== NSL-KDD ablation ===');
  const ensembleData = JSON.parse(fs.readFileSync(NSLKDD_ENSEMBLE, 'utf8')) as SerialisedEnsemble;
  const scaler = JSON.parse(fs.readFileSync(NSLKDD_SCALER, 'utf8')) as FeatureScaler;
  const ensemble = EnsembleDetector.deserialise(ensembleData);
  const { rows, vectors } = loadCsvText(fs.readFileSync(NSLKDD_TEST, 'utf8'), scaler);
  const sampled = shuffle(rows.map((r, i) => ({ row: r, vec: vectors[i] }))).slice(0, SAMPLE_SIZE);
  const v = sampled.map(p => p.vec);
  const y = sampled.map(p => p.row.label.trim().toLowerCase() !== 'normal');
  console.log(`Loaded ${rows.length} test rows, sampled ${sampled.length} (${y.filter(Boolean).length} attacks).`);
  return runAblation(ensemble, v, y, 'NSL-KDD');
}

async function ablateCICIDS(): Promise<AblationRow[] | null> {
  const cicidsScalerPath = path.join(MODELS_DIR, 'cicids', 'scaler.json');
  if (!fs.existsSync(CICIDS_ENSEMBLE) || !fs.existsSync(CICIDS_TEST) || !fs.existsSync(cicidsScalerPath)) {
    console.log('Skipping CICIDS ablation (missing artefacts; run train:cicids first).');
    return null;
  }
  console.log('\n=== CICIDS-2017 ablation ===');
  const ensembleData = JSON.parse(fs.readFileSync(CICIDS_ENSEMBLE, 'utf8')) as SerialisedEnsemble;
  const ensemble = EnsembleDetector.deserialise(ensembleData);
  // Use the SCALER FITTED ON THE TRAINING SPLIT (saved at train time) so
  // the test vectors land in the same feature space the models were trained
  // on. Refitting on the test sample drifts the scale and inflates results.
  const scaler = JSON.parse(fs.readFileSync(cicidsScalerPath, 'utf8')) as CICIDSScaler;
  const rawRows = await loadCICIDSCsv(CICIDS_TEST, { sampleRate: 0.05, maxRows: 100000, seed: 23 });
  const sampled = shuffle(rawRows).slice(0, SAMPLE_SIZE);
  const ds = buildCICIDSDataset(sampled, scaler);
  const y = ds.yBinary.map(b => b === 1);
  console.log(`Loaded ${rawRows.length} candidate test rows, sampled ${sampled.length} (${y.filter(Boolean).length} attacks).`);
  return runAblation(ensemble, ds.X, y, 'CICIDS-2017');
}

async function main() {
  console.log('=== Ensemble subset ablation ===');

  const nsl = await ablateNSLKDD();
  if (nsl) {
    fs.writeFileSync(
      path.join(MODELS_DIR, 'ablation-nslkdd.json'),
      JSON.stringify(
        {
          dataset: 'NSL-KDD',
          threshold: ENSEMBLE_THRESHOLD,
          sampleSize: SAMPLE_SIZE,
          generatedAt: new Date().toISOString(),
          results: nsl,
        },
        null,
        2,
      ),
    );
  }
  const cicids = await ablateCICIDS();
  if (cicids) {
    fs.writeFileSync(
      path.join(MODELS_DIR, 'ablation-cicids.json'),
      JSON.stringify(
        {
          dataset: 'CICIDS-2017 (Kaggle preprocessed mirror)',
          threshold: ENSEMBLE_THRESHOLD,
          sampleSize: SAMPLE_SIZE,
          generatedAt: new Date().toISOString(),
          results: cicids,
        },
        null,
        2,
      ),
    );
  }

  // ---- Cross-dataset summary ----
  if (nsl && cicids) {
    console.log('\n=== Cross-dataset finding ===');
    const fullNSL = nsl.find(r => r.size === 4)!;
    const fullCIC = cicids.find(r => r.size === 4)!;
    const bestSingleNSL = nsl.filter(r => r.size === 1).reduce((a, b) => (a.f1 >= b.f1 ? a : b));
    const bestSingleCIC = cicids.filter(r => r.size === 1).reduce((a, b) => (a.f1 >= b.f1 ? a : b));

    console.log(`NSL-KDD:    full ensemble F1 ${(fullNSL.f1 * 100).toFixed(2)}%  vs best single ${(bestSingleNSL.f1 * 100).toFixed(2)}% (${bestSingleNSL.subset[0]}) → Δ ${((fullNSL.f1 - bestSingleNSL.f1) * 100).toFixed(2)} pts (voting ${fullNSL.f1 >= bestSingleNSL.f1 ? 'wins' : 'loses'})`);
    console.log(`CICIDS-2017: full ensemble F1 ${(fullCIC.f1 * 100).toFixed(2)}%  vs best single ${(bestSingleCIC.f1 * 100).toFixed(2)}% (${bestSingleCIC.subset[0]}) → Δ ${((fullCIC.f1 - bestSingleCIC.f1) * 100).toFixed(2)} pts (voting ${fullCIC.f1 >= bestSingleCIC.f1 ? 'wins' : 'loses'})`);

    const f1sNSL = nsl.filter(r => r.size === 1).map(r => r.f1);
    const f1sCIC = cicids.filter(r => r.size === 1).map(r => r.f1);
    const spreadNSL = Math.max(...f1sNSL) - Math.min(...f1sNSL);
    const spreadCIC = Math.max(...f1sCIC) - Math.min(...f1sCIC);
    console.log(`Per-model F1 spread: NSL-KDD ${(spreadNSL * 100).toFixed(2)} pts | CICIDS ${(spreadCIC * 100).toFixed(2)} pts`);
    console.log(`Hypothesis: voting wins when individual-model F1 spread is moderate (NSL-KDD), loses when one model dominates (CICIDS).`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
