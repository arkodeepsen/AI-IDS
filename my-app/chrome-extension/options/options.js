// Options Page Script

const DEFAULT_SETTINGS = {
    apiBaseUrl: 'http://localhost:3000',
    checkIntervalSeconds: 30,
    notificationsEnabled: true,
    isPaused: false
};

async function loadSettings() {
    const settings = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));

    document.getElementById('apiUrl').value = settings.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl;
    document.getElementById('checkInterval').value = settings.checkIntervalSeconds || DEFAULT_SETTINGS.checkIntervalSeconds;
    document.getElementById('notifications').checked = settings.notificationsEnabled !== false;
}

async function saveSettings() {
    const apiBaseUrl = document.getElementById('apiUrl').value.trim() || DEFAULT_SETTINGS.apiBaseUrl;
    const checkIntervalSeconds = parseInt(document.getElementById('checkInterval').value) || DEFAULT_SETTINGS.checkIntervalSeconds;
    const notificationsEnabled = document.getElementById('notifications').checked;

    // Validate
    if (checkIntervalSeconds < 10 || checkIntervalSeconds > 300) {
        showStatus('Check interval must be between 10 and 300 seconds', 'error');
        return;
    }

    try {
        new URL(apiBaseUrl);
    } catch {
        showStatus('Invalid URL format', 'error');
        return;
    }

    await chrome.storage.local.set({
        apiBaseUrl,
        checkIntervalSeconds,
        notificationsEnabled
    });

    showStatus('Settings saved successfully!', 'success');
}

async function resetSettings() {
    await chrome.storage.local.set(DEFAULT_SETTINGS);
    await loadSettings();
    showStatus('Settings reset to defaults', 'success');
}

function showStatus(message, type) {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;

    setTimeout(() => {
        statusEl.className = 'status-message';
    }, 3000);
}

// Event listeners
document.addEventListener('DOMContentLoaded', loadSettings);
document.getElementById('saveBtn').addEventListener('click', saveSettings);
document.getElementById('resetBtn').addEventListener('click', resetSettings);
