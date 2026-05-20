import { NetworkPacket, Alert, DatasetInfo } from './types';
import { KddOverride } from './ml/packet-to-kdd';

const PROTOCOLS: NetworkPacket['protocol'][] = [
  'TCP',
  'UDP',
  'ICMP',
  'HTTP',
  'HTTPS',
  'DNS',
  'SSH',
  'FTP',
];

const NORMAL_FLAGS = ['SYN,ACK', 'ACK', 'FIN,ACK', 'PSH,ACK'];
const COMMON_PORTS = [80, 443, 22, 21, 25, 53, 110, 143, 993, 995, 3306, 5432, 27017, 6379];
const SUSPICIOUS_PORTS = [4444, 5555, 6666, 31337, 12345, 23, 3389];

const PUBLIC_PREFIXES = ['8.8.', '1.1.', '203.0.', '198.51.', '142.250.', '52.85.'];
const PRIVATE_PREFIXES = ['192.168.1.', '10.0.0.', '172.16.0.'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function publicIP(): string {
  const prefix = pick(PUBLIC_PREFIXES);
  return `${prefix}${Math.floor(Math.random() * 254 + 1)}.${Math.floor(Math.random() * 254 + 1)}`;
}

function privateIP(): string {
  return pick(PRIVATE_PREFIXES) + Math.floor(Math.random() * 254 + 1);
}

// Probability that a benign packet is a "noisy" one — slightly anomalous,
// keeps the dashboard from looking too sterile but doesn't trip the detector.
const NOISY_BENIGN_RATIO = 0.05;

export function generateNetworkPacket(): NetworkPacket {
  const noisy = Math.random() < NOISY_BENIGN_RATIO;

  // Most fields stay in the "normal" NSL-KDD distribution. We stamp a
  // matching kddOverride so the trained ensemble sees a benign flow.
  const protocol = noisy
    ? pick<NetworkPacket['protocol']>(['TCP', 'UDP', 'ICMP', 'HTTP'])
    : pick<NetworkPacket['protocol']>(['TCP', 'HTTP', 'HTTPS', 'DNS']);
  const destPort = pick(COMMON_PORTS);
  const sourcePort = Math.floor(Math.random() * 50000) + 1024;
  const packetSize = Math.floor(Math.random() * 1500) + 64;
  const flags = pick(NORMAL_FLAGS);

  const kdd: KddOverride = {
    duration: Math.floor(Math.random() * 5),
    src_bytes: packetSize,
    dst_bytes: Math.floor(Math.random() * 4000),
    logged_in: Math.random() < 0.6 ? 1 : 0,
    count: Math.floor(Math.random() * 3) + 1,
    srv_count: Math.floor(Math.random() * 3) + 1,
    same_srv_rate: 1,
    diff_srv_rate: 0,
    serror_rate: 0,
    srv_serror_rate: 0,
    rerror_rate: 0,
    srv_rerror_rate: 0,
    dst_host_count: Math.floor(Math.random() * 30) + 1,
    dst_host_srv_count: Math.floor(Math.random() * 30) + 1,
    dst_host_same_srv_rate: 1,
    dst_host_diff_srv_rate: 0,
    dst_host_same_src_port_rate: Math.random() * 0.2,
    label: 'normal',
  };

  return {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    sourceIP: publicIP(),
    destIP: privateIP(),
    sourcePort: noisy ? Math.floor(Math.random() * 1024) : sourcePort,
    destPort: noisy && Math.random() < 0.3 ? pick(SUSPICIOUS_PORTS) : destPort,
    protocol,
    packetSize,
    flags,
    kddOverride: kdd,
  };
}

export function generatePacketBatch(count: number): NetworkPacket[] {
  return Array(count)
    .fill(null)
    .map(() => generateNetworkPacket());
}

// =========================================================================
// Synthetic attack generators
//
// Each generator produces a packet plus a kddOverride that lands the flow
// inside the region of NSL-KDD feature space the trained ensemble flags as
// the corresponding attack class.
// =========================================================================

export type SyntheticAttackKind =
  | 'ddos'
  | 'portscan'
  | 'bruteforce'
  | 'webattack'
  | 'sqlinjection'
  | 'botnet'
  | 'infiltration';

export function generateSyntheticAttack(
  kind: SyntheticAttackKind,
  count: number
): NetworkPacket[] {
  switch (kind) {
    case 'ddos':
      return generateDDoSBatch(count);
    case 'portscan':
      return generatePortScanBatch(count);
    case 'bruteforce':
      return generateBruteForceBatch(count);
    case 'webattack':
      return generateWebAttackBatch(count);
    case 'sqlinjection':
      return generateSqlInjectionBatch(count);
    case 'botnet':
      return generateBotnetBatch(count);
    case 'infiltration':
      return generateInfiltrationBatch(count);
  }
}

/** DDoS / DoS — modelled after NSL-KDD `neptune` (SYN flood). */
function generateDDoSBatch(count: number): NetworkPacket[] {
  const target = privateIP();
  const targetPort = pick([80, 443, 25, 21]);
  return Array.from({ length: count }, () => {
    const kdd: KddOverride = {
      duration: 0,
      src_bytes: 0,
      dst_bytes: 0,
      flag: 'S0', // half-open SYN
      logged_in: 0,
      count: 250 + Math.floor(Math.random() * 250),
      srv_count: 250 + Math.floor(Math.random() * 250),
      serror_rate: 1,
      srv_serror_rate: 1,
      rerror_rate: 0,
      srv_rerror_rate: 0,
      same_srv_rate: 1,
      diff_srv_rate: 0,
      dst_host_count: 255,
      dst_host_srv_count: 255,
      dst_host_same_srv_rate: 1,
      dst_host_diff_srv_rate: 0,
      dst_host_serror_rate: 1,
      dst_host_srv_serror_rate: 1,
      label: 'neptune',
    };
    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      sourceIP: publicIP(),
      destIP: target,
      sourcePort: Math.floor(Math.random() * 64),
      destPort: targetPort,
      protocol: 'TCP',
      packetSize: 0,
      flags: 'SYN',
      kddOverride: kdd,
    };
  });
}

