// ========================================
// ANALYTICS VIEW (analytics.js)
// ========================================

// State Variables
let analyticsRange = 30;
let analyticsData = null;
const activeCharts = {};
let clientsTableData = [];
let tableSortCol = 'calls';
let tableSortDir = 'desc';
let currentClientId = null;

// ========================================
// TIME RANGE MANAGEMENT
// ========================================

function setAnalyticsRange(days) {
  analyticsRange = days;
  analyticsData = null;
  loadAnalytics();

  // Update active button and aria-pressed state
  document.querySelectorAll('.analytics-header button[data-range]').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
    const btnRange = btn.dataset.range === 'all' ? null : parseInt(btn.dataset.range);
    if (btnRange === days) {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    }
  });
}

// ========================================
// VIEW SWITCHING
// ========================================

function showAnalytics() {
  document.getElementById('pipeline-view').style.display = 'none';
  document.getElementById('detail-view').classList.remove('active');
  document.getElementById('analytics-view').classList.add('active');

  if (!analyticsData) {
    loadAnalytics();
  } else {
    renderAnalytics();
  }
}

function showPipeline() {
  document.getElementById('analytics-view').classList.remove('active');
  document.getElementById('detail-view').classList.remove('active');
  document.getElementById('pipeline-view').style.display = 'grid';
}

// ========================================
// DATA LOADING
// ========================================

/**
 * Fetch analytics overview from API and render the dashboard.
 * Adds a loading state to the view while the request is in flight.
 */
async function loadAnalytics() {
  const view = document.getElementById('analytics-view');
  if (view) view.classList.add('loading');

  try {
    const rangeParam = analyticsRange ? analyticsRange : 'all';
    const url = `/api/analytics/overview?range=${rangeParam}`;
    const response = await fetch(url, {
      headers: { 'Authorization': authHeader() }
    });

    if (response.status === 401) {
      login();
      return;
    }

    if (!response.ok) {
      showToast('Failed to load analytics', 'error');
      return;
    }

    analyticsData = await response.json();
    renderAnalytics();
  } catch (err) {
    console.error('[loadAnalytics]', err);
    showToast('Error loading analytics', 'error');
  } finally {
    if (view) view.classList.remove('loading');
  }
}

// ========================================
// RENDERING
// ========================================

function renderAnalytics() {
  if (!analyticsData) return;

  renderSummaryCards();
  renderPipelineHealth();
  renderSubscriptionTiers();
  renderCallVolumeChart();
  renderClientsTable();
}

function renderSummaryCards() {
  const summary = analyticsData.summary;
  const trends = summary.trends;

  const cards = [
    {
      metric: 'totalCalls',
      value: summary.totalCalls,
      trend: trends.totalCalls,
      format: 'number'
    },
    {
      metric: 'avgDuration',
      value: summary.avgDuration,
      trend: trends.avgDuration,
      format: 'duration'
    },
    {
      metric: 'positiveRate',
      value: summary.positiveRate,
      trend: trends.positiveRate,
      format: 'percent'
    },
    {
      metric: 'clientCount',
      value: summary.clientCount,
      trend: trends.clientCount,
      format: 'number'
    }
  ];

  cards.forEach(card => {
    const el = document.querySelector(`.analytics-card[data-metric="${card.metric}"]`);
    if (!el) return;

    const valueEl = el.querySelector('.value');
    const trendEl = el.querySelector('.trend');

    // Format value
    if (card.format === 'duration') {
      valueEl.textContent = fmtDuration(card.value);
    } else if (card.format === 'percent') {
      valueEl.textContent = card.value + '%';
    } else {
      valueEl.textContent = card.value;
    }

    // Format trend
    trendEl.innerHTML = fmtTrend(card.trend, card.format);
  });
}

