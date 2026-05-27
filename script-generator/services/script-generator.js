// services/script-generator.js — AI-powered multi-goal call script generator
// Fixed: CALL_GOALS key lookup, double system prompt, customInstructions passthrough,
//        fetchBusinessContext stub, JSON response parsing, @anthropic-ai/sdk usage

const Anthropic = require('@anthropic-ai/sdk');
const { CALL_GOALS, GOAL_PRESETS } = require('../call-goals-config');

class CallScriptGenerator {
  constructor(claudeApiKey) {
    this.anthropic = new Anthropic({ apiKey: claudeApiKey });
  }

  // ── System prompt (sent once as the system parameter, not in the user turn) ──
  getSystemPrompt() {
    return `You are an expert call script generator for AI voice receptionists. You create professional, natural-sounding phone scripts that weave multiple objectives together seamlessly.

RULES:
1. Voice responses must be SHORT — 1 to 3 sentences max per AI turn
2. No markdown, no bullet points in spoken content — plain conversational English only
3. End most AI responses with a question to keep the conversation moving
4. Combine goals logically — never abruptly switch topics
5. Use natural transitions between different objectives
6. Include realistic objection handling and graceful fallbacks

OUTPUT: Return ONLY a valid JSON object — no preamble, no explanation, no markdown code fences. The JSON must have exactly these fields:
{
  "greeting": "string — opening line when call connects",
  "flow": [
    {
      "stage": "string — stage name",
      "purpose": "string — what this stage accomplishes",
      "aiPrompts": ["string — what the AI says to move forward"],
      "callerResponses": {
        "positive": "string — AI response when caller engages positively",
        "negative": "string — AI response when caller hesitates or objects",
        "unclear": "string — AI response to redirect if caller goes off-topic"
      }
    }
  ],
  "closing": {
    "success": "string — close when goal(s) achieved",
    "partial": "string — close when partial success",
    "failure": "string — graceful close when nothing achieved"
  },
  "notes": ["string — key reminders for the AI agent"]
}`;
  }

  // ── Main entry point ────────────────────────────────────────────────────────
  async generateScript(options) {
    const {
      selectedGoals = [],
      businessData = {},
      tone = 'professional',
      includeObjectionHandling = true,
      maxDurationMinutes = 5,
      customInstructions = ''
    } = options;

    if (selectedGoals.length === 0) {
      throw new Error('At least one goal must be selected');
    }

    // Order goals by priority, check compatibility
    const orderedGoals = this.orderGoalsByPriority(selectedGoals);
    const compatibilityWarning = this.checkGoalCompatibility(orderedGoals);

    // Fetch real business context from DB (or stub if no businessId)
    const businessContext = await this.fetchBusinessContext(businessData.businessId);

    // Build the user-turn prompt
    const userPrompt = this.buildUserPrompt({
      goals: orderedGoals,
      businessContext,
      tone,
      maxDurationMinutes,
      includeObjectionHandling,
      compatibilityWarning,
      customInstructions
    });

    // Call Claude and parse the JSON response
    const script = await this.callClaude(userPrompt);

    return {
      success: true,
      script,
      metadata: {
        goals: selectedGoals,
        orderedGoals,
        estimatedDuration: this.calculateEstimatedDuration(orderedGoals),
        tone,
        warnings: compatibilityWarning ? [compatibilityWarning] : []
      }
    };
  }

  // ── Goal ordering and compatibility ────────────────────────────────────────
  orderGoalsByPriority(goalIds) {
    return [...goalIds].sort((a, b) => {
      const pA = CALL_GOALS[a]?.priority ?? 99;
      const pB = CALL_GOALS[b]?.priority ?? 99;
      return pA - pB;
    });
  }

  checkGoalCompatibility(goalIds) {
    for (let i = 0; i < goalIds.length; i++) {
      for (let j = i + 1; j < goalIds.length; j++) {
        const goalA = CALL_GOALS[goalIds[i]];
        const goalB = CALL_GOALS[goalIds[j]];
        if (goalA?.incompatibleWith?.includes(goalIds[j])) {
          return `Warning: "${goalA.name}" and "${goalB.name}" are incompatible. Script will prioritize ${goalA.name}.`;
        }
      }
    }
    return null;
  }

