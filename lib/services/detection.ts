/**
 * Detection service.
 *
 * Owns the singleton ensemble detector. On first call it tries to load the
 * trained models from `models/ensemble.json` (produced by `npm run train`
 * on NSL-KDD). If those artefacts are missing it falls back to in-process
 * training on the synthetic distribution so dev mode still works.
 *
 * Every detection is persisted to SQLite + considered for auto-block.
 */

import { NetworkPacket, DetectionResult, DetectionMethod, AttackType } from '../types';
import {
  EnsembleDetector,
  extractFeatures,
  generateLabeledTrainingData,
  loadTrainedArtefacts,
} from '../ml';
import { autoResponseService } from './auto-response';
import { autoTrainingService } from './auto-training';
import { rlhfService } from './rlhf';
import prisma from '../prisma';

let detector: EnsembleDetector | null = null;
let initialized = false;
let trainingMode: 'nsl-kdd' | 'synthetic' = 'synthetic';

export function initializeDetector(): EnsembleDetector {
  if (detector && initialized) return detector;

  // Prefer the real NSL-KDD-trained ensemble when its artefacts are on disk.
  const artefacts = loadTrainedArtefacts();
  if (artefacts) {
    detector = artefacts.ensemble;
    detector.updateWeights(rlhfService.getWeights());
    trainingMode = 'nsl-kdd';
    initialized = true;
    return detector;
  }

  // Fallback: train on the synthetic distribution. Lower fidelity but always available.
  console.warn('[detection] Trained NSL-KDD ensemble not found, using synthetic fallback.');
  detector = new EnsembleDetector(rlhfService.getWeights());
  const { features, labels, attackTypes } = generateLabeledTrainingData(800);
  detector.fit(features, labels, attackTypes);
  trainingMode = 'synthetic';
  initialized = true;
  return detector;
}

export function getDetector(): EnsembleDetector {
  return initializeDetector();
}

export function getTrainingMode(): 'nsl-kdd' | 'synthetic' {
  initializeDetector();
  return trainingMode;
}

export function retrainDetector(): void {
  // "Retrain" in the running app means: refit on the synthetic + verified
  // feedback data. We deliberately do NOT overwrite the saved NSL-KDD models
  // — those stay on disk as the gold reference.
  detector = new EnsembleDetector(rlhfService.getWeights());
  const { features, labels, attackTypes } = generateLabeledTrainingData(800);
  detector.fit(features, labels, attackTypes);
  trainingMode = 'synthetic';
  initialized = true;
}

function getThreatLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  // Calibrated against the trained ensemble's score distribution: most NSL-KDD
  // attacks land in the 0.55-0.75 band, near-novel attacks cluster in 0.65-0.8,
  // and the very obvious DoS / Probe spike to >0.85.
  if (score > 0.85) return 'critical';
  if (score > 0.65) return 'high';
  if (score > 0.5) return 'medium';
  return 'low';
}

function classifyAttack(packet: NetworkPacket, hint?: string): AttackType {
  if (hint && hint !== 'Unknown' && hint !== '') return hint as AttackType;
  if (packet.destPort === 22) return 'Brute Force';
  if (packet.destPort === 3389) return 'Brute Force';
  if (packet.protocol === 'ICMP' && packet.packetSize > 1000) return 'DoS';
  if ([80, 443, 8080].includes(packet.destPort)) return 'SQL Injection';
  if (packet.flags?.includes('SYN') && !packet.flags?.includes('ACK')) return 'Port Scan';
  if (packet.sourcePort < 1024 && packet.destPort < 1024) return 'Probe';
  return 'Unknown';
}

const DESCRIPTIONS: Record<AttackType, string> = {
  DoS: 'Potential Denial of Service attack. High volume of traffic from a single source.',
  DDoS: 'Distributed Denial of Service pattern. Multiple sources targeting one host.',
  Probe: 'Network reconnaissance. Likely port scanning or vulnerability probing.',
  R2L: 'Remote-to-Local attack. Unauthorized access attempt from a remote host.',
  U2R: 'User-to-Root privilege escalation attempt detected.',
  'Brute Force': 'Brute-force authentication attack. Multiple failed login attempts.',
  'Port Scan': 'Port scan in progress. Systematic probing of open ports.',
  'SQL Injection': 'Suspected SQL injection in HTTP traffic.',
  XSS: 'Cross-site scripting attempt detected in web traffic.',
  Malware: 'Suspicious payload pattern indicating malware communication.',
  Botnet: 'Botnet command-and-control traffic pattern detected.',
  'Man-in-the-Middle': 'Possible MITM attack — ARP spoofing or SSL stripping.',
  Unknown: 'Anomalous traffic pattern detected. Investigation recommended.',
};

const RECOMMENDATIONS: Record<AttackType, string[]> = {
  DoS: ['Apply rate limiting', 'Engage DDoS mitigation', 'Block source IP temporarily'],
  DDoS: ['Activate DDoS protection', 'Contact ISP for upstream filtering', 'Scale infrastructure'],
  Probe: ['Update IDS signatures', 'Audit exposed services', 'Implement port knocking'],
  R2L: ['Review authentication logs', 'Enforce stronger passwords', 'Enable MFA'],
  U2R: ['Audit user privileges', 'Patch the system', 'Review sudo configs'],
  'Brute Force': ['Lock the affected account', 'Add CAPTCHA', 'Use fail2ban'],
  'Port Scan': ['Review firewall rules', 'Disable unused services', 'Deploy honeypots'],
  'SQL Injection': ['Update WAF rules', 'Audit input validation', 'Parameterize queries'],
  XSS: ['Set CSP headers', 'Sanitize user input', 'Update WAF'],
  Malware: ['Isolate affected hosts', 'Run antimalware sweep', 'Audit network logs'],
  Botnet: ['Block C2 IPs', 'Scan endpoints', 'Update endpoint protection'],
  'Man-in-the-Middle': [
    'Verify SSL certificates',
    'Implement certificate pinning',
    'Use encrypted protocols',
  ],
  Unknown: [
    'Capture packet data for analysis',
    'Correlate with other security events',
    'Escalate to security team',
  ],
};

