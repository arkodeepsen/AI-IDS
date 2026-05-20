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

/** Current Gemini model — single source of truth. Bump here when Google
 *  ships a newer flash model. */
const GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Shared project context so the assistant answers about THIS system — the
 * AI-IDS major project — instead of generic security trivia.
 */
const IDS_CONTEXT = `You are the built-in assistant for "AI-IDS", an AI-based Network Intrusion Detection System (a B.Tech 2025-26 major project).

About the system:
- Detection core: a four-model ML ensemble combined by weighted vote — Isolation Forest (weight 0.30), MLP Autoencoder (0.25), Random Forest (0.25), XGBoost-style gradient boosting (0.20) — plus a separate LSTM sequence model.
- A flow is flagged as an anomaly when the ensemble score exceeds 0.35. Severity tiers: critical > 0.85, high > 0.65, medium > 0.50, otherwise low.
- Trained and evaluated on NSL-KDD (KDDTest+: 90.99% accuracy, 92.57% F1, 97.99% recall, 18.41% FPR) and, independently, CICIDS-2017 (99.40% accuracy, 98.16% F1, 0.18% FPR).
- Active Learning: operator Confirm/Dismiss feedback rebalances the ensemble weights every 10 verified samples (learning rate 0.05).
- Severity-driven autonomous response: block / alert / monitor, with an IP whitelist and time-limited blocks.
- 72-dimensional feature vector (protocol/service/flag one-hots + 38 numeric stats) plus per-source IP-entropy signals.
- Stack: Next.js 16 dashboard, SQLite via Prisma, a Chrome MV3 extension. Dashboard tabs: Dashboard, Detections, ML Models, Auto-Response, Training, Datasets, Alerts, AI Assistant.

Answer as this system's assistant: be concrete and specific to AI-IDS. When the user asks about current/live numbers, use the "Live system state" data when it is provided.`;

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

  const prompt = `${IDS_CONTEXT}

Acting as the expert analyst for the system above, analyse this network IDS data and respond ONLY with JSON.

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
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
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

  const prompt = `${IDS_CONTEXT}

Explain this intrusion detection result from the system above for a non-expert, in 2-3 short paragraphs:

Attack: ${detection.attackType ?? 'Unknown'}
Threat: ${detection.threatLevel}
Confidence: ${detection.confidence.toFixed(1)}%
Source: ${detection.packet.sourceIP}:${detection.packet.sourcePort}
Destination: ${detection.packet.destIP}:${detection.packet.destPort}
Protocol: ${detection.packet.protocol}

Explain (1) what was detected and why, (2) potential impact if real, (3) immediate recommended actions.`;

  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
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

export async function getSecurityAdvice(
  query: string,
  liveContext?: string
): Promise<string> {
  if (!genAI) return fallbackAdvice(query);

  const prompt = `${IDS_CONTEXT}
${liveContext ? `\n## Live system state (current dashboard data)\n${liveContext}\n` : ''}
Answer the operator's question below in 2-3 short paragraphs. Be concrete and specific to AI-IDS — reference its models, thresholds, or the live numbers above when relevant. Plain text, no markdown headings.

Question: ${query}`;

  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
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
