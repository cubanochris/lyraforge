const pathParts = window.location.pathname.split('/');
const CLIENT_ID = pathParts[2];
let currentRange = 'month';

function fmtDuration(ms) {
  const s = Math.round((ms || 0) / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? m + 'm ' + sec + 's' : sec + 's';
}

function fmtSentiment(s) {
  if (!s) return '<span style="color:#475569">—</span>';
  const cls = s === 'positive' ? 's-pos' : s === 'negative' ? 's-neg' : 's-neu';
  return '<span class="' + cls + '">' + s + '</span>';
}

async function loadDashboard(range) {
  try {
    const res = await fetch('/api/clients/' + CLIENT_ID + '/usage?range=' + range);
    if (res.status === 404) {
      document.getElementById('main-content').style.display = 'none';
      document.getElementById('error-content').style.display = 'block';
      document.getElementById('biz-name').textContent = '';
      return;
    }
    if (!res.ok) throw new Error('Server error ' + res.status);
    render(await res.json());
  } catch (err) {
    console.error('[dashboard]', err);
  }
}

function render(data) {
  document.getElementById('main-content').style.display = 'block';
  document.getElementById('biz-name').textContent = data.businessName || 'Your Dashboard';
  document.getElementById('intake-link').href = '/client/' + CLIENT_ID;

  const badge = document.getElementById('tier-badge');
  if (data.subscription && data.monthlyRate) {
    badge.textContent = data.subscription + ' · $' + data.monthlyRate.toLocaleString() + '/mo';
    badge.style.display = 'inline-block';
  } else if (data.subscription) {
    badge.textContent = data.subscription;
    badge.style.display = 'inline-block';
  }

  document.getElementById('card-calls').textContent = data.calls.thisRange;
  document.getElementById('card-minutes').textContent = data.calls.minutesThisRange + ' min';
  document.getElementById('card-alltime').textContent = data.calls.allTime;
  document.getElementById('s-positive').textContent = data.sentiment.positive;
  document.getElementById('s-neutral').textContent = data.sentiment.neutral;
  document.getElementById('s-negative').textContent = data.sentiment.negative;

  const tbody = document.getElementById('calls-tbody');
  if (!data.recentCalls || !data.recentCalls.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-cell">No calls recorded yet.</td></tr>';
    return;
  }
  tbody.innerHTML = data.recentCalls.map(function(c) {
    return '<tr><td>' + (c.date || '—') + '</td><td>' + fmtDuration(c.durationMs) + '</td><td>' + fmtSentiment(c.sentiment) + '</td></tr>';
  }).join('');
}

document.querySelectorAll('.range-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.range-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    currentRange = btn.dataset.range;
    loadDashboard(currentRange);
  });
});

loadDashboard(currentRange);