/** Port Scan — modelled after NSL-KDD `satan` / `ipsweep`. */
function generatePortScanBatch(count: number): NetworkPacket[] {
  const source = publicIP();
  const target = privateIP();
  return Array.from({ length: count }, (_, i) => {
    const destPort = (i * 7 + 21) % 1024;
    const kdd: KddOverride = {
      duration: 0,
      src_bytes: 0,
      dst_bytes: 0,
      flag: 'REJ',
      logged_in: 0,
      count: 60 + Math.floor(Math.random() * 60),
      srv_count: 1,
      serror_rate: 0,
      srv_serror_rate: 0,
      rerror_rate: 1,
      srv_rerror_rate: 1,
      same_srv_rate: 0.05,
      diff_srv_rate: 0.95,
      srv_diff_host_rate: 0.6,
      dst_host_count: 255,
      dst_host_srv_count: 1,
      dst_host_same_srv_rate: 0.05,
      dst_host_diff_srv_rate: 0.95,
      dst_host_rerror_rate: 1,
      dst_host_srv_rerror_rate: 1,
      label: 'satan',
    };
    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      sourceIP: source,
      destIP: target,
      sourcePort: Math.floor(Math.random() * 64),
      destPort,
      protocol: 'TCP',
      packetSize: 40,
      flags: 'SYN',
      kddOverride: kdd,
    };
  });
}

