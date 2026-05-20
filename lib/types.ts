/**
 * Shared types for the AI-Based Intrusion Detection System.
 */

// ==========================================================================
// Network
// ==========================================================================

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
  /** Ground-truth attack type stamped by the synthetic attack generators so
   *  demo attacks are labelled precisely. Real/benign traffic leaves it unset. */
  attackLabel?: AttackType;
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

// ==========================================================================
// Detection
// ==========================================================================

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
  modelScores?: {
    isolationForest: number;
    autoencoder: number;
    randomForest: number;
    xgboost: number;
  };
  ipEntropy?: {
    source: number;
    destination: number;
    sourceFanout: number;
  };
  autoResponseAction?: 'blocked' | 'alerted' | 'monitored' | 'ignored';
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
  | 'Web Attack'
  | 'Infiltration'
  | 'Man-in-the-Middle'
  | 'Unknown';

export type DetectionMethod =
  | 'Isolation Forest'
  | 'Autoencoder'
  | 'Random Forest'
  | 'XGBoost'
  | 'Ensemble';

// ==========================================================================
// ML
// ==========================================================================

export interface MLModelMetrics {
  method: DetectionMethod;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  detectionTime: number;
}

export interface ModelWeights {
  isolationForest: number;
  autoencoder: number;
  randomForest: number;
  xgboost: number;
}

// ==========================================================================
// System
// ==========================================================================

export interface SystemStats {
  totalPacketsAnalyzed: number;
  anomaliesDetected: number;
  falsePositives: number;
  truePositives: number;
  packetsPerSecond: number;
  cpuUsage: number;
  memoryUsage: number;
  uptime: number;
  blockedIPs: number;
  modelVersion: number;
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
  autoBlocked?: boolean;
}

// ==========================================================================
// Datasets
// ==========================================================================

export interface DatasetInfo {
  name: string;
  description: string;
  totalSamples: number;
  features: number;
  attackTypes: string[];
  normalRatio: number;
  attackRatio: number;
}

// ==========================================================================
// API
// ==========================================================================

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

// ==========================================================================
// Charts
// ==========================================================================

export interface ChartDataPoint {
  time: string;
  normal: number;
  anomaly: number;
  blocked?: number;
  [key: string]: string | number | undefined;
}

export interface ThreatDistribution {
  name: string;
  value: number;
  color: string;
}

// ==========================================================================
// Active Learning (HITL)
// ==========================================================================

export interface RLHFFeedbackSubmission {
  detectionId: string;
  isCorrect: boolean;
  correctLabel?: 'normal' | 'anomaly';
  correctAttackType?: AttackType;
  notes?: string;
}

// ==========================================================================
// Auto-Response
// ==========================================================================

export interface AutoResponseSettings {
  enabled: boolean;
  threatThreshold: number;
  autoBlockDuration: number;
  blockOnCritical: boolean;
  blockOnHigh: boolean;
  blockOnMedium: boolean;
}

// ==========================================================================
// Training
// ==========================================================================

export interface TrainingStatus {
  enabled: boolean;
  totalSamples: number;
  lastTrainingTime: Date | null;
  modelVersion: number;
  pendingRetraining: boolean;
}
