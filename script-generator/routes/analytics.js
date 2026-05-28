const express = require('express');
const router = express.Router();
const analyticsEngine = require('../services/analyticsEngine');
const { isAdmin } = require('../middleware/auth');

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
