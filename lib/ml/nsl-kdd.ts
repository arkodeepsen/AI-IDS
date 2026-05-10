/**
 * NSL-KDD dataset loader and feature engineering.
 *
 * NSL-KDD (https://www.unb.ca/cic/datasets/nsl.html) is the de-facto IDS
 * benchmark. Each row is a connection record with 41 features + label.
 * We turn each row into a numeric feature vector that's one-hot encoded for
 * the three categorical fields (protocol_type, service, flag) and normalised
 * for the rest.
 *
 * The same feature pipeline is used at inference time so the trained models
 * see the exact same shape as during training.
 */

export const PROTOCOL_TYPES = ['tcp', 'udp', 'icmp'] as const;
export type ProtocolType = (typeof PROTOCOL_TYPES)[number];

// Top-20 services from KDDTrain+ — covers ~93 % of rows. Anything else is bucketed as 'other'.
export const SERVICES = [
  'http',
  'private',
  'domain_u',
  'smtp',
  'ftp_data',
  'eco_i',
  'other',
  'ecr_i',
  'telnet',
  'finger',
  'ftp',
  'auth',
  'Z39_50',
  'uucp',
  'whois',
  'courier',
  'csnet_ns',
  'ctf',
  'daytime',
  'discard',
] as const;

export const FLAGS = [
  'SF',
  'S0',
  'REJ',
  'RSTR',
  'S1',
  'S2',
  'S3',
  'RSTO',
  'RSTOS0',
  'OTH',
  'SH',
] as const;

// Standard NSL-KDD attack-class mapping.
const DOS_ATTACKS = new Set([
  'neptune',
  'smurf',
  'back',
  'teardrop',
  'pod',
  'land',
  'apache2',
  'udpstorm',
  'processtable',
  'worm',
  'mailbomb',
]);
const PROBE_ATTACKS = new Set(['satan', 'ipsweep', 'portsweep', 'nmap', 'mscan', 'saint']);
const R2L_ATTACKS = new Set([
  'warezclient',
  'guess_passwd',
  'warezmaster',
  'imap',
  'ftp_write',
  'multihop',
  'phf',
  'spy',
  'sendmail',
  'named',
  'snmpgetattack',
  'snmpguess',
  'xlock',
  'xsnoop',
  'httptunnel',
]);
const U2R_ATTACKS = new Set([
  'buffer_overflow',
  'rootkit',
  'loadmodule',
  'perl',
  'sqlattack',
  'xterm',
  'ps',
]);

export type AttackClass = 'normal' | 'DoS' | 'Probe' | 'R2L' | 'U2R';

export function classifyLabel(label: string): AttackClass {
  if (label === 'normal') return 'normal';
  if (DOS_ATTACKS.has(label)) return 'DoS';
  if (PROBE_ATTACKS.has(label)) return 'Probe';
  if (R2L_ATTACKS.has(label)) return 'R2L';
  if (U2R_ATTACKS.has(label)) return 'U2R';
  return 'DoS'; // unknown labels default to DoS — most-common fallback
}

/** A single parsed NSL-KDD row before vectorisation. */
export interface KDDRow {
  duration: number;
  protocol_type: string;
  service: string;
  flag: string;
  src_bytes: number;
  dst_bytes: number;
  land: number;
  wrong_fragment: number;
  urgent: number;
  hot: number;
  num_failed_logins: number;
  logged_in: number;
  num_compromised: number;
  root_shell: number;
  su_attempted: number;
  num_root: number;
  num_file_creations: number;
  num_shells: number;
  num_access_files: number;
  num_outbound_cmds: number;
  is_host_login: number;
  is_guest_login: number;
  count: number;
  srv_count: number;
  serror_rate: number;
  srv_serror_rate: number;
  rerror_rate: number;
  srv_rerror_rate: number;
  same_srv_rate: number;
  diff_srv_rate: number;
  srv_diff_host_rate: number;
  dst_host_count: number;
  dst_host_srv_count: number;
  dst_host_same_srv_rate: number;
  dst_host_diff_srv_rate: number;
  dst_host_same_src_port_rate: number;
  dst_host_srv_diff_host_rate: number;
  dst_host_serror_rate: number;
  dst_host_srv_serror_rate: number;
  dst_host_rerror_rate: number;
  dst_host_srv_rerror_rate: number;
  label: string;
}

