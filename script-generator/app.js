// app.js - Standalone Express server for the AI Script Generator
// Run: node app.js  |  dev: nodemon app.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const scriptsRouter = require('./routes/scripts');

const app = express();

// -- Middleware --------------------------------------------------------------
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'DELETE']
}));
app.use(express.json());

// Rate limit: 20 generation requests per minute per IP
app.use('/api/scripts/generate', rateLimit({
  windowMs: 60_000,
  max: 20,
  message: { success: false, error: 'Too many requests - slow down' }
}));

// -- Routes ------------------------------------------------------------------
app.use('/api/scripts', scriptsRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'AI Script Generator',
    ts: new Date().toISOString(),
    anthropicKeySet: !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)
  });
});

// -- Quick demo: curl-ready test --------------------------------------------
app.get('/demo', async (req, res) => {
  res.json({
    message: 'AI Script Generator is running. Try the endpoints below.',
    endpoints: {
      'GET  /health':                  'Health check',
      'GET  /api/scripts/goals':       'List all goals and presets',
      'GET  /api/scripts/templates':   'Pre-built templates',
      'POST /api/scripts/generate':    'Generate a script',
      'POST /api/scripts/batch':       'Generate multiple variants (A/B)',
      'GET  /api/scripts/saved':       'List saved scripts (?businessId=xxx)',
      'GET  /api/scripts/saved/:id':   'Get a saved script'
    },
    exampleGenerateBody: {
      goals: ['book_appointment', 'qualify_lead'],
      tone: 'friendly',
      maxDurationMinutes: 5,
      includeObjectionHandling: true,
      customInstructions: 'This is for a dental practice. Emphasize that we accept most insurance plans.'
    }
  });
});

// -- Start server ------------------------------------------------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\nAI Script Generator running on http://localhost:${PORT}`);
  console.log(`   Demo:   http://localhost:${PORT}/demo`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);

  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_API_KEY) {
    console.warn('WARNING: ANTHROPIC_API_KEY is not set - script generation will fail\n');
  }
});

module.exports = app;
