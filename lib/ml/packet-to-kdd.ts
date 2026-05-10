/**
 * Adapter: NetworkPacket → NSL-KDD-shape connection record.
 *
 * Our dashboard shows packets, but the trained ensemble expects NSL-KDD
 * flow records. This module bridges them. Most aggregate fields default to
 * zero (we don't have multi-packet flow context for live traffic), but the
 * critical fields — protocol_type, service, flag, packet size — are filled
 * in from the packet so the trained models still recognise patterns.
 *
 * For synthetic attacks (DoS, Probe, R2L, U2R), the generators in lib/utils
 * also stash an explicit `kddOverride` to push the flow record into the
 * region of feature space the ensemble was trained to flag.
 */

import { NetworkPacket } from '../types';
import { KDDRow } from './nsl-kdd';

// Pre-built map from common dest ports to NSL-KDD service names. The KDD
// service taxonomy is stricter than what Wireshark would report — we cover
// the high-traffic ports and fall back to 'other' for the rest.
const PORT_TO_SERVICE: Record<number, string> = {
  20: 'ftp_data',
  21: 'ftp',
  22: 'ssh',
  23: 'telnet',
  25: 'smtp',
  43: 'whois',
  53: 'domain_u',
  79: 'finger',
  80: 'http',
  110: 'pop_3',
  111: 'sunrpc',
  113: 'auth',
  115: 'sftp',
  117: 'uucp_path',
  119: 'nntp',
  123: 'ntp_u',
  137: 'netbios_ns',
  138: 'netbios_dgm',
  139: 'netbios_ssn',
  143: 'imap4',
  443: 'http',
  513: 'login',
  514: 'shell',
  515: 'printer',
  540: 'uucp',
  543: 'klogin',
  544: 'kshell',
  993: 'imap4',
  995: 'pop_3',
  3306: 'mysql',
  3389: 'private',
  5900: 'X11',
};

function mapProtocol(p: NetworkPacket['protocol']): 'tcp' | 'udp' | 'icmp' {
  if (p === 'UDP' || p === 'DNS') return 'udp';
  if (p === 'ICMP') return 'icmp';
  return 'tcp';
}

function mapService(packet: NetworkPacket): string {
  const byPort = PORT_TO_SERVICE[packet.destPort];
  if (byPort) return byPort;
  if (packet.protocol === 'HTTP' || packet.protocol === 'HTTPS') return 'http';
  if (packet.protocol === 'DNS') return 'domain_u';
  if (packet.protocol === 'SSH') return 'ssh';
  if (packet.protocol === 'FTP') return 'ftp';
  return 'other';
}

function mapFlag(flags?: string): string {
  // NSL-KDD flag is a connection-state code, not raw TCP bits. We fold the
  // most common TCP flag combinations to the closest KDD code:
  //   - normal complete handshake -> SF
  //   - SYN with no reply -> S0
  //   - RST -> RSTR
  //   - URG/PSH-heavy ‑> SH ("syn handshake?")
  if (!flags) return 'SF';
  const f = flags.toUpperCase();
  if (f.includes('RST')) return f.includes('SYN') ? 'RSTOS0' : 'RSTR';
  if (f === 'SYN') return 'S0';
  if (f === 'SYN,FIN' || f === 'FIN,SYN') return 'SF';
  if (f === 'URG' || f.includes('URG,PSH')) return 'SH';
  if (f.includes('SYN,ACK')) return 'SF';
  if (f.includes('FIN,ACK')) return 'SF';
  if (f.includes('PSH,ACK')) return 'SF';
  return 'OTH';
}

/** Optional override fields a generator may stamp onto a packet to push it
 * toward a specific NSL-KDD attack region. */
export interface KddOverride extends Partial<KDDRow> {}

declare module '../types' {
  interface NetworkPacket {
    /** Optional NSL-KDD feature override stamped by synthetic generators. */
    kddOverride?: KddOverride;
  }
}

export function packetToKddRow(packet: NetworkPacket): KDDRow {
  const proto = mapProtocol(packet.protocol);
  const isSameHost = packet.sourceIP === packet.destIP;

  const base: KDDRow = {
    duration: 0,
    protocol_type: proto,
    service: mapService(packet),
    flag: mapFlag(packet.flags),
    src_bytes: Math.min(packet.packetSize, 1_000_000),
    dst_bytes: 0,
    land: isSameHost && packet.sourcePort === packet.destPort ? 1 : 0,
    wrong_fragment: 0,
    urgent: packet.flags?.includes('URG') ? 1 : 0,
    hot: 0,
    num_failed_logins: 0,
    logged_in: 0,
    num_compromised: 0,
    root_shell: 0,
    su_attempted: 0,
    num_root: 0,
    num_file_creations: 0,
    num_shells: 0,
    num_access_files: 0,
    num_outbound_cmds: 0,
    is_host_login: 0,
    is_guest_login: 0,
    count: 1,
    srv_count: 1,
    serror_rate: packet.flags === 'SYN' ? 0.5 : 0,
    srv_serror_rate: packet.flags === 'SYN' ? 0.5 : 0,
    rerror_rate: packet.flags?.includes('RST') ? 0.5 : 0,
    srv_rerror_rate: packet.flags?.includes('RST') ? 0.5 : 0,
    same_srv_rate: 1,
    diff_srv_rate: 0,
    srv_diff_host_rate: 0,
    dst_host_count: 1,
    dst_host_srv_count: 1,
    dst_host_same_srv_rate: 1,
    dst_host_diff_srv_rate: 0,
    dst_host_same_src_port_rate: 0,
    dst_host_srv_diff_host_rate: 0,
    dst_host_serror_rate: 0,
    dst_host_srv_serror_rate: 0,
    dst_host_rerror_rate: 0,
    dst_host_srv_rerror_rate: 0,
    label: 'normal',
  };

  if (packet.kddOverride) {
    return { ...base, ...packet.kddOverride } as KDDRow;
  }
  return base;
}
