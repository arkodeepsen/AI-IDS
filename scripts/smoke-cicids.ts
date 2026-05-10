/**
 * Quick smoke test for the CICIDS loader.
 *
 * Synthesises a tiny in-memory CSV exercising the three known CIC quirks
 * (Infinity / NaN values, repeated mid-file headers, C1-byte web-attack
 * labels), runs it through the same loader the trainer uses, and checks the
 * resulting rows + scaler + dataset shape.
 *
 * Run with: `npx tsx scripts/smoke-cicids.ts`
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadCICIDSCsv,
  fitScaler,
  buildDataset,
  classifyCICIDSLabel,
  CICIDS_FEATURE_LENGTH,
  CICIDS_NUMERIC_COLS,
} from '../lib/ml/cicids';

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error(`FAIL  ${msg}`);
    process.exit(1);
  }
  console.log(`PASS  ${msg}`);
}

async function main() {
  // Synthesise: header line + 5 rows (one benign, one DoS Hulk, one with
  // Infinity, one Web Attack with U+0096 byte, one mid-file header repeat).
  const header = [...CICIDS_NUMERIC_COLS, 'Label'].join(',');
  const zeros = new Array(CICIDS_FEATURE_LENGTH).fill('0').join(',');

  // Build a row with a few meaningful values so the scaler has range.
  const benign = (() => {
    const fields = new Array(CICIDS_FEATURE_LENGTH).fill('0');
    fields[0] = '80'; // Destination Port
    fields[1] = '1000'; // Flow Duration
    fields[2] = '5'; // Total Fwd Packets
    return fields.join(',') + ',BENIGN';
  })();

  const dosHulk = (() => {
    const fields = new Array(CICIDS_FEATURE_LENGTH).fill('0');
    fields[0] = '80';
    fields[1] = '500';
    fields[2] = '100';
    return fields.join(',') + ',DoS Hulk';
  })();

  // Infinity in Flow Bytes/s (idx 14) — should clamp to 1e12.
  const inf = (() => {
    const fields = new Array(CICIDS_FEATURE_LENGTH).fill('0');
    fields[0] = '443';
    fields[14] = 'Infinity';
    return fields.join(',') + ',DDoS';
  })();

  // Web Attack with the C1 control byte CIC uses.
  const webAttackLabel = 'Web Attack  Brute Force';
  const webAttack = (() => {
    const fields = new Array(CICIDS_FEATURE_LENGTH).fill('0');
    fields[0] = '80';
    return fields.join(',') + ',' + webAttackLabel;
  })();

  const csv = [
    header,
    benign,
    dosHulk,
    inf,
    webAttack,
    header, // mid-file header repeat — should be skipped
    zeros + ',BENIGN',
  ].join('\n');

  const tmpPath = path.join(os.tmpdir(), `cicids-smoke-${Date.now()}.csv`);
  fs.writeFileSync(tmpPath, csv);

  const rows = await loadCICIDSCsv(tmpPath);
  fs.unlinkSync(tmpPath);

  assert(rows.length === 5, `loaded 5 data rows (got ${rows.length})`);
  assert(rows[0].label === 'BENIGN' && rows[0].binary === 0, 'benign row classified as normal');
  assert(rows[1].label === 'DoS Hulk' && rows[1].binary === 1, 'DoS Hulk classified as attack');
  assert(rows[2].values[14] === 1e12, `Infinity clamped to 1e12 (got ${rows[2].values[14]})`);

  const klass = classifyCICIDSLabel(webAttackLabel);
  assert(klass === 'WebAttack', `web-attack with C1 byte → WebAttack (got ${klass})`);

  const scaler = fitScaler(rows);
  assert(scaler.mins.length === CICIDS_FEATURE_LENGTH, 'scaler has 78 mins');
  assert(scaler.maxs[0] === 443, `scaler max for Destination Port is 443 (got ${scaler.maxs[0]})`);

  const ds = buildDataset(rows, scaler);
  assert(ds.X.length === 5 && ds.X[0].length === CICIDS_FEATURE_LENGTH, 'dataset shape 5 x 78');
  assert(
    ds.X[0].every(v => v >= 0 && v <= 1),
    'all normalised values in [0,1]',
  );
  assert(
    ds.yClass.includes('WebAttack') && ds.yClass.includes('DoS'),
    'dataset contains WebAttack + DoS families',
  );

  console.log('\nAll CICIDS smoke checks passed.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
