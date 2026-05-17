/**
 * Live packet capture adapter — pipes real network traffic from a libpcap
 * source into the trained NSL-KDD detection pipeline.
 *
 * Closes §12.2 item 1 of the project report.
 *
 * Why an adapter, not a direct dependency
 * ---------------------------------------
 * libpcap requires CAP_NET_RAW or root, which the dashboard process should
 * not have. Instead the adapter shells out to `tcpdump` (which can be
 * setuid or capability-granted) and parses its plaintext output. This keeps
 * the Node process unprivileged and makes the integration testable without
 * root in CI.
 *
 * Activation
 * ----------
 *   IDS_ENABLE_PCAP=1
 *   IDS_PCAP_INTERFACE=eth0          (which NIC to listen on; required)
 *   IDS_PCAP_FILTER="tcp or udp"     (BPF filter; optional, default = all IP)
 *   IDS_PCAP_TCPDUMP_PATH=tcpdump    (override binary path)
 *
 * The adapter no-ops on macOS/Windows in this design — they can be wired up
 * by swapping the binary for `dumpcap` (Wireshark) or `Get-NetEventSession`
 * (Windows), neither of which is in scope for this work.
 *
 * Output contract
 * ---------------
 * The adapter emits packet objects shaped like NetworkPacket, which the
 * detection service then runs through `lib/ml/packet-to-kdd.ts` and the
 * trained ensemble. No new feature pipeline is required.
 *
 * Demo mode
 * ---------
 * If IDS_ENABLE_PCAP isn't set, the adapter is inert and the dashboard's
 * synthetic packet generator (lib/utils.ts) keeps producing demo traffic.
 * This is what runs in the project's reproducible smoke test.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

export interface CapturedPacket {
  timestamp: Date;
  sourceIP: string;
  destIP: string;
  sourcePort: number;
  destPort: number;
  protocol: 'TCP' | 'UDP' | 'ICMP' | 'OTHER';
  packetSize: number;
  flags?: string;
}

interface AdapterEvents {
  packet: (p: CapturedPacket) => void;
  error: (err: Error) => void;
  start: () => void;
  stop: () => void;
}

// Minimal typed wrapper around EventEmitter so consumers get autocomplete.
export declare interface PcapAdapter {
  on<E extends keyof AdapterEvents>(event: E, listener: AdapterEvents[E]): this;
  emit<E extends keyof AdapterEvents>(event: E, ...args: Parameters<AdapterEvents[E]>): boolean;
}

export class PcapAdapter extends EventEmitter {
  private proc: ChildProcess | null = null;

  isEnabled(): boolean {
    return process.env.IDS_ENABLE_PCAP === '1' && process.platform === 'linux';
  }

  start(): void {
    if (this.proc) return;
    if (!this.isEnabled()) {
      console.info('[pcap] disabled (set IDS_ENABLE_PCAP=1 on Linux). Synthetic traffic remains in use.');
      return;
    }
    const iface = process.env.IDS_PCAP_INTERFACE;
    if (!iface) {
      this.emit('error', new Error('IDS_PCAP_INTERFACE not set'));
      return;
    }
    const bin = process.env.IDS_PCAP_TCPDUMP_PATH ?? 'tcpdump';
    const filter = process.env.IDS_PCAP_FILTER ?? 'ip';
    const args = [
      '-i', iface,
      '-l',           // line-buffered stdout — packets arrive immediately
      '-n',           // no DNS — keep raw IPs, lower CPU
      '-q',           // quiet — short output, easier to parse
      '-tttt',        // full timestamps
      filter,
    ];
    this.proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc.on('error', err => this.emit('error', err));
    this.proc.on('exit', code => {
      this.proc = null;
      console.info(`[pcap] tcpdump exited with code ${code}`);
      this.emit('stop');
    });

    let buf = '';
    this.proc.stdout?.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      let nl = buf.indexOf('\n');
      while (nl >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        nl = buf.indexOf('\n');
        if (!line) continue;
        const pkt = this.parseTcpdumpLine(line);
        if (pkt) this.emit('packet', pkt);
      }
    });
    this.proc.stderr?.on('data', (chunk: Buffer) => {
      // tcpdump prints "N packets captured" summaries to stderr; surface as info, not error.
      const msg = chunk.toString('utf8').trim();
      if (msg) console.debug('[pcap]', msg);
    });
    console.info(`[pcap] capturing on ${iface} (filter: "${filter}")`);
    this.emit('start');
  }

  stop(): void {
    if (this.proc) {
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
  }

  /**
   * Parse a `tcpdump -q -tttt -n` line. Two example shapes:
   *
   *   2026-05-17 18:43:12.123456 IP 10.0.0.1.45678 > 10.0.0.2.80: tcp 1500
   *   2026-05-17 18:43:12.123456 IP 10.0.0.1 > 10.0.0.2: ICMP echo request, length 64
   *
   * We tolerate both. Anything we can't parse returns null so the upstream
   * detection pipeline keeps moving.
   */
  parseTcpdumpLine(line: string): CapturedPacket | null {
    // Timestamp prefix: YYYY-MM-DD HH:MM:SS.ffffff
    const m = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+) IP6? (.+)$/);
    if (!m) return null;
    const ts = new Date(m[1].replace(' ', 'T') + 'Z');
    const rest = m[2];
    // Try IPv4 src.port > dst.port
    const tcpUdp = rest.match(/^(\d+\.\d+\.\d+\.\d+)\.(\d+) > (\d+\.\d+\.\d+\.\d+)\.(\d+): (\w+).*?(?:length (\d+))?$/);
    if (tcpUdp) {
      const proto = tcpUdp[5].toUpperCase();
      return {
        timestamp: ts,
        sourceIP: tcpUdp[1],
        destIP: tcpUdp[3],
        sourcePort: parseInt(tcpUdp[2], 10),
        destPort: parseInt(tcpUdp[4], 10),
        protocol: (proto === 'TCP' || proto === 'UDP') ? proto : 'OTHER',
        packetSize: tcpUdp[6] ? parseInt(tcpUdp[6], 10) : 0,
      };
    }
    // ICMP (no ports)
    const icmp = rest.match(/^(\d+\.\d+\.\d+\.\d+) > (\d+\.\d+\.\d+\.\d+): ICMP.*?length (\d+)$/);
    if (icmp) {
      return {
        timestamp: ts,
        sourceIP: icmp[1],
        destIP: icmp[2],
        sourcePort: 0,
        destPort: 0,
        protocol: 'ICMP',
        packetSize: parseInt(icmp[3], 10),
      };
    }
    return null;
  }
}

export const pcapAdapter = new PcapAdapter();