function fmtDuration(ms) {
  const seconds = Math.round((ms || 0) / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function fmtTrend(value, format) {
  if (value === 0 || value === undefined) {
    return '<span class="trend-neutral">— no change</span>';
  }

  let display = '';
  if (format === 'duration') {
    display = fmtDuration(Math.abs(value));
  } else if (format === 'percent') {
    display = Math.abs(Math.round(value * 100) / 100) + '%';
  } else {
    display = Math.abs(Math.round(value));
  }

  if (value > 0) {
    return `<span class="trend-up">↑ +${display}</span>`;
  } else {
    return `<span class="trend-down">↓ -${display}</span>`;
  }
}

function renderPipelineHealth() {
  const health = analyticsData.pipelineHealth;
  const content = document.getElementById('pipeline-content');

  const statuses = ['pending', 'review', 'scripted', 'live', 'paused'];
  const icons = {
    pending: '⏱',
    review: '📋',
    scripted: '🤖',
    live: '✅',
    paused: '⏸'
  };

  let html = '';
  statuses.forEach(status => {
    const count = health[status] || 0;
    html += `
      <div class="health-item">
        <span class="health-label">${icons[status]} ${status}</span>
        <span class="health-count">${count}</span>
      </div>
    `;
  });

  content.innerHTML = html;
}

function renderSubscriptionTiers() {
  const tiers = analyticsData.subscriptionTiers;
  const content = document.getElementById('subscription-content');

  const tierOrder = ['Starter', 'Professional', 'Business Pro', 'Enterprise'];
  let html = '';

  tierOrder.forEach(tier => {
    const count = tiers[tier] || 0;
    html += `
      <div class="tier-item">
        <span class="tier-label">${tier}</span>
        <span class="tier-count">${count}</span>
      </div>
    `;
  });

  content.innerHTML = html;
}

function renderClientsTable() {
  if (!analyticsData.clients) {
    document.getElementById('table-body').innerHTML = '<tr><td colspan="5" class="empty" style="text-align:center;padding:20px;">No clients</td></tr>';
    return;
  }

  clientsTableData = [...analyticsData.clients];
  filterAndSortClientsTable();
}

/**
 * Filter and sort the clients table based on current search term and sort state.
 * Sanitizes search input to prevent XSS via HTML injection characters.
 */
function filterAndSortClientsTable() {
  const rawTerm = document.getElementById('search-clients')?.value || '';
  const searchTerm = rawTerm.toLowerCase().trim().replace(/[<>"']/g, '');

  const filtered = clientsTableData.filter(client => {
    if (!searchTerm) return true;
    return client.businessName.toLowerCase().includes(searchTerm);
  });

  // Sort
  filtered.sort((a, b) => {
    let aVal = a[tableSortCol];
    let bVal = b[tableSortCol];

    if (tableSortCol === 'avgDuration') {
      aVal = a.avgDuration || 0;
      bVal = b.avgDuration || 0;
    }

    if (aVal < bVal) return tableSortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return tableSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // Render
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty" style="text-align:center;padding:20px;">No clients match search</td></tr>';
    return;
  }

  filtered.forEach(client => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(client.businessName)}</td>
      <td>${client.calls}</td>
      <td>${fmtDuration(client.avgDuration * 1000)}</td>
      <td>${client.sentiment}%</td>
      <td><span class="status-badge status-${client.status}">${client.status}</span></td>
    `;
    tr.style.cursor = 'pointer';
    tr.onclick = () => openClientPanel(client.id);
    tbody.appendChild(tr);
  });
}

function filterClientsTable() {
  filterAndSortClientsTable();
}

function sortClientsTable(col) {
  if (col === tableSortCol) {
    tableSortDir = tableSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    tableSortCol = col;
    tableSortDir = 'asc';
  }
  filterAndSortClientsTable();
}

// ========================================
// CLIENT DETAIL PANEL
// ========================================

/**
 * Load and display per-client analytics in the slide-in panel.
 * @param {string} clientId - Client ID to load
 */
async function openClientPanel(clientId) {
  currentClientId = clientId;

  try {
    const rangeParam = analyticsRange ? analyticsRange : 'all';
    const url = `/api/analytics/client/${clientId}?range=${rangeParam}`;
    const response = await fetch(url, {
      headers: { 'Authorization': authHeader() }
    });

    if (response.status === 401) {
      login();
      return;
    }

    if (!response.ok) {
      showToast('Failed to load client details', 'error');
      return;
    }

    const data = await response.json();
    renderClientPanel(data);
    document.getElementById('client-panel').classList.add('active');
  } catch (err) {
    console.error('[openClientPanel]', err);
    showToast('Error loading client details', 'error');
  }
}

function renderClientPanel(data) {
  document.getElementById('client-name').textContent = data.clientName;

  const summary = data.summary;
  const breakdown = data.sentimentBreakdown;

  let html = `
    <div class="panel-detail-row">
      <div class="panel-detail-label">Total Calls</div>
      <div class="panel-detail-value">${summary.totalCalls}</div>
    </div>
    <div class="panel-detail-row">
      <div class="panel-detail-label">Avg Duration</div>
      <div class="panel-detail-value">${fmtDuration(summary.avgDuration * 1000)}</div>
    </div>
    <div class="panel-detail-row">
      <div class="panel-detail-label">Sentiment</div>
      <div class="panel-detail-value">${summary.positiveRate}% Positive</div>
    </div>
    <div class="panel-detail-row">
      <div class="panel-detail-label">Status</div>
      <div class="panel-detail-value"><span class="status-badge status-${summary.status}">${summary.status}</span></div>
    </div>
    <div class="panel-detail-row">
      <div class="panel-detail-label">Sentiment Breakdown</div>
      <div class="panel-detail-value">
        <div>✅ Positive: ${breakdown.positive}</div>
        <div>➖ Neutral: ${breakdown.neutral}</div>
        <div>❌ Negative: ${breakdown.negative}</div>
      </div>
    </div>
  `;

  if (data.recentCalls && data.recentCalls.length > 0) {
    html += '<div class="panel-detail-row"><div class="panel-detail-label">Recent Calls</div></div>';
    data.recentCalls.slice(0, 5).forEach(call => {
      const callDate = call.startTimestamp ? new Date(call.startTimestamp).toLocaleDateString() : 'N/A';
      html += `
        <div class="panel-detail-row">
          <div class="panel-detail-label">${callDate}</div>
          <div class="panel-detail-value">${fmtDuration((call.duration || 0) * 1000)} • ${call.sentiment || 'neutral'}</div>
        </div>
      `;
    });
  }

  document.getElementById('client-detail-content').innerHTML = html;

  // Update manage button
  document.getElementById('manage-client-btn').onclick = () => {
    window.location.hash = '#' + currentClientId;
  };
}

function closeClientPanel() {
  document.getElementById('client-panel').classList.remove('active');
  currentClientId = null;
}

// ========================================
// CHART.JS LAZY LOADING & RENDERING
// ========================================

async function ensureChartJs() {
  return new Promise((resolve, reject) => {
    if (window.Chart) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Chart.js'));
    document.head.appendChild(script);
  });
}

async function renderCallVolumeChart() {
  if (!analyticsData.callVolumeByDay) return;

  try {
    await ensureChartJs();
  } catch (err) {
    console.error('[renderCallVolumeChart]', err);
    showToast('Failed to load Chart.js', 'error');
    return;
  }

  // Destroy existing chart
  if (activeCharts['chart-call-volume']) {
    activeCharts['chart-call-volume'].destroy();
  }

  const canvas = document.getElementById('chart-call-volume');
  if (!canvas) return;

  const volumeData = analyticsData.callVolumeByDay;
  const labels = Object.keys(volumeData).sort().reverse().slice(0, 30);
  const data = labels.map(date => volumeData[date]);

  const ctx = canvas.getContext('2d');
  activeCharts['chart-call-volume'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Calls per Day',
        data: data,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: '#22c55e',
        pointBorderColor: '#1e293b',
        pointBorderWidth: 2,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#94a3b8',
            font: { size: 12 }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: '#64748b',
            font: { size: 11 }
          },
          grid: {
            color: '#334155',
            drawBorder: false
          }
        },
        x: {
          ticks: {
            color: '#64748b',
            font: { size: 11 },
            maxRotation: 45,
            minRotation: 0
          },
          grid: {
            display: false
          }
        }
      }
    }
  });
}

// ========================================
// CSV EXPORT
// ========================================

function exportOverviewCsv() {
  if (!analyticsData) {
    showToast('No data to export', 'error');
    return;
  }

  const summary = analyticsData.summary;
  let csv = 'Metric,Value,Trend\n';
  csv += `Total Calls,${summary.totalCalls},${summary.trends.totalCalls > 0 ? '+' : ''}${summary.trends.totalCalls}\n`;
  csv += `Avg Duration (s),${Math.round(summary.avgDuration)},${summary.trends.avgDuration > 0 ? '+' : ''}${Math.round(summary.trends.avgDuration)}\n`;
  csv += `Positive Sentiment %,${summary.positiveRate},${summary.trends.positiveRate > 0 ? '+' : ''}${Math.round(summary.trends.positiveRate * 100) / 100}\n`;
  csv += `Active Clients,${summary.clientCount},${summary.trends.clientCount > 0 ? '+' : ''}${summary.trends.clientCount}\n`;

  downloadCsv(csv, 'analytics-overview.csv');
}

function exportClientCsv() {
  if (!clientsTableData || clientsTableData.length === 0) {
    showToast('No data to export', 'error');
    return;
  }

  let csv = 'Business Name,Calls,Avg Duration (s),Sentiment %,Status,Subscription\n';
  clientsTableData.forEach(client => {
    csv += `"${escHtml(client.businessName).replace(/"/g, '""')}",${client.calls},${Math.round(client.avgDuration)},${client.sentiment},${client.status},${client.subscription}\n`;
  });

  downloadCsv(csv, 'analytics-clients.csv');
}

function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

// ========================================
// EVENT LISTENERS
// ========================================

document.addEventListener('DOMContentLoaded', () => {
  // Range buttons
  document.querySelectorAll('.analytics-header button[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      const range = btn.dataset.range;
      const days = range === 'all' ? null : parseInt(range);
      setAnalyticsRange(days);
    });
  });

  // Search input
  const searchInput = document.getElementById('search-clients');
  if (searchInput) {
    searchInput.addEventListener('input', filterClientsTable);
  }

  // Table headers (sorting)
  document.querySelectorAll('#clients-table th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      sortClientsTable(th.dataset.col);
    });
  });

  // Export button
  const exportBtn = document.getElementById('export-csv');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportOverviewCsv);
  }

  // Client panel close button
  const closeBtn = document.getElementById('close-client-panel');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeClientPanel);
  }

  const closePanelBtn = document.getElementById('close-panel-btn');
  if (closePanelBtn) {
    closePanelBtn.addEventListener('click', closeClientPanel);
  }

  // Close panel when clicking overlay background
  const overlay = document.getElementById('client-panel');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeClientPanel();
      }
    });
  }

  // Analytics button toggle
  const btnAnalytics = document.getElementById('btn-analytics');
  const btnPipeline = document.getElementById('btn-pipeline');

  if (btnAnalytics) {
    btnAnalytics.addEventListener('click', showAnalytics);
  }
  if (btnPipeline) {
    btnPipeline.addEventListener('click', showPipeline);
  }
});
