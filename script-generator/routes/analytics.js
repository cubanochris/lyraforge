const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const analyticsEngine = require('../services/analyticsEngine');

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

// GET /api/analytics/overview — get dashboard overview (admin only)
router.get('/overview', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const range = req.query.range;
  let days = 30;
  if (range === '7') days = 7;
  else if (range === '30') days = 30;
  else if (range === '90') days = 90;
  else if (range === 'all') days = null;

  const data = analyticsEngine.getAnalyticsOverview(days);
  res.json(data);
});

// GET /api/analytics/client/:id — get client-specific analytics (admin only)
router.get('/client/:id', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const range = req.query.range;
  let days = 30;
  if (range === '7') days = 7;
  else if (range === '30') days = 30;
  else if (range === '90') days = 90;
  else if (range === 'all') days = null;

  const data = analyticsEngine.getClientAnalytics(req.params.id, { rangeDays: days });
  res.json(data);
});

module.exports = router;
