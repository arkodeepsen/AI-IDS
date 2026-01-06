/**
 * Detection Service
 * Central service for handling intrusion detection
 */

import { NetworkPacket, DetectionResult, DetectionMethod, AttackType } from '../types';
import { EnsembleDetector, extractFeatures, generateTrainingData, generateLabeledTrainingData } from '../ml';
import { autoResponseService } from '../services/auto-response';
import { autoTrainingService } from '../services/auto-training';
import { rlhfService } from '../services/rlhf';

// Global detector instance
let detector: EnsembleDetector | null = null;
let isInitialized = false;

/**
 * Initialize the detector with training data
 */
export function initializeDetector(): EnsembleDetector {
    if (!detector || !isInitialized) {
        detector = new EnsembleDetector(rlhfService.getWeights());

        // Generate labeled training data for KNN
        const { features, labels, attackTypes } = generateLabeledTrainingData(500);
        detector.fit(features, labels, attackTypes);

        isInitialized = true;
    }
    return detector;
}

/**
 * Get the current detector instance
 */
export function getDetector(): EnsembleDetector {
    return initializeDetector();
}

/**
 * Reset and retrain the detector
 */
export function retrainDetector(): void {
    const weights = rlhfService.getWeights();
    detector = new EnsembleDetector(weights);

    const { features, labels, attackTypes } = generateLabeledTrainingData(500);
    detector.fit(features, labels, attackTypes);

    isInitialized = true;
}

/**
 * Detect anomaly in a network packet
 */
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
        case 'K-Means Clustering':
            score = prediction.scores.kMeans;
            break;
        case 'KNN':
            score = prediction.scores.knn;
            break;
        default:
            score = prediction.score;
    }

    const isAnomaly = score > 0.5;
    const threatLevel = getThreatLevel(score);
    const attackType = isAnomaly ? classifyAttack(packet, score, prediction.attackType) : undefined;

    const result: DetectionResult = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        packet,
        isAnomaly,
        threatLevel,
        attackType,
        confidence: Math.min(score * 100, 100),
        detectionMethod: method === 'Ensemble' ? 'Ensemble' : method,
        description: generateDescription(isAnomaly, attackType, packet),
        recommendations: isAnomaly ? generateRecommendations(attackType, threatLevel) : [],
        modelScores: {
            isolationForest: prediction.scores.isolationForest,
            autoencoder: prediction.scores.autoencoder,
            kMeans: prediction.scores.kMeans,
            knn: prediction.scores.knn
        }
    };

    // Auto-response evaluation
    if (isAnomaly) {
        const responseAction = autoResponseService.evaluateThreat(result);
        result.autoResponseAction = responseAction.action === 'block' ? 'blocked' :
            responseAction.action === 'alert' ? 'alerted' :
                responseAction.action === 'monitor' ? 'monitored' : 'ignored';
    }

    // Add to training data
    autoTrainingService.addDetectionData(result);

    return result;
}

/**
 * Batch detection for multiple packets
 */
export function detectBatch(
    packets: NetworkPacket[],
    method: DetectionMethod = 'Ensemble'
): DetectionResult[] {
    return packets.map(packet => detectAnomaly(packet, method));
}

/**
 * Get threat level from score
 */
function getThreatLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score > 0.9) return 'critical';
    if (score > 0.7) return 'high';
    if (score > 0.5) return 'medium';
    return 'low';
}

/**
 * Classify the attack type
 */
function classifyAttack(packet: NetworkPacket, score: number, knnPrediction?: string): AttackType {
    // Use KNN prediction if available
    if (knnPrediction) {
        return knnPrediction as AttackType;
    }

    // Heuristic-based classification
    if (packet.destPort === 22 && score > 0.7) return 'Brute Force';
    if (packet.destPort === 3389 && score > 0.7) return 'Brute Force';
    if (packet.protocol === 'ICMP' && packet.packetSize > 1000) return 'DoS';
    if (packet.sourcePort < 1024 && packet.destPort < 1024) return 'Probe';
    if ([80, 443, 8080].includes(packet.destPort) && score > 0.8) return 'SQL Injection';
    if (packet.flags?.includes('SYN') && !packet.flags?.includes('ACK')) return 'Port Scan';

    return 'Unknown';
}

