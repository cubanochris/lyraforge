// Retell API proxy — all routes require admin auth
const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/auth');
const retell = require('../services/retell');

router.get('/agents', adminAuth, async (req, res) => {
  try {
    res.json(await retell.listAgents());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/phone-numbers', adminAuth, async (req, res) => {
  try {
    res.json(await retell.listPhoneNumbers());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/voices', adminAuth, async (req, res) => {
  try {
    res.json(await retell.listVoices());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
