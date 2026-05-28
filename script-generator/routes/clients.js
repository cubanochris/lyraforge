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

function buildCustomInstructions(client) {
  const b = client.businessInfo;
  const c = client.agentConfig;
  const lines = [];

  if (b.businessName) lines.push(`Business: ${b.businessName}`);
  if (b.industry)      lines.push(`Industry: ${b.industry}`);
  if (b.location)      lines.push(`Location: ${b.location}`);
  if (b.hours)         lines.push(`Hours: ${b.hours}`);
  if (b.phone)         lines.push(`Phone: ${b.phone}`);
  if (b.website)       lines.push(`Website: ${b.website}`);
  if (b.languages)     lines.push(`Languages spoken: ${b.languages}`);
  if (b.services)      lines.push(`Services: ${b.services}`);
  if (b.pricing)       lines.push(`Pricing: ${b.pricing}`);
  if (b.staffNames)    lines.push(`Key staff: ${b.staffNames}`);
  if (b.bookingLink)   lines.push(`Booking link: ${b.bookingLink}`);
  if (b.insurancePayment) lines.push(`Payment accepted: ${b.insurancePayment}`);
  if (b.faqs)          lines.push(`Common questions: ${b.faqs}`);
  if (b.afterHours)    lines.push(`After-hours: ${b.afterHours}`);
  if (b.promotions)    lines.push(`Promotions: ${b.promotions}`);
  if (b.additionalContext) lines.push(b.additionalContext);
  if (c.escalationRules)   lines.push(`Escalation: ${c.escalationRules}`);
  if (c.competitorHandling) lines.push(`Competitor handling: ${c.competitorHandling}`);
  if (c.customInstructions) lines.push(c.customInstructions);

  return lines.join('\n');
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
    const result = await generator.generateScript({
      selectedGoals: goals,
      tone: tone || 'professional',
      maxDurationMinutes: maxDurationMinutes || 5,
      includeObjectionHandling: true,
      customInstructions: buildCustomInstructions(client)
    });

    const scriptText = JSON.stringify(result.script, null, 2);
    const updated = store.updateClient(client.id, {
      generatedScript: scriptText,
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
