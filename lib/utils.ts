import { NetworkPacket, Alert, DatasetInfo } from './types';

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
const SUSPICIOUS_FLAGS = ['SYN', 'FIN', 'RST', 'SYN,FIN', 'URG,PSH'];
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

function generateIP(suspicious: boolean): string {
  if (suspicious && Math.random() < 0.6) {
    return publicIP(); // attackers tend to be external
  }
  return Math.random() < 0.5 ? privateIP() : publicIP();
}

function getRandomPort(suspicious: boolean): number {
  if (suspicious && Math.random() < 0.4) {
    return pick(SUSPICIOUS_PORTS);
  }
  return pick(COMMON_PORTS);
}

function generateFlags(suspicious: boolean): string {
  if (suspicious && Math.random() < 0.5) {
    return pick(SUSPICIOUS_FLAGS);
  }
  return pick(NORMAL_FLAGS);
}

export function generateNetworkPacket(): NetworkPacket {
  const isSuspicious = Math.random() < 0.18;
  return {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    sourceIP: generateIP(isSuspicious),
    destIP: privateIP(),
    sourcePort: isSuspicious
      ? Math.floor(Math.random() * 1024)
      : Math.floor(Math.random() * 50000) + 1024,
    destPort: getRandomPort(isSuspicious),
    protocol: PROTOCOLS[Math.floor(Math.random() * (isSuspicious ? PROTOCOLS.length : 4))],
    packetSize: isSuspicious
      ? Math.floor(Math.random() * 60000) + 5000
      : Math.floor(Math.random() * 1500) + 64,
    flags: generateFlags(isSuspicious),
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
// These produce packet patterns biased toward each attack archetype so that
// the ensemble surfaces them as anomalies. Used by the "Generate Attack"
// dashboard button to give the demo a dramatic on-cue moment.
// =========================================================================

export type SyntheticAttackKind = 'ddos' | 'portscan' | 'bruteforce';

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
  }
}

// The flag scoring in features.ts treats SYN=1, ACK=2, FIN=4, RST=8, PSH=16,
// URG=32 normalised to /63 — so URG and PSH carry the highest weight. The
// generators below pick flag combinations that produce HIGH normalised flag
// scores so the trained models recognise them as the suspicious class.

function generateDDoSBatch(count: number): NetworkPacket[] {
  const target = privateIP();
  const targetPort = pick([80, 443, 8080, 53]);
  return Array.from({ length: count }, () => ({
    id: crypto.randomUUID(),
    timestamp: new Date(),
    sourceIP: publicIP(),
    destIP: target,
    sourcePort: Math.floor(Math.random() * 64),
    destPort: targetPort,
    protocol: pick<NetworkPacket['protocol']>(['ICMP', 'ICMP', 'UDP']),
    packetSize: 50000 + Math.floor(Math.random() * 15000),
    flags: 'URG,PSH', // 48/63 — high
  }));
}

function generatePortScanBatch(count: number): NetworkPacket[] {
  const source = publicIP();
  const target = privateIP();
  return Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(),
    timestamp: new Date(),
    sourceIP: source,
    destIP: target,
    sourcePort: Math.floor(Math.random() * 64),
    // Stay within port 1-1024 to match the trained probe/portscan pattern.
    destPort: 1 + (i * 7) % 1024,
    protocol: 'TCP',
    packetSize: 40 + Math.floor(Math.random() * 24),
    flags: pick(['URG,PSH', 'URG', 'PSH']), // high flag scores
  }));
}

function generateBruteForceBatch(count: number): NetworkPacket[] {
  const source = publicIP();
  const target = privateIP();
  const targetPort = pick([22, 3389]);
  return Array.from({ length: count }, () => ({
    id: crypto.randomUUID(),
    timestamp: new Date(),
    sourceIP: source,
    destIP: target,
    sourcePort: Math.floor(Math.random() * 64),
    destPort: targetPort,
    protocol: targetPort === 22 ? 'SSH' : 'TCP',
    packetSize: 180 + Math.floor(Math.random() * 80),
    flags: 'URG,PSH',
  }));
}

// =========================================================================
// Mock alerts (used for dashboard demos before a real run is triggered)
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
    sourceIP: generateIP(true),
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
      'Improved KDD Cup 99 with redundant records removed. 41 features per labelled connection.',
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
