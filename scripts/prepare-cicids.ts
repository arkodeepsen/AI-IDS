/**
 * CICIDS-2017 prep: turn whatever's in `data/cicids/raw/` into the two-file
 * `train.csv` / `test.csv` layout that `train-cicids.ts` expects.
 *
 * Three modes are supported:
 *
 *   --temporal
 *     Monday-Thursday rows → train.csv, Friday rows → test.csv.
 *     The harder evaluation: PortScan, Botnet, and DDoS only appear in the
 *     Friday capture, so the model has to generalise to attack types it has
 *     literally never seen. Requires the raw CIC 8-per-day CSVs in `raw/`.
 *
 *   --random
 *     80/20 per-row coin flip across whatever CSVs are in `raw/`. Class
 *     distribution is preserved IID. Good default for pre-combined / Kaggle
 *     "cleaned and preprocessed" mirrors where day-of-week info has already
 *     been dropped.
 *
 *   --stratified
 *     Two-pass stratified 80/20: first pass counts labels, second pass
 *     splits each class independently so rare families (WebAttack, Botnet,
 *     Infiltration) show up in BOTH train and test even when they're <1%
 *     of the source file. Recommended for any preprocessed single-file
 *     mirror.
 *
 * Default mode = auto-detect:
 *   - If filenames start with Monday/Tuesday/Wednesday/Thursday/Friday →
 *     temporal split.
 *   - Otherwise → stratified split (best default for Kaggle mirrors).
 *
 * Run with:
 *   npx tsx scripts/prepare-cicids.ts                # auto-detect
 *   npx tsx scripts/prepare-cicids.ts --temporal
 *   npx tsx scripts/prepare-cicids.ts --random
 *   npx tsx scripts/prepare-cicids.ts --stratified
 *
 * Source files are expected in `data/cicids/raw/`. Any *.csv in that dir is
 * picked up — drop the Kaggle archive's CSVs there and it just works.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'data', 'cicids', 'raw');
const OUT_DIR = path.join(ROOT, 'data', 'cicids');
const TRAIN_OUT = path.join(OUT_DIR, 'train.csv');
const TEST_OUT = path.join(OUT_DIR, 'test.csv');

// CIC's 8 per-day CSV filenames. We grep against the start of the filename
// (case-insensitive) so users can rename if they like.
const TEMPORAL_TRAIN_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday'];
const TEMPORAL_TEST_DAYS = ['Friday'];

function findCSVFiles(): string[] {
  if (!fs.existsSync(RAW_DIR)) {
    console.error(`Missing ${RAW_DIR}. See docs/RESEARCH.md for the download steps.`);
    process.exit(1);
  }
  return fs
    .readdirSync(RAW_DIR)
    .filter(f => f.toLowerCase().endsWith('.csv'))
    .map(f => path.join(RAW_DIR, f));
}

function dayOfFile(filePath: string): string {
  const base = path.basename(filePath).toLowerCase();
  for (const d of [...TEMPORAL_TRAIN_DAYS, ...TEMPORAL_TEST_DAYS]) {
    if (base.startsWith(d.toLowerCase())) return d;
  }
  return 'unknown';
}

async function streamCopy(
  inputPaths: string[],
  outputPath: string,
  options: { sampleRate?: number } = {},
) {
  const sampleRate = options.sampleRate ?? 1;
  const out = fs.createWriteStream(outputPath);
  let headerWritten = false;
  let rowsKept = 0;

  for (const inputPath of inputPaths) {
    const stream = fs.createReadStream(inputPath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let isFirstLine = true;
    for await (const line of rl) {
      if (!line.trim()) continue;
      if (isFirstLine) {
        isFirstLine = false;
        if (!headerWritten) {
          out.write(line.replace(/^﻿/, '') + '\n');
          headerWritten = true;
        }
        continue;
      }
      if (sampleRate < 1 && Math.random() > sampleRate) continue;
      out.write(line + '\n');
      rowsKept++;
    }
  }
  out.end();
  await new Promise<void>(resolve => out.on('finish', () => resolve()));
  return rowsKept;
}

async function temporalSplit() {
  const files = findCSVFiles();
  const trainFiles = files.filter(f => TEMPORAL_TRAIN_DAYS.includes(dayOfFile(f)));
  const testFiles = files.filter(f => TEMPORAL_TEST_DAYS.includes(dayOfFile(f)));
  console.log(`Train days: ${trainFiles.map(f => path.basename(f)).join(', ') || '(none)'}`);
  console.log(`Test  days: ${testFiles.map(f => path.basename(f)).join(', ') || '(none)'}`);
  if (trainFiles.length === 0 || testFiles.length === 0) {
    console.error(
      'Need at least one Monday-Thursday CSV and one Friday CSV in data/cicids/raw/.',
    );
    process.exit(1);
  }
  const trainRows = await streamCopy(trainFiles, TRAIN_OUT);
  const testRows = await streamCopy(testFiles, TEST_OUT);
  console.log(`Wrote ${trainRows} train rows → ${TRAIN_OUT}`);
  console.log(`Wrote ${testRows} test rows → ${TEST_OUT}`);
}

async function randomSplit() {
  const files = findCSVFiles();
  console.log(`Files: ${files.map(f => path.basename(f)).join(', ')}`);
  // 80/20 by per-row coin flip — preserves overall class distribution because
  // it's IID across the full pooled stream. Seeded RNG would be nicer but
  // CICIDS-2017 is large enough that the law of large numbers handles it.
  const out = {
    train: fs.createWriteStream(TRAIN_OUT),
    test: fs.createWriteStream(TEST_OUT),
  };
  let headerWritten = false;
  let trainRows = 0;
  let testRows = 0;

  for (const filePath of files) {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let isFirstLine = true;
    for await (const line of rl) {
      if (!line.trim()) continue;
      if (isFirstLine) {
        isFirstLine = false;
        if (!headerWritten) {
          const clean = line.replace(/^﻿/, '') + '\n';
          out.train.write(clean);
          out.test.write(clean);
          headerWritten = true;
        }
        continue;
      }
      if (Math.random() < 0.2) {
        out.test.write(line + '\n');
        testRows++;
      } else {
        out.train.write(line + '\n');
        trainRows++;
      }
    }
  }
  out.train.end();
  out.test.end();
  await Promise.all([
    new Promise<void>(r => out.train.on('finish', () => r())),
    new Promise<void>(r => out.test.on('finish', () => r())),
  ]);
  console.log(`Wrote ${trainRows} train rows → ${TRAIN_OUT}`);
  console.log(`Wrote ${testRows} test rows → ${TEST_OUT}`);
}

/**
 * Two-pass stratified 80/20 split.
 *
 * Pass 1 — index labels: stream every row, compute its attack family via
 *          classifyCICIDSLabel, and remember which family bucket it belongs
 *          to. We store only (file, row#, family) so we don't keep the row
 *          contents in RAM.
 *
 * Pass 2 — write rows: shuffle each bucket independently, take the first
 *          80% for train, the remainder for test, then re-stream the source
 *          files and emit lines into the right output stream.
 *
 * This keeps memory linear in row count rather than row size, so even the
 * full 2.8M-row CICIDS-2017 fits comfortably under a few hundred MB.
 */
