/**
 * Feature Extraction Utilities
 * Extract numerical features from network packets for ML processing
 */

import { NetworkPacket } from '../types';

const PROTOCOL_MAP: Record<string, number> = {
    'TCP': 1, 'UDP': 2, 'ICMP': 3, 'HTTP': 4,
    'HTTPS': 5, 'DNS': 6, 'SSH': 7, 'FTP': 8
};

const FLAG_MAP: Record<string, number> = {
    'SYN': 1, 'ACK': 2, 'FIN': 4, 'RST': 8, 'PSH': 16, 'URG': 32
};

/**
 * Convert IP address to number
 */
export function ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

/**
 * Convert TCP flags to normalized number
 */
export function flagsToNumber(flags: string): number {
    return flags.split(',').reduce((acc, flag) => acc + (FLAG_MAP[flag.trim()] || 0), 0) / 63;
}

/**
 * Extract normalized features from a network packet
 */
export function extractFeatures(packet: NetworkPacket): number[] {
    return [
        PROTOCOL_MAP[packet.protocol] || 0,
        packet.sourcePort / 65535,
        packet.destPort / 65535,
        packet.packetSize / 65535,
        ipToNumber(packet.sourceIP) / 4294967295,
        ipToNumber(packet.destIP) / 4294967295,
        packet.flags ? flagsToNumber(packet.flags) : 0,
    ];
}

/**
 * Extract extended features with additional metrics
 */
export function extractExtendedFeatures(packet: NetworkPacket, context?: {
    connectionCount?: number;
    bytesSent?: number;
    bytesReceived?: number;
    duration?: number;
}): number[] {
    const baseFeatures = extractFeatures(packet);

    if (context) {
        return [
            ...baseFeatures,
            (context.connectionCount || 0) / 1000,
            (context.bytesSent || 0) / 1000000,
            (context.bytesReceived || 0) / 1000000,
            (context.duration || 0) / 3600,
        ];
    }

    return baseFeatures;
}

/**
 * Normalize a feature array
 */
export function normalizeFeatures(features: number[], min: number[], max: number[]): number[] {
    return features.map((f, i) => {
        const range = max[i] - min[i];
        return range > 0 ? (f - min[i]) / range : 0;
    });
}

/**
 * Calculate feature statistics from a dataset
 */
export function calculateFeatureStats(data: number[][]): {
    min: number[];
    max: number[];
    mean: number[];
    std: number[];
} {
    if (data.length === 0) {
        return { min: [], max: [], mean: [], std: [] };
    }

    const numFeatures = data[0].length;
    const min = Array(numFeatures).fill(Infinity);
    const max = Array(numFeatures).fill(-Infinity);
    const sum = Array(numFeatures).fill(0);

    for (const point of data) {
        for (let i = 0; i < numFeatures; i++) {
            min[i] = Math.min(min[i], point[i]);
            max[i] = Math.max(max[i], point[i]);
            sum[i] += point[i];
        }
    }

    const mean = sum.map(s => s / data.length);

    const varSum = Array(numFeatures).fill(0);
    for (const point of data) {
        for (let i = 0; i < numFeatures; i++) {
            varSum[i] += Math.pow(point[i] - mean[i], 2);
        }
    }
    const std = varSum.map(v => Math.sqrt(v / data.length));

    return { min, max, mean, std };
}
