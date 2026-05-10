/**
 * Training Data Generation
 * Generate synthetic training data based on NSL-KDD/CICIDS patterns
 */

/**
 * Generate unlabeled training data for unsupervised learning
 */
export function generateTrainingData(numSamples: number = 1000): number[][] {
    const data: number[][] = [];

    for (let i = 0; i < numSamples; i++) {
        // Normal traffic pattern (80% of data)
        if (Math.random() < 0.8) {
            data.push([
                Math.floor(Math.random() * 4) + 1, // Common protocols
                (Math.random() * 0.7 + 0.15), // Normal port range
                (Math.random() * 0.5 + 0.001), // Common destination ports
                (Math.random() * 0.1 + 0.01), // Normal packet sizes
                Math.random(), // Source IP
                Math.random(), // Dest IP
                Math.random() * 0.3, // Normal flags
            ]);
        } else {
            // Anomalous patterns
            data.push([
                Math.floor(Math.random() * 8) + 1,
                Math.random(),
                Math.random(),
                Math.random() * 0.5 + 0.3, // Larger packets
                Math.random(),
                Math.random(),
                Math.random() * 0.7 + 0.3, // Unusual flags
            ]);
        }
    }

    return data;
}

/**
 * Generate labeled training data with attack types
 */
export function generateLabeledTrainingData(numSamples: number = 1000): {
    features: number[][];
    labels: boolean[];
    attackTypes: string[];
} {
    const features: number[][] = [];
    const labels: boolean[] = [];
    const attackTypes: string[] = [];

    // Bumped attack ratios from ~20% to ~40% so the supervised models learn
    // more discriminative boundaries. Real-world IDS data is usually much
    // less attack-heavy; we synthesise a richer attack distribution here.
    const attackPatterns = [
        { type: 'DoS', ratio: 0.10, pattern: () => generateDoSPattern() },
        { type: 'Port Scan', ratio: 0.08, pattern: () => generatePortScanPattern() },
        { type: 'Brute Force', ratio: 0.07, pattern: () => generateBruteForcePattern() },
        { type: 'Probe', ratio: 0.05, pattern: () => generateProbePattern() },
        { type: 'SQL Injection', ratio: 0.04, pattern: () => generateWebAttackPattern() },
        { type: 'DDoS', ratio: 0.06, pattern: () => generateDDoSPattern() },
    ];

    for (let i = 0; i < numSamples; i++) {
        const rand = Math.random();
        let cumRatio = 0;
        let isAnomaly = false;
        let attackType = '';
        let feature: number[];

        for (const pattern of attackPatterns) {
            cumRatio += pattern.ratio;
            if (rand < cumRatio) {
                feature = pattern.pattern();
                isAnomaly = true;
                attackType = pattern.type;
                break;
            }
        }

        if (!isAnomaly) {
            feature = generateNormalTrafficPattern();
        }

        features.push(feature!);
        labels.push(isAnomaly);
        attackTypes.push(attackType);
    }

    return { features, labels, attackTypes };
}

// Pattern generation functions
function generateNormalTrafficPattern(): number[] {
    return [
        Math.floor(Math.random() * 4) + 1,
        Math.random() * 0.7 + 0.15,
        Math.random() * 0.5 + 0.001,
        Math.random() * 0.1 + 0.01,
        Math.random(),
        Math.random(),
        Math.random() * 0.3,
    ];
}

function generateDoSPattern(): number[] {
    return [
        3, // ICMP often used
        Math.random() * 0.1,
        Math.random() * 0.1,
        0.7 + Math.random() * 0.3, // Large packets
        Math.random() * 0.2, // Narrow source range
        Math.random() * 0.1, // Single target
        0.8 + Math.random() * 0.2,
    ];
}

function generatePortScanPattern(): number[] {
    return [
        1, // TCP
        Math.random(),
        Math.random(), // Many different ports
        0.01 + Math.random() * 0.05, // Small packets
        Math.random() * 0.1, // Single source
        Math.random(),
        0.02, // SYN only
    ];
}

function generateBruteForcePattern(): number[] {
    return [
        7, // SSH
        Math.random(),
        22 / 65535, // SSH port
        0.05 + Math.random() * 0.1,
        Math.random() * 0.1,
        Math.random() * 0.1,
        0.5 + Math.random() * 0.3,
    ];
}

function generateProbePattern(): number[] {
    return [
        Math.floor(Math.random() * 3) + 1,
        Math.random() * 0.01, // Low source ports
        Math.random() * 0.01,
        0.02 + Math.random() * 0.03,
        Math.random(),
        Math.random(),
        0.4 + Math.random() * 0.4,
    ];
}

function generateWebAttackPattern(): number[] {
    return [
        4, // HTTP
        Math.random(),
        80 / 65535, // HTTP port
        0.3 + Math.random() * 0.4, // Larger payloads
        Math.random(),
        Math.random() * 0.2,
        0.6 + Math.random() * 0.2,
    ];
}

function generateDDoSPattern(): number[] {
    return [
        Math.floor(Math.random() * 3) + 1,
        Math.random(), // Various sources
        Math.random() * 0.1, // Few targets
        0.5 + Math.random() * 0.5,
        Math.random(), // Distributed sources
        Math.random() * 0.05, // Single target
        0.7 + Math.random() * 0.3,
    ];
}
