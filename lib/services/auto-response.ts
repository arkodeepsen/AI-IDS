/**
 * Auto-Response Service
 * Automatic attack prevention without human intervention
 */

import { DetectionResult, AttackType } from '../types';
import { iptablesAdapter } from './iptables-adapter';
import { fireAlertSinks, type AlertSeverity } from './alert-sinks';

export interface BlockedIP {
    id: string;
    ipAddress: string;
    reason: string;
    attackType?: AttackType;
    confidence: number;
    blockedAt: Date;
    expiresAt: Date | null;
    autoBlocked: boolean;
}

export interface AutoResponseConfig {
    enabled: boolean;
    threatThreshold: number; // 0-1, default 0.85
    autoBlockDuration: number; // minutes, 0 = permanent
    blockOnCritical: boolean;
    blockOnHigh: boolean;
    blockOnMedium: boolean;
    notifyOnBlock: boolean;
    whitelistedIPs: string[];
}

export interface ResponseAction {
    action: 'block' | 'alert' | 'monitor' | 'ignore';
    reason: string;
    autoExecuted: boolean;
}

export interface BlockEvent {
    id: string;
    timestamp: Date;
    ipAddress: string;
    action: 'blocked' | 'unblocked' | 'extended';
    reason: string;
    autoTriggered: boolean;
}

class AutoResponseService {
    private blockedIPs: Map<string, BlockedIP> = new Map();
    private blockEvents: BlockEvent[] = [];
    private config: AutoResponseConfig = {
        enabled: true,
        threatThreshold: 0.55,
        autoBlockDuration: 60,
        blockOnCritical: true,
        blockOnHigh: true,
        // Block on medium too — NSL-KDD R2L attacks (brute force, etc.) often
        // score medium because their features overlap with normal traffic.
        // Operators can tighten this in the Auto-Response tab.
        blockOnMedium: true,
        notifyOnBlock: true,
        whitelistedIPs: ['127.0.0.1', 'localhost']
    };

    /**
     * Evaluate a detection and determine response action
     */
    evaluateThreat(detection: DetectionResult): ResponseAction {
        if (!this.config.enabled) {
            return { action: 'monitor', reason: 'Auto-response disabled', autoExecuted: false };
        }

        const sourceIP = detection.packet.sourceIP;

        // Check whitelist
        if (this.isWhitelisted(sourceIP)) {
            return { action: 'ignore', reason: 'IP is whitelisted', autoExecuted: false };
        }

        // Check if already blocked
        if (this.isBlocked(sourceIP)) {
            return { action: 'ignore', reason: 'IP already blocked', autoExecuted: false };
        }

        // Determine action based on threat level and confidence
        const shouldBlock = this.shouldAutoBlock(detection);

        if (shouldBlock) {
            this.blockIP(sourceIP, {
                reason: `Auto-blocked: ${detection.attackType || 'Anomaly detected'}`,
                attackType: detection.attackType,
                confidence: detection.confidence,
                autoBlocked: true
            });

            return {
                action: 'block',
                reason: `Threat level: ${detection.threatLevel}, Confidence: ${detection.confidence.toFixed(1)}%`,
                autoExecuted: true
            };
        }

        if (detection.isAnomaly) {
            return {
                action: 'alert',
                reason: `Anomaly detected but below auto-block threshold`,
                autoExecuted: false
            };
        }

        return { action: 'monitor', reason: 'Normal traffic', autoExecuted: false };
    }

    /**
     * Determine if threat should be auto-blocked
     */
    private shouldAutoBlock(detection: DetectionResult): boolean {
        if (!detection.isAnomaly) return false;

        const confidenceThreshold = this.config.threatThreshold * 100;
        if (detection.confidence < confidenceThreshold) return false;

        switch (detection.threatLevel) {
            case 'critical':
                return this.config.blockOnCritical;
            case 'high':
                return this.config.blockOnHigh;
            case 'medium':
                return this.config.blockOnMedium;
            default:
                return false;
        }
    }

    /**
     * Block an IP address
     */
    blockIP(ipAddress: string, options: {
        reason: string;
        attackType?: AttackType;
        confidence?: number;
        autoBlocked?: boolean;
        duration?: number; // Override default duration
    }): BlockedIP {
        const duration = options.duration ?? this.config.autoBlockDuration;
        const expiresAt = duration > 0
            ? new Date(Date.now() + duration * 60 * 1000)
            : null;

        const blocked: BlockedIP = {
            id: crypto.randomUUID(),
            ipAddress,
            reason: options.reason,
            attackType: options.attackType,
            confidence: options.confidence || 0,
            blockedAt: new Date(),
            expiresAt,
            autoBlocked: options.autoBlocked ?? false
        };

        this.blockedIPs.set(ipAddress, blocked);

        this.blockEvents.push({
            id: crypto.randomUUID(),
            timestamp: new Date(),
            ipAddress,
            action: 'blocked',
            reason: options.reason,
            autoTriggered: options.autoBlocked ?? false
        });

        // Side effects: real firewall rule + outbound alert sinks. Both
        // are opt-in via env vars and fail-safe (logged, not thrown).
        const durationSec = duration > 0 ? duration * 60 : 0;
        void iptablesAdapter.block(ipAddress, durationSec);
        void fireAlertSinks({
            detectionId: blocked.id,
            timestamp: blocked.blockedAt,
            severity: this.confidenceToSeverity(blocked.confidence),
            title: `Auto-blocked ${ipAddress}`,
            message: `${options.reason}${options.attackType ? ` — attack=${options.attackType}` : ''}${expiresAt ? ` — expires ${expiresAt.toISOString()}` : ' (permanent)'}`,
            sourceIP: ipAddress,
            attackType: options.attackType,
            confidence: options.confidence,
        });

        return blocked;
    }