const COL_NAMES: Array<keyof KDDRow> = [
  'duration',
  'protocol_type',
  'service',
  'flag',
  'src_bytes',
  'dst_bytes',
  'land',
  'wrong_fragment',
  'urgent',
  'hot',
  'num_failed_logins',
  'logged_in',
  'num_compromised',
  'root_shell',
  'su_attempted',
  'num_root',
  'num_file_creations',
  'num_shells',
  'num_access_files',
  'num_outbound_cmds',
  'is_host_login',
  'is_guest_login',
  'count',
  'srv_count',
  'serror_rate',
  'srv_serror_rate',
  'rerror_rate',
  'srv_rerror_rate',
  'same_srv_rate',
  'diff_srv_rate',
  'srv_diff_host_rate',
  'dst_host_count',
  'dst_host_srv_count',
  'dst_host_same_srv_rate',
  'dst_host_diff_srv_rate',
  'dst_host_same_src_port_rate',
  'dst_host_srv_diff_host_rate',
  'dst_host_serror_rate',
  'dst_host_srv_serror_rate',
  'dst_host_rerror_rate',
  'dst_host_srv_rerror_rate',
  'label',
];

const NUMERIC_COLS: Array<keyof KDDRow> = COL_NAMES.filter(
  c => c !== 'protocol_type' && c !== 'service' && c !== 'flag' && c !== 'label'
) as Array<keyof KDDRow>;

export function parseKDDRow(line: string): KDDRow | null {
  const parts = line.split(',');
  if (parts.length < 42) return null;

  const row: Record<string, number | string> = {};
  for (let i = 0; i < COL_NAMES.length; i++) {
    const col = COL_NAMES[i];
    const raw = parts[i];
    if (col === 'protocol_type' || col === 'service' || col === 'flag' || col === 'label') {
      row[col] = raw;
    } else {
      row[col] = parseFloat(raw);
    }
  }
  return row as unknown as KDDRow;
}

/** Stats used for min-max normalisation; computed once on the training set. */
export interface FeatureScaler {
  numericMins: Record<string, number>;
  numericMaxs: Record<string, number>;
}

export function fitScaler(rows: KDDRow[]): FeatureScaler {
  const numericMins: Record<string, number> = {};
  const numericMaxs: Record<string, number> = {};
  for (const col of NUMERIC_COLS) {
    let min = Infinity;
    let max = -Infinity;
    for (const r of rows) {
      const v = r[col] as number;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    numericMins[col] = min;
    numericMaxs[col] = max;
  }
  return { numericMins, numericMaxs };
}

/** Total feature length (cached for performance). */
export const FEATURE_LENGTH =
  PROTOCOL_TYPES.length + SERVICES.length + FLAGS.length + NUMERIC_COLS.length;

/** Convert a parsed KDD row into a numeric vector that the ML models consume. */
export function vectorise(row: KDDRow, scaler: FeatureScaler): number[] {
  const v: number[] = new Array(FEATURE_LENGTH).fill(0);
  let i = 0;

  // protocol one-hot
  const pIdx = PROTOCOL_TYPES.indexOf(row.protocol_type as ProtocolType);
  if (pIdx >= 0) v[i + pIdx] = 1;
  i += PROTOCOL_TYPES.length;

  // service one-hot (with 'other' fallback)
  const sIdx = SERVICES.indexOf(row.service as (typeof SERVICES)[number]);
  if (sIdx >= 0) v[i + sIdx] = 1;
  else v[i + SERVICES.indexOf('other')] = 1;
  i += SERVICES.length;

  // flag one-hot
  const fIdx = FLAGS.indexOf(row.flag as (typeof FLAGS)[number]);
  if (fIdx >= 0) v[i + fIdx] = 1;
  i += FLAGS.length;

  // numeric features, min-max normalised
  for (const col of NUMERIC_COLS) {
    const raw = row[col] as number;
    const min = scaler.numericMins[col] ?? 0;
    const max = scaler.numericMaxs[col] ?? 1;
    const span = max - min;
    v[i] = span > 0 ? (raw - min) / span : 0;
    i++;
  }

  return v;
}

export interface ParsedDataset {
  X: number[][];
  yBinary: number[]; // 1 = attack, 0 = normal
  yClass: AttackClass[];
  rawLabels: string[];
}

export function loadCsvText(text: string, scaler: FeatureScaler | null): {
  rows: KDDRow[];
  vectors: number[][];
  scaler: FeatureScaler;
} {
  const rows: KDDRow[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const r = parseKDDRow(line);
    if (r) rows.push(r);
  }
  const finalScaler = scaler ?? fitScaler(rows);
  const vectors = rows.map(r => vectorise(r, finalScaler));
  return { rows, vectors, scaler: finalScaler };
}

export function buildDataset(rows: KDDRow[], vectors: number[][]): ParsedDataset {
  const yBinary = rows.map(r => (r.label === 'normal' ? 0 : 1));
  const yClass = rows.map(r => classifyLabel(r.label));
  return {
    X: vectors,
    yBinary,
    yClass,
    rawLabels: rows.map(r => r.label),
  };
}

export const NUMERIC_FEATURE_NAMES: ReadonlyArray<keyof KDDRow> = NUMERIC_COLS;
