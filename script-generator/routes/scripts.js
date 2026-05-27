// routes/scripts.js — API endpoints for script generation
// Fixed: config path (was '../config/call-goals-config'), customInstructions passthrough,
//        added script persistence to DB and save/list endpoints

const express = require('express');
const router = express.Router();
const CallScriptGenerator = require('../services/script-generator');
const { CALL_GOALS, GOAL_PRESETS } = require('../call-goals-config');

// Lazy-init generator — fail loudly if key is missing at request time, not load time
let _generator = null;
function getGenerator() {
  if (!_generator) {
    const key = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
    _generator = new CallScriptGenerator(key);
  }
  return _generator;
}

// ── GET /api/scripts/goals — list all goals and presets ────────────────────
router.get('/goals', (req, res) => {
  const goals = Object.values(CALL_GOALS).map(g => ({
    id: g.id,
    name: g.name,
    description: g.description,
    category: g.category,
    estimatedDuration: g.estimatedDuration,
    compatibleWith: g.compatibleWith,
    incompatibleWith: g.incompatibleWith
  }));

  const presets = Object.entries(GOAL_PRESETS).map(([key, preset]) => ({
    id: key,
    name: preset.name,
    description: preset.description,
    goals: preset.goals,
    recommendedTone: preset.recommendedTone
  }));

  res.json({ goals, presets });
});

// ── POST /api/scripts/generate — generate a script from selected goals ──────
router.post('/generate', async (req, res) => {
  try {
    const {
      goals = [],
      presetId = null,
      businessId = null,
      tone = 'professional',
      includeObjectionHandling = true,
      maxDurationMinutes = 5,
      customInstructions = '',
      saveName = null       // optional: save the script to DB with this name
    } = req.body;

    // Merge preset goals with any additionally selected goals
    let selectedGoals = [...goals];
    if (presetId && GOAL_PRESETS[presetId]) {
      selectedGoals = [...GOAL_PRESETS[presetId].goals, ...goals];
      selectedGoals = [...new Set(selectedGoals)]; // dedupe
    }

    if (selectedGoals.length === 0) {
      return res.status(400).json({ success: false, error: 'Select at least one goal' });
    }

    // Validate all goal IDs exist
    const invalidGoals = selectedGoals.filter(g => !CALL_GOALS[g]);
    if (invalidGoals.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Unknown goal IDs: ${invalidGoals.join(', ')}. Valid IDs: ${Object.keys(CALL_GOALS).join(', ')}`
      });
    }

    const result = await getGenerator().generateScript({
      selectedGoals,
      businessData: { businessId },
      tone,
      includeObjectionHandling,
      maxDurationMinutes,
      customInstructions  // ← was missing in original
    });

    // Optionally persist to DB if a name was provided
    if (saveName && businessId) {
      try {
        const { prisma } = require('../lib/prisma');
        const saved = await prisma.callScript.create({
          data: {
            businessId,
            name: saveName,
            goals: selectedGoals,
            tone,
            scriptJson: JSON.stringify(result.script)
          }
        });
        result.savedScriptId = saved.id;
      } catch (dbErr) {
        // DB save failure is non-fatal — script generation still succeeded
        console.warn('[scripts route] DB save failed:', dbErr.message);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Script generation error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to generate script' });
  }
});

// ── POST /api/scripts/batch — generate multiple variants (A/B testing) ──────
router.post('/batch', async (req, res) => {
  try {
    const { configurations = [] } = req.body;

    if (!configurations.length) {
      return res.status(400).json({ success: false, error: 'Provide at least one configuration' });
    }

    const generator = getGenerator();
    const results = await Promise.all(
      configurations.map(async (config, index) => {
        try {
          const result = await generator.generateScript(config);
          return { variant: `A${index + 1}`, ...result };
        } catch (err) {
          return { variant: `A${index + 1}`, success: false, error: err.message };
        }
      })
    );

    res.json({ success: true, scripts: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /api/scripts/saved — list saved scripts for a business ───────────────
router.get('/saved', async (req, res) => {
  const { businessId } = req.query;
  if (!businessId) return res.status(400).json({ error: 'businessId required' });

  try {
    const { prisma } = require('../lib/prisma');
    const scripts = await prisma.callScript.findMany({
      where: { businessId, isActive: true },
      select: { id: true, name: true, goals: true, tone: true, usageCount: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(scripts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/scripts/saved/:id — get a specific saved script ─────────────────
router.get('/saved/:id', async (req, res) => {
  try {
    const { prisma } = require('../lib/prisma');
    const script = await prisma.callScript.findUnique({ where: { id: req.params.id } });
    if (!script) return res.status(404).json({ error: 'Not found' });
    res.json({ ...script, scriptJson: JSON.parse(script.scriptJson) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/scripts/templates — pre-built quick-start templates ─────────────
router.get('/templates', (req, res) => {
  const templates = Object.entries(GOAL_PRESETS).map(([key, preset]) => ({
    id: key.toLowerCase(),
    name: preset.name,
    description: preset.description,
    goals: preset.goals,
    tone: preset.recommendedTone,
    presetId: key
  }));
  res.json(templates);
});

module.exports = router;
