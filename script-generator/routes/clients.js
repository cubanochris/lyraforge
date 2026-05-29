const express = require('express');
const router = express.Router();
const { adminAuth, isAdmin } = require('../middleware/auth');
const store = require('../lib/clientStore');
const callStore = require('../lib/callStore');
const { buildCaptureLeadTool } = require('../services/retellToolConfig');
const leadStore = require('../lib/leadStore');

const TIER_RATES = { 'Starter': 497, 'Professional': 997, 'Business Pro': 1997, 'Enterprise': 3997 };

// POST /api/clients — create new client
router.post('/', adminAuth, (req, res) => {
  const client = store.createClient(req.body);
  const host = `${req.protocol}://${req.get('host')}`;
  res.status(201).json({ id: client.id, clientUrl: `${host}/client/${client.id}` });
});

// GET /api/clients — list all clients (admin only)
router.get('/', adminAuth, (req, res) => {
  res.json(store.listClients());
});

// GET /api/clients/:id/usage — public, no auth — safe usage stats for client dashboard
router.get('/:id/usage', (req, res) => {
  const client = store.getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const range = req.query.range || 'month';
  const now = Date.now();
  let cutoff;
  if (range === 'month') {
    const d = new Date();
    cutoff = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  } else if (range === '30') {
    cutoff = now - 30 * 86400000;
  } else {
    cutoff = null;
  }

  const allCalls = callStore.listCalls(req.params.id, 1000); // note: allTime under-counts beyond 1000 calls
  const rangeCalls = cutoff
    ? allCalls.filter(c => c.startTimestamp && c.startTimestamp >= cutoff)
    : allCalls;

  const minutesThisRange = rangeCalls.reduce((s, c) => s + (c.durationMs || 0), 0) / 60000;
  const minutesAllTime = allCalls.reduce((s, c) => s + (c.durationMs || 0), 0) / 60000;

  const sentiment = { positive: 0, neutral: 0, negative: 0 };
  rangeCalls.forEach(c => {
    if (c.sentiment === 'positive') sentiment.positive++;
    else if (c.sentiment === 'negative') sentiment.negative++;
    else sentiment.neutral++;
  });

  const recentCalls = [...allCalls]
    .sort((a, b) => (b.startTimestamp || 0) - (a.startTimestamp || 0))
    .slice(0, 20)
    .map(c => ({
      date: c.startTimestamp ? new Date(c.startTimestamp).toISOString().split('T')[0] : null,
      durationMs: c.durationMs || 0,
      sentiment: c.sentiment || null
    }));

  const d = new Date();
  res.json({
    businessName: client.businessInfo?.businessName || '',
    subscription: client.subscription || '',
    monthlyRate: TIER_RATES[client.subscription] || null,
    period: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    calls: {
      thisRange: rangeCalls.length,
      allTime: allCalls.length,
      minutesThisRange: Math.round(minutesThisRange * 10) / 10,
      minutesAllTime: Math.round(minutesAllTime * 10) / 10
    },
    sentiment,
    recentCalls
  });
});

// GET /api/clients/:id/leads — public (UUID-gated). store mode → content; forward mode → count only.
router.get('/:id/leads', (req, res) => {
  const client = store.getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const lc = (client.agentConfig && client.agentConfig.leadCapture) || {};
  if (lc.mode === 'forward') {
    return res.json({ mode: 'forward', count: leadStore.count(req.params.id) });
  }
  const leads = leadStore.list(req.params.id, 100)
    .filter(l => !l.forwarded)
    .map(l => ({
      date: l.capturedAt ? l.capturedAt.split('T')[0] : null,
      name: l.name || '', phone: l.phone || '',
      reason: l.reason || '', preferredCallback: l.preferredCallback || ''
    }));
  res.json({ mode: 'store', leads });
});

// GET /api/clients/:id — full data for admin, public fields only otherwise
router.get('/:id', (req, res) => {
  const client = store.getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  if (isAdmin(req)) {
    return res.json(client);
  }

  // Public: businessInfo + status only — no agentConfig, no internal fields
  res.json({ id: client.id, status: client.status, businessInfo: client.businessInfo });
});