/**
 * Generate detection description
 */
function generateDescription(isAnomaly: boolean, attackType?: AttackType, packet?: NetworkPacket): string {
    if (!isAnomaly) {
        return 'Normal traffic pattern detected. No anomalies found.';
    }

    const descriptions: Record<AttackType, string> = {
        'DoS': 'Potential Denial of Service attack detected. High volume of traffic from single source.',
        'DDoS': 'Distributed Denial of Service attack pattern detected. Multiple sources targeting single destination.',
        'Probe': 'Network reconnaissance activity detected. Possible port scanning or vulnerability probing.',
        'R2L': 'Remote to Local attack pattern detected. Unauthorized access attempt from remote host.',
        'U2R': 'User to Root privilege escalation attempt detected.',
        'Brute Force': 'Brute force authentication attack detected. Multiple failed login attempts.',
        'Port Scan': 'Port scanning activity detected. Systematic probing of network ports.',
        'SQL Injection': 'Potential SQL injection attack detected in HTTP traffic.',
        'XSS': 'Cross-site scripting attempt detected in web traffic.',
        'Malware': 'Potential malware communication detected. Suspicious payload patterns.',
        'Botnet': 'Botnet command and control traffic pattern detected.',
        'Man-in-the-Middle': 'Potential MITM attack detected. ARP spoofing or SSL stripping activity.',
        'Unknown': 'Anomalous traffic pattern detected. Further investigation recommended.'
    };

    return descriptions[attackType || 'Unknown'];
}

/**
 * Generate security recommendations
 */
function generateRecommendations(attackType?: AttackType, threatLevel?: string): string[] {
    const baseRecommendations = [
        'Monitor the source IP for continued suspicious activity',
        'Review firewall rules and update if necessary',
        'Document the incident for security audit'
    ];

    const specificRecommendations: Record<AttackType, string[]> = {
        'DoS': ['Implement rate limiting', 'Consider DDoS mitigation service', 'Block source IP temporarily'],
        'DDoS': ['Activate DDoS protection', 'Contact ISP for upstream filtering', 'Scale infrastructure if possible'],
        'Probe': ['Update IDS signatures', 'Review exposed services', 'Implement port knocking'],
        'R2L': ['Review authentication logs', 'Enforce stronger password policies', 'Enable MFA'],
        'U2R': ['Audit user privileges', 'Update system patches', 'Review sudo configurations'],
        'Brute Force': ['Implement account lockout', 'Enable CAPTCHA', 'Use fail2ban or similar'],
        'Port Scan': ['Review firewall rules', 'Disable unnecessary services', 'Implement honeypots'],
        'SQL Injection': ['Update WAF rules', 'Review application input validation', 'Parameterize SQL queries'],
        'XSS': ['Implement CSP headers', 'Sanitize user inputs', 'Update web application firewall'],
        'Malware': ['Isolate affected systems', 'Run antimalware scans', 'Review network traffic logs'],
        'Botnet': ['Block C2 server IPs', 'Scan network for infected hosts', 'Update endpoint protection'],
        'Man-in-the-Middle': ['Verify SSL certificates', 'Implement certificate pinning', 'Use encrypted protocols'],
        'Unknown': ['Capture packet data for analysis', 'Correlate with other security events', 'Escalate to security team']
    };

    return [...(specificRecommendations[attackType || 'Unknown'] || []), ...baseRecommendations];
}

/**
 * Submit feedback for a detection (RLHF)
 */
export function submitDetectionFeedback(
    detectionId: string,
    isCorrect: boolean,
    detectionMethod?: string
): void {
    rlhfService.addFeedback({
        detectionId,
        isCorrect,
        modelMethod: detectionMethod
    });
}

/**
 * Get current system statistics
 */
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
        modelAccuracy: rlhfMetrics.accuracyRate
    };
}
