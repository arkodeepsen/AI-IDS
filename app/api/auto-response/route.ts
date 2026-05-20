/**
 * Auto-Response API Route
 * Handles automatic attack prevention configuration and IP blocking
 */

import { NextRequest, NextResponse } from 'next/server';
import { autoResponseService } from '@/lib/services/auto-response';
import prisma from '@/lib/prisma';

// GET - Get current config, blocked IPs, and stats
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type');

        if (type === 'blocked') {
            const blockedIPs = autoResponseService.getBlockedIPs();
            return NextResponse.json({ success: true, blockedIPs });
        }

        if (type === 'events') {
            const limit = parseInt(searchParams.get('limit') || '50');
            const events = autoResponseService.getBlockEvents(limit);
            return NextResponse.json({ success: true, events });
        }

        // Default: return everything. Blocked IPs + stats are read from the
        // persisted BlockedIP table — the durable source of truth. The
        // in-memory service resets on restart and isn't shared across route
        // bundles, so reading it here previously showed 0 even when the
        // database was full.
        const config = autoResponseService.getConfig();
        const dbBlocks = await prisma.blockedIP.findMany({
            orderBy: { blockedAt: 'desc' },
        });
        const nowMs = Date.now();
        const blockedIPs = dbBlocks
            .filter(b => !b.expiresAt || b.expiresAt.getTime() > nowMs)
            .map(b => ({
                id: b.id,
                ipAddress: b.ipAddress,
                reason: b.reason,
                attackType: b.attackType ?? undefined,
                confidence: b.confidence,
                blockedAt: b.blockedAt.toISOString(),
                expiresAt: b.expiresAt ? b.expiresAt.toISOString() : null,
                autoBlocked: b.autoBlocked,
            }));
        const stats = {
            totalBlocked: blockedIPs.length,
            autoBlocked: blockedIPs.filter(b => b.autoBlocked).length,
            manualBlocked: blockedIPs.filter(b => !b.autoBlocked).length,
            totalEvents: dbBlocks.length,
        };
        const events = autoResponseService.getBlockEvents(20);

        return NextResponse.json({
            success: true,
            config,
            blockedIPs,
            stats,
            recentEvents: events
        });
    } catch (error) {
        console.error('Auto-response GET error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to get auto-response data' },
            { status: 500 }
        );
    }
}

// POST - Block an IP or update config
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, ipAddress, reason, duration, config } = body;

        if (action === 'block' && ipAddress) {
            const blocked = autoResponseService.blockIP(ipAddress, {
                reason: reason || 'Manual block',
                autoBlocked: false,
                duration
            });

            return NextResponse.json({
                success: true,
                message: `IP ${ipAddress} blocked`,
                blocked
            });
        }

        if (action === 'whitelist' && ipAddress) {
            autoResponseService.addToWhitelist(ipAddress);
            return NextResponse.json({
                success: true,
                message: `IP ${ipAddress} added to whitelist`
            });
        }

        if (action === 'updateConfig' && config) {
            const updatedConfig = autoResponseService.updateConfig(config);
            return NextResponse.json({
                success: true,
                message: 'Configuration updated',
                config: updatedConfig
            });
        }

        return NextResponse.json(
            { success: false, error: 'Invalid action or missing parameters' },
            { status: 400 }
        );
    } catch (error) {
        console.error('Auto-response POST error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to process request' },
            { status: 500 }
        );
    }
}

// DELETE - Unblock an IP or remove from whitelist
export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, ipAddress, reason } = body;

        if (action === 'unblock' && ipAddress) {
            const success = autoResponseService.unblockIP(ipAddress, reason || 'Manual unblock');

            if (success) {
                return NextResponse.json({
                    success: true,
                    message: `IP ${ipAddress} unblocked`
                });
            } else {
                return NextResponse.json(
                    { success: false, error: 'IP not found in block list' },
                    { status: 404 }
                );
            }
        }

        if (action === 'removeWhitelist' && ipAddress) {
            autoResponseService.removeFromWhitelist(ipAddress);
            return NextResponse.json({
                success: true,
                message: `IP ${ipAddress} removed from whitelist`
            });
        }

        return NextResponse.json(
            { success: false, error: 'Invalid action or missing IP address' },
            { status: 400 }
        );
    } catch (error) {
        console.error('Auto-response DELETE error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to process request' },
            { status: 500 }
        );
    }
}

// PATCH - Update specific settings
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();

        const updatedConfig = autoResponseService.updateConfig(body);

        return NextResponse.json({
            success: true,
            message: 'Settings updated',
            config: updatedConfig
        });
    } catch (error) {
        console.error('Auto-response PATCH error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update settings' },
            { status: 500 }
        );
    }
}