/** Brute Force — modelled after NSL-KDD `guess_passwd`. */
function generateBruteForceBatch(count: number): NetworkPacket[] {
  const source = publicIP();
  const target = privateIP();
  const targetPort = pick([22, 21, 23]);
  return Array.from({ length: count }, () => {
    const kdd: KddOverride = {
      duration: 1 + Math.floor(Math.random() * 5),
      src_bytes: 200 + Math.floor(Math.random() * 200),
      dst_bytes: 100 + Math.floor(Math.random() * 100),
      flag: 'SF',
      logged_in: 0,
      num_failed_logins: 4 + Math.floor(Math.random() * 5),
      is_guest_login: 1,
      count: 30 + Math.floor(Math.random() * 30),
      srv_count: 30 + Math.floor(Math.random() * 30),
      serror_rate: 0,
      srv_serror_rate: 0,
      rerror_rate: 0.1,
      same_srv_rate: 1,
      dst_host_count: 30 + Math.floor(Math.random() * 30),
      dst_host_srv_count: 30 + Math.floor(Math.random() * 30),
      dst_host_same_srv_rate: 1,
      label: 'guess_passwd',
    };
    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      sourceIP: source,
      destIP: target,
      sourcePort: Math.floor(Math.random() * 60000) + 1024,
      destPort: targetPort,
      protocol: targetPort === 22 ? 'SSH' : 'TCP',
      packetSize: 200 + Math.floor(Math.random() * 100),
      flags: 'PSH,ACK',
      kddOverride: kdd,
    };
  });
}

/**
 * Web Attack — XSS / injection-style malicious HTTP: oversized request
 * payloads, guest-login probing and a high rejected-request rate against a
 * web port (the rerror signature the ensemble flags hard).
 */
function generateWebAttackBatch(count: number): NetworkPacket[] {
  const source = publicIP();
  const target = privateIP();
  return Array.from({ length: count }, () => {
    const err = 0.7 + Math.random() * 0.3;
    const kdd: KddOverride = {
      duration: Math.floor(Math.random() * 4),
      src_bytes: 4000 + Math.floor(Math.random() * 8000),
      dst_bytes: 120 + Math.floor(Math.random() * 200),
      flag: 'SF',
      logged_in: 1,
      hot: 18 + Math.floor(Math.random() * 14),
      num_compromised: 2 + Math.floor(Math.random() * 5),
      num_access_files: 2 + Math.floor(Math.random() * 4),
      num_failed_logins: 4 + Math.floor(Math.random() * 6),
      is_guest_login: 1,
      count: 150 + Math.floor(Math.random() * 150),
      srv_count: 150 + Math.floor(Math.random() * 150),
      rerror_rate: err,
      srv_rerror_rate: err,
      same_srv_rate: 1,
      diff_srv_rate: 0,
      dst_host_count: 255,
      dst_host_srv_count: 255,
      dst_host_same_srv_rate: 1,
      dst_host_rerror_rate: err,
      dst_host_srv_rerror_rate: err,
      label: 'phf',
    };
    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      sourceIP: source,
      destIP: target,
      sourcePort: Math.floor(Math.random() * 60000) + 1024,
      destPort: pick([80, 443, 8080]),
      protocol: 'HTTP',
      packetSize: 1400 + Math.floor(Math.random() * 200),
      flags: 'PSH,ACK',
      kddOverride: kdd,
      attackLabel: 'Web Attack',
    };
  });
}

