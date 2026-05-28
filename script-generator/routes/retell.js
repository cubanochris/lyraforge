const express = require('express');
const router = express.Router();

// Placeholder routes for Retell API integration
router.get('/agents', (req, res) => {
  res.json({ agents: [] });
});

router.post('/agents', (req, res) => {
  res.json({ agentId: 'placeholder' });
});

module.exports = router;
