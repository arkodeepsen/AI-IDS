import { GoogleGenerativeAI } from '@google/generative-ai';
import { DetectionResult, GeminiAnalysisResponse } from './types';

/**
 * Gemini integration with deterministic offline fallbacks.
 *
 * The dashboard works without an API key — every helper here returns a
 * canned, on-topic response when GEMINI_API_KEY is missing or the request
 * fails. This keeps the demo bulletproof if the laptop is offline.
 */

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export async function analyzeWithGemini(
  detectionResults: DetectionResult[],
  systemContext: string
): Promise<GeminiAnalysisResponse> {
  const anomalies = detectionResults.filter(r => r.isAnomaly);
  const criticalCount = anomalies.filter(r => r.threatLevel === 'critical').length;
  const highCount = anomalies.filter(r => r.threatLevel === 'high').length;

  if (!genAI) {
    return offlineSummary(detectionResults.length, anomalies.length, criticalCount, highCount);
  }

  const attackTypeSummary = anomalies.reduce((acc, r) => {
    if (r.attackType) acc[r.attackType] = (acc[r.attackType] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const prompt = `You are an expert cybersecurity analyst. Analyse this network IDS data and respond ONLY with JSON.

## System Context
${systemContext}

## Detection Summary
- Total packets: ${detectionResults.length}
- Anomalies: ${anomalies.length}
- Critical: ${criticalCount}
- High: ${highCount}
- Detection rate: ${detectionResults.length === 0 ? '0' : ((anomalies.length / detectionResults.length) * 100).toFixed(2)}%

## Attack Type Distribution
${Object.entries(attackTypeSummary)
  .map(([t, c]) => `- ${t}: ${c}`)
  .join('\n')}

## Sample Anomalies
${anomalies
  .slice(0, 5)
  .map(
    a =>
      `- ${a.attackType ?? 'Unknown'} | ${a.threatLevel} | ${a.confidence.toFixed(1)}% | ${a.packet.sourceIP} -> ${a.packet.destIP}:${a.packet.destPort} (${a.packet.protocol})`
  )
  .join('\n')}

Respond with JSON only:
{
  "summary": "2-3 sentence executive summary",
  "riskAssessment": "detailed risk assessment",
  "recommendations": ["5 actionable items"],
  "predictedTrends": "predicted attack trend",
  "technicalDetails": "technical detection analysis"
}`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as GeminiAnalysisResponse;
    throw new Error('No JSON in response');
  } catch (err) {
    console.error('Gemini analyze error:', err);
    return offlineSummary(detectionResults.length, anomalies.length, criticalCount, highCount);
  }
}

export async function explainDetection(detection: DetectionResult): Promise<string> {
  const fallback = `${detection.attackType ?? 'Anomaly'} detected from ${detection.packet.sourceIP} -> ${detection.packet.destIP}:${detection.packet.destPort} over ${detection.packet.protocol}.

Why suspicious: the ensemble scored this packet at ${detection.confidence.toFixed(1)}% confidence (${detection.threatLevel} severity). The detection method was ${detection.detectionMethod}.

Recommended actions:
${detection.recommendations.map(r => `- ${r}`).join('\n')}`;

  if (!genAI) return fallback;

  const prompt = `Explain this intrusion detection result for a non-expert in 2-3 short paragraphs:

Attack: ${detection.attackType ?? 'Unknown'}
Threat: ${detection.threatLevel}
Confidence: ${detection.confidence.toFixed(1)}%
Source: ${detection.packet.sourceIP}:${detection.packet.sourcePort}
Destination: ${detection.packet.destIP}:${detection.packet.destPort}
Protocol: ${detection.packet.protocol}

Explain (1) what was detected and why, (2) potential impact if real, (3) immediate recommended actions.`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.error('Gemini explain error:', err);
    return fallback;
  }
}

const ADVICE_TEMPLATES: Record<string, string> = {
  'ddos':
    'A DDoS attack overwhelms a target with traffic from many sources. Mitigations: enable upstream scrubbing (Cloudflare, AWS Shield), apply rate limits per source IP, and deploy SYN cookies if you see SYN floods.',
  'isolation forest':
    'Isolation Forest builds shallow random trees. Anomalies are isolated faster than normal points, so a short average path length means a high anomaly score. It is unsupervised and very fast at inference.',
  'false positive':
    'False positives happen when benign traffic looks unusual. Reduce them by tuning the anomaly threshold, adding context features (connection counts), enabling Active Learning so the operator can dismiss noise, and combining multiple models in an ensemble (which this system does).',
  'best practice':
    'Layer your defences: a perimeter firewall, network IDS like this one, host EDR, MFA on every account, regular patching, and an incident response runbook. Audit logs continuously.',
};

function fallbackAdvice(query: string): string {
  const q = query.toLowerCase();
  for (const [k, v] of Object.entries(ADVICE_TEMPLATES)) {
    if (q.includes(k)) return v;
  }
  return `An IDS is most effective when (a) the model has rich features per flow, (b) it combines unsupervised + supervised approaches, and (c) operators provide feedback to refine weights over time. This system uses an Isolation Forest + Autoencoder + Random Forest + Gradient Boosting ensemble with Active Learning baked in.`;
}

export async function getSecurityAdvice(query: string): Promise<string> {
  if (!genAI) return fallbackAdvice(query);

  const prompt = `You are a cybersecurity assistant inside an IDS dashboard. Answer this question in 2-3 short paragraphs, focused on network security:

Question: ${query}`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.error('Gemini advice error:', err);
    return fallbackAdvice(query);
  }
}

function offlineSummary(
  total: number,
  anomalies: number,
  critical: number,
  high: number
): GeminiAnalysisResponse {
  const rate = total > 0 ? ((anomalies / total) * 100).toFixed(1) : '0';
  return {
    summary: `Out of ${total} packets analysed, ${anomalies} were flagged as anomalies (${rate}%). ${critical} critical and ${high} high severity events require immediate attention.`,
    riskAssessment:
      critical > 0
        ? 'Risk is elevated. Critical-severity detections suggest active reconnaissance or attempted exploitation. Investigate the source IPs and confirm none reached internal services.'
        : 'Risk is moderate. The current detections are consistent with typical internet background noise rather than a targeted campaign.',
    recommendations: [
      'Confirm any blocked IPs in the auto-response queue and extend duration if the source is recognised as malicious.',
      'Review the Active Learning queue and validate the highest-confidence anomalies first.',
      'Audit firewall rules for the destination ports that received the most attack traffic.',
      'Schedule a model retrain after 50+ verified samples accumulate.',
      'Export the training data periodically as a baseline snapshot.',
    ],
    predictedTrends:
      'Given the current mix, expect continued reconnaissance activity from the same source ranges. DDoS volume tends to grow on weekends; brute-force activity tracks credential leak events.',
    technicalDetails:
      'The ensemble currently weights Isolation Forest at 30%, Autoencoder at 25%, Random Forest at 25%, and Gradient Boosting (XGBoost-style) at 20%. RLHF feedback re-balances these weights every 10 verified samples.',
  };
}
