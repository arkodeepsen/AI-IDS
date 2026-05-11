/**
 * CICIDS-2017 dataset loader and feature engineering.
 *
 * CICIDS-2017 (https://www.unb.ca/cic/datasets/ids-2017.html) is the second
 * benchmark this project supports alongside NSL-KDD. Each row is a flow
 * record produced by CICFlowMeter with 78 numeric features + a string Label.
 *
 * Why support both datasets? NSL-KDD is small and old (1998 traffic);
 * CICIDS-2017 captures modern attack families (Heartbleed, Botnet, web
 * attacks). Training the same ensemble architecture on both lets us check
 * whether the methodology generalises or merely overfits NSL-KDD quirks.
 *
 * Input format: CSV (the format CIC originally distributes). Users who pull
 * the HuggingFace parquet mirror can convert with one pandas call — see
 * docs/RESEARCH.md.
 */

import readline from 'node:readline';
import fs from 'node:fs';

/**
 * All 78 numeric CICIDS-2017 feature columns, in the canonical order used
 * by CIC's CSVs and the HuggingFace mirror. We deliberately keep the original
 * spacing/casing so a vanilla CIC CSV parses without renaming. Trim happens
 * on the header line of the file, not here.
 */
export const CICIDS_NUMERIC_COLS = [
  'Destination Port',
  'Flow Duration',
  'Total Fwd Packets',
  'Total Backward Packets',
  'Total Length of Fwd Packets',
  'Total Length of Bwd Packets',
  'Fwd Packet Length Max',
  'Fwd Packet Length Min',
  'Fwd Packet Length Mean',
  'Fwd Packet Length Std',
  'Bwd Packet Length Max',
  'Bwd Packet Length Min',
  'Bwd Packet Length Mean',
  'Bwd Packet Length Std',
  'Flow Bytes/s',
  'Flow Packets/s',
  'Flow IAT Mean',
  'Flow IAT Std',
  'Flow IAT Max',
  'Flow IAT Min',
  'Fwd IAT Total',
  'Fwd IAT Mean',
  'Fwd IAT Std',
  'Fwd IAT Max',
  'Fwd IAT Min',
  'Bwd IAT Total',
  'Bwd IAT Mean',
  'Bwd IAT Std',
  'Bwd IAT Max',
  'Bwd IAT Min',
  'Fwd PSH Flags',
  'Bwd PSH Flags',
  'Fwd URG Flags',
  'Bwd URG Flags',
  'Fwd Header Length',
  'Bwd Header Length',
  'Fwd Packets/s',
  'Bwd Packets/s',
  'Min Packet Length',
  'Max Packet Length',
  'Packet Length Mean',
  'Packet Length Std',
  'Packet Length Variance',
  'FIN Flag Count',
  'SYN Flag Count',
  'RST Flag Count',
  'PSH Flag Count',
  'ACK Flag Count',
  'URG Flag Count',
  'CWE Flag Count',
  'ECE Flag Count',
  'Down/Up Ratio',
  'Average Packet Size',
  'Avg Fwd Segment Size',
  'Avg Bwd Segment Size',
  'Fwd Header Length.1',
  'Fwd Avg Bytes/Bulk',
  'Fwd Avg Packets/Bulk',
  'Fwd Avg Bulk Rate',
  'Bwd Avg Bytes/Bulk',
  'Bwd Avg Packets/Bulk',
  'Bwd Avg Bulk Rate',
  'Subflow Fwd Packets',
  'Subflow Fwd Bytes',
  'Subflow Bwd Packets',
  'Subflow Bwd Bytes',
  'Init_Win_bytes_forward',
  'Init_Win_bytes_backward',
  'act_data_pkt_fwd',
  'min_seg_size_forward',
  'Active Mean',
  'Active Std',
  'Active Max',
  'Active Min',
  'Idle Mean',
  'Idle Std',
  'Idle Max',
  'Idle Min',
] as const;

export const CICIDS_FEATURE_LENGTH = CICIDS_NUMERIC_COLS.length; // 78

export type CICIDSAttackClass =
  | 'normal'
  | 'DoS'
  | 'Probe'
  | 'R2L'
  | 'WebAttack'
  | 'Botnet'
  | 'Infiltration';

/**
 * Canonical attack-family mapping after the label has been normalised by
 * {@link normaliseLabel}. CICIDS-2017 ships with fine-grained labels which
 * we collapse to the standard taxonomy so it lines up with NSL-KDD's
 * DoS/Probe/R2L/U2R buckets for cross-dataset comparison.
 *
 * Cross-checked against the CIC release notes and Sharafaldin et al. 2018.
 */
