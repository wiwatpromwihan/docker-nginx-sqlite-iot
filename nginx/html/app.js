// IoT Dashboard Frontend Logic with Chart.js, Duo Theme & Thailand Timezone

const REFRESH_INTERVAL_SEC = 3;
let countdown = REFRESH_INTERVAL_SEC;
let isPaused = false;
let countdownTimer = null;

// Filters state
let currentDeviceFilter = 'ALL';
let currentRangeLimit = 20;

// Chart instances
let tempChart = null;
let humiChart = null;

// Device Color Palette
const DEVICE_COLORS = {
  'ESP32-001': { border: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' }, // Cyan
  'ESP32-002': { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' }, // Purple
  'ESP32-003': { border: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' }, // Emerald
  'ESP32-004': { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' }, // Amber
};

// Thai Date/Time Formatter
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

const thaiTimeOnlyFormatter = new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok',
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
    const parsed = new Date(dateString.replace(' ', 'T') + '+07:00');
    if (!isNaN(parsed.getTime())) {
      return thaiDateFormatter.format(parsed) + ' น.';
    }
    return dateString;
  } catch (e) {
    return dateString;
  }
}

function formatThaiTimeOnly(dateString) {
  if (!dateString) return '';
  try {
    const parsed = new Date(dateString.replace(' ', 'T') + '+07:00');
    if (!isNaN(parsed.getTime())) {
      return thaiTimeOnlyFormatter.format(parsed);
    }
    return dateString.split(' ')[1] || dateString;
  } catch (e) {
    return dateString;
  }
}

// Theme Handling (Light / Dark Duo)
function initTheme() {
  const savedTheme = localStorage.getItem('iot-theme') || 'dark';
  applyTheme(savedTheme);

  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem('iot-theme', next);
      updateChartTheme();
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const themeIcon = document.getElementById('theme-icon');
  const themeText = document.getElementById('theme-text');
  if (theme === 'dark') {
    if (themeIcon) themeIcon.textContent = '☀️';
    if (themeText) themeText.textContent = 'Light Mode';
  } else {
    if (themeIcon) themeIcon.textContent = '🌙';
    if (themeText) themeText.textContent = 'Dark Mode';
  }
}

function getThemeColors() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    gridColor: isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.08)',
    tickColor: isLight ? '#64748b' : '#94a3b8',
    tooltipBg: isLight ? 'rgba(15, 23, 42, 0.92)' : 'rgba(30, 41, 59, 0.95)',
    tooltipText: '#ffffff'
  };
}

// Initialize Charts
function initCharts() {
  const tempCtx = document.getElementById('tempChart');
  const humiCtx = document.getElementById('humidityChart');
  if (!tempCtx || !humiCtx) return;

  const colors = getThemeColors();

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: colors.tickColor,
          font: { family: "'Prompt', sans-serif", size: 12 },
          usePointStyle: true,
          boxWidth: 8
        }
      },
      tooltip: {
        backgroundColor: colors.tooltipBg,
        titleColor: colors.tooltipText,
        bodyColor: colors.tooltipText,
        titleFont: { family: "'Prompt', sans-serif", size: 12 },
        bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
        padding: 10,
        cornerRadius: 8
      }
    },
    scales: {
      x: {
        grid: { color: colors.gridColor },
        ticks: {
          color: colors.tickColor,
          font: { family: "'JetBrains Mono', monospace", size: 11 },
          maxRotation: 45
        }
      },
      y: {
        grid: { color: colors.gridColor },
        ticks: {
          color: colors.tickColor,
          font: { family: "'JetBrains Mono', monospace", size: 11 }
        }
      }
    }
  };

  // Temp Chart
  tempChart = new Chart(tempCtx, {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {
      ...commonOptions,
      scales: {
        ...commonOptions.scales,
        y: {
          ...commonOptions.scales.y,
          suggestedMin: 20,
          suggestedMax: 42,
          ticks: {
            ...commonOptions.scales.y.ticks,
            callback: (v) => `${v}°C`
          }
        }
      }
    }
  });

  // Humidity Chart
  humiChart = new Chart(humiCtx, {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {
      ...commonOptions,
      scales: {
        ...commonOptions.scales,
        y: {
          ...commonOptions.scales.y,
          suggestedMin: 40,
          suggestedMax: 95,
          ticks: {
            ...commonOptions.scales.y.ticks,
            callback: (v) => `${v}%`
          }
        }
      }
    }
  });
}

function updateChartTheme() {
  if (!tempChart || !humiChart) return;
  const colors = getThemeColors();

  [tempChart, humiChart].forEach((chart) => {
    chart.options.scales.x.grid.color = colors.gridColor;
    chart.options.scales.x.ticks.color = colors.tickColor;
    chart.options.scales.y.grid.color = colors.gridColor;
    chart.options.scales.y.ticks.color = colors.tickColor;
    chart.options.plugins.legend.labels.color = colors.tickColor;
    chart.options.plugins.tooltip.backgroundColor = colors.tooltipBg;
    chart.update('none');
  });
}

