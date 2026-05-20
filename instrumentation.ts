/**
 * Next.js instrumentation hook — runs once per server process at startup.
 *
 * Used to wire the optional live packet-capture pipeline. When
 * IDS_ENABLE_PCAP=1 (Linux only) this connects the tcpdump adapter to the
 * trained detection ensemble; otherwise it does nothing and the dashboard
 * runs on synthetic traffic exactly as before.
 *
 * See lib/services/pcap-adapter.ts for the full environment-variable
 * contract and lib/services/pcap-ingest.ts for the pipeline wiring.
 */

export async function register(): Promise<void> {
  // Only the Node.js server runtime can spawn tcpdump — skip the edge runtime.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Default (demo) configuration: pcap off, nothing loaded, zero overhead.
  if (process.env.IDS_ENABLE_PCAP !== '1') return;

  const { startLivePacketCapture } = await import('./lib/services/pcap-ingest');
  startLivePacketCapture();
}
