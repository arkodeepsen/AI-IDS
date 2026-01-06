import { GoogleGenerativeAI } from '@google/generative-ai';
import { DetectionResult, GeminiAnalysisResponse } from './types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function analyzeWithGemini(
  detectionResults: DetectionResult[],
  systemContext: string
): Promise<GeminiAnalysisResponse> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const anomalies = detectionResults.filter(r => r.isAnomaly);
  const criticalCount = anomalies.filter(r => r.threatLevel === 'critical').length;
  const highCount = anomalies.filter(r => r.threatLevel === 'high').length;
  
  const attackTypeSummary = anomalies.reduce((acc, r) => {
    if (r.attackType) {
      acc[r.attackType] = (acc[r.attackType] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const prompt = `You are an expert cybersecurity analyst specializing in network intrusion detection systems. Analyze the following network security data and provide insights.

## System Context
${systemContext}

## Detection Summary
- Total packets analyzed: ${detectionResults.length}
- Anomalies detected: ${anomalies.length}
- Critical threats: ${criticalCount}
- High severity threats: ${highCount}
- Detection rate: ${((anomalies.length / detectionResults.length) * 100).toFixed(2)}%

## Attack Type Distribution
${Object.entries(attackTypeSummary).map(([type, count]) => `- ${type}: ${count} occurrences`).join('\n')}

## Sample Anomalies (up to 5)
${anomalies.slice(0, 5).map(a => `
- Type: ${a.attackType || 'Unknown'}
  Threat Level: ${a.threatLevel}
  Confidence: ${a.confidence.toFixed(1)}%
  Source: ${a.packet.sourceIP}:${a.packet.sourcePort}
  Destination: ${a.packet.destIP}:${a.packet.destPort}
  Protocol: ${a.packet.protocol}
  Detection Method: ${a.detectionMethod}
`).join('\n')}

Please provide a comprehensive analysis in the following JSON format:
{
  "summary": "A 2-3 sentence executive summary of the security situation",
  "riskAssessment": "Detailed risk assessment including threat severity and potential impact",
  "recommendations": ["Array of 5 specific, actionable security recommendations"],
  "predictedTrends": "Prediction of potential future attack patterns based on current data",
  "technicalDetails": "Technical analysis of the detection patterns and ML model performance"
}

Respond ONLY with the JSON object, no additional text.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as GeminiAnalysisResponse;
    }
    
    throw new Error('Invalid response format');
  } catch (error) {
    console.error('Gemini API error:', error);
    return {
      summary: 'Analysis unavailable. Please check API configuration.',
      riskAssessment: 'Unable to perform risk assessment at this time.',
      recommendations: ['Verify Gemini API key configuration', 'Check network connectivity', 'Review system logs'],
      predictedTrends: 'Trend analysis unavailable.',
      technicalDetails: 'Technical analysis could not be completed.'
    };
  }
}

export async function explainDetection(detection: DetectionResult): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `As a cybersecurity expert, explain this network intrusion detection result in simple terms:

Attack Type: ${detection.attackType || 'Unknown Anomaly'}
Threat Level: ${detection.threatLevel}
Confidence: ${detection.confidence.toFixed(1)}%
Detection Method: ${detection.detectionMethod}
Source: ${detection.packet.sourceIP}:${detection.packet.sourcePort}
Destination: ${detection.packet.destIP}:${detection.packet.destPort}
Protocol: ${detection.packet.protocol}

Provide a brief, clear explanation (2-3 paragraphs) that:
1. Explains what was detected and why it's suspicious
2. Describes the potential impact if this is a real attack
3. Suggests immediate actions to take

Keep the language accessible for someone with basic IT knowledge.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini API error:', error);
    return detection.description;
  }
}

export async function getSecurityAdvice(query: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `You are an AI cybersecurity assistant integrated into an Intrusion Detection System. Answer the following security-related question concisely and accurately.

Question: ${query}

Provide a helpful, accurate response focused on network security and intrusion detection. If the question is not related to cybersecurity, politely redirect to security topics.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini API error:', error);
    return 'Unable to process your request. Please try again later.';
  }
}