// Fetch and Process Data
async function fetchDashboardData() {
  try {
    const devQuery = currentDeviceFilter !== 'ALL' ? `&device_id=${encodeURIComponent(currentDeviceFilter)}` : '';
    const logsUrl = `/api/logs?limit=${currentRangeLimit}${devQuery}`;
    const statsUrl = '/api/stats';

    const [logsRes, statsRes] = await Promise.all([
      fetch(logsUrl, { cache: 'no-store' }),
      fetch(statsUrl, { cache: 'no-store' })
    ]);

    if (!logsRes.ok || !statsRes.ok) {
      throw new Error(`API error (${logsRes.status}, ${statsRes.status})`);
    }

    const logsJson = await logsRes.json();
    const statsJson = await statsRes.json();

    const logs = logsJson.data || [];
    renderStats(statsJson);
    renderLogs(logs);
    updateChartsData(logs);

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

// Update Charts with Fresh Data
function updateChartsData(logs) {
  if (!tempChart || !humiChart || logs.length === 0) return;

  // Reverse logs so timeline runs from left (oldest) to right (newest)
  const chronoLogs = [...logs].reverse();

  // Distinct timeline labels
  const timeLabels = chronoLogs.map((r) => formatThaiTimeOnly(r.timestamp));

  if (currentDeviceFilter === 'ALL') {
    // Multi-device comparison
    const devices = ['ESP32-001', 'ESP32-002', 'ESP32-003', 'ESP32-004'];

    const tempDatasets = devices.map((dev) => {
      const cfg = DEVICE_COLORS[dev] || { border: '#94a3b8', bg: 'transparent' };
      const data = chronoLogs.map((r) => (r.device_id === dev ? r.temperature : null));
      return {
        label: dev,
        data: data,
        borderColor: cfg.border,
        backgroundColor: cfg.bg,
        tension: 0.35,
        spanGaps: true,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 6
      };
    });

    const humiDatasets = devices.map((dev) => {
      const cfg = DEVICE_COLORS[dev] || { border: '#94a3b8', bg: 'transparent' };
      const data = chronoLogs.map((r) => (r.device_id === dev ? r.humidity : null));
      return {
        label: dev,
        data: data,
        borderColor: cfg.border,
        backgroundColor: cfg.bg,
        tension: 0.35,
        spanGaps: true,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 6
      };
    });

    tempChart.data.labels = timeLabels;
    tempChart.data.datasets = tempDatasets;
    tempChart.update();

    humiChart.data.labels = timeLabels;
    humiChart.data.datasets = humiDatasets;
    humiChart.update();
  } else {
    // Single Device Detailed View
    const cfg = DEVICE_COLORS[currentDeviceFilter] || { border: '#0284c7', bg: 'rgba(2, 132, 199, 0.15)' };
    const tempData = chronoLogs.map((r) => r.temperature);
    const humiData = chronoLogs.map((r) => r.humidity);

    tempChart.data.labels = timeLabels;
    tempChart.data.datasets = [
      {
        label: `${currentDeviceFilter} อุณหภูมิ (°C)`,
        data: tempData,
        borderColor: '#f43f5e',
        backgroundColor: 'rgba(244, 63, 94, 0.15)',
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: 3.5,
        pointHoverRadius: 6
      }
    ];
    tempChart.update();

    humiChart.data.labels = timeLabels;
    humiChart.data.datasets = [
      {
        label: `${currentDeviceFilter} ความชื้น (%)`,
        data: humiData,
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56, 189, 248, 0.15)',
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: 3.5,
        pointHoverRadius: 6
      }
    ];
    humiChart.update();
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
        <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.82rem;">#${row.id}</td>
        <td class="timestamp-tag">${thaiTime}</td>
        <td class="device-tag">${escapeHtml(row.device_id)}</td>
        <td>${escapeHtml(row.location)}</td>
        <td style="font-weight: 600; color: var(--accent-temp); font-family: 'JetBrains Mono', monospace;">${Number(row.temperature).toFixed(1)}°C</td>
        <td style="font-weight: 600; color: var(--accent-humi); font-family: 'JetBrains Mono', monospace;">${Number(row.humidity).toFixed(1)}%</td>
        <td><span class="badge ${badgeClass}">${escapeHtml(row.status)}</span></td>
        <td style="color: var(--text-muted); font-size: 0.82rem;">${escapeHtml(row.note || '-')}</td>
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

// Setup Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Theme (Duo: Dark/Light)
  initTheme();

  // 2. Initialize Charts
  initCharts();

  // 3. Start Thai clock
  updateLiveClock();
  setInterval(updateLiveClock, 1000);

  // 4. Initial Fetch
  fetchDashboardData();

  // 5. Start Auto-refresh countdown
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

  // Device Filter Buttons
  const devGroup = document.getElementById('device-filter-group');
  if (devGroup) {
    devGroup.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        devGroup.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentDeviceFilter = btn.getAttribute('data-dev');
        fetchDashboardData();
      });
    });
  }

  // Range Filter Buttons
  const rangeGroup = document.getElementById('range-filter-group');
  if (rangeGroup) {
    rangeGroup.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        rangeGroup.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentRangeLimit = parseInt(btn.getAttribute('data-range'), 10) || 20;
        fetchDashboardData();
      });
    });
  }
});
