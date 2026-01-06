import { NetworkPacket, Alert, DatasetInfo } from './types';

/**
 * Generate simulated network traffic for demonstration
 */
export function generateNetworkPacket(): NetworkPacket {
  const protocols: NetworkPacket['protocol'][] = ['TCP', 'UDP', 'ICMP', 'HTTP', 'HTTPS', 'DNS', 'SSH', 'FTP'];
  const isAnomaly = Math.random() < 0.15; // 15% chance of anomaly
  
  const basePacket: NetworkPacket = {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    sourceIP: generateIP(isAnomaly),
    destIP: generateIP(false),
    sourcePort: isAnomaly ? Math.floor(Math.random() * 1024) : Math.floor(Math.random() * 50000) + 1024,
    destPort: getRandomPort(isAnomaly),
    protocol: protocols[Math.floor(Math.random() * (isAnomaly ? protocols.length : 4))],
    packetSize: isAnomaly ? Math.floor(Math.random() * 60000) + 5000 : Math.floor(Math.random() * 1500) + 64,
    flags: generateFlags(isAnomaly),
  };

  return basePacket;
}

function generateIP(suspicious: boolean): string {
  if (suspicious && Math.random() < 0.5) {
    // Known malicious IP ranges (example)
    const maliciousRanges = [
      '192.168.1.',
      '10.0.0.',
      '172.16.0.',
    ];
    const range = maliciousRanges[Math.floor(Math.random() * maliciousRanges.length)];
    return range + Math.floor(Math.random() * 256);
  }
  return `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
}

function getRandomPort(suspicious: boolean): number {
  const commonPorts = [80, 443, 22, 21, 25, 53, 110, 143, 993, 995, 3306, 5432, 27017, 6379];
  const suspiciousPorts = [4444, 5555, 6666, 31337, 12345, 23, 3389];
  
  if (suspicious && Math.random() < 0.3) {
    return suspiciousPorts[Math.floor(Math.random() * suspiciousPorts.length)];
  }
  return commonPorts[Math.floor(Math.random() * commonPorts.length)];
}

function generateFlags(suspicious: boolean): string {
  const normalFlags = ['SYN,ACK', 'ACK', 'FIN,ACK', 'PSH,ACK'];
  const suspiciousFlags = ['SYN', 'FIN', 'RST', 'SYN,FIN', 'URG,PSH'];
  
  if (suspicious && Math.random() < 0.4) {
    return suspiciousFlags[Math.floor(Math.random() * suspiciousFlags.length)];
  }
  return normalFlags[Math.floor(Math.random() * normalFlags.length)];
}

/**
 * Generate batch of network packets
 */
export function generatePacketBatch(count: number): NetworkPacket[] {
  return Array(count).fill(null).map(() => generateNetworkPacket());
}

/**
 * Generate mock alert
 */
export function generateAlert(isNew: boolean = true): Alert {
  const severities: Alert['severity'][] = ['info', 'warning', 'danger', 'critical'];
  const attackTypes: Alert['attackType'][] = ['DoS', 'DDoS', 'Probe', 'Brute Force', 'Port Scan', 'SQL Injection'];
  const statuses: Alert['status'][] = isNew ? ['new'] : ['new', 'investigating', 'resolved', 'false-positive'];
  
  const attackType = attackTypes[Math.floor(Math.random() * attackTypes.length)];
  const severity = severities[Math.floor(Math.random() * severities.length)];
  
  return {
    id: crypto.randomUUID(),
    timestamp: new Date(Date.now() - Math.random() * 3600000),
    severity,
    title: `${attackType} Attack Detected`,
    message: `Potential ${attackType} attack detected from suspicious source.`,
    sourceIP: generateIP(true),
    destIP: generateIP(false),
    attackType,
    status: statuses[Math.floor(Math.random() * statuses.length)],
  };
}

/**
 * Dataset information for NSL-KDD and CICIDS
 */
export const datasets: DatasetInfo[] = [
  {
    name: 'NSL-KDD',
    description: 'An improved version of KDD Cup 99 dataset, removing redundant records to prevent classifier bias. Contains labeled network connections with 41 features.',
    totalSamples: 148517,
    features: 41,
    attackTypes: ['DoS', 'Probe', 'R2L', 'U2R'],
    normalRatio: 0.534,
    attackRatio: 0.466,
  },
  {
    name: 'CICIDS 2017',
    description: 'Modern intrusion detection dataset containing benign and up-to-date common attacks. Captures network traffic with over 80 features extracted using CICFlowMeter.',
    totalSamples: 2830743,
    features: 83,
    attackTypes: ['Brute Force', 'DoS', 'DDoS', 'Web Attack', 'Infiltration', 'Botnet', 'Port Scan'],
    normalRatio: 0.830,
    attackRatio: 0.170,
  },
  {
    name: 'CICIDS 2018',
    description: 'Updated version with additional attack scenarios including more sophisticated DDoS attacks and infiltration techniques.',
    totalSamples: 16233002,
    features: 80,
    attackTypes: ['Brute Force', 'DoS', 'DDoS', 'Web Attack', 'Botnet', 'Infiltration', 'SQL Injection'],
    normalRatio: 0.831,
    attackRatio: 0.169,
  },
];

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format timestamp
 */
export function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Get threat level color
 */
export function getThreatColor(level: string): string {
  const colors: Record<string, string> = {
    low: '#22c55e',
    medium: '#f59e0b',
    high: '#ef4444',
    critical: '#dc2626',
  };
  return colors[level] || '#6b7280';
}

/**
 * Get severity color for alerts
 */
export function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    info: '#3b82f6',
    warning: '#f59e0b',
    danger: '#ef4444',
    critical: '#7c3aed',
  };
  return colors[severity] || '#6b7280';
}
