/**
 * Feature extraction for live packets.
 *
 * The trained models expect the NSL-KDD 41-feature vectorisation. Live
 * packets are first projected into the NSL-KDD shape via packetToKddRow,
 * then run through the same `vectorise()` used at training time with the
 * saved scaler.
 *
 * We also keep a minimal 7-feature legacy extractor for in-memory training
 * paths that don't go through the trained ensemble.
 */

import { NetworkPacket } from '../types';
import { packetToKddRow } from './packet-to-kdd';
import { vectorise, FeatureScaler } from './nsl-kdd';
import { loadTrainedArtefacts } from './loader';

const PROTOCOL_MAP: Record<string, number> = {
  TCP: 1,
  UDP: 2,
  ICMP: 3,
  HTTP: 4,
  HTTPS: 5,
  DNS: 6,
  SSH: 7,
  FTP: 8,
};

const FLAG_MAP: Record<string, number> = {
  SYN: 1,
  ACK: 2,
  FIN: 4,
  RST: 8,
  PSH: 16,
  URG: 32,
};

export function ipToNumber(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

export function flagsToNumber(flags: string): number {
  return flags.split(',').reduce((acc, flag) => acc + (FLAG_MAP[flag.trim()] || 0), 0) / 63;
}

/**
 * Produce the 72-dim NSL-KDD feature vector that the trained models consume.
 * Falls back to a 7-dim legacy vector if no scaler is loaded (dev / test).
 */
export function extractFeatures(packet: NetworkPacket): number[] {
  const artefacts = loadTrainedArtefacts();
  if (artefacts) {
    return extractKddFeatures(packet, artefacts.scaler);
  }
  return extractLegacyFeatures(packet);
}

/** Project a packet into the NSL-KDD 72-dimensional feature space. */
export function extractKddFeatures(packet: NetworkPacket, scaler: FeatureScaler): number[] {
  const row = packetToKddRow(packet);
  return vectorise(row, scaler);
}

/** 7-feature legacy vector (compat with un-trained synthetic mode). */
export function extractLegacyFeatures(packet: NetworkPacket): number[] {
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

export function extractExtendedFeatures(
  packet: NetworkPacket,
  context?: {
    connectionCount?: number;
    bytesSent?: number;
    bytesReceived?: number;
    duration?: number;
  }
): number[] {
  const baseFeatures = extractLegacyFeatures(packet);
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

export function normalizeFeatures(features: number[], min: number[], max: number[]): number[] {
  return features.map((f, i) => {
    const range = max[i] - min[i];
    return range > 0 ? (f - min[i]) / range : 0;
  });
}

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
