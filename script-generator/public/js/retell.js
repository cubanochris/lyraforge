/* global authHeader, escHtml, showToast, currentClientId */
'use strict';

var retellWorkspaceLoaded = false;
var retellVoices = [];
var retellAgents = [];

// ── Tab display ────────────────────────────────────────────────────────────

function showRetell() {
  if (typeof clearClientHash === 'function') clearClientHash();
  document.getElementById('pipeline-view').style.display = 'none';
  var av = document.getElementById('analytics-view');
  if (av) av.classList.remove('active');
  var dv = document.getElementById('detail-view');
  if (dv) dv.classList.remove('active');
  document.getElementById('retell-view').style.display = 'block';
  if (!retellWorkspaceLoaded) loadRetellWorkspace();
}

// ── Workspace panel ────────────────────────────────────────────────────────

async function loadRetellWorkspace() {
  retellWorkspaceLoaded = true;
  var [agents, phones, voices] = await Promise.all([
    fetch('/api/retell/agents', { headers: { 'Authorization': authHeader() } }).then(r => r.json()).catch(() => []),
    fetch('/api/retell/phone-numbers', { headers: { 'Authorization': authHeader() } }).then(r => r.json()).catch(() => []),
    fetch('/api/retell/voices', { headers: { 'Authorization': authHeader() } }).then(r => r.json()).catch(() => [])
  ]);
  retellAgents = Array.isArray(agents) ? agents : [];
  retellVoices = Array.isArray(voices) ? voices : [];
  renderAgentsList(retellAgents);
  renderPhonesList(Array.isArray(phones) ? phones : []);
}

function refreshRetellWorkspace() {
  retellWorkspaceLoaded = false;
  document.getElementById('retell-agents-list').textContent = 'Loading…';
  document.getElementById('retell-phones-list').textContent = 'Loading…';
  loadRetellWorkspace();
}

function renderAgentsList(agents) {
  var el = document.getElementById('retell-agents-list');
  if (!agents.length) { el.textContent = 'No agents in workspace.'; return; }
  el.innerHTML = agents.map(function(a) {
    var name = escHtml(a.agent_name || a.agent_id);
    var pub = a.is_published ? '<span style="color:#22c55e">●</span>' : '<span style="color:#64748b">●</span>';
    var tags = (a.assigned_tags || []).join(', ');
    return '<div style="padding:8px 0; border-bottom:1px solid #1e293b;">' +
      pub + ' <strong>' + name + '</strong>' +
      (tags ? ' <span style="color:#64748b; font-size:10px;">[' + escHtml(tags) + ']</span>' : '') +
      '<br><span style="color:#475569; font-size:10px;">' + escHtml(a.agent_id) + '</span></div>';
  }).join('');
}

function renderPhonesList(phones) {
  var el = document.getElementById('retell-phones-list');
  if (!phones.length) { el.textContent = 'No phone numbers in workspace.'; return; }
  el.innerHTML = phones.map(function(p) {
    var num = escHtml(p.phone_number || '');
    var nick = p.nickname ? ' (' + escHtml(p.nickname) + ')' : '';
    var agents = (p.inbound_agents || []).map(function(a) { return a.agent_id; }).join(', ');
    return '<div style="padding:8px 0; border-bottom:1px solid #1e293b;">' +
      '<strong>' + num + '</strong>' + nick +
      (agents ? '<br><span style="color:#475569; font-size:10px;">→ ' + escHtml(agents) + '</span>' : '') +
      '</div>';
  }).join('');
}

// ── Provision modal ────────────────────────────────────────────────────────

function openProvisionModal(clientName) {
  document.getElementById('prov-agent-name').value = clientName || '';
  document.getElementById('prov-area-code').value = '';
  document.getElementById('prov-progress').textContent = '';
  populateVoiceDropdown();
  document.getElementById('provision-modal').style.display = 'flex';
}

function closeProvisionModal() {
  document.getElementById('provision-modal').style.display = 'none';
}

function populateVoiceDropdown() {
  var sel = document.getElementById('prov-voice-id');
  if (retellVoices.length) {
    var male = retellVoices.filter(function(v) { return v.gender === 'male'; });
    var female = retellVoices.filter(function(v) { return v.gender === 'female'; });
    sel.innerHTML = '<option value="">Select a voice…</option>' +
      renderVoiceOptgroup('Male', male) + renderVoiceOptgroup('Female', female);
  } else {
    fetch('/api/retell/voices', { headers: { 'Authorization': authHeader() } })
      .then(function(r) { return r.json(); })
      .then(function(voices) {
        retellVoices = Array.isArray(voices) && voices.length ? voices : [];
        if (retellVoices.length) {
          populateVoiceDropdown();
        } else {
          sel.innerHTML = '<option value="">No voices available — check RETELL_API_KEY</option>';
        }
      });
  }
}

