// IoT Dashboard Frontend Logic with Thailand Timezone & Auto-refresh

const REFRESH_INTERVAL_SEC = 3;
let countdown = REFRESH_INTERVAL_SEC;
let isPaused = false;
let refreshTimer = null;
let countdownTimer = null;

// Thai Time Formatter
const thaiDateFormatter = new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

// Update Live Thai Clock on Header
function updateLiveClock() {
  const clockEl = document.getElementById('live-thai-clock');
  if (clockEl) {
    const now = new Date();
    clockEl.textContent = thaiDateFormatter.format(now) + ' น.';
  }
}

// Convert SQLite ISO/timestamp string to Thai formatted string
function formatThaiDateTime(dateString) {
  if (!dateString) return '-';
  try {
    // If format is "YYYY-MM-DD HH:MM:SS"
    const parsed = new Date(dateString.replace(' ', 'T') + '+07:00');
    if (!isNaN(parsed.getTime())) {
      return thaiDateFormatter.format(parsed) + ' น.';
    }
    return dateString;
  } catch (e) {
    return dateString;
  }
}

// Fetch and Render Dashboard Data
async function fetchDashboardData() {
  try {
    // Fetch logs and stats in parallel
    const [logsRes, statsRes] = await Promise.all([
      fetch('/api/logs?limit=25', { cache: 'no-store' }),
      fetch('/api/stats', { cache: 'no-store' })
    ]);

    if (!logsRes.ok || !statsRes.ok) {
      throw new Error(`API Error: logs=${logsRes.status}, stats=${statsRes.status}`);
    }

    const logsJson = await logsRes.json();
    const statsJson = await statsRes.json();

    renderStats(statsJson);
    renderLogs(logsJson.data || []);

    const lastUpdateEl = document.getElementById('last-update-text');
    if (lastUpdateEl) {
      lastUpdateEl.textContent = `อัปเดตล่าสุด: ${formatThaiDateTime(logsJson.server_time_th || new Date().toISOString())}`;
    }
  } catch (err) {
    console.error('Fetch error:', err);
    const lastUpdateEl = document.getElementById('last-update-text');
    if (lastUpdateEl) {
      lastUpdateEl.textContent = `⚠️ ข้อผิดพลาดในการเชื่อมต่อ API (${err.message})`;
    }
  }
}

function renderStats(stats) {
  const agg = stats.statistics || {};
  const latest = stats.latest || {};

  // Temperature
  const tempEl = document.getElementById('stat-temp');
  if (tempEl) {
    tempEl.innerHTML = latest.temperature !== undefined ? `${latest.temperature} <span class="unit">°C</span>` : '-- <span class="unit">°C</span>';
  }
  const tempRangeEl = document.getElementById('stat-temp-range');
  if (tempRangeEl) {
    tempRangeEl.textContent = `เฉลี่ย: ${agg.avg_temp ?? '--'}°C | สูงสุด: ${agg.max_temp ?? '--'}°C`;
  }

  // Humidity
  const humiEl = document.getElementById('stat-humidity');
  if (humiEl) {
    humiEl.innerHTML = latest.humidity !== undefined ? `${latest.humidity} <span class="unit">%</span>` : '-- <span class="unit">%</span>';
  }
  const humiRangeEl = document.getElementById('stat-humidity-range');
  if (humiRangeEl) {
    humiRangeEl.textContent = `เฉลี่ย: ${agg.avg_humidity ?? '--'}% | สูงสุด: ${agg.max_humidity ?? '--'}%`;
  }

  // Status
  const statusEl = document.getElementById('stat-status');
  if (statusEl) {
    const st = latest.status || 'NORMAL';
    let badgeClass = 'badge-normal';
    if (st === 'WARNING') badgeClass = 'badge-warning';
    if (st === 'CRITICAL') badgeClass = 'badge-critical';
    statusEl.innerHTML = `<span class="badge ${badgeClass}">${st}</span>`;
  }
  const devInfoEl = document.getElementById('stat-device-info');
  if (devInfoEl) {
    devInfoEl.textContent = latest.device_id ? `อุปกรณ์ล่าสุด: ${latest.device_id}` : 'อุปกรณ์: --';
  }

  // Total Records
  const totalEl = document.getElementById('stat-total-records');
  if (totalEl) {
    totalEl.innerHTML = `${(agg.total_count || 0).toLocaleString()} <span class="unit">รายการ</span>`;
  }
  const warnEl = document.getElementById('stat-warning-count');
  if (warnEl) {
    const warnings = (agg.warning_count || 0) + (agg.critical_count || 0);
    warnEl.textContent = `คำเตือน/วิกฤต: ${warnings.toLocaleString()} รายการ`;
  }
}

function renderLogs(logs) {
  const tbody = document.getElementById('logs-table-body');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--text-muted);">ยังไม่มีข้อมูลเซนเซอร์ใน SQLite</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(row => {
    let badgeClass = 'badge-normal';
    if (row.status === 'WARNING') badgeClass = 'badge-warning';
    if (row.status === 'CRITICAL') badgeClass = 'badge-critical';

    const thaiTime = formatThaiDateTime(row.timestamp);

    return `
      <tr>
        <td>#${row.id}</td>
        <td class="timestamp-tag">${thaiTime}</td>
        <td class="device-tag">${escapeHtml(row.device_id)}</td>
        <td>${escapeHtml(row.location)}</td>
        <td style="font-weight: 600; color: #38bdf8;">${Number(row.temperature).toFixed(1)}°C</td>
        <td style="color: #60a5fa;">${Number(row.humidity).toFixed(1)}%</td>
        <td><span class="badge ${badgeClass}">${escapeHtml(row.status)}</span></td>
        <td style="color: var(--text-muted); font-size: 0.85rem;">${escapeHtml(row.note || '-')}</td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Countdown & Interval Management
function startCountdown() {
  const countdownEl = document.getElementById('countdown');
  const pulseEl = document.getElementById('pulse-indicator');

  countdownTimer = setInterval(() => {
    if (isPaused) return;

    countdown -= 1;
    if (countdownEl) countdownEl.textContent = countdown;

    if (countdown <= 0) {
      countdown = REFRESH_INTERVAL_SEC;
      if (countdownEl) countdownEl.textContent = countdown;
      fetchDashboardData();
    }
  }, 1000);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Start Thai clock
  updateLiveClock();
  setInterval(updateLiveClock, 1000);

  // Initial Fetch
  fetchDashboardData();

  // Start Auto-refresh countdown
  startCountdown();

  // Manual Refresh Button
  const manualBtn = document.getElementById('manual-refresh-btn');
  if (manualBtn) {
    manualBtn.addEventListener('click', () => {
      countdown = REFRESH_INTERVAL_SEC;
      document.getElementById('countdown').textContent = countdown;
      fetchDashboardData();
    });
  }

  // Pause / Resume Button
  const toggleBtn = document.getElementById('toggle-refresh-btn');
  const pulseEl = document.getElementById('pulse-indicator');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      isPaused = !isPaused;
      if (isPaused) {
        toggleBtn.textContent = '▶️ ดำเนินการต่อ';
        if (pulseEl) pulseEl.classList.add('paused');
      } else {
        toggleBtn.textContent = '⏸️ หยุดชั่วคราว';
        if (pulseEl) pulseEl.classList.remove('paused');
        countdown = REFRESH_INTERVAL_SEC;
        fetchDashboardData();
      }
    });
  }
});
