const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const callStore = require('../lib/callStore');
const clientStore = require('../lib/clientStore');

function verifySignature(rawBody, signature) {
  if (!process.env.RETELL_API_KEY || !signature) return false;
  const expected = crypto
    .createHmac('sha256', process.env.RETELL_API_KEY)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch (_) {
    return false;
  }
}

router.post('/retell', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-retell-signature'];
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  if (!verifySignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch (_) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { event, call } = payload;
  if (!call || !call.agent_id || !call.call_id) return res.sendStatus(200);

  const client = clientStore.findClientByAgentId(call.agent_id);
  if (!client) return res.sendStatus(200);

  const callId = call.call_id;

  if (event === 'call_started') {
    callStore.upsertCall(client.id, callId, {
      agentId: call.agent_id,
      startTimestamp: call.start_timestamp || null,
      fromNumber: call.from_number || null,
      toNumber: call.to_number || null,
      status: 'in_progress'
    });
  } else if (event === 'call_ended') {
    callStore.upsertCall(client.id, callId, {
      agentId: call.agent_id,
      startTimestamp: call.start_timestamp || null,
      endTimestamp: call.end_timestamp || null,
      durationMs: (call.end_timestamp && call.start_timestamp)
        ? call.end_timestamp - call.start_timestamp : null,
      disconnectionReason: call.disconnection_reason || null,
      status: 'ended'
    });
  } else if (event === 'call_analyzed') {
    callStore.upsertCall(client.id, callId, {
      agentId: call.agent_id,
      transcript: call.transcript || null,
      summary: (call.call_analysis && call.call_analysis.call_summary) || null,
      sentiment: (call.call_analysis && call.call_analysis.user_sentiment) || null,
      status: 'analyzed'
    });
  }

  res.sendStatus(200);
});

module.exports = router;