const ATTACK_FAMILY_MAP: Record<string, CICIDSAttackClass> = {
  benign: 'normal',
  ddos: 'DoS',
  'dos hulk': 'DoS',
  'dos goldeneye': 'DoS',
  'dos slowloris': 'DoS',
  'dos slowhttptest': 'DoS',
  heartbleed: 'DoS',
  portscan: 'Probe',
  'ftp-patator': 'R2L',
  'ssh-patator': 'R2L',
  'web attack brute force': 'WebAttack',
  'web attack xss': 'WebAttack',
  'web attack sql injection': 'WebAttack',
  bot: 'Botnet',
  infiltration: 'Infiltration',
};

/**
 * Normalise a raw label by:
 *   - trimming whitespace
 *   - collapsing the C1 control byte U+0096 that CIC's CSV exporter inserts
 *     between "Web Attack" and the variant (a well-known artifact of their
 *     latin-1-then-utf-8 export pipeline)
 *   - collapsing repeated spaces to single
 *   - lowercasing for case-insensitive lookup
 */
function normaliseLabel(raw: string): string {
  return raw
    .trim()
    .replace(/[-]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Some Kaggle-preprocessed mirrors integer-encode the label column. The
 * encoding varies between releases, but the de-facto convention is:
 *   0 → BENIGN, 1..N → attack families in alphabetical order.
 * Without the original mapping we can only recover the binary signal, so
 * we treat 0 as normal and everything else as DoS (the modal attack class).
 * If the user's dataset uses a different integer encoding, they should add
 * the mapping to ATTACK_FAMILY_MAP below.
 */
function classifyNumericLabel(n: number): CICIDSAttackClass {
  return n === 0 ? 'normal' : 'DoS';
}

export function classifyCICIDSLabel(rawLabel: string): CICIDSAttackClass {
  const trimmed = rawLabel.trim();
  // Integer-encoded labels: 0, 1, 2, … (Kaggle preprocessed mirrors).
  if (/^-?\d+$/.test(trimmed)) {
    return classifyNumericLabel(Number(trimmed));
  }
  const key = normaliseLabel(trimmed);
  const mapped = ATTACK_FAMILY_MAP[key];
  if (mapped) return mapped;
  if (key.startsWith('web attack')) return 'WebAttack';
  // Anything we don't recognise that isn't "benign" is treated as DoS, the
  // dominant attack family in CICIDS-2017.
  return key === 'benign' ? 'normal' : 'DoS';
}

export interface CICIDSRow {
  /** Numeric values aligned with {@link CICIDS_NUMERIC_COLS}. */
  values: number[];
  /** Raw textual label, e.g. "BENIGN", "DoS Hulk". */
  label: string;
  /** 1 = attack, 0 = normal. */
  binary: number;
}

export interface CICIDSScaler {
  mins: number[];
  maxs: number[];
}

/**
 * Normalise a column-name for tolerant header lookups.
 *
 * CIC's raw release uses titles like "Destination Port" and " Bwd Header
 * Length" (leading space and all). Kaggle preprocessed mirrors often rename
 * those to snake_case ("destination_port") or kebab-case ("bwd-header-length")
 * and may add or drop punctuation. We collapse everything to a lowercase
 * alphanumeric key so the loader matches regardless of which mirror is used.
 */
function normColumn(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Build a header → column-index lookup keyed by the normalised column name.
 * Returns the original header indices so downstream parsing keeps using
 * field positions as before.
 */
function buildColumnIndex(header: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < header.length; i++) {
    const key = normColumn(header[i]);
    if (key && !m.has(key)) m.set(key, i);
  }
  return m;
}

/** Pre-computed canonical keys for the 78 expected columns. */
const NORMALISED_FEATURE_KEYS = CICIDS_NUMERIC_COLS.map(normColumn);

/**
 * Parse a single CICIDS CSV row using a header→column index mapping.
 * Returns null when the row is malformed (e.g. mid-file header repeats).
 *
 * Two well-known quirks of CIC's raw files we handle:
 *   1. Infinity / NaN values for "Flow Bytes/s" and "Flow Packets/s" when
 *      Flow Duration is 0 — clamped to a large finite value.
 *   2. Some rows have a stray trailing comma; extra fields are ignored.
 */
function parseRow(
  fields: string[],
  colIndex: Map<string, number>,
  labelIdx: number,
): CICIDSRow | null {
  if (fields.length < CICIDS_NUMERIC_COLS.length + 1) return null;

  const values: number[] = new Array(CICIDS_FEATURE_LENGTH);
  for (let i = 0; i < CICIDS_NUMERIC_COLS.length; i++) {
    const idx = colIndex.get(NORMALISED_FEATURE_KEYS[i]);
    if (idx === undefined) return null;
    const raw = (fields[idx] ?? '').trim();
    let v: number;
    if (raw === '' || raw === 'NaN' || raw === 'nan') {
      v = 0;
    } else if (raw === 'Infinity' || raw === 'inf' || raw === 'Inf') {
      v = 1e12;
    } else if (raw === '-Infinity' || raw === '-inf') {
      v = -1e12;
    } else {
      const parsed = Number(raw);
      v = Number.isFinite(parsed) ? parsed : 0;
    }
    values[i] = v;
  }

  const labelRaw = (fields[labelIdx] ?? '').trim();
  if (!labelRaw) return null;
  // Some files repeat headers mid-file.
  if (labelRaw === 'Label') return null;

  const klass = classifyCICIDSLabel(labelRaw);
  return {
    values,
    label: labelRaw,
    binary: klass === 'normal' ? 0 : 1,
  };
}

function splitCsv(line: string): string[] {
  return line.split(',');
}

/**
 * Stream a CICIDS CSV file line-by-line, applying an optional row sampler so
 * very large files (the Friday capture is ~250 MB) don't blow the heap.
 *
 * `sampleRate` is a per-row keep probability. Pass 1 to keep everything.
 */
export async function loadCICIDSCsv(
  filePath: string,
  options: {
    sampleRate?: number;
    maxRows?: number;
    seed?: number;
  } = {},
): Promise<CICIDSRow[]> {
  const sampleRate = options.sampleRate ?? 1;
  const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY;
  const rng = mulberry32(options.seed ?? 1337);

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let header: string[] | null = null;
  let colIndex: Map<string, number> | null = null;
  let labelIdx = -1;
  const rows: CICIDSRow[] = [];

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;
    if (header === null) {
      // CIC headers sometimes have a UTF-8 BOM and per-column leading spaces.
      const cleaned = line.replace(/^﻿/, '');
      header = splitCsv(cleaned).map(c => c.trim());
      colIndex = buildColumnIndex(header);
      // Tolerate "Label", "label", "Class", "attack_label", etc. — any header
      // cell whose normalised key contains "label" or equals "class" wins.
      labelIdx = header.findIndex(c => {
        const k = normColumn(c);
        return k === 'label' || k === 'class' || k.endsWith('label');
      });
      if (labelIdx < 0) {
        throw new Error(`No Label column in ${filePath}`);
      }
      continue;
    }
    if (sampleRate < 1 && rng() > sampleRate) continue;
    const row = parseRow(splitCsv(line), colIndex!, labelIdx);
    if (row) rows.push(row);
    if (rows.length >= maxRows) break;
  }

  return rows;
}

/**
 * Compute min/max per feature from a fitted set. We use this scaler at
 * inference time too so test rows are normalised against training stats.
 */
export function fitScaler(rows: CICIDSRow[]): CICIDSScaler {
  const mins = new Array(CICIDS_FEATURE_LENGTH).fill(Number.POSITIVE_INFINITY);
  const maxs = new Array(CICIDS_FEATURE_LENGTH).fill(Number.NEGATIVE_INFINITY);
  for (const r of rows) {
    for (let i = 0; i < CICIDS_FEATURE_LENGTH; i++) {
      const v = r.values[i];
      if (v < mins[i]) mins[i] = v;
      if (v > maxs[i]) maxs[i] = v;
    }
  }
  for (let i = 0; i < CICIDS_FEATURE_LENGTH; i++) {
    if (!Number.isFinite(mins[i])) mins[i] = 0;
    if (!Number.isFinite(maxs[i])) maxs[i] = 0;
  }
  return { mins, maxs };
}

export function vectorise(row: CICIDSRow, scaler: CICIDSScaler): number[] {
  const v: number[] = new Array(CICIDS_FEATURE_LENGTH);
  for (let i = 0; i < CICIDS_FEATURE_LENGTH; i++) {
    const min = scaler.mins[i];
    const max = scaler.maxs[i];
    const span = max - min;
    v[i] = span > 0 ? (row.values[i] - min) / span : 0;
  }
  return v;
}

export interface CICIDSDataset {
  X: number[][];
  yBinary: number[];
  yClass: CICIDSAttackClass[];
  rawLabels: string[];
}

export function buildDataset(rows: CICIDSRow[], scaler: CICIDSScaler): CICIDSDataset {
  return {
    X: rows.map(r => vectorise(r, scaler)),
    yBinary: rows.map(r => r.binary),
    yClass: rows.map(r => classifyCICIDSLabel(r.label)),
    rawLabels: rows.map(r => r.label),
  };
}

/** Deterministic seeded RNG (mulberry32) for reproducible sampling. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
