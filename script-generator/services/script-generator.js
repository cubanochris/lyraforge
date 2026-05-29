const Anthropic = require('@anthropic-ai/sdk');
const { CALL_GOALS } = require('../call-goals-config');

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 3000;

class CallScriptGenerator {
  constructor(claudeApiKey) {
    this.anthropic = new Anthropic({ apiKey: claudeApiKey });
  }

  getSystemPrompt() {
    return `You are an expert prompt engineer specialising in Retell AI voice agent configuration. Your sole job is to write a \`general_prompt\` — the natural-language instruction set loaded into a Retell AI agent that tells it how to handle inbound calls for a specific business.

WHAT YOU ARE WRITING
The text you produce will be read by an LLM inside Retell, not by a human. Write it as direct instructions to that AI agent.

HARD RULES
1. Output ONLY the prompt text — no preamble, no explanation, no code fences.
2. Structure the prompt with ## markdown headers so the agent can navigate sections easily.
3. Every example spoken line must be conversational, 1-3 sentences, zero bullet points when spoken aloud.
4. End almost every AI turn with a question so the conversation keeps moving.
5. Never invent business details — only use what is provided. If a detail is missing, instruct the agent to say "I don't have that information but I can have someone call you back."
6. Make the business name and key services feel natural in every section — not bolted on.
7. Keep the agent grounded: it cannot book in real time, check live availability, or access external systems unless told otherwise.`;
  }

  buildUserPrompt({ goals, business, agentConfig }) {
    const b = business;
    const c = agentConfig;

    const goalDescriptions = goals
      .map((g, i) => {
        const goal = CALL_GOALS[g];
        return goal ? `${i + 1}. **${goal.name}** — ${goal.description}` : null;
      })
      .filter(Boolean)
      .join('\n');

    const toneDescriptions = {
      professional: 'polished and professional — warm but efficient, use formal language',
      friendly: 'warm and conversational — use first names when known, relaxed phrasing',
      urgent: 'direct and action-oriented — create mild time-sensitivity, keep it brisk',
      empathetic: 'patient and understanding — validate feelings before redirecting'
    };
    const toneGuide = toneDescriptions[c.tone] || toneDescriptions.professional;

    const bLines = [
      b.businessName     && `Business name: ${b.businessName}`,
      b.industry         && `Industry: ${b.industry}`,
      b.location         && `Location: ${b.location}`,
      b.phone            && `Phone number: ${b.phone}`,
      b.website          && `Website: ${b.website}`,
      b.hours            && `Business hours: ${b.hours}`,
      b.languages        && `Languages spoken: ${b.languages}`,
      b.services         && `Services offered: ${b.services}`,
      b.pricing          && `Pricing: ${b.pricing}`,
      b.staffNames       && `Key staff: ${b.staffNames}`,
      b.bookingLink      && `Booking link: ${b.bookingLink}`,
      b.insurancePayment && `Payment / insurance: ${b.insurancePayment}`,
      b.faqs             && `Common questions and answers: ${b.faqs}`,
      b.afterHours       && `After-hours message: ${b.afterHours}`,
      b.promotions       && `Current promotions: ${b.promotions}`,
      b.additionalContext && `Additional context: ${b.additionalContext}`
    ].filter(Boolean).join('\n');

    const constraintLines = [
      `Max call duration: ${c.maxDurationMinutes || 5} minutes — be concise`,
      c.escalationRules    && `Escalation rules: ${c.escalationRules}`,
      c.competitorHandling && `Competitor handling: ${c.competitorHandling}`,
      c.objectionHandlingStyle && `Objection style: ${c.objectionHandlingStyle}`,
      c.customInstructions && `Special instructions: ${c.customInstructions}`
    ].filter(Boolean).join('\n');

    const leadCaptureEnabled = c.leadCapture && c.leadCapture.enabled !== false;
    const toolSection = leadCaptureEnabled
      ? `\n\n## Available Tool: capture_lead
You have a tool named \`capture_lead\`. When the caller wants a callback, asks someone to reach them, or you cannot fully help them live, collect their **name** and **phone number** (and, if offered, email, the reason for their call, and a preferred callback time), then call \`capture_lead\` with those values. Confirm warmly afterward (e.g. "Got it — someone will get back to you shortly"). Do not promise an exact callback time you cannot guarantee.`
      : '';

    return `Write a Retell AI agent general_prompt for this business.

## Business Details
${bLines || 'No business details provided — keep instructions generic.'}

## Call Goals (handle in this priority order)
${goalDescriptions}

## Tone
${toneGuide}

## Constraints
${constraintLines}

Write the complete general_prompt now. It must cover:
- Agent identity and role (who the agent is, what business it represents)
- Business context woven in naturally (hours, services, location as relevant)
- Each goal handled in priority order with clear instructions and example spoken lines
- Objection and hesitation handling for each major goal
- After-hours and escalation handling if applicable
- A short rules section at the end (response length, tone reminders, what to do when uncertain)${toolSection}`;
  }

  async generateScript(options) {
    const {
      selectedGoals = [],
      businessData = {},
      tone = 'professional',
      maxDurationMinutes = 5,
      customInstructions = '',
      escalationRules = '',
      competitorHandling = '',
      objectionHandlingStyle = 'neutral',
      leadCapture = null
    } = options;

    if (selectedGoals.length === 0) {
      throw new Error('At least one goal must be selected');
    }

    const orderedGoals = this.orderGoalsByPriority(selectedGoals);
    const compatibilityWarning = this.checkGoalCompatibility(orderedGoals);

    const prompt = this.buildUserPrompt({
      goals: orderedGoals,
      business: businessData,
      agentConfig: { tone, maxDurationMinutes, escalationRules, competitorHandling, objectionHandlingStyle, customInstructions, leadCapture }
    });

    const scriptText = await this.callClaude(prompt);

    return {
      success: true,
      script: scriptText,
      metadata: {
        goals: selectedGoals,
        orderedGoals,
        tone,
        warnings: compatibilityWarning ? [compatibilityWarning] : []
      }
    };
  }

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
          return `Warning: "${goalA.name}" and "${goalB?.name}" are incompatible. Script will prioritise ${goalA.name}.`;
        }
      }
    }
    return null;
  }

  async callClaude(userPrompt) {
    let rawText;
    try {
      const response = await this.anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: this.getSystemPrompt(),
        messages: [{ role: 'user', content: userPrompt }]
      });
      rawText = response.content[0]?.text ?? '';
    } catch (err) {
      console.error('[ScriptGenerator] Anthropic API error:', err);
      throw new Error('Claude API call failed: ' + err.message);
    }

    if (!rawText.trim()) {
      throw new Error('Claude returned an empty response');
    }

    return rawText.trim();
  }
}

module.exports = CallScriptGenerator;
