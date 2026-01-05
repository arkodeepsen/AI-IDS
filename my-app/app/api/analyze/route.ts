import { NextRequest, NextResponse } from 'next/server';
import { analyzeWithGemini, explainDetection, getSecurityAdvice } from '@/lib/gemini';
import { DetectionResult } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, data } = body;

    switch (action) {
      case 'analyze': {
        const { detectionResults, systemContext } = data;
        const analysis = await analyzeWithGemini(
          detectionResults as DetectionResult[],
          systemContext as string
        );
        return NextResponse.json({ success: true, analysis });
      }
      
      case 'explain': {
        const { detection } = data;
        const explanation = await explainDetection(detection as DetectionResult);
        return NextResponse.json({ success: true, explanation });
      }
      
      case 'advice': {
        const { query } = data;
        const advice = await getSecurityAdvice(query as string);
        return NextResponse.json({ success: true, advice });
      }
      
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Gemini API error:', error);
    return NextResponse.json(
      { success: false, error: 'AI analysis failed' },
      { status: 500 }
    );
  }
}
