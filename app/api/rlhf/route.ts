/**
 * RLHF API Route
 * Handles feedback submission and weight management
 */

import { NextRequest, NextResponse } from 'next/server';
import { rlhfService } from '@/lib/services/rlhf';
import { getDetector } from '@/lib/services/detection';

// GET - Get RLHF metrics and current weights
export async function GET() {
    try {
        const metrics = rlhfService.getMetrics();
        const weights = rlhfService.getWeights();
        const history = rlhfService.getWeightHistory();
        const feedback = rlhfService.getFeedbackHistory(20);

        return NextResponse.json({
            success: true,
            metrics,
            weights,
            weightHistory: history,
            recentFeedback: feedback
        });
    } catch (error) {
        console.error('RLHF GET error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to get RLHF data' },
            { status: 500 }
        );
    }
}

// POST - Submit feedback
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { detectionId, isCorrect, correctLabel, attackType, modelMethod } = body;

        if (!detectionId || typeof isCorrect !== 'boolean') {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: detectionId, isCorrect' },
                { status: 400 }
            );
        }

        const feedback = rlhfService.addFeedback({
            detectionId,
            isCorrect,
            correctLabel,
            attackType,
            modelMethod
        });

        // Update detector weights
        const newWeights = rlhfService.getWeights();
        const detector = getDetector();
        detector.updateWeights(newWeights);

        return NextResponse.json({
            success: true,
            feedback,
            currentWeights: newWeights
        });
    } catch (error) {
        console.error('RLHF POST error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to submit feedback' },
            { status: 500 }
        );
    }
}

// PATCH - Manually adjust weights or settings
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, learningRate, weights } = body;

        if (action === 'reset') {
            rlhfService.resetWeights();
            const detector = getDetector();
            detector.updateWeights(rlhfService.getWeights());

            return NextResponse.json({
                success: true,
                message: 'Weights reset to defaults',
                weights: rlhfService.getWeights()
            });
        }

        if (action === 'setLearningRate' && typeof learningRate === 'number') {
            rlhfService.setLearningRate(learningRate);
            return NextResponse.json({
                success: true,
                message: 'Learning rate updated',
                learningRate
            });
        }

        if (action === 'forceAdjust') {
            const newWeights = rlhfService.adjustWeights();
            const detector = getDetector();
            detector.updateWeights(newWeights);

            return NextResponse.json({
                success: true,
                message: 'Weights adjusted based on feedback',
                weights: newWeights
            });
        }

        return NextResponse.json(
            { success: false, error: 'Invalid action' },
            { status: 400 }
        );
    } catch (error) {
        console.error('RLHF PATCH error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update settings' },
            { status: 500 }
        );
    }
}
