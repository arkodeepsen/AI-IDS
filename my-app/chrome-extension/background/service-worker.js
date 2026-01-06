// Background Service Worker for Chrome Extension

const DEFAULT_API_URL = 'http://localhost:3000';
let apiBaseUrl = DEFAULT_API_URL;
let isMonitoring = true;
let checkInterval = null;

// Initialize
chrome.runtime.onInstalled.addListener(async () => {
    console.log('AI-Based IDS Monitor installed');

    // Set default settings
    await chrome.storage.local.set({
        apiBaseUrl: DEFAULT_API_URL,
        isPaused: false,
        notificationsEnabled: true,
        checkIntervalSeconds: 30
    });

    // Start monitoring
    startMonitoring();
});

// Load settings and start
chrome.runtime.onStartup.addListener(async () => {
    await loadSettings();
    if (isMonitoring) {
        startMonitoring();
    }
});

async function loadSettings() {
    const result = await chrome.storage.local.get([
        'apiBaseUrl',
        'isPaused',
        'notificationsEnabled',
        'checkIntervalSeconds'
    ]);

    apiBaseUrl = result.apiBaseUrl || DEFAULT_API_URL;
    isMonitoring = !result.isPaused;

    return result;
}

function startMonitoring() {
    // Clear existing interval
    if (checkInterval) {
        clearInterval(checkInterval);
    }

    // Initial check
    checkForThreats();

    // Set up periodic checks
    checkInterval = setInterval(checkForThreats, 30000); // Every 30 seconds

    console.log('Monitoring started');
}

function stopMonitoring() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
    console.log('Monitoring stopped');
}

async function checkForThreats() {
    if (!isMonitoring) return;

    try {
        const response = await fetch(`${apiBaseUrl}/api/detect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count: 10, method: 'Ensemble' })
        });

        if (!response.ok) throw new Error('API request failed');

        const data = await response.json();
        const summary = data.summary || {};

        // Update badge
        updateBadge(summary);

        // Check for critical threats and notify
        if (summary.critical > 0 || summary.high > 0) {
            await notifyThreat(data.results, summary);
        }

    } catch (error) {
        console.error('Threat check failed:', error);
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
    }
}

function updateBadge(summary) {
    const anomalies = summary.anomalies || 0;

    if (anomalies === 0) {
        chrome.action.setBadgeText({ text: '' });
        return;
    }

    chrome.action.setBadgeText({ text: anomalies.toString() });

    if (summary.critical > 0) {
        chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' }); // Purple for critical
    } else if (summary.high > 0) {
        chrome.action.setBadgeBackgroundColor({ color: '#ef4444' }); // Red for high
    } else {
        chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' }); // Orange for medium
    }
}

async function notifyThreat(results, summary) {
    const settings = await chrome.storage.local.get(['notificationsEnabled']);
    if (!settings.notificationsEnabled) return;

    const criticalThreats = results?.filter(r =>
        r.isAnomaly && (r.threatLevel === 'critical' || r.threatLevel === 'high')
    ) || [];

    if (criticalThreats.length === 0) return;

    const threat = criticalThreats[0];
    const blocked = threat.autoResponseAction === 'blocked' ? ' [BLOCKED]' : '';

    chrome.notifications.create({
        type: 'basic',
        iconUrl: '../icons/icon128.png',
        title: `🚨 ${threat.threatLevel.toUpperCase()} Threat Detected${blocked}`,
        message: `${threat.attackType || 'Anomaly'} from ${threat.packet?.sourceIP}\n` +
            `Confidence: ${threat.confidence?.toFixed(1)}%`,
        priority: 2,
        requireInteraction: threat.threatLevel === 'critical'
    });
}

// Listen for storage changes (settings updates)
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.apiBaseUrl) {
            apiBaseUrl = changes.apiBaseUrl.newValue;
        }
        if (changes.isPaused) {
            isMonitoring = !changes.isPaused.newValue;
            if (isMonitoring) {
                startMonitoring();
            } else {
                stopMonitoring();
            }
        }
    }
});

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
    chrome.tabs.create({ url: apiBaseUrl });
});

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'checkThreats') {
        checkForThreats();
    }
});
