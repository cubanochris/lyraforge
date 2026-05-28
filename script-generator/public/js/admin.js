// ========================================
// ADMIN DASHBOARD LOGIC (admin.js)
// ========================================

let currentClientId = null;
let currentScript = null;

// Configuration from environment or fallback
const ADMIN_PASSWORD = 'lyraforge';

// ========================================
// HASH ROUTING HELPERS
// ========================================

function setClientHash(clientId) {
  window.location.hash = '#' + clientId;
}

function clearClientHash() {
  window.location.hash = '';
}

function getClientHash() {
  const hash = window.location.hash.slice(1);
  return hash ? hash : null;
}

async function restoreClientFromHash() {
  const clientId = getClientHash();
  if (clientId) {
    try {
      await openDetail(clientId);
    } catch (err) {
      showToast('Client not found', 'error');
      showPipeline();
    }
  }
}

// ========================================
// VALIDATION HELPERS
// ========================================

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ========================================
// CORE API FUNCTIONS
// ========================================

async function loadClients() {
  try {
    const res = await fetch('/api/clients', { headers: { 'Authorization': authHeader() } });
    if (!res.ok) {
      if (res.status === 401) { submitLogin(); return []; }
      showToast('Failed to load clients (' + res.status + ')', 'error');
      return [];
    }
    return res.json();
  } catch (err) {
    console.error('[loadClients]', err);
    showToast('Cannot reach server', 'error');
    return [];
  }
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

// ========================================
// PIPELINE VIEW
// ========================================

function renderPipeline(clients) {
  const cols = { pending: [], review: [], scripted: [], live: [] };
  clients.forEach(c => { if (cols[c.status]) cols[c.status].push(c); });

  const attention = (cols.review.length || 0) + (cols.scripted.length || 0);
  document.getElementById('attention-count').textContent = attention;

  for (const [status, list] of Object.entries(cols)) {
    document.getElementById('count-' + status).textContent = list.length;
    const el = document.getElementById('col-' + status);
    el.innerHTML = '';

    if (list.length === 0) {
      el.innerHTML = '<div class="empty">No clients</div>';
    } else {
      const fragment = document.createDocumentFragment();
      list.forEach(c => {
        const card = buildCard(c);
        fragment.appendChild(card);
      });
      el.appendChild(fragment);
    }
  }
}

function buildCard(c) {
  const div = document.createElement('div');
  div.className = 'card ' + c.status;
  const name = (c.businessInfo && c.businessInfo.businessName) || (c.clientContact && c.clientContact.name) || 'Unnamed';
  const industry = (c.businessInfo && c.businessInfo.industry) || '';
  const tone = (c.agentConfig && c.agentConfig.tone) || '';
  const sub = c.subscription || '';
  const subClass = TIER_CLASSES[sub] || 'sub-starter';
  const subOptions = ['', ...TIERS].map(function(t) {
    return '<option value="' + t + '"' + (sub === t ? ' selected' : '') + '>' + (t || '-- no tier --') + '</option>';
  }).join('');
  div.innerHTML =
    '<div class="card-header">' +
      '<div class="card-name">' + escHtml(name) + '</div>' +
      '<div class="card-tier">' +
        '<span class="card-tier-label">TIER:</span>' +
        '<select class="sub-select ' + subClass + '" onchange="event.stopPropagation();updateSubscription(\'' + c.id + '\',this)" onclick="event.stopPropagation()">' + subOptions + '</select>' +
      '</div>' +
    '</div>' +
    '<div class="card-meta">' + timeAgo(c.updatedAt) + '</div>' +
    '<div class="card-sub">' + escHtml([industry, tone].filter(Boolean).join(' · ')) + '</div>' +
    '<div class="card-actions">' +
      (c.status === 'pending' ? '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();copyLink(\'' + c.id + '\')">Copy Link</button>' : '') +
      (c.status === 'scripted' ? '<button class="btn btn-purple btn-sm" onclick="event.stopPropagation();openDetailAndPush(\'' + c.id + '\')">Push to Retell</button>' : '') +
      '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openDetail(\'' + c.id + '\')">' +
        (c.status === 'review' ? 'Review →' : 'Edit') +
      '</button>' +
      '<button class="btn btn-ghost btn-sm" style="color:#ef4444" onclick="event.stopPropagation();deleteClient(\'' + c.id + '\',\'' + escHtml(name) + '\')">Delete</button>' +
    '</div>';
  return div;
}

// ========================================
// DETAIL VIEW
// ========================================

async function openDetail(id) {
  try {
    let clientRes, agentsRes, voicesRes, phonesRes;
    try {
      const responses = await Promise.all([
        fetch('/api/clients/' + id, { headers: { 'Authorization': authHeader() } }),
        fetch('/api/retell/agents', { headers: { 'Authorization': authHeader() } }),
        fetch('/api/retell/voices', { headers: { 'Authorization': authHeader() } }),
        fetch('/api/retell/phone-numbers', { headers: { 'Authorization': authHeader() } })
      ]);
      clientRes = responses[0];
      agentsRes = responses[1];
      voicesRes = responses[2];
      phonesRes = responses[3];

      if (!clientRes.ok) {
        showToast('Client not found', 'error');
        showPipeline();
        return;
      }
    } catch (err) {
      showToast('Failed to load client details', 'error');
      showPipeline();
      return;
    }

    const client = await clientRes.json();
    const retell = {
      agents: agentsRes.ok ? await agentsRes.json() : [],
      voices: voicesRes.ok ? await voicesRes.json() : [],
      phones: phonesRes.ok ? await phonesRes.json() : []
    };
    currentClientId = id;
    currentScript = client.generatedScript || null;

    // Update hash to preserve state
    setClientHash(id);

    document.getElementById('detail-name').textContent = (client.businessInfo && client.businessInfo.businessName) || (client.clientContact && client.clientContact.name) || 'Client';
    const pill = document.getElementById('detail-status-pill');
    pill.textContent = client.status.toUpperCase();
    pill.className = 'status-pill pill-' + client.status;

    renderBizFields(client.businessInfo || {});
    renderCfgFields(client.agentConfig || {}, retell);

    const preview = document.getElementById('script-preview');
    if (client.generatedScript) {
      preview.textContent = client.generatedScript.slice(0, 120) + '…';
    } else {
      preview.textContent = 'No script generated yet — configure goals above then click Generate.';
    }
    document.getElementById('view-script-btn').disabled = !client.generatedScript;
    document.getElementById('copy-script-btn').disabled = !client.generatedScript;
    document.getElementById('push-btn').disabled = !client.generatedScript;

    document.getElementById('pipeline-view').style.display = 'none';
    document.getElementById('detail-view').classList.add('active');
  } catch (err) {
    // Error handling already done in catch above
  }
}

async function openDetailAndPush(id) {
  await openDetail(id);
  pushToRetell();
}

// ========================================
// BUSINESS INFO RENDERING
// ========================================

function renderBizFields(b) {
  const fields = [
    ['businessName', 'Business Name', 'text'], ['industry', 'Industry / Type', 'text'],
    ['phone', 'Phone', 'text'], ['location', 'Location / City', 'text'],
    ['website', 'Website', 'text'], ['hours', 'Business Hours', 'text'],
    ['languages', 'Languages Spoken', 'text'], ['services', 'Services Offered', 'textarea'],
    ['pricing', 'Pricing Info', 'text'], ['staffNames', 'Key Staff Names', 'text'],
    ['bookingLink', 'Booking Link', 'text'], ['insurancePayment', 'Insurance / Payment', 'text'],
    ['faqs', 'FAQs', 'textarea'], ['afterHours', 'After-Hours Message', 'text'],
    ['promotions', 'Current Promotions', 'text'], ['additionalContext', 'Additional Context', 'textarea']
  ];
  document.getElementById('biz-fields').innerHTML = fields.map(function(f) {
    const key = f[0], label = f[1], type = f[2];
    return '<div class="field"><label for="biz-' + key + '">' + label + '</label>' +
      (type === 'textarea'
        ? '<textarea id="biz-' + key + '" rows="2" aria-label="' + label + '">' + escHtml(b[key] || '') + '</textarea>'
        : '<input type="text" id="biz-' + key + '" value="' + escHtml(b[key] || '') + '" aria-label="' + label + '" />') +
      '</div>';
  }).join('');
}

/**
 * Collect and validate business info form fields.
 * @returns {Object|null} Field values or null if validation fails (toast already shown)
 */
function collectBizFields() {
  const keys = ['businessName', 'industry', 'phone', 'location', 'website', 'hours', 'languages',
    'services', 'pricing', 'staffNames', 'bookingLink', 'insurancePayment', 'faqs', 'afterHours', 'promotions', 'additionalContext'];
  const out = {};
  keys.forEach(function(k) { const el = document.getElementById('biz-' + k); if (el) out[k] = el.value; });

  // Validation
  if (!out.businessName || !out.businessName.trim()) {
    showToast('Business name is required', 'error');
    return null;
  }

  // Email validation if email field exists
  const emailEl = document.getElementById('biz-email');
  if (emailEl) {
    const email = emailEl.value.trim();
    if (email && !isValidEmail(email)) {
      showToast('Invalid email format', 'error');
      return null;
    }
    out.email = email;
  }

  return out;
}

// ========================================
// AGENT CONFIG RENDERING
// ========================================

function renderCfgFields(c, retell) {
  retell = retell || { agents: [], voices: [], phones: [] };
  const goals = c.goals || [];
  const goalsHtml = GOALS.map(function(g) {
    const selected = goals.includes(g);
    return '<span class="goal-tag' + (selected ? ' selected' : '') + '" onclick="toggleGoal(\'' + g + '\',this)">' + g.replace(/_/g, ' ') + '</span>';
  }).join('');

  // Agent dropdown or text fallback
  let agentField;
  if (retell.agents.length) {
    agentField = '<select id="cfg-retell-id">' +
      '<option value="">-- select agent --</option>' +
      retell.agents.map(function(a) {
        return '<option value="' + escHtml(a.agent_id) + '"' + (c.retellAgentId === a.agent_id ? ' selected' : '') + '>' + escHtml(a.agent_name || a.agent_id) + '</option>';
      }).join('') +
      '</select>';
  } else {
    agentField = '<input type="text" id="cfg-retell-id" value="' + escHtml(c.retellAgentId || '') + '" placeholder="agent_xxxxxx" />';
  }

  // Phone number dropdown or text fallback
  let phoneField;
  if (retell.phones.length) {
    phoneField = '<select id="cfg-retell-phone">' +
      '<option value="">-- select number --</option>' +
      retell.phones.map(function(p) {
        const label = (p.phone_number_pretty || p.phone_number) + (p.agent_id ? ' → ' + p.agent_id : '');
        return '<option value="' + escHtml(p.phone_number) + '"' + (c.retellPhoneNumber === p.phone_number ? ' selected' : '') + '>' + escHtml(label) + '</option>';
      }).join('') +
      '</select>';
  } else {
    phoneField = '<input type="text" id="cfg-retell-phone" value="' + escHtml(c.retellPhoneNumber || '') + '" placeholder="+1xxxxxxxxxx" />';
  }

  // Voice dropdown or text fallback
  let voiceField;
  if (retell.voices.length) {
    voiceField = '<select id="cfg-voice">' +
      '<option value="">-- select voice --</option>' +
      retell.voices.map(function(v) {
        const label = v.voice_name + ' (' + (v.provider || '') + (v.gender ? ', ' + v.gender : '') + (v.accent ? ', ' + v.accent : '') + ')';
        return '<option value="' + escHtml(v.voice_id) + '"' + (c.voiceSelection === v.voice_id ? ' selected' : '') + '>' + escHtml(label) + '</option>';
      }).join('') +
      '</select>';
  } else {
    voiceField = '<select id="cfg-voice">' + VOICES.map(function(v) { return '<option' + (c.voiceSelection === v ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select>';
  }

  document.getElementById('cfg-fields').innerHTML =
    '<div class="field"><label>Call Goals (click to toggle)</label><div class="goals-list" id="goals-list">' + goalsHtml + '</div></div>' +
    '<div class="field"><label>Tone</label><select id="cfg-tone">' + TONES.map(function(t) { return '<option' + (c.tone === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div>' +
    '<div class="field"><label>Max Duration (minutes)</label><input type="number" id="cfg-duration" value="' + (c.maxDurationMinutes || 5) + '" min="1" max="30" /></div>' +
    '<div class="field"><label>Escalation Rules</label><textarea id="cfg-escalation" rows="2">' + escHtml(c.escalationRules || '') + '</textarea></div>' +
    '<div class="field"><label>Objection Style</label><select id="cfg-objection">' + ['soft', 'assertive', 'neutral'].map(function(s) { return '<option' + (c.objectionHandlingStyle === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
    '<div class="field"><label>Competitor Handling</label><input type="text" id="cfg-competitor" value="' + escHtml(c.competitorHandling || '') + '" /></div>' +
    '<div class="field"><label>Custom Instructions</label><textarea id="cfg-custom" rows="3">' + escHtml(c.customInstructions || '') + '</textarea></div>' +
    '<div class="field"><label>Retell Agent</label>' + agentField + '</div>' +
    '<div class="field"><label>Phone Number</label>' + phoneField + '</div>' +
    '<div class="field"><label>Voice</label>' + voiceField + '</div>';
}

function toggleGoal(goal, el) {
  el.classList.toggle('selected');
}

/**
 * Collect and validate agent config form fields.
 * @returns {Object|null} Config values or null if validation fails (toast already shown)
 */
function collectCfgFields() {
  const goals = Array.from(document.querySelectorAll('#goals-list .goal-tag.selected'))
    .map(function(el) { return el.textContent.trim().replace(/ /g, '_'); });

  const maxDurationStr = document.getElementById('cfg-duration') ? document.getElementById('cfg-duration').value : '5';
  const maxDuration = parseInt(maxDurationStr, 10);

  // Validation - check if maxDuration is valid
  if (isNaN(maxDuration) || maxDuration < 1 || maxDuration > 30) {
    showToast('Call duration must be between 1 and 30 minutes', 'error');
    return null;
  }

  return {
    goals: goals,
    tone: document.getElementById('cfg-tone') ? document.getElementById('cfg-tone').value : 'professional',
    maxDurationMinutes: maxDuration,
    escalationRules: document.getElementById('cfg-escalation') ? document.getElementById('cfg-escalation').value : '',
    objectionHandlingStyle: document.getElementById('cfg-objection') ? document.getElementById('cfg-objection').value : 'soft',
    competitorHandling: document.getElementById('cfg-competitor') ? document.getElementById('cfg-competitor').value : '',
    customInstructions: document.getElementById('cfg-custom') ? document.getElementById('cfg-custom').value : '',
    retellAgentId: document.getElementById('cfg-retell-id') ? document.getElementById('cfg-retell-id').value : '',
    retellPhoneNumber: document.getElementById('cfg-retell-phone') ? document.getElementById('cfg-retell-phone').value : '',
    voiceSelection: document.getElementById('cfg-voice') ? document.getElementById('cfg-voice').value : ''
  };
}

// ========================================
// SAVE & GENERATE
// ========================================

async function saveClientDetail() {
  const bizFields = collectBizFields();
  if (!bizFields) return;

  const cfgFields = collectCfgFields();
  if (!cfgFields) return;

  try {
    const res = await fetch('/api/clients/' + currentClientId, {
      method: 'PUT',
      headers: { 'Authorization': authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessInfo: bizFields, agentConfig: cfgFields })
    });
    if (!res.ok) {
      if (res.status === 401) { submitLogin(); return; }
      const err = await res.json().catch(function() { return {}; });
      showToast('Save failed: ' + (err.message || res.statusText), 'error');
      return;
    }
    const el = document.getElementById('save-confirm');
    el.style.display = 'block';
    setTimeout(function() { el.style.display = 'none'; }, 2000);
  } catch (err) {
    console.error('[saveClientDetail]', err);
    showToast('Error saving: ' + err.message, 'error');
  }
}

async function generateScript() {
  await saveClientDetail();
  showToast('Generating script…', 'success');
  try {
    const res = await fetch('/api/clients/' + currentClientId + '/generate', {
      method: 'POST', headers: { 'Authorization': authHeader() }
    });
    const data = await res.json().catch(function() { return {}; });
    if (!res.ok) {
      if (res.status === 401) { submitLogin(); return; }
      showToast(data.error || 'Script generation failed', 'error');
      return;
    }
    currentScript = data.client.generatedScript;
    document.getElementById('script-preview').textContent = currentScript.slice(0, 120) + '…';
    document.getElementById('view-script-btn').disabled = false;
    document.getElementById('copy-script-btn').disabled = false;
    document.getElementById('push-btn').disabled = false;
    showToast('Script generated!', 'success');
  } catch (err) {
    console.error('[generateScript]', err);
    showToast('Error generating script: ' + err.message, 'error');
  }
}

// ========================================
// SCRIPT MODAL
// ========================================

function openScriptModal() {
  if (!currentScript) return;
  document.getElementById('script-full-text').textContent = currentScript;
  document.getElementById('script-modal').classList.add('active');
}

function closeScriptModal() {
  document.getElementById('script-modal').classList.remove('active');
}

function copyScript() {
  if (!currentScript) return;
  navigator.clipboard.writeText(currentScript).then(function() { showToast('Copied!', 'success'); });
}

// ========================================
// CALL LOG
// ========================================

async function showCallLog() {
  document.getElementById('calllog-modal').classList.add('active');
  document.getElementById('calllog-body').innerHTML = '<div class="no-calls">Loading…</div>';
  try {
    const res = await fetch('/api/clients/' + currentClientId + '/calls', {
      headers: { 'Authorization': authHeader() }
    });
    if (!res.ok) {
      document.getElementById('calllog-body').innerHTML = '<div class="no-calls">Failed to load calls (error ' + res.status + ')</div>';
      return;
    }
    const calls = await res.json();
    renderCallLog(calls);
  } catch (_) {
    document.getElementById('calllog-body').innerHTML = '<div class="no-calls">Could not reach server — check your connection.</div>';
  }
}

function closeCallLog() {
  document.getElementById('calllog-modal').classList.remove('active');
}

function renderCallLog(calls) {
  const body = document.getElementById('calllog-body');
  if (!calls.length) {
    body.innerHTML = '<div class="no-calls">No calls recorded yet. Calls appear here after Retell sends webhook events.</div>';
    return;
  }
  body.innerHTML = calls.map(function(c) {
    const date = c.startTimestamp ? new Date(c.startTimestamp).toLocaleString() : '—';
    const dur = c.durationMs ? Math.round(c.durationMs / 1000) + 's' : '—';
    const rawSentiment = c.sentiment ? c.sentiment.toLowerCase() : '';
    const sentimentClass = ['positive', 'negative', 'neutral'].includes(rawSentiment) ? 'sentiment-' + rawSentiment : 'sentiment-neutral';
    const sentiment = rawSentiment || '—';
    const summary = c.summary ? escHtml(c.summary) : '<span style="color:#475569">No summary yet</span>';
    return '<div class="call-row">' +
      '<div><div class="call-row-label">DATE</div><div class="call-row-val">' + escHtml(date) + '</div></div>' +
      '<div><div class="call-row-label">DURATION</div><div class="call-row-val">' + escHtml(dur) + '</div></div>' +
      '<div><div class="call-row-label">SENTIMENT</div><div class="call-row-val ' + sentimentClass + '">' + escHtml(sentiment) + '</div></div>' +
      '<div><div class="call-row-label">SUMMARY</div><div class="call-summary">' + summary + '</div></div>' +
      '</div>';
  }).join('');
}

// ========================================
// RETELL INTEGRATION
// ========================================

async function pushToRetell() {
  try {
    const res = await fetch('/api/clients/' + currentClientId + '/push', {
      method: 'POST', headers: { 'Authorization': authHeader() }
    });
    const data = await res.json().catch(function() { return {}; });
    if (!res.ok) {
      if (res.status === 401) { submitLogin(); return; }
      showToast(data.error || 'Push to Retell failed', 'error');
      return;
    }
    showToast('Pushed to Retell — agent is live!', 'success');
    document.getElementById('detail-status-pill').textContent = 'LIVE';
    document.getElementById('detail-status-pill').className = 'status-pill pill-live';
  } catch (err) {
    console.error('[pushToRetell]', err);
    showToast('Error pushing to Retell: ' + err.message, 'error');
  }
}

// ========================================
// LINK UTILITIES
// ========================================

function copyLink(id) {
  const url = location.origin + '/client/' + id;
  navigator.clipboard.writeText(url).then(function() { showToast('Link copied!', 'success'); });
}

function copyClientLink() { copyLink(currentClientId); }

// ========================================
// DELETE CLIENT
// ========================================

async function deleteClient(id, name) {
  if (!confirm('Delete ' + name + '? This cannot be undone.')) return;
  const res = await fetch('/api/clients/' + id, {
    method: 'DELETE', headers: { 'Authorization': authHeader() }
  });
  if (res.ok) {
    showToast('Client deleted', 'success');
    loadClients().then(renderPipeline);
  } else {
    showToast('Delete failed', 'error');
  }
}

// ========================================
// VIEW SWITCHING
// ========================================

function showPipeline() {
  clearClientHash();
  document.getElementById('pipeline-view').style.display = '';
  document.getElementById('detail-view').classList.remove('active');
  loadClients().then(renderPipeline);
}

function showAnalytics() {
  document.getElementById('pipeline-view').style.display = 'none';
  document.getElementById('detail-view').classList.remove('active');
  document.getElementById('analytics-view').classList.add('active');

  // Load analytics if not already loaded
  if (!analyticsData) {
    loadAnalytics();
  } else {
    renderAnalytics();
  }
}

function showPipelineView() {
  document.getElementById('analytics-view').classList.remove('active');
  document.getElementById('detail-view').classList.remove('active');
  document.getElementById('pipeline-view').style.display = '';
  loadClients().then(renderPipeline);
}

// ========================================
// CLIENT MANAGEMENT MODAL
// ========================================

function showNewClientModal() { document.getElementById('new-client-modal').classList.add('active'); }
function hideNewClientModal() { document.getElementById('new-client-modal').classList.remove('active'); }

async function createClient() {
  const name = document.getElementById('nc-name').value;
  const email = document.getElementById('nc-email').value;
  const sub = document.getElementById('nc-subscription').value;
  const notes = document.getElementById('nc-notes').value;

  // Validation
  if (!name || !name.trim()) {
    showToast('Client contact name is required', 'error');
    return;
  }

  if (email && !isValidEmail(email)) {
    showToast('Invalid email format', 'error');
    return;
  }

  const res = await fetch('/api/clients', {
    method: 'POST',
    headers: { 'Authorization': authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientContact: { name: name, email: email }, subscription: sub, internalNotes: notes })
  });
  const data = await res.json();
  if (!res.ok) { showToast('Failed to create client', 'error'); return; }
  navigator.clipboard.writeText(data.clientUrl).then(function() {
    showToast('Client created — link copied!', 'success');
  });
  hideNewClientModal();
  document.getElementById('nc-name').value = '';
  document.getElementById('nc-email').value = '';
  document.getElementById('nc-subscription').value = '';
  document.getElementById('nc-notes').value = '';
  loadClients().then(renderPipeline);
}

async function updateSubscription(id, selectEl) {
  const tier = selectEl.value;
  const res = await fetch('/api/clients/' + id, {
    method: 'PUT',
    headers: { 'Authorization': authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: tier })
  });
  if (!res.ok) { showToast('Failed to update tier', 'error'); return; }
  // Update badge class
  const newClass = tier ? (TIER_CLASSES[tier] || 'sub-starter') : 'sub-starter';
  selectEl.className = 'sub-select ' + newClass;
  showToast((tier || 'No tier') + ' saved', 'success');
}

// ========================================
// LOGIN HANDLER
// ========================================

async function submitLogin() {
  const pw = document.getElementById('password-input').value;
  if (!pw) return;

  // Validate against configured password
  if (pw !== ADMIN_PASSWORD) {
    document.getElementById('login-error').style.display = 'block';
    document.getElementById('password-input').value = '';
    return;
  }

  // Store password and proceed
  sessionStorage.setItem('adminPassword', pw);
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('login-screen').style.display = 'none';

  // Load and render pipeline
  try {
    const clients = await loadClients();
    renderPipeline(clients);
  } catch (e) {
    showToast('Failed to load clients', 'error');
  }

  // Restore client from hash if present
  await restoreClientFromHash();

  // Show nav buttons
  document.getElementById('btn-analytics').style.display = 'block';
  document.getElementById('btn-pipeline').style.display = 'block';
}

// ========================================
// EVENT LISTENERS
// ========================================

document.addEventListener('DOMContentLoaded', function() {
  // Login input
  const passwordInput = document.getElementById('password-input');
  if (passwordInput) {
    passwordInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        submitLogin();
      }
    });
  }

  // Login button
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', submitLogin);
  }

  // Analytics button
  const btnAnalytics = document.getElementById('btn-analytics');
  if (btnAnalytics) {
    btnAnalytics.addEventListener('click', showAnalytics);
  }

  // Pipeline button
  const btnPipeline = document.getElementById('btn-pipeline');
  if (btnPipeline) {
    btnPipeline.addEventListener('click', showPipelineView);
  }

  // Auto-login if password saved in session
  const saved = sessionStorage.getItem('adminPassword');
  if (saved) {
    document.getElementById('login-screen').style.display = 'none';
    loadClients().then(renderPipeline).catch(e => {
      showToast('Failed to load clients', 'error');
    });

    // Restore client from hash if present
    restoreClientFromHash();

    // Show nav buttons
    document.getElementById('btn-analytics').style.display = 'block';
    document.getElementById('btn-pipeline').style.display = 'block';
  }
});
