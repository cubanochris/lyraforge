require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
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
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limit: 20 generation requests per minute per IP
app.use('/api/scripts/generate', rateLimit({
  windowMs: 60000,
  max: 20,
  message: { success: false, error: 'Too many requests — slow down' }
}));

// ── Routes ──────────────────────────────────────────────────────────────────
const scriptsRouter = require('./routes/scripts');
const clientsRouter = require('./routes/clients');
const retellRouter = require('./routes/retell');

app.use('/api/scripts', scriptsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/retell', retellRouter);

// Admin dashboard — serve admin.html (auth checked client-side via API)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
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
  });
}

module.exports = app;