function renderVoiceOptgroup(label, voices) {
  if (!voices.length) return '';
  return '<optgroup label="' + label + '">' +
    voices.map(function(v) {
      var optLabel = escHtml(v.voice_name) + (v.accent ? ' (' + escHtml(v.accent) + ')' : '');
      return '<option value="' + escHtml(v.voice_id) + '">' + optLabel + '</option>';
    }).join('') + '</optgroup>';
}

async function submitProvision() {
  var voiceId = document.getElementById('prov-voice-id').value;
  var areaCode = document.getElementById('prov-area-code').value.trim();
  var agentName = document.getElementById('prov-agent-name').value.trim();
  var progress = document.getElementById('prov-progress');
  if (!voiceId || !areaCode) { progress.textContent = 'Voice and area code are required.'; return; }
  if (!/^\d{3}$/.test(areaCode)) { progress.textContent = 'Area code must be 3 digits.'; return; }
  if (!currentClientId) return;
  progress.textContent = 'Provisioning…';
  try {
    var res = await fetch('/api/clients/' + currentClientId + '/retell-provision', {
      method: 'POST',
      headers: { 'Authorization': authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ voiceId: voiceId, areaCode: areaCode, agentName: agentName || undefined })
    });
    var data = await res.json();
    if (!res.ok) {
      progress.textContent = (data.error || 'Provision failed') +
        (data.step ? ' (failed at ' + data.step + ')' : '');
      return;
    }
    progress.textContent = 'Done! Agent: ' + escHtml(data.agentId) + ' | Phone: ' + escHtml(data.phoneNumber);
    showToast('Provisioned — Agent + phone number ready.', 'success');
    retellWorkspaceLoaded = false;
    // Refresh the per-client section with latest data
    var fresh = await fetch('/api/clients/' + currentClientId, { headers: { 'Authorization': authHeader() } }).then(function(r) { return r.json(); }).catch(function() { return null; });
    if (fresh) renderRetellClientSection(fresh);
    setTimeout(closeProvisionModal, 2000);
  } catch (err) {
    progress.textContent = 'Error: ' + err.message;
  }
}

// ── Go Live ────────────────────────────────────────────────────────────────

async function goLive() {
  if (!currentClientId) return;
  showToast('Publishing to Retell…', 'info');
  try {
    var res = await fetch('/api/clients/' + currentClientId + '/retell-golive', {
      method: 'POST',
      headers: { 'Authorization': authHeader() }
    });
    var data = await res.json().catch(function() { return {}; });
    if (!res.ok) {
      if (res.status === 401) { typeof submitLogin !== 'undefined' && submitLogin(); return; }
      showToast(data.error || 'Go Live failed', 'error');
      return;
    }
    showToast('Live! v' + data.publishedVersion + (data.note ? ' — ' + data.note : ''), 'success');
    var pill = document.getElementById('detail-status-pill');
    if (pill) { pill.textContent = 'LIVE'; pill.className = 'status-pill pill-live'; }
    // Refresh per-client section so Go Live button disables
    var freshClient = await fetch('/api/clients/' + currentClientId, { headers: { 'Authorization': authHeader() } }).then(function(r) { return r.json(); }).catch(function() { return null; });
    if (freshClient) renderRetellClientSection(freshClient);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ── Per-client Retell section ──────────────────────────────────────────────

function renderRetellClientSection(client) {
  var cfg = client.agentConfig || {};
  setRcField('rc-agent-id', cfg.retellAgentId || '—');
  setRcField('rc-phone', cfg.retellPhoneNumber || '—');
  setRcField('rc-llm-id', cfg.retellLlmId || '—');
  setRcField('rc-last-sync', client.lastPushedAt ? client.lastPushedAt.slice(0,10) : '—');
  setRcField('rc-last-live', client.lastGoLiveAt ? client.lastGoLiveAt.slice(0,10) : '—');
  setRcField('rc-published-ver', client.lastPublishedAgentVersion != null ? String(client.lastPublishedAgentVersion) : '—');
  var provBtn = document.getElementById('rc-provision-btn');
  if (provBtn) provBtn.disabled = !!cfg.retellAgentId;
  var liveBtn = document.getElementById('rc-golive-btn');
  if (liveBtn) {
    var hasUnpublished = client.lastSyncedAgentVersion != null &&
      client.lastSyncedAgentVersion !== client.lastPublishedAgentVersion;
    liveBtn.disabled = !hasUnpublished;
  }
}

function setRcField(id, value) {
  var el = document.getElementById(id);
  if (el) el.textContent = value;
}