/** SQL Injection — oversized database-payload requests against a web port. */
function generateSqlInjectionBatch(count: number): NetworkPacket[] {
  const source = publicIP();
  const target = privateIP();
  return Array.from({ length: count }, () => {
    const err = 0.6 + Math.random() * 0.4;
    const kdd: KddOverride = {
      duration: Math.floor(Math.random() * 4),
      src_bytes: 6000 + Math.floor(Math.random() * 10000),
      dst_bytes: 100 + Math.floor(Math.random() * 200),
      flag: 'SF',
      logged_in: 1,
      hot: 20 + Math.floor(Math.random() * 14),
      num_compromised: 3 + Math.floor(Math.random() * 5),
      num_file_creations: 1 + Math.floor(Math.random() * 3),
      num_access_files: 2 + Math.floor(Math.random() * 4),
      num_failed_logins: 4 + Math.floor(Math.random() * 6),
      is_guest_login: 1,
      count: 130 + Math.floor(Math.random() * 130),
      srv_count: 130 + Math.floor(Math.random() * 130),
      rerror_rate: err,
      srv_rerror_rate: err,
      same_srv_rate: 1,
      diff_srv_rate: 0,
      dst_host_count: 255,
      dst_host_srv_count: 255,
      dst_host_same_srv_rate: 1,
      dst_host_rerror_rate: err,
      dst_host_srv_rerror_rate: err,
      label: 'phf',
    };
    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      sourceIP: source,
      destIP: target,
      sourcePort: Math.floor(Math.random() * 60000) + 1024,
      destPort: pick([80, 443]),
      protocol: 'HTTP',
      packetSize: 1500,
      flags: 'PSH,ACK',
      kddOverride: kdd,
      attackLabel: 'SQL Injection',
    };
  });
}

/**
 * Botnet — command-and-control beaconing: a flood of half-open connections to
 * an unusual port (the SYN-failure signature the ensemble flags hardest).
 */
function generateBotnetBatch(count: number): NetworkPacket[] {
  const target = privateIP();
  const c2Port = pick([6667, 4444, 8443, 1337]);
  return Array.from({ length: count }, () => {
    const err = 0.85 + Math.random() * 0.15;
    const kdd: KddOverride = {
      duration: Math.floor(Math.random() * 2),
      src_bytes: 40 + Math.floor(Math.random() * 200),
      dst_bytes: 0,
      flag: 'S0',
      logged_in: 0,
      count: 300 + Math.floor(Math.random() * 200),
      srv_count: 300 + Math.floor(Math.random() * 200),
      serror_rate: err,
      srv_serror_rate: err,
      rerror_rate: 0,
      srv_rerror_rate: 0,
      same_srv_rate: 1,
      diff_srv_rate: 0,
      srv_diff_host_rate: 0.8,
      dst_host_count: 255,
      dst_host_srv_count: 255,
      dst_host_same_srv_rate: 1,
      dst_host_same_src_port_rate: 1,
      dst_host_serror_rate: err,
      dst_host_srv_serror_rate: err,
      label: 'neptune',
    };
    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      sourceIP: publicIP(),
      destIP: target,
      sourcePort: Math.floor(Math.random() * 64),
      destPort: c2Port,
      protocol: 'TCP',
      packetSize: 40 + Math.floor(Math.random() * 200),
      flags: 'SYN',
      kddOverride: kdd,
      attackLabel: 'Botnet',
    };
  });
}

/**
 * Infiltration — internal host compromise / privilege escalation: the U2R
 * signature (root shell, su attempts, file creation) plus failed-login
 * probing and a raised error rate.
 */
function generateInfiltrationBatch(count: number): NetworkPacket[] {
  const source = publicIP();
  const target = privateIP();
  return Array.from({ length: count }, () => {
    const err = 0.4 + Math.random() * 0.4;
    const kdd: KddOverride = {
      duration: 20 + Math.floor(Math.random() * 400),
      src_bytes: 300 + Math.floor(Math.random() * 800),
      dst_bytes: 2000 + Math.floor(Math.random() * 8000),
      flag: 'SF',
      logged_in: 1,
      hot: 24 + Math.floor(Math.random() * 16),
      num_compromised: 6 + Math.floor(Math.random() * 12),
      root_shell: 1,
      su_attempted: 1,
      num_root: 6 + Math.floor(Math.random() * 10),
      num_file_creations: 5 + Math.floor(Math.random() * 10),
      num_shells: 1 + Math.floor(Math.random() * 3),
      num_access_files: 3 + Math.floor(Math.random() * 5),
      num_failed_logins: 3 + Math.floor(Math.random() * 5),
      is_guest_login: 1,
      count: 60 + Math.floor(Math.random() * 80),
      srv_count: 60 + Math.floor(Math.random() * 80),
      rerror_rate: err,
      srv_rerror_rate: err,
      same_srv_rate: 1,
      dst_host_count: 200 + Math.floor(Math.random() * 55),
      dst_host_srv_count: 200 + Math.floor(Math.random() * 55),
      dst_host_same_srv_rate: 1,
      dst_host_rerror_rate: err,
      label: 'rootkit',
    };
    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      sourceIP: source,
      destIP: target,
      sourcePort: Math.floor(Math.random() * 60000) + 1024,
      destPort: pick([22, 445, 3389]),
      protocol: 'TCP',
      packetSize: 300 + Math.floor(Math.random() * 400),
      flags: 'PSH,ACK',
      kddOverride: kdd,
      attackLabel: 'Infiltration',
    };
  });
}

