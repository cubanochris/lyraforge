require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Ensure data/clients directory exists on startup
fs.mkdirSync(path.join(__dirname, 'data', 'clients'), { recursive: true });

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes — webhooks MUST be before express.json() ─────────────────────────
const clientsRouter = require('./routes/clients');
const retellRouter = require('./routes/retell');
const analyticsRouter = require('./routes/analytics');
const webhooksRouter = require('./routes/webhooks');
const functionsRouter = require('./routes/functions');

app.use('/api/webhooks', webhooksRouter);   // ← BEFORE express.json()
app.use(express.json());                    // ← json parsing for all other routes

app.use('/api/clients', clientsRouter);
app.use('/api/retell', retellRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/functions', functionsRouter);

// Admin dashboard — serve admin.html (auth checked client-side via API)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Client dashboard — serve dashboard.html
app.get('/client/:id/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Client form — serve client.html for any /client/:id path
app.get('/client/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client.html'));
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'LyraForge Script Generator',
    ts: new Date().toISOString(),
    anthropicKeySet: !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)
  });
});

// ── Start server ─────────────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`\n⚡ LyraForge Script Generator on http://localhost:${PORT}`);
    console.log(`   Admin:  http://localhost:${PORT}/admin`);
    console.log(`   Health: http://localhost:${PORT}/health\n`);
    if (!process.env.ADMIN_PASSWORD) {
      console.warn('⚠️  WARNING: ADMIN_PASSWORD is not set\n');
    }
    if (!process.env.ALLOWED_ORIGINS) {
      console.warn('⚠️  WARNING: ALLOWED_ORIGINS is not set — CORS is open to all origins (*)\n');
    }
    if (!process.env.FUNCTION_SECRET) {
      console.warn('⚠️  WARNING: FUNCTION_SECRET is not set — /api/functions/capture-lead will reject all calls\n');
    } else {
      const fs = process.env.FUNCTION_SECRET;
      console.log(`   FUNCTION_SECRET diag: raw length ${fs.length}, trimmed length ${fs.trim().length}\n`);
    }
  });
}

module.exports = app;
