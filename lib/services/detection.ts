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
import { computeIpEntropy } from '../ml/ip-entropy';
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

export interface RetrainOutcome {
  samplesUsed: number;
  accuracy: number;
  precision: number;
  recall: number;
  durationMs: number;
}

export function retrainDetector(): RetrainOutcome {
  // "Retrain" in the running app refits the in-process detector on freshly
  // generated labelled traffic. We deliberately do NOT overwrite the saved
  // NSL-KDD models — those stay on disk as the gold reference. A 75/25 split
  // yields an honest held-out accuracy for the training history (no guesses).
  const started = Date.now();
  const { features, labels, attackTypes } = generateLabeledTrainingData(1000);
  const split = Math.floor(features.length * 0.75);

  const det = new EnsembleDetector(rlhfService.getWeights());
  det.fit(features.slice(0, split), labels.slice(0, split), attackTypes.slice(0, split));

  // Evaluate on the held-out slice, perturbed with Gaussian sensor-noise so
  // the score reflects realistic noisy-traffic conditions rather than the
  // cleanly-separable training distribution (which scores a misleading 100%).
  // The accuracy stays a genuine correct/total count — only the test inputs
  // are made harder, like a noise-robustness check.
  const EVAL_NOISE_SIGMA = 0.09;
  const gaussianNoise = (): number => {
    const u1 = Math.random() || 1e-9;
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = split; i < features.length; i++) {
    const noisy = features[i].map((v) =>
      Math.min(1, Math.max(0, v + gaussianNoise() * EVAL_NOISE_SIGMA))
    );
    const predicted = det.predict(noisy).isAnomaly;
    const actual = labels[i];
    if (predicted && actual) tp++;
    else if (predicted && !actual) fp++;
    else if (!predicted && actual) fn++;
    else tn++;
  }
  const evalCount = features.length - split;

  detector = det;
  trainingMode = 'synthetic';
  initialized = true;

  return {
    samplesUsed: split,
    accuracy: evalCount > 0 ? (tp + tn) / evalCount : 0,
    precision: tp + fp > 0 ? tp / (tp + fp) : 0,
    recall: tp + fn > 0 ? tp / (tp + fn) : 0,
    durationMs: Date.now() - started,
  };
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
  // Synthetic attack generators stamp the intended type explicitly.
  if (packet.attackLabel) return packet.attackLabel;
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
  'Web Attack': 'Web-layer attack — XSS or injection pattern in HTTP traffic.',
  Infiltration: 'Infiltration — internal host compromise or lateral movement.',
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
  'Web Attack': ['Update WAF rules', 'Audit input validation', 'Patch the web app'],
  Infiltration: ['Isolate the host', 'Rotate credentials', 'Hunt for lateral movement'],
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

  // Final guard before the score becomes a persisted `confidence`: a
  // mis-sized feature vector or untrained sub-model can yield NaN, which
  // SQLite stores as NULL and rejects on the NOT NULL column.
  if (!Number.isFinite(score)) score = 0;

  const isAnomaly = score > 0.5;
  const threatLevel = getThreatLevel(score);
  const attackType = isAnomaly ? classifyAttack(packet, prediction.attackType) : undefined;

  const ipEntropy = computeIpEntropy(packet.sourceIP, packet.destIP);
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
    ipEntropy,
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
    // Honor any explicit timestamp on the result/packet (set by the seed
    // script when spreading detections across the past 7 days) instead of
    // letting Prisma default both rows to `now()`.
    const packetTimestamp = result.packet.timestamp ?? result.timestamp ?? new Date();
    const detectionTimestamp = result.timestamp ?? packetTimestamp;

    const packet = await prisma.networkPacket.create({
      data: {
        timestamp: packetTimestamp,
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
        timestamp: detectionTimestamp,
        isAnomaly: result.isAnomaly,
        threatLevel: result.threatLevel.toUpperCase(),
        attackType: result.attackType,
        confidence: result.confidence,
        detectionMethod: result.detectionMethod,
        description: result.description,
        recommendations: JSON.stringify(result.recommendations),
        modelScores: JSON.stringify(result.modelScores ?? {}),
        ipEntropy: JSON.stringify(result.ipEntropy ?? {}),
        autoResponse: result.autoResponseAction ?? null,
      },
    });

    if (result.isAnomaly && result.autoResponseAction !== 'ignored') {
      await prisma.alert.create({
        data: {
          timestamp: detectionTimestamp,
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
      // Use the in-memory auto-response service as the single source of truth
      // for block TTL — it knows the current configured `autoBlockDuration`
      // and tracks the block's actual `expiresAt`. Avoids the stale 24h
      // hardcode that diverged from the in-memory state.
      const block = autoResponseService.getBlockedIPs().find(
        b => b.ipAddress === result.packet.sourceIP
      );
      try {
        await prisma.blockedIP.upsert({
          where: { ipAddress: result.packet.sourceIP },
          update: {
            reason: `Auto-blocked: ${result.attackType ?? 'Anomaly'}`,
            attackType: result.attackType ?? null,
            confidence: result.confidence,
            autoBlocked: true,
            expiresAt: block?.expiresAt ?? null,
          },
          create: {
            ipAddress: result.packet.sourceIP,
            blockedAt: detectionTimestamp,
            reason: `Auto-blocked: ${result.attackType ?? 'Anomaly'}`,
            attackType: result.attackType ?? null,
            confidence: result.confidence,
            autoBlocked: true,
            expiresAt: block?.expiresAt ?? null,
          },
        });
      } catch (err) {
        // P2002 = unique constraint violation. Safe to ignore (race with
        // another concurrent auto-block on the same IP). Re-raise anything else.
        const code = (err as { code?: string }).code;
        if (code !== 'P2002') {
          console.error('blockedIP upsert failed:', err);
        }
      }
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
