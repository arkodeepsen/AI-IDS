import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Severity, AlertStatus } from '@prisma/client';

// GET - Fetch alerts with optional filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as AlertStatus | null;
    const severity = searchParams.get('severity') as Severity | null;
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (severity) where.severity = severity;

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
      alerts,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + alerts.length < total,
      },
    });
  } catch (error) {
    console.error('Failed to fetch alerts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch alerts' },
      { status: 500 }
    );
  }
}

// POST - Create a new alert
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { severity, title, message, sourceIP, destIP, attackType } = body;

    const alert = await prisma.alert.create({
      data: {
        severity: severity as Severity,
        title,
        message,
        sourceIP,
        destIP,
        attackType,
        status: AlertStatus.NEW,
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

// PATCH - Update alert status
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, notes, handledBy } = body;

    const updateData: Record<string, unknown> = { status };
    if (notes) updateData.notes = notes;
    if (handledBy) updateData.handledBy = handledBy;
    if (status === AlertStatus.RESOLVED || status === AlertStatus.FALSE_POSITIVE) {
      updateData.handledAt = new Date();
    }

    const alert = await prisma.alert.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, alert });
  } catch (error) {
    console.error('Failed to update alert:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update alert' },
      { status: 500 }
    );
  }
}