async function stratifiedSplit() {
  const { classifyCICIDSLabel } = await import('../lib/ml/cicids');
  const files = findCSVFiles();
  console.log(`Files: ${files.map(f => path.basename(f)).join(', ')}`);

  type Bucket = { file: number; row: number }[];
  const buckets = new Map<string, Bucket>();
  let labelIdx = -1;
  let headerLine: string | null = null;

  // ---- Pass 1: index labels ----
  let totalRows = 0;
  for (let fi = 0; fi < files.length; fi++) {
    const stream = fs.createReadStream(files[fi], { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let isFirstLine = true;
    let rowIdx = 0;
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;
      if (isFirstLine) {
        isFirstLine = false;
        const cleaned = line.replace(/^﻿/, '');
        if (headerLine === null) headerLine = cleaned;
        // First time we see a header, locate the label column. Tolerate
        // "Label", "label", " Label", "Class", "attack_label".
        if (labelIdx < 0) {
          const cols = cleaned.split(',').map(c => c.trim().toLowerCase());
          labelIdx = cols.findIndex(c => c === 'label' || c === 'class' || c.endsWith('label'));
          if (labelIdx < 0) {
            throw new Error(
              `No Label column in ${path.basename(files[fi])}. Stratified split needs a label column.`,
            );
          }
        }
        continue;
      }
      const fields = line.split(',');
      const rawLabel = (fields[labelIdx] ?? '').trim();
      if (!rawLabel || rawLabel.toLowerCase() === 'label') {
        rowIdx++;
        continue;
      }
      const klass = classifyCICIDSLabel(rawLabel);
      let bucket = buckets.get(klass);
      if (!bucket) {
        bucket = [];
        buckets.set(klass, bucket);
      }
      bucket.push({ file: fi, row: rowIdx });
      rowIdx++;
      totalRows++;
    }
  }
  console.log(`Indexed ${totalRows} rows across ${buckets.size} attack families:`);
  for (const [k, v] of buckets) console.log(`  ${k.padEnd(14)} ${v.length}`);

  // ---- Pick the 20% test rows from each bucket ----
  // Stratified per family — rare families (Infiltration ≈ 36 rows) still
  // appear in test set. Seeded RNG would be tidier; Math.random is fine for
  // a one-shot prep script.
  const testSet = new Set<string>(); // key = `${file}:${row}`
  for (const [klass, bucket] of buckets) {
    const shuffled = bucket.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const testCount = Math.max(1, Math.floor(shuffled.length * 0.2));
    for (let i = 0; i < testCount; i++) {
      testSet.add(`${shuffled[i].file}:${shuffled[i].row}`);
    }
    console.log(`  ${klass.padEnd(14)} → ${testCount} to test, ${shuffled.length - testCount} to train`);
  }

  // ---- Pass 2: write rows ----
  if (headerLine === null) throw new Error('No header line captured.');
  const trainOut = fs.createWriteStream(TRAIN_OUT);
  const testOut = fs.createWriteStream(TEST_OUT);
  trainOut.write(headerLine + '\n');
  testOut.write(headerLine + '\n');
  let trainRows = 0;
  let testRows = 0;
  for (let fi = 0; fi < files.length; fi++) {
    const stream = fs.createReadStream(files[fi], { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let isFirstLine = true;
    let rowIdx = 0;
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;
      if (isFirstLine) {
        isFirstLine = false;
        continue;
      }
      const fields = line.split(',');
      const rawLabel = (fields[labelIdx] ?? '').trim();
      if (!rawLabel || rawLabel.toLowerCase() === 'label') {
        rowIdx++;
        continue;
      }
      if (testSet.has(`${fi}:${rowIdx}`)) {
        testOut.write(line + '\n');
        testRows++;
      } else {
        trainOut.write(line + '\n');
        trainRows++;
      }
      rowIdx++;
    }
  }
  trainOut.end();
  testOut.end();
  await Promise.all([
    new Promise<void>(r => trainOut.on('finish', () => r())),
    new Promise<void>(r => testOut.on('finish', () => r())),
  ]);
  console.log(`Wrote ${trainRows} train rows → ${TRAIN_OUT}`);
  console.log(`Wrote ${testRows} test rows → ${TEST_OUT}`);
}

function detectMode(): 'temporal' | 'random' | 'stratified' {
  if (process.argv.includes('--temporal')) return 'temporal';
  if (process.argv.includes('--random')) return 'random';
  if (process.argv.includes('--stratified')) return 'stratified';
  // Auto-detect: if any file in raw/ starts with a CIC day-of-week prefix,
  // assume the user has the raw 8-CSV release and default to temporal.
  // Otherwise treat it as a pre-combined mirror (Kaggle, HF) and stratify.
  try {
    const files = fs.readdirSync(RAW_DIR);
    const hasDayFiles = files.some(f => {
      const base = f.toLowerCase();
      return [...TEMPORAL_TRAIN_DAYS, ...TEMPORAL_TEST_DAYS].some(d =>
        base.startsWith(d.toLowerCase()),
      );
    });
    return hasDayFiles ? 'temporal' : 'stratified';
  } catch {
    return 'stratified';
  }
}

const mode = detectMode();
console.log(`Mode: ${mode}`);

const runner =
  mode === 'temporal' ? temporalSplit() : mode === 'random' ? randomSplit() : stratifiedSplit();
runner.catch(err => {
  console.error(err);
  process.exit(1);
});
