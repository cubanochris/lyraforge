const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const adminAuth = require('../middleware/auth');
const store = require('../lib/clientStore');
const callStore = require('../lib/callStore');

function isAdmin(req) {
  const header = req.headers['authorization'] || '';
  const [type, encoded] = header.split(' ');
  if (type !== 'Basic' || !encoded) return false;
  const decoded = Buffer.from(encoded, 'base64').toString();
  const password = decoded.slice(decoded.indexOf(':') + 1);
  if (!process.env.ADMIN_PASSWORD) return false;
  try {
    return password.length === process.env.ADMIN_PASSWORD.length &&
      crypto.timingSafeEqual(Buffer.from(password), Buffer.from(process.env.ADMIN_PASSWORD));
  } catch (_) {
    return false;
  }
}

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
    if (fields.agentConfig) fields.agentConfig = { ...client.agentConfig, ...fields.agentConfig };
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
      customInstructions: cfg.customInstructions || ''
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

module.exports = router;
