/**
 * Training API Route
 * Handles training data management and model retraining
 */

import { NextRequest, NextResponse } from 'next/server';
import { autoTrainingService } from '@/lib/services/auto-training';
import { retrainDetector } from '@/lib/services/detection';

// GET - Get training data and stats
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type');

        if (type === 'export') {
            const exportData = autoTrainingService.exportTrainingData();
            return NextResponse.json({
                success: true,
                data: exportData
            });
        }

        if (type === 'samples') {
            const label = searchParams.get('label') as 'normal' | 'anomaly' | undefined;
            const verified = searchParams.get('verified');
            const limit = parseInt(searchParams.get('limit') || '50');

            const samples = autoTrainingService.getTrainingData({
                label: label || undefined,
                verified: verified === 'true' ? true : verified === 'false' ? false : undefined,
                limit
            });

            return NextResponse.json({ success: true, samples });
        }

        // Default: return stats and config
        const stats = autoTrainingService.getStats();
        const config = autoTrainingService.getConfig();

        return NextResponse.json({
            success: true,
            stats,
            config
        });
    } catch (error) {
        console.error('Training GET error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to get training data' },
            { status: 500 }
        );
    }
}

// POST - Import training data or trigger retraining
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, data, config } = body;

        if (action === 'import' && data) {
            autoTrainingService.importTrainingData(data);
            const stats = autoTrainingService.getStats();

            return NextResponse.json({
                success: true,
                message: 'Training data imported',
                stats
            });
        }

        if (action === 'retrain') {
            const result = await autoTrainingService.executeRetraining();

            // Also retrain the detector with new data
            retrainDetector();

            return NextResponse.json({
                success: true,
                message: 'Model retrained successfully',
                result
            });
        }

        if (action === 'updateConfig' && config) {
            const updatedConfig = autoTrainingService.updateConfig(config);
            return NextResponse.json({
                success: true,
                message: 'Training config updated',
                config: updatedConfig
            });
        }

        if (action === 'verify') {
            const { sampleId, isCorrect, correctLabel } = body;
            if (!sampleId) {
                return NextResponse.json(
                    { success: false, error: 'Sample ID required' },
                    { status: 400 }
                );
            }

            autoTrainingService.verifyDataPoint(sampleId, isCorrect, correctLabel);
            return NextResponse.json({
                success: true,
                message: 'Sample verified'
            });
        }

        return NextResponse.json(
            { success: false, error: 'Invalid action' },
            { status: 400 }
        );
    } catch (error) {
        console.error('Training POST error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to process request' },
            { status: 500 }
        );
    }
}

// DELETE - Delete training sample or clear data
export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, sampleId } = body;

        if (action === 'clearAll') {
            autoTrainingService.clearTrainingData();
            return NextResponse.json({
                success: true,
                message: 'All training data cleared'
            });
        }

        if (action === 'deleteSample' && sampleId) {
            const deleted = autoTrainingService.deleteTrainingSample(sampleId);

            if (deleted) {
                return NextResponse.json({
                    success: true,
                    message: 'Sample deleted'
                });
            } else {
                return NextResponse.json(
                    { success: false, error: 'Sample not found' },
                    { status: 404 }
                );
            }
        }

        return NextResponse.json(
            { success: false, error: 'Invalid action or missing sample ID' },
            { status: 400 }
        );
    } catch (error) {
        console.error('Training DELETE error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to process request' },
            { status: 500 }
        );
    }
}

// PATCH - Update training config
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const updatedConfig = autoTrainingService.updateConfig(body);

        return NextResponse.json({
            success: true,
            message: 'Training config updated',
            config: updatedConfig
        });
    } catch (error) {
        console.error('Training PATCH error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update config' },
            { status: 500 }
        );
    }
}
