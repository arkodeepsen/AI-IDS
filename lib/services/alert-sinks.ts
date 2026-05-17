/**
 * Alert sinks — forward auto-response decisions to external channels.
 *
 * Three sink types are supported:
 *   - WEBHOOK     POST JSON to an arbitrary URL
 *   - SLACK       Slack incoming-webhook format (subset of webhook)
 *   - EMAIL       SMTP via the environment's MAIL_*  vars (or no-op if unset)
 *
 * Each sink is opt-in via environment variables — no creds, no traffic.
 * The dispatcher fans out a single Alert to every configured sink and
 * never blocks the caller (errors are logged, not thrown).
 *
 * Closes §12.2 item 9 ("Webhook / Slack / email alert sinks").
 *
 * ENV vars
 * --------
 *   ALERT_WEBHOOK_URL=<https://...>       generic POST
 *   ALERT_SLACK_WEBHOOK_URL=<https://...> Slack incoming webhook
 *   ALERT_EMAIL_TO=<addr,addr,...>        comma-separated recipients
 *   ALERT_EMAIL_SUBJECT_PREFIX="[IDS]"    optional subject prefix
 *   ALERT_MIN_SEVERITY=high               filter — only fire for ≥ this severity
 *
 * Email is implemented via the host's `sendmail` binary (zero npm deps);
 * if `sendmail` isn't on PATH the sink logs a warning and skips. Adding a
 * proper SMTP client (nodemailer) is one line in the future if needed.
 */

import { execFile } from 'node:child_process';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface OutboundAlert {
  detectionId: string;
  timestamp: Date;
  severity: AlertSeverity;
  title: string;
  message: string;
  sourceIP?: string;
  destIP?: string;
  attackType?: string;
  confidence?: number;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function shouldFire(sev: AlertSeverity): boolean {
  const min = (process.env.ALERT_MIN_SEVERITY ?? 'high').toLowerCase() as AlertSeverity;
  return SEVERITY_RANK[sev] >= (SEVERITY_RANK[min] ?? 2);
}

async function postJSON(url: string, body: unknown): Promise<void> {
  // Native fetch is available on Node 18+; Next.js 16 runs on Node 20.
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${url} failed: HTTP ${res.status}`);
  }
}

async function fireWebhook(alert: OutboundAlert): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  await postJSON(url, alert);
}

async function fireSlack(alert: OutboundAlert): Promise<void> {
  const url = process.env.ALERT_SLACK_WEBHOOK_URL;
  if (!url) return;
  // Slack's incoming-webhook schema. The "text" field is the fallback for
  // notification previews; "blocks" carries the rich payload.
  const icon =
    alert.severity === 'critical' ? ':rotating_light:'
    : alert.severity === 'high' ? ':warning:'
    : ':information_source:';
  const text = `${icon} *${alert.severity.toUpperCase()}* — ${alert.title}`;
  await postJSON(url, {
    text,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text } },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: alert.message },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Source: \`${alert.sourceIP ?? 'n/a'}\`` },
          { type: 'mrkdwn', text: `Dest: \`${alert.destIP ?? 'n/a'}\`` },
          { type: 'mrkdwn', text: `Attack: \`${alert.attackType ?? 'unknown'}\`` },
          { type: 'mrkdwn', text: `Confidence: \`${alert.confidence?.toFixed(2) ?? 'n/a'}\`` },
        ],
      },
    ],
  });
}

async function fireEmail(alert: OutboundAlert): Promise<void> {
  const to = process.env.ALERT_EMAIL_TO;
  if (!to) return;
  const prefix = process.env.ALERT_EMAIL_SUBJECT_PREFIX ?? '[IDS]';
  const subject = `${prefix} ${alert.severity.toUpperCase()}: ${alert.title}`;
  const body = [
    `Severity:    ${alert.severity}`,
    `Detection:   ${alert.detectionId}`,
    `Timestamp:   ${alert.timestamp.toISOString()}`,
    `Source IP:   ${alert.sourceIP ?? 'n/a'}`,
    `Dest IP:     ${alert.destIP ?? 'n/a'}`,
    `Attack type: ${alert.attackType ?? 'unknown'}`,
    `Confidence:  ${alert.confidence?.toFixed(2) ?? 'n/a'}`,
    '',
    alert.message,
  ].join('\n');
  const payload = `To: ${to}\nSubject: ${subject}\n\n${body}\n`;
  // Hand off to the host's sendmail. If sendmail isn't installed, the
  // exec fails and we log; we deliberately don't add an SMTP-client
  // dependency.
  await new Promise<void>((resolve, reject) => {
    const proc = execFile('sendmail', ['-t'], (err) => {
      if (err) reject(err);
      else resolve();
    });
    proc.stdin?.end(payload);
  });
}

export async function fireAlertSinks(alert: OutboundAlert): Promise<void> {
  if (!shouldFire(alert.severity)) return;
  const work: Promise<void>[] = [];
  for (const fn of [fireWebhook, fireSlack, fireEmail]) {
    work.push(
      fn(alert).catch(err => {
        console.warn(`[alert-sink] ${fn.name} failed:`, err instanceof Error ? err.message : err);
      }),
    );
  }
  await Promise.all(work);
}
