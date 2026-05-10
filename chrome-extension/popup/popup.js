// AI-Based IDS — popup UI.
// Pulls live state from the running dashboard via /api/stats and
// /api/detections (read-only — never triggers detection batches).

class IDSPopup {
  constructor() {
    this.apiBaseUrl = 'http://localhost:3000';
    this.isPaused = false;
    this.refreshInterval = null;
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.bindEvents();
    await this.fetchData();
    this.startAutoRefresh();
  }

  async loadSettings() {
    const result = await chrome.storage.local.get(['apiBaseUrl', 'isPaused']);
    if (result.apiBaseUrl) this.apiBaseUrl = result.apiBaseUrl;
    if (result.isPaused !== undefined) {
      this.isPaused = result.isPaused;
      this.updatePauseButton();
    }
  }

  bindEvents() {
    document
      .getElementById('refreshBtn')
      .addEventListener('click', () => this.fetchData());
    document
      .getElementById('dashboardBtn')
      .addEventListener('click', () => this.openDashboard());
    document.getElementById('pauseBtn').addEventListener('click', () => this.togglePause());
    document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
  }

  async fetchData() {
    if (this.isPaused) return;
    this.updateStatus('Connecting…', '');

    try {
      const [statsRes, detRes] = await Promise.all([
        fetch(`${this.apiBaseUrl}/api/stats?period=1h`, { cache: 'no-store' }),
        fetch(`${this.apiBaseUrl}/api/detections?anomalyOnly=true&limit=5`, {
          cache: 'no-store',
        }),
      ]);

      if (!statsRes.ok || !detRes.ok) throw new Error('upstream not reachable');

      const stats = (await statsRes.json()).stats || {};
      const dets = (await detRes.json()).results || [];

      this.updateStats(stats);
      this.updateDetections(dets);
      this.updateThreatLevel(stats);
      this.updateStatus('Connected', 'connected');
    } catch (error) {
      console.error('Fetch error:', error);
      this.updateStatus('Connection Error', 'error');
      this.showEmptyState('Dashboard unreachable at ' + this.apiBaseUrl);
    }
  }

  updateStats(stats) {
    document.getElementById('totalPackets').textContent = (stats.totalPackets ?? 0).toLocaleString();
    document.getElementById('anomalies').textContent = stats.totalAnomalies ?? 0;
    document.getElementById('blocked').textContent = stats.blockedIPs ?? 0;
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
  }

  updateDetections(detections) {
    const container = document.getElementById('detectionsList');
    if (!detections.length) {
      this.showEmptyState('No recent threats');
      return;
    }
    container.innerHTML = detections.map(d => this.createDetectionItem(d)).join('');
  }

  createDetectionItem(detection) {
    const icon = '⚠️';
    const type = detection.attackType || 'Anomaly';
    const time = new Date(detection.timestamp).toLocaleTimeString();
    const blocked = detection.autoResponse === 'blocked' ? ' 🚫' : '';
    const level = (detection.threatLevel || '').toLowerCase();
    return `
      <div class="detection-item ${level}">
        <span class="detection-icon">${icon}${blocked}</span>
        <div class="detection-details">
          <div class="detection-type">${escapeHtml(type)}</div>
          <div class="detection-ip">${escapeHtml(detection.packet?.sourceIP || '')}</div>
        </div>
        <span class="detection-time">${time}</span>
      </div>
    `;
  }

  updateThreatLevel(stats) {
    const dist = stats.threatLevelDistribution || {};
    const total = (dist.critical || 0) + (dist.high || 0) + (dist.medium || 0) + (dist.low || 0);
    const score =
      total > 0
        ? ((dist.critical || 0) * 4 + (dist.high || 0) * 3 + (dist.medium || 0) * 2 + (dist.low || 0)) /
          (total * 4)
        : 0;
    const fill = document.getElementById('threatFill');
    if (fill) fill.style.width = `${Math.round(score * 100)}%`;
  }

  showEmptyState(message) {
    document.getElementById('detectionsList').innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
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
    if (!btn) return;
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

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', () => new IDSPopup());
