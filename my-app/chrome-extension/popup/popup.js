// Chrome Extension Popup Script

class IDSPopup {
    constructor() {
        this.apiBaseUrl = 'http://localhost:3000';
        this.isPaused = false;
        this.refreshInterval = null;
        this.init();
    }

    async init() {
        // Load settings
        await this.loadSettings();

        // Bind events
        this.bindEvents();

        // Initial fetch
        await this.fetchData();

        // Start auto-refresh
        this.startAutoRefresh();
    }

    async loadSettings() {
        const result = await chrome.storage.local.get(['apiBaseUrl', 'isPaused']);
        if (result.apiBaseUrl) {
            this.apiBaseUrl = result.apiBaseUrl;
        }
        if (result.isPaused !== undefined) {
            this.isPaused = result.isPaused;
            this.updatePauseButton();
        }
    }

    bindEvents() {
        document.getElementById('refreshBtn').addEventListener('click', () => this.fetchData());
        document.getElementById('dashboardBtn').addEventListener('click', () => this.openDashboard());
        document.getElementById('pauseBtn').addEventListener('click', () => this.togglePause());
        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
    }

    async fetchData() {
        if (this.isPaused) return;

        try {
            this.updateStatus('Connecting...', '');

            // Fetch detections
            const detectResponse = await fetch(`${this.apiBaseUrl}/api/detect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ count: 5, method: 'Ensemble' })
            });

            if (!detectResponse.ok) throw new Error('API request failed');

            const detectData = await detectResponse.json();

            // Fetch auto-response stats
            const responseStats = await this.fetchAutoResponseStats();

            // Update UI
            this.updateStats(detectData, responseStats);
            this.updateDetections(detectData.results || []);
            this.updateThreatLevel(detectData.summary);
            this.updateStatus('Connected', 'connected');

        } catch (error) {
            console.error('Fetch error:', error);
            this.updateStatus('Connection Error', 'error');
            this.showEmptyState('Unable to connect to server');
        }
    }

    async fetchAutoResponseStats() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/auto-response`);
            if (response.ok) {
                return await response.json();
            }
        } catch (e) {
            console.log('Auto-response stats not available');
        }
        return { stats: { totalBlocked: 0 } };
    }

    updateStats(data, responseStats) {
        const summary = data.summary || {};
        document.getElementById('totalPackets').textContent = summary.total || 0;
        document.getElementById('anomalies').textContent = summary.anomalies || 0;
        document.getElementById('blocked').textContent = responseStats?.stats?.totalBlocked || summary.blocked || 0;
        document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
    }

    updateDetections(results) {
        const container = document.getElementById('detectionsList');

        // Filter to show only anomalies, or recent normal traffic
        const detections = results
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 5);

        if (detections.length === 0) {
            this.showEmptyState('No recent detections');
            return;
        }

        container.innerHTML = detections.map(d => this.createDetectionItem(d)).join('');
    }

    createDetectionItem(detection) {
        const icon = detection.isAnomaly ? '⚠️' : '✅';
        const type = detection.isAnomaly
            ? (detection.attackType || 'Unknown Threat')
            : 'Normal Traffic';
        const time = new Date(detection.timestamp).toLocaleTimeString();
        const blocked = detection.autoResponseAction === 'blocked' ? ' 🚫' : '';

        return `
      <div class="detection-item ${detection.threatLevel}">
        <span class="detection-icon">${icon}${blocked}</span>
        <div class="detection-details">
          <div class="detection-type">${type}</div>
          <div class="detection-ip">${detection.packet?.sourceIP || 'Unknown'}</div>
        </div>
        <span class="detection-time">${time}</span>
      </div>
    `;
    }

    updateThreatLevel(summary) {
        const threatFill = document.getElementById('threatFill');
        let threatPercent = 0;

        if (summary) {
            const total = summary.total || 1;
            const anomalies = summary.anomalies || 0;
            const critical = summary.critical || 0;
            const high = summary.high || 0;

            // Calculate threat percentage based on anomaly ratio and severity
            const anomalyRatio = anomalies / total;
            const severityScore = (critical * 4 + high * 2) / (total * 4);
            threatPercent = Math.min(((anomalyRatio + severityScore) / 2) * 100, 100);
        }

        threatFill.style.width = `${threatPercent}%`;

        // Update badge
        chrome.action.setBadgeText({
            text: summary?.anomalies > 0 ? summary.anomalies.toString() : ''
        });
        chrome.action.setBadgeBackgroundColor({
            color: summary?.critical > 0 ? '#7c3aed' :
                summary?.high > 0 ? '#ef4444' : '#f59e0b'
        });
    }

    showEmptyState(message) {
        document.getElementById('detectionsList').innerHTML = `
      <div class="empty-state">${message}</div>
    `;
    }

    updateStatus(text, className) {
        const status = document.getElementById('status');
        status.textContent = text;
        status.className = `status ${className}`;
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        chrome.storage.local.set({ isPaused: this.isPaused });
        this.updatePauseButton();

        if (this.isPaused) {
            this.stopAutoRefresh();
            this.updateStatus('Paused', '');
        } else {
            this.startAutoRefresh();
            this.fetchData();
        }
    }

    updatePauseButton() {
        const btn = document.getElementById('pauseBtn');
        if (this.isPaused) {
            btn.innerHTML = '▶️ Resume';
            btn.classList.add('paused');
        } else {
            btn.innerHTML = '⏸️ Pause';
            btn.classList.remove('paused');
        }
    }

    startAutoRefresh() {
        if (this.refreshInterval) return;
        this.refreshInterval = setInterval(() => this.fetchData(), 5000);
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    openDashboard() {
        chrome.tabs.create({ url: this.apiBaseUrl });
    }

    openSettings() {
        chrome.runtime.openOptionsPage();
    }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
    new IDSPopup();
});