// PUT /api/clients/:id — admin can update anything; client can only update businessInfo
router.put('/:id', (req, res) => {
  const client = store.getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  let updated;
  if (isAdmin(req)) {
    // Merge top-level fields, deep-merge businessInfo and agentConfig
    const fields = { ...req.body };
    if (fields.businessInfo) fields.businessInfo = { ...client.businessInfo, ...fields.businessInfo };
    if (fields.agentConfig) {
      fields.agentConfig = { ...client.agentConfig, ...fields.agentConfig };
      if (req.body.agentConfig.leadCapture) {
        const lc = { ...(client.agentConfig.leadCapture || {}), ...req.body.agentConfig.leadCapture };
        if (lc.mode === 'forward' && !lc.forwardEmail && !lc.forwardWebhookUrl && !lc.forwardSms) {
          return res.status(400).json({ error: 'Forward mode requires at least one destination (email, webhook URL, or SMS number)' });
        }
        fields.agentConfig.leadCapture = lc;
      }
    }
    updated = store.updateClient(req.params.id, fields);
  } else {
    // Client: only businessInfo, force status to 'review'
    const businessInfo = { ...client.businessInfo, ...(req.body.businessInfo || {}) };
    updated = store.updateClient(req.params.id, { businessInfo, status: 'review' });
  }

  res.json(updated);
});

// POST /api/clients/:id/generate — generate script via Claude
router.post('/:id/generate', adminAuth, async (req, res) => {
  const client = store.getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const { goals, tone, maxDurationMinutes } = client.agentConfig;
  if (!goals || goals.length === 0) {
    return res.status(400).json({ error: 'At least one goal must be configured in agent config' });
  }

  try {
    const CallScriptGenerator = require('../services/script-generator');
    const key = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set' });

    const generator = new CallScriptGenerator(key);
    const cfg = client.agentConfig || {};
    const result = await generator.generateScript({
      selectedGoals: goals,
      businessData: client.businessInfo || {},
      tone: cfg.tone || 'professional',
      maxDurationMinutes: cfg.maxDurationMinutes || 5,
      escalationRules: cfg.escalationRules || '',
      competitorHandling: cfg.competitorHandling || '',
      objectionHandlingStyle: cfg.objectionHandlingStyle || 'neutral',
      customInstructions: cfg.customInstructions || '',
      leadCapture: cfg.leadCapture || null
    });

    const updated = store.updateClient(client.id, {
      generatedScript: result.script,
      scriptGeneratedAt: new Date().toISOString(),
      status: 'scripted'
    });

    res.json({ success: true, script: result.script, metadata: result.metadata, client: updated });
  } catch (err) {
    console.error('[generate]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients/:id/push — push script to Retell agent
router.post('/:id/push', adminAuth, async (req, res) => {
  const client = store.getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  if (!client.generatedScript) {
    return res.status(400).json({ error: 'No script generated yet — generate a script first' });
  }
  if (!client.agentConfig.retellAgentId) {
    return res.status(400).json({ error: 'Retell Agent ID is not set in agent config' });
  }

  try {
    const { pushScriptToRetell } = require('../services/retell');
    await pushScriptToRetell(client.agentConfig.retellAgentId, client.generatedScript);
    const updated = store.updateClient(client.id, {
      lastPushedAt: new Date().toISOString(),
      status: 'live'
    });
    res.json({ success: true, client: updated });
  } catch (err) {
    console.error('[push]', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/clients/:id — remove a client (admin only)
router.delete('/:id', adminAuth, (req, res) => {
  const deleted = store.deleteClient(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Client not found' });
  res.json({ success: true });
});

// GET /api/clients/:id/calls — call log for a client (admin only)
router.get('/:id/calls', adminAuth, (req, res) => {
  const client = store.getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(callStore.listCalls(req.params.id));
});

// GET /api/clients/:id/retell-tool — copyable capture_lead tool config (admin only)
router.get('/:id/retell-tool', adminAuth, (req, res) => {
  const client = store.getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const secret = process.env.FUNCTION_SECRET || 'SET_FUNCTION_SECRET';
  res.json(buildCaptureLeadTool(client, { baseUrl, secret }));
});

// GET /api/clients/:id/leads/count — admin only: total + forward-failure count
router.get('/:id/leads/count', adminAuth, (req, res) => {
  const client = store.getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const all = leadStore.list(req.params.id, 100000);
  res.json({ count: all.length, forwardFailed: all.filter(l => l.forwardFailed).length });
});

// GET /api/clients/:id/leads/failed — admin only: flagged forward failures (with content) for recovery
router.get('/:id/leads/failed', adminAuth, (req, res) => {
  const client = store.getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(leadStore.list(req.params.id, 100000).filter(l => l.forwardFailed));
});

module.exports = router;