  // ── Business context — queries KnowledgeItem table if available ─────────────
  async fetchBusinessContext(businessId) {
    if (!businessId) return null;

    try {
      // Lazy-require prisma to avoid hard dependency when running standalone
      const { prisma } = require('../lib/prisma');
      const items = await prisma.knowledgeItem.findMany({
        where: { businessId },
        select: { category: true, question: true, answer: true }
      });

      if (!items.length) return null;

      // Group by category
      const context = {};
      items.forEach(item => {
        if (!context[item.category]) context[item.category] = [];
        context[item.category].push(`Q: ${item.question}\nA: ${item.answer}`);
      });

      return context;
    } catch (err) {
      // Prisma not configured — return null and continue without context
      console.warn('[ScriptGenerator] Could not fetch business context:', err.message);
      return null;
    }
  }

  // ── Prompt construction ─────────────────────────────────────────────────────
  buildUserPrompt({ goals, businessContext, tone, maxDurationMinutes, includeObjectionHandling, compatibilityWarning, customInstructions }) {
    const goalLines = goals
      .map((g, i) => {
        const goal = CALL_GOALS[g];
        return goal ? `${i + 1}. ${goal.name}: ${goal.description}` : null;
      })
      .filter(Boolean)
      .join('\n');

    const toneDescriptions = {
      professional: 'Formal, polished, business-appropriate',
      friendly: 'Warm, approachable, conversational — use first names',
      urgent: 'Direct, action-oriented, create mild time-sensitivity',
      empathetic: 'Understanding, patient, validate feelings before redirecting'
    };

    let prompt = `Generate a call script for an AI voice receptionist.

GOALS (handle in this priority order):
${goalLines}

TONE: ${tone} — ${toneDescriptions[tone] || toneDescriptions.professional}

CONSTRAINTS:
- Maximum call duration: ${maxDurationMinutes} minutes
- Include objection handling: ${includeObjectionHandling ? 'Yes — add realistic callerResponses.negative for each stage' : 'No — only handle cooperative callers'}`;

    if (compatibilityWarning) {
      prompt += `\n- ${compatibilityWarning}`;
    }

    if (businessContext) {
      prompt += `\n\nBUSINESS KNOWLEDGE BASE:\n${JSON.stringify(businessContext, null, 2)}`;
    }

    if (customInstructions && customInstructions.trim()) {
      prompt += `\n\nSPECIAL INSTRUCTIONS:\n${customInstructions.trim()}`;
    }

    prompt += `\n\nReturn ONLY the JSON object as described. No extra text.`;
    return prompt;
  }

  // ── Claude API call ─────────────────────────────────────────────────────────
  async callClaude(userPrompt) {
    let rawText;
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 2500,
        system: this.getSystemPrompt(),   // system prompt sent once, correctly
        messages: [{ role: 'user', content: userPrompt }]
      });

      rawText = response.content[0]?.text ?? '';
    } catch (err) {
      console.error('[ScriptGenerator] Anthropic API error:', err);
      throw new Error('Claude API call failed: ' + err.message);
    }

    // Parse JSON response — strip any accidental markdown fences
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[ScriptGenerator] JSON parse failed. Raw response:\n', rawText);
      throw new Error('Claude returned invalid JSON. Raw output saved to logs.');
    }
  }

  // ── Duration estimation ─────────────────────────────────────────────────────
  calculateEstimatedDuration(goalIds) {
    const durations = goalIds.map(g => CALL_GOALS[g]?.estimatedDuration).filter(Boolean);
    if (!durations.length) return '1-2 minutes';

    let totalMin = 0, totalMax = 0;
    durations.forEach(d => {
      const parts = d.replace(/[^0-9-]/g, '').split('-').map(Number);
      totalMin += parts[0] || 1;
      totalMax += parts[1] || 2;
    });

    // Cap at 15 minutes; add 1 min buffer for natural conversation flow
    return `${totalMin}-${Math.min(totalMax + 1, 15)} minutes`;
  }
}

module.exports = CallScriptGenerator;
