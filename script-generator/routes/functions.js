const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const clientStore = require('../lib/clientStore');
const leadStore = require('../lib/leadStore');
const leadForwarder = require('../services/leadForwarder');

function authOk(req) {
  const header = req.headers['authorization'] || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token || !process.env.FUNCTION_SECRET) return false;
  try {
    return token.length === process.env.FUNCTION_SECRET.length &&
      crypto.timingSafeEqual(Buffer.from(token), Buffer.from(process.env.FUNCTION_SECRET));
  } catch (_) {
    return false;
  }
}

// Persist or forward a lead per the client's leadCapture mode. Exported for tests.
async function processLead(client, lead) {
  const lc = (client.agentConfig && client.agentConfig.leadCapture) || {};
  const mode = lc.mode === 'forward' ? 'forward' : 'store';
  if (mode === 'store') {
    return leadStore.create(client.id, { ...lead, mode: 'store' });
  }
  const result = await leadForwarder.forwardLead(lead, {
    email: lc.forwardEmail, webhookUrl: lc.forwardWebhookUrl, sms: lc.forwardSms
  });
  if (result.anySucceeded) {
    return leadStore.create(client.id, {
      clientId: lead.clientId, callId: lead.callId,
      mode: 'forward', forwarded: true, channels: result.succeeded
    });
  }
  return leadStore.create(client.id, { ...lead, mode: 'forward', forwardFailed: true });
}

router.post('/capture-lead', (req, res) => {
  if (!authOk(req)) return res.status(401).json({ error: 'Unauthorized' });

  const body = req.body || {};
  const call = body.call || {};
  const args = body.args || {};
  const agentId = call.agent_id || body.agent_id;
  const callId = call.call_id || body.call_id || null;

  const client = clientStore.findClientByAgentId(agentId);
  if (!client) return res.json({ success: true, message: "Thanks — I've noted that." });

  const lc = (client.agentConfig && client.agentConfig.leadCapture) || {};
  if (lc.enabled === false) return res.json({ success: true, message: 'Thanks for calling.' });

  const name = String(args.name || '').trim();
  const phone = String(args.phone || '').trim();
  if (!name || !phone) {
    return res.json({ success: false, message: 'Could you share your name and the best phone number to reach you?' });
  }

  const lead = {
    clientId: client.id, callId, name, phone,
    email: String(args.email || '').trim(),
    reason: String(args.reason || '').trim(),
    preferredCallback: String(args.preferred_callback_time || '').trim(),
    source: 'retell'
  };

  // Respond immediately; do storage/forwarding after the response.
  res.json({ success: true, message: "Got it — I've taken your details and someone will get back to you shortly." });
  setImmediate(() => { processLead(client, lead).catch(err => console.error('[capture-lead]', err)); });
});

module.exports = router;
module.exports.processLead = processLead;