    private confidenceToSeverity(c: number): AlertSeverity {
        if (c >= 0.85) return 'critical';
        if (c >= 0.65) return 'high';
        if (c >= 0.5) return 'medium';
        return 'low';
    }

    /**
     * Unblock an IP address
     */
    unblockIP(ipAddress: string, reason: string = 'Manual unblock'): boolean {
        if (!this.blockedIPs.has(ipAddress)) {
            return false;
        }

        this.blockedIPs.delete(ipAddress);
        void iptablesAdapter.unblock(ipAddress);

        this.blockEvents.push({
            id: crypto.randomUUID(),
            timestamp: new Date(),
            ipAddress,
            action: 'unblocked',
            reason,
            autoTriggered: false
        });

        return true;
    }

    /**
     * Check if IP is blocked
     */
    isBlocked(ipAddress: string): boolean {
        const blocked = this.blockedIPs.get(ipAddress);
        if (!blocked) return false;

        // Check expiration
        if (blocked.expiresAt && blocked.expiresAt < new Date()) {
            this.blockedIPs.delete(ipAddress);
            this.blockEvents.push({
                id: crypto.randomUUID(),
                timestamp: new Date(),
                ipAddress,
                action: 'unblocked',
                reason: 'Block expired',
                autoTriggered: true
            });
            return false;
        }

        return true;
    }

    /**
     * Check if IP is whitelisted
     */
    isWhitelisted(ipAddress: string): boolean {
        return this.config.whitelistedIPs.includes(ipAddress);
    }

    /**
     * Get all blocked IPs
     */
    getBlockedIPs(): BlockedIP[] {
        // Clean up expired blocks
        const now = new Date();
        for (const [ip, blocked] of this.blockedIPs) {
            if (blocked.expiresAt && blocked.expiresAt < now) {
                this.blockedIPs.delete(ip);
            }
        }
        return Array.from(this.blockedIPs.values());
    }

    /**
     * Get block events history
     */
    getBlockEvents(limit: number = 50): BlockEvent[] {
        return this.blockEvents.slice(-limit);
    }

    /**
     * Update configuration
     */
    updateConfig(updates: Partial<AutoResponseConfig>): AutoResponseConfig {
        this.config = { ...this.config, ...updates };
        return this.config;
    }

    /**
     * Get current configuration
     */
    getConfig(): AutoResponseConfig {
        return { ...this.config };
    }

    /**
     * Add IP to whitelist
     */
    addToWhitelist(ipAddress: string): void {
        if (!this.config.whitelistedIPs.includes(ipAddress)) {
            this.config.whitelistedIPs.push(ipAddress);
        }
        // Also unblock if currently blocked
        this.unblockIP(ipAddress, 'Added to whitelist');
    }

    /**
     * Remove IP from whitelist
     */
    removeFromWhitelist(ipAddress: string): void {
        this.config.whitelistedIPs = this.config.whitelistedIPs.filter(ip => ip !== ipAddress);
    }

    /**
     * Get statistics
     */
    getStats(): {
        totalBlocked: number;
        autoBlocked: number;
        manualBlocked: number;
        totalEvents: number;
    } {
        const blocked = this.getBlockedIPs();
        return {
            totalBlocked: blocked.length,
            autoBlocked: blocked.filter(b => b.autoBlocked).length,
            manualBlocked: blocked.filter(b => !b.autoBlocked).length,
            totalEvents: this.blockEvents.length
        };
    }

    /**
     * Export data for persistence
     */
    exportData(): {
        blockedIPs: BlockedIP[];
        events: BlockEvent[];
        config: AutoResponseConfig;
    } {
        return {
            blockedIPs: this.getBlockedIPs(),
            events: this.blockEvents,
            config: this.config
        };
    }

    /**
     * Import persisted data
     */
    importData(data: {
        blockedIPs?: BlockedIP[];
        events?: BlockEvent[];
        config?: AutoResponseConfig;
    }): void {
        if (data.blockedIPs) {
            this.blockedIPs.clear();
            for (const blocked of data.blockedIPs) {
                this.blockedIPs.set(blocked.ipAddress, blocked);
            }
        }
        if (data.events) this.blockEvents = data.events;
        if (data.config) this.config = data.config;
    }
}

// Singleton instance
export const autoResponseService = new AutoResponseService();
