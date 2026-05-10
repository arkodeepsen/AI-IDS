// AI-Based IDS — background service worker (Manifest V3).
//
// MV3 service workers can be suspended at any time, so we rely on
// `chrome.alarms` (which is persistent) instead of `setInterval`. Each tick
// reads /api/stats + /api/detections from the running dashboard, updates the
// toolbar badge, and fires a desktop notification for fresh critical / high
// severity detections.

const DEFAULT_API_URL = 'http://localhost:3000';
const ALARM_NAME = 'checkThreats';
const DEFAULT_INTERVAL_MIN = 0.5; // 30 s, the minimum chrome.alarms accepts

// In-memory cache of detection IDs we've already notified about so we don't
// double-buzz the user on every tick.
const seen = new Set();
const SEEN_CAP = 200;

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    apiBaseUrl: DEFAULT_API_URL,
    isPaused: false,
    notificationsEnabled: true,
    checkIntervalMinutes: DEFAULT_INTERVAL_MIN,
  });
  await scheduleAlarm();
  await checkForThreats();
});

chrome.runtime.onStartup.addListener(async () => {
  await scheduleAlarm();
  await checkForThreats();
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) {
    checkForThreats();
  }
});

chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace !== 'local') return;
  if (changes.isPaused || changes.checkIntervalMinutes) {
    await scheduleAlarm();
  }
});

chrome.notifications.onClicked.addListener(async notificationId => {
  const { apiBaseUrl } = await chrome.storage.local.get('apiBaseUrl');
  chrome.tabs.create({ url: apiBaseUrl || DEFAULT_API_URL });
  chrome.notifications.clear(notificationId);
});

async function scheduleAlarm() {
  const { isPaused, checkIntervalMinutes } = await chrome.storage.local.get([
    'isPaused',
    'checkIntervalMinutes',
  ]);
  await chrome.alarms.clear(ALARM_NAME);
  if (isPaused) return;
  const period = Math.max(checkIntervalMinutes || DEFAULT_INTERVAL_MIN, 0.5);
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: period });
}

async function checkForThreats() {
  const settings = await chrome.storage.local.get([
    'apiBaseUrl',
    'isPaused',
    'notificationsEnabled',
  ]);
  if (settings.isPaused) return;
  const base = settings.apiBaseUrl || DEFAULT_API_URL;

  try {
    // Stats give us the badge totals. Detections give us the rows we might
    // need to surface as notifications.
    const [statsRes, detRes] = await Promise.all([
      fetch(`${base}/api/stats?period=1h`, { cache: 'no-store' }),
      fetch(`${base}/api/detections?anomalyOnly=true&limit=10`, { cache: 'no-store' }),
    ]);

    if (!statsRes.ok || !detRes.ok) throw new Error('upstream not reachable');

    const stats = (await statsRes.json()).stats || {};
    const dets = (await detRes.json()).results || [];

    updateBadge(stats);

    if (settings.notificationsEnabled !== false) {
      for (const d of dets) {
        if (seen.has(d.id)) continue;
        if (d.threatLevel === 'critical' || d.threatLevel === 'high') {
          await notifyThreat(d);
        }
        seen.add(d.id);
      }
      if (seen.size > SEEN_CAP) {
        // Trim oldest half — Set preserves insertion order.
        const arr = Array.from(seen);
        seen.clear();
        for (const id of arr.slice(-SEEN_CAP / 2)) seen.add(id);
      }
    }

    await chrome.storage.local.set({
      lastUpdate: new Date().toISOString(),
      lastStats: stats,
      lastError: null,
    });
  } catch (err) {
    console.warn('checkForThreats failed:', err);
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#52525b' });
    await chrome.storage.local.set({ lastError: String(err) });
  }
}

function updateBadge(stats) {
  const anomalies = Number(stats.totalAnomalies || 0);
  const dist = stats.threatLevelDistribution || {};

  if (anomalies === 0) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  chrome.action.setBadgeText({ text: String(Math.min(anomalies, 999)) });

  if ((dist.critical || 0) > 0) {
    chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' });
  } else if ((dist.high || 0) > 0) {
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  } else {
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
  }
}

async function notifyThreat(detection) {
  const blocked = detection.autoResponse === 'blocked' ? ' [BLOCKED]' : '';
  const src = detection.packet?.sourceIP || '';
  const dst = detection.packet?.destIP || '';
  const port = detection.packet?.destPort ?? '';

  chrome.notifications.create(detection.id, {
    type: 'basic',
    iconUrl: '../icons/icon128.png',
    title: `${detection.threatLevel.toUpperCase()} threat${blocked}`,
    message: `${detection.attackType || 'Anomaly'} · ${src} → ${dst}:${port} (${(detection.confidence || 0).toFixed(0)}%)`,
    priority: detection.threatLevel === 'critical' ? 2 : 1,
    requireInteraction: detection.threatLevel === 'critical',
  });
}
