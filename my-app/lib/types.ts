// Types for the AI-Based Intrusion Detection System

export interface NetworkPacket {
  id: string;
  timestamp: Date;
  sourceIP: string;
  destIP: string;
  sourcePort: number;
  destPort: number;
  protocol: 'TCP' | 'UDP' | 'ICMP' | 'HTTP' | 'HTTPS' | 'DNS' | 'SSH' | 'FTP';
  packetSize: number;
  flags?: string;
  payload?: string;
}

export interface NetworkFlow {
  id: string;
  duration: number;
  protocol: string;
  srcBytes: number;
  dstBytes: number;
  srcPackets: number;
  dstPackets: number;
  srcPort: number;
  dstPort: number;
  tcpFlags: string;
  flowStart: Date;
  flowEnd: Date;
}

export interface DetectionResult {
  id: string;
  timestamp: Date;
  packet: NetworkPacket;
  isAnomaly: boolean;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  attackType?: AttackType;
  confidence: number;
  detectionMethod: DetectionMethod;
  description: string;
  recommendations: string[];
}

export type AttackType = 
  | 'DoS'
  | 'DDoS'
  | 'Probe'
  | 'R2L'
  | 'U2R'
  | 'Brute Force'
  | 'Port Scan'
  | 'SQL Injection'
  | 'XSS'
  | 'Malware'
  | 'Botnet'
  | 'Man-in-the-Middle'
  | 'Unknown';

export type DetectionMethod = 
  | 'Isolation Forest'
  | 'Autoencoder'
  | 'K-Means Clustering'
  | 'Ensemble';

export interface MLModelMetrics {
  method: DetectionMethod;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  detectionTime: number; // in milliseconds
}

export interface SystemStats {
  totalPacketsAnalyzed: number;
  anomaliesDetected: number;
  falsePositives: number;
  truePositives: number;
  packetsPerSecond: number;
  cpuUsage: number;
  memoryUsage: number;
  uptime: number;
}

export interface Alert {
  id: string;
  timestamp: Date;
  severity: 'info' | 'warning' | 'danger' | 'critical';
  title: string;
  message: string;
  sourceIP: string;
  destIP: string;
  attackType: AttackType;
  status: 'new' | 'investigating' | 'resolved' | 'false-positive';
}

export interface DatasetInfo {
  name: string;
  description: string;
  totalSamples: number;
  features: number;
  attackTypes: string[];
  normalRatio: number;
  attackRatio: number;
}

export interface AnalysisRequest {
  packets: NetworkPacket[];
  method: DetectionMethod | 'all';
  threshold?: number;
}

export interface GeminiAnalysisRequest {
  detectionResults: DetectionResult[];
  systemContext: string;
}

export interface GeminiAnalysisResponse {
  summary: string;
  riskAssessment: string;
  recommendations: string[];
  predictedTrends: string;
  technicalDetails: string;
}

export interface ChartDataPoint {
  time: string;
  normal: number;
  anomaly: number;
  [key: string]: string | number;
}

export interface ThreatDistribution {
  name: string;
  value: number;
  color: string;
}
