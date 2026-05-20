/**
 * Live packet ingest — bridges the tcpdump pcap adapter to the trained
 * detection pipeline.
 *
 * The pcap adapter (lib/services/pcap-adapter.ts) shells out to `tcpdump`
 * and emits CapturedPacket objects. This module subscribes to those events,
 * projects each captured packet into the dashboard's NetworkPacket shape,
 * and runs it through exactly the same detectAnomaly() + persistDetection()
 * path the synthetic demo traffic uses — so the trained ensemble scores live
 * traffic with no separate code path.
 *
 * Activation is entirely opt-in: with IDS_ENABLE_PCAP unset the adapter
 * no-ops and the dashboard keeps running on synthetic traffic. See
 * pcap-adapter.ts for the full environment-variable contract.
 *
 * Wired in at server startup by the root `instrumentation.ts`.
 */

import { pcapAdapter, type CapturedPacket } from './pcap-adapter';
import { detectAnomaly, persistDetection } from './detection';
import type { NetworkPacket } from '../types';

let started = false;

/** Project a libpcap-captured packet into the dashboard's NetworkPacket shape. */
function toNetworkPacket(c: CapturedPacket): NetworkPacket {
  const protocol: NetworkPacket['protocol'] =
    c.protocol === 'TCP' || c.protocol === 'UDP' || c.protocol === 'ICMP'
      ? c.protocol
      : 'TCP'; // 'OTHER' → treat as TCP so packet-to-kdd still maps it

  return {
    id: crypto.randomUUID(),
    timestamp: c.timestamp,
    sourceIP: c.sourceIP,
    destIP: c.destIP,
    sourcePort: c.sourcePort,
    destPort: c.destPort,
    protocol,
    packetSize: c.packetSize,
    flags: c.flags,
  };
}

/**
 * Subscribe the pcap adapter to the detection pipeline and start capture.
 * Idempotent. No-ops gracefully when pcap is disabled — the adapter itself
 * logs the reason (wrong platform / IDS_ENABLE_PCAP unset).
 */
export function startLivePacketCapture(): void {
  if (started) return;
  started = true;

  pcapAdapter.on('error', (err) => {
    console.error('[pcap-ingest] adapter error:', err.message);
  });

  pcapAdapter.on('packet', (captured: CapturedPacket) => {
    try {
      // Same path as synthetic traffic: feature-extract → trained ensemble →
      // auto-response → persist. The SSE broadcaster's DB poll then pushes the
      // new detection to the dashboard, so no extra plumbing is needed here.
      const result = detectAnomaly(toNetworkPacket(captured));
      void persistDetection(result);
    } catch (err) {
      console.error('[pcap-ingest] detection pipeline error:', err);
    }
  });

  // start() self-gates: it no-ops + logs unless IDS_ENABLE_PCAP=1 on Linux.
  pcapAdapter.start();

  if (pcapAdapter.isEnabled()) {
    console.info('[pcap-ingest] live tcpdump capture wired into the detection pipeline');
  }
}

/** Stop live capture and detach listeners. For graceful shutdown / tests. */
export function stopLivePacketCapture(): void {
  pcapAdapter.stop();
  pcapAdapter.removeAllListeners('packet');
  pcapAdapter.removeAllListeners('error');
  started = false;
}
