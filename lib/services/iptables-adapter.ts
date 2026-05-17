/**
 * iptables adapter — promote in-DB block records to real Linux firewall
 * rules so the IDS's "block" action becomes a real ingress drop, not just
 * a database row.
 *
 * Closes §12.2 item 8 of the project report.
 *
 * Activation
 * ----------
 * - Set IDS_ENABLE_IPTABLES=1 in the environment.
 * - Run as a user that can `sudo iptables` without a password prompt
 *   (typical: a dedicated `ids` user with a /etc/sudoers.d/ids file granting
 *    `NOPASSWD: /usr/sbin/iptables, /usr/sbin/ip6tables`).
 * - The dashboard process must run on Linux. The adapter no-ops on macOS /
 *   Windows / non-Linux hosts.
 *
 * Failure mode
 * ------------
 * If iptables isn't reachable (binary missing, no sudo, IPv6 disabled, etc.)
 * the adapter LOGS the would-be rule and returns false. The in-memory block
 * list and the BlockedIP DB row are still authoritative; the adapter is an
 * additive enforcement layer, not the source of truth.
 *
 * Safety
 * ------
 * - Validates the IP with node:net.isIP() before exec — no shell metachars.
 * - Uses execFile (not exec) so arguments don't shell-interpolate.
 * - Chains rules into a dedicated `IDS-BLOCK` chain so removing the chain
 *   wholesale (`iptables -F IDS-BLOCK`) cleans everything up without
 *   touching unrelated firewall state.
 *
 * Usage
 * -----
 *   import { iptablesAdapter } from '@/lib/services/iptables-adapter';
 *   await iptablesAdapter.block('203.0.113.42', 86400);   // 24h, in seconds
 *   await iptablesAdapter.unblock('203.0.113.42');
 *   const rules = await iptablesAdapter.listRules();
 */

import { execFile } from 'node:child_process';
import { isIP } from 'node:net';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const CHAIN = 'IDS-BLOCK';

function enabled(): boolean {
  return process.env.IDS_ENABLE_IPTABLES === '1' && process.platform === 'linux';
}

function pickBinary(version: 4 | 6): string {
  return version === 6 ? 'ip6tables' : 'iptables';
}

/**
 * Idempotent: creates the IDS-BLOCK chain and the INPUT → IDS-BLOCK jump if
 * they don't already exist. Safe to call on every adapter operation.
 */
async function ensureChain(version: 4 | 6): Promise<void> {
  const bin = pickBinary(version);
  // List chains; if IDS-BLOCK is absent, create it.
  try {
    await execFileP('sudo', [bin, '-L', CHAIN, '-n']);
  } catch {
    await execFileP('sudo', [bin, '-N', CHAIN]);
    await execFileP('sudo', [bin, '-I', 'INPUT', '1', '-j', CHAIN]);
  }
}

class IptablesAdapter {
  async block(ipAddress: string, durationSeconds = 0): Promise<boolean> {
    const version = isIP(ipAddress);
    if (version === 0) {
      console.warn('[iptables] refusing to block invalid IP:', ipAddress);
      return false;
    }
    if (!enabled()) {
      console.info(`[iptables] (disabled) would block ${ipAddress}${durationSeconds ? ` for ${durationSeconds}s` : ''}`);
      return false;
    }
    try {
      await ensureChain(version as 4 | 6);
      const bin = pickBinary(version as 4 | 6);
      await execFileP('sudo', [bin, '-A', CHAIN, '-s', ipAddress, '-j', 'DROP']);
      if (durationSeconds > 0) {
        // Schedule an unblock. We deliberately use a per-process timer
        // rather than `at` / cron so the unblock fires even if the host's
        // task scheduler is locked down. The DB row's expiresAt is the
        // source of truth across restarts; the periodic reconcile task
        // (out of scope here) re-syncs at startup.
        setTimeout(() => {
          this.unblock(ipAddress).catch(err =>
            console.warn(`[iptables] auto-unblock for ${ipAddress} failed:`, err),
          );
        }, durationSeconds * 1000).unref();
      }
      return true;
    } catch (err) {
      console.error(`[iptables] block(${ipAddress}) failed:`, err instanceof Error ? err.message : err);
      return false;
    }
  }

  async unblock(ipAddress: string): Promise<boolean> {
    const version = isIP(ipAddress);
    if (version === 0) return false;
    if (!enabled()) {
      console.info(`[iptables] (disabled) would unblock ${ipAddress}`);
      return false;
    }
    try {
      const bin = pickBinary(version as 4 | 6);
      // -D returns non-zero if the rule isn't present; we ignore that.
      await execFileP('sudo', [bin, '-D', CHAIN, '-s', ipAddress, '-j', 'DROP']).catch(() => {});
      return true;
    } catch (err) {
      console.error(`[iptables] unblock(${ipAddress}) failed:`, err instanceof Error ? err.message : err);
      return false;
    }
  }

  async listRules(): Promise<string[]> {
    if (!enabled()) return [];
    try {
      const { stdout } = await execFileP('sudo', ['iptables', '-L', CHAIN, '-n', '--line-numbers']);
      return stdout.split('\n').filter(l => l.includes('DROP'));
    } catch {
      return [];
    }
  }

  async flushAll(): Promise<void> {
    if (!enabled()) return;
    try {
      await execFileP('sudo', ['iptables', '-F', CHAIN]);
      await execFileP('sudo', ['ip6tables', '-F', CHAIN]).catch(() => {});
    } catch (err) {
      console.warn('[iptables] flush failed:', err);
    }
  }
}

export const iptablesAdapter = new IptablesAdapter();
