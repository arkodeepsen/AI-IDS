/**
 * CICIDS-2017 prep: turn the raw CIC release (8 per-day CSVs) into the
 * two-file `train.csv` / `test.csv` layout that `train-cicids.ts` expects.
 *
 * Two splits are supported:
 *
 *   --temporal (default)
 *     Monday-Thursday rows → train.csv
 *     Friday rows          → test.csv
 *     This is the harder evaluation: PortScan, Botnet, and DDoS only appear
 *     in the Friday capture, so the model has to generalise to attack types
 *     it has literally never seen.
 *
 *   --random
 *     80/20 random shuffle across all 8 days.
 *     Easier, but doesn't test generalisation to unseen attacks.
 *
 * Run with:
 *   npx tsx scripts/prepare-cicids.ts --temporal
 *   npx tsx scripts/prepare-cicids.ts --random
 *
 * Source files are expected in `data/cicids/raw/` with their CIC names
 * (e.g. `Monday-WorkingHours.pcap_ISCX.csv`).
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

const mode = process.argv.includes('--random') ? 'random' : 'temporal';
console.log(`Mode: ${mode}`);

(mode === 'temporal' ? temporalSplit() : randomSplit()).catch(err => {
  console.error(err);
  process.exit(1);
});