// =========================================================================
// Mock alerts (kept for the AlertsPanel demo before any detection runs)
// =========================================================================

export function generateAlert(isNew = true): Alert {
  const severities: Alert['severity'][] = ['info', 'warning', 'danger', 'critical'];
  const attackTypes: Alert['attackType'][] = [
    'DoS',
    'DDoS',
    'Probe',
    'Brute Force',
    'Port Scan',
    'SQL Injection',
  ];
  const statuses: Alert['status'][] = isNew
    ? ['new']
    : ['new', 'investigating', 'resolved', 'false-positive'];

  const attackType = pick(attackTypes);
  const severity = pick(severities);
  return {
    id: crypto.randomUUID(),
    timestamp: new Date(Date.now() - Math.random() * 3600000),
    severity,
    title: `${attackType} attack detected`,
    message: `Suspicious ${attackType} pattern from public source.`,
    sourceIP: publicIP(),
    destIP: privateIP(),
    attackType,
    status: pick(statuses),
  };
}

// =========================================================================
// Static dataset descriptions (referenced from the Datasets tab)
// =========================================================================

export const datasets: DatasetInfo[] = [
  {
    name: 'NSL-KDD',
    description:
      'Improved KDD Cup 99 with redundant records removed. 41 features per labelled connection. The system is trained on KDDTrain+ and evaluated on KDDTest+.',
    totalSamples: 148517,
    features: 41,
    attackTypes: ['DoS', 'Probe', 'R2L', 'U2R'],
    normalRatio: 0.534,
    attackRatio: 0.466,
  },
  {
    name: 'CICIDS 2017',
    description:
      'Modern IDS dataset capturing benign and attack traffic with 80+ flow features (CICFlowMeter).',
    totalSamples: 2830743,
    features: 83,
    attackTypes: ['Brute Force', 'DoS', 'DDoS', 'Web Attack', 'Infiltration', 'Botnet', 'Port Scan'],
    normalRatio: 0.83,
    attackRatio: 0.17,
  },
  {
    name: 'CICIDS 2018',
    description:
      'Updated CICIDS with additional sophisticated DDoS and infiltration scenarios.',
    totalSamples: 16233002,
    features: 80,
    attackTypes: [
      'Brute Force',
      'DoS',
      'DDoS',
      'Web Attack',
      'Botnet',
      'Infiltration',
      'SQL Injection',
    ],
    normalRatio: 0.831,
    attackRatio: 0.169,
  },
];

// =========================================================================
// Display helpers
// =========================================================================

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function getThreatColor(level: string): string {
  const colors: Record<string, string> = {
    low: '#22c55e',
    medium: '#f59e0b',
    high: '#ef4444',
    critical: '#dc2626',
  };
  return colors[level] || '#6b7280';
}

export function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    info: '#3b82f6',
    warning: '#f59e0b',
    danger: '#ef4444',
    critical: '#7c3aed',
  };
  return colors[severity] || '#6b7280';
}