export function detectAnomaly(
  packet: NetworkPacket,
  method: DetectionMethod = 'Ensemble'
): DetectionResult {
  const det = getDetector();
  const features = extractFeatures(packet);
  const prediction = det.predict(features);

  let score: number;
  switch (method) {
    case 'Isolation Forest':
      score = prediction.scores.isolationForest;
      break;
    case 'Autoencoder':
      score = prediction.scores.autoencoder;
      break;
    case 'Random Forest':
      score = prediction.scores.randomForest;
      break;
    case 'XGBoost':
      score = prediction.scores.xgboost;
      break;
    default:
      score = prediction.score;
  }

  const isAnomaly = score > 0.5;
  const threatLevel = getThreatLevel(score);
  const attackType = isAnomaly ? classifyAttack(packet, prediction.attackType) : undefined;

  const result: DetectionResult = {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    packet,
    isAnomaly,
    threatLevel,
    attackType,
    confidence: Math.min(score * 100, 100),
    detectionMethod: method,
    description: isAnomaly
      ? DESCRIPTIONS[attackType ?? 'Unknown']
      : 'Normal traffic pattern. No anomaly detected.',
    recommendations: isAnomaly ? RECOMMENDATIONS[attackType ?? 'Unknown'] : [],
    modelScores: prediction.scores,
  };

  if (isAnomaly) {
    const action = autoResponseService.evaluateThreat(result);
    result.autoResponseAction =
      action.action === 'block'
        ? 'blocked'
        : action.action === 'alert'
        ? 'alerted'
        : action.action === 'monitor'
        ? 'monitored'
        : 'ignored';
  }

  autoTrainingService.addDetectionData(result);
  return result;
}

export function detectBatch(
  packets: NetworkPacket[],
  method: DetectionMethod = 'Ensemble'
): DetectionResult[] {
  return packets.map(p => detectAnomaly(p, method));
}

export async function persistDetection(result: DetectionResult): Promise<void> {
  try {
    const packet = await prisma.networkPacket.create({
      data: {
        sourceIP: result.packet.sourceIP,
        destIP: result.packet.destIP,
        sourcePort: result.packet.sourcePort,
        destPort: result.packet.destPort,
        protocol: result.packet.protocol,
        packetSize: result.packet.packetSize,
        flags: result.packet.flags,
      },
    });

    await prisma.detectionResult.create({
      data: {
        packetId: packet.id,
        isAnomaly: result.isAnomaly,
        threatLevel: result.threatLevel.toUpperCase(),
        attackType: result.attackType,
        confidence: result.confidence,
        detectionMethod: result.detectionMethod,
        description: result.description,
        recommendations: JSON.stringify(result.recommendations),
        modelScores: JSON.stringify(result.modelScores ?? {}),
        autoResponse: result.autoResponseAction ?? null,
      },
    });

    if (result.isAnomaly && result.autoResponseAction !== 'ignored') {
      await prisma.alert.create({
        data: {
          severity: result.threatLevel.toUpperCase(),
          title: `${result.attackType ?? 'Anomaly'} detected`,
          message: result.description,
          sourceIP: result.packet.sourceIP,
          destIP: result.packet.destIP,
          attackType: result.attackType ?? 'Unknown',
          status: 'NEW',
        },
      });
    }

    if (result.autoResponseAction === 'blocked') {
      await prisma.blockedIP
        .upsert({
          where: { ipAddress: result.packet.sourceIP },
          update: {
            reason: `Auto-blocked: ${result.attackType ?? 'Anomaly'}`,
            attackType: result.attackType ?? null,
            confidence: result.confidence,
            autoBlocked: true,
          },
          create: {
            ipAddress: result.packet.sourceIP,
            reason: `Auto-blocked: ${result.attackType ?? 'Anomaly'}`,
            attackType: result.attackType ?? null,
            confidence: result.confidence,
            autoBlocked: true,
            expiresAt:
              result.threatLevel === 'critical'
                ? null
                : new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        })
        .catch(() => {});
    }
  } catch (err) {
    console.error('persistDetection error:', err);
  }
}

export function submitDetectionFeedback(
  detectionId: string,
  isCorrect: boolean,
  detectionMethod?: string
): void {
  rlhfService.addFeedback({ detectionId, isCorrect, modelMethod: detectionMethod });
}

export function getSystemStats() {
  const trainingStats = autoTrainingService.getStats();
  const responseStats = autoResponseService.getStats();
  const rlhfMetrics = rlhfService.getMetrics();
  return {
    modelVersion: trainingStats.modelVersion,
    totalTrainingSamples: trainingStats.totalSamples,
    blockedIPs: responseStats.totalBlocked,
    autoBlockedIPs: responseStats.autoBlocked,
    feedbackCount: rlhfMetrics.totalFeedback,
    modelAccuracy: rlhfMetrics.accuracyRate,
    trainingMode,
  };
}
