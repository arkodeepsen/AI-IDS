import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 200);
    const offset = parseInt(searchParams.get('offset') ?? '0');

    const where: Record<string, string> = {};
    if (status) where.status = status.toUpperCase();
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

    const alert = await prisma.alert.create({
      data: {
        severity: (severity as string).toUpperCase(),
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

    const data: Record<string, unknown> = { status: status.toUpperCase() };
    if (notes) data.notes = notes;
    if (handledBy) data.handledBy = handledBy;
    if (status === 'RESOLVED' || status === 'FALSE_POSITIVE' || status === 'resolved' || status === 'false-positive') {
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
