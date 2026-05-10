import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const VALID_STATUSES = new Set(['NEW', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE']);
const TERMINAL_STATUSES = new Set(['RESOLVED', 'FALSE_POSITIVE']);

function normaliseStatus(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  const upper = input.toUpperCase().replace(/-/g, '_');
  return VALID_STATUSES.has(upper) ? upper : null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 200);
    const offset = parseInt(searchParams.get('offset') ?? '0');

    const where: Record<string, string> = {};
    if (status) {
      const norm = normaliseStatus(status);
      if (norm) where.status = norm;
    }
    if (severity) where.severity = severity.toUpperCase();

    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.alert.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      alerts: alerts.map(a => ({
        ...a,
        severity: a.severity.toLowerCase(),
        status: a.status.toLowerCase(),
      })),
      pagination: { total, limit, offset, hasMore: offset + alerts.length < total },
    });
  } catch (error) {
    console.error('Failed to fetch alerts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch alerts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { severity, title, message, sourceIP, destIP, attackType } = body;

    if (typeof severity !== 'string' || !title || !message || !sourceIP || !destIP) {
      return NextResponse.json(
        { success: false, error: 'severity, title, message, sourceIP and destIP are required' },
        { status: 400 }
      );
    }

    const alert = await prisma.alert.create({
      data: {
        severity: severity.toUpperCase(),
        title,
        message,
        sourceIP,
        destIP,
        attackType,
        status: 'NEW',
      },
    });

    return NextResponse.json({ success: true, alert });
  } catch (error) {
    console.error('Failed to create alert:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create alert' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, notes, handledBy } = body;

    if (typeof id !== 'string' || !id) {
      return NextResponse.json(
        { success: false, error: 'id is required' },
        { status: 400 }
      );
    }

    const normStatus = normaliseStatus(status);
    if (!normStatus) {
      return NextResponse.json(
        {
          success: false,
          error: `status must be one of ${Array.from(VALID_STATUSES).join(', ')}`,
        },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = { status: normStatus };
    if (typeof notes === 'string') data.notes = notes;
    if (typeof handledBy === 'string') data.handledBy = handledBy;
    if (TERMINAL_STATUSES.has(normStatus)) {
      data.handledAt = new Date();
    }

    const alert = await prisma.alert.update({ where: { id }, data });
    return NextResponse.json({ success: true, alert });
  } catch (error) {
    console.error('Failed to update alert:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update alert' },
      { status: 500 }
    );
  }
}
