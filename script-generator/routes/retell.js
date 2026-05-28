const express = require('express');
const router = express.Router();
const https = require('https');
const adminAuth = require('../middleware/auth');

function retellGet(endpoint) {
  const apiKey = process.env.RETELL_API_KEY;
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.retellai.com',
      path: endpoint,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data || '[]') }); }
        catch (_) { resolve({ status: res.statusCode, body: [] }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

router.get('/agents', adminAuth, async (req, res) => {
  if (!process.env.RETELL_API_KEY) return res.json([]);
  try {
    const { status, body } = await retellGet('/list-agent');
    if (status >= 400) return res.status(status).json({ error: 'Retell API error', detail: body });
    res.json(body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/voices', adminAuth, async (req, res) => {
  if (!process.env.RETELL_API_KEY) return res.json([]);
  try {
    const { status, body } = await retellGet('/list-voice');
    if (status >= 400) return res.status(status).json({ error: 'Retell API error', detail: body });
    res.json(body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/phone-numbers', adminAuth, async (req, res) => {
  if (!process.env.RETELL_API_KEY) return res.json([]);
  try {
    const { status, body } = await retellGet('/list-phone-number');
    if (status >= 400) return res.status(status).json({ error: 'Retell API error', detail: body });
    res.json(body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
