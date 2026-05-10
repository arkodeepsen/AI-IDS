/**
 * IP address entropy.
 *
 * The project deck calls for "IP Address Entropy Scores: Statistical
 * randomness measures for source and destination IPs to detect spoofing or
 * scanning patterns". This module exposes two complementary measures:
 *
 *  - Per-IP Shannon entropy of the octet bytes (returns a stable per-address
 *    randomness signal — random spoofed IPs have higher byte-level entropy
 *    than well-known infrastructure addresses).
 *  - A rolling per-host entropy of the destination IPs a given source has
 *    contacted recently (high entropy → fan-out scanning behaviour).
 *
 * The trained ensemble doesn't consume these directly (it's locked to the
 * 72-dim NSL-KDD feature shape) but the values are surfaced on each
 * detection so the dashboard can show them, and the Datasets tab uses them
 * as part of the feature engineering breakdown.
 */

const WINDOW_SIZE = 200;
const recentBySource = new Map<string, string[]>();

/** Shannon entropy of the four octet bytes of an IPv4 address. */
export function octetEntropy(ip: string): number {
  const parts = ip.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p))) return 0;
  const counts: Record<number, number> = {};
  for (const p of parts) counts[p] = (counts[p] ?? 0) + 1;
  let entropy = 0;
  for (const c of Object.values(counts)) {
    const p = c / 4;
    entropy -= p * Math.log2(p);
  }
  // Theoretical max for 4 octets is log2(4) = 2.
  return entropy / 2;
}

/** Update per-source fan-out cache + return current normalised entropy. */
export function recordAndScoreSource(sourceIP: string, destIP: string): number {
  let recent = recentBySource.get(sourceIP);
  if (!recent) {
    recent = [];
    recentBySource.set(sourceIP, recent);
  }
  recent.push(destIP);
  if (recent.length > WINDOW_SIZE) recent.shift();

  const counts: Record<string, number> = {};
  for (const d of recent) counts[d] = (counts[d] ?? 0) + 1;

  const total = recent.length;
  let entropy = 0;
  for (const c of Object.values(counts)) {
    const p = c / total;
    entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(Math.max(2, total));
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

export interface IpEntropyScores {
  source: number;
  destination: number;
  sourceFanout: number;
}

export function computeIpEntropy(sourceIP: string, destIP: string): IpEntropyScores {
  return {
    source: octetEntropy(sourceIP),
    destination: octetEntropy(destIP),
    sourceFanout: recordAndScoreSource(sourceIP, destIP),
  };
}

export function resetEntropyCache(): void {
  recentBySource.clear();
}
