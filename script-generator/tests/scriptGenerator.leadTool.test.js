const CallScriptGenerator = require('../services/script-generator');

const gen = new CallScriptGenerator('dummy-key');
const base = {
  goals: ['book_appointment'],
  business: { businessName: 'Acme' },
  agentConfig: { tone: 'professional', maxDurationMinutes: 5 }
};

test('buildUserPrompt includes capture_lead instructions when leadCapture enabled', () => {
  const prompt = gen.buildUserPrompt({ ...base, agentConfig: { ...base.agentConfig, leadCapture: { enabled: true } } });
  expect(prompt).toContain('capture_lead');
});

test('buildUserPrompt omits capture_lead instructions when leadCapture disabled', () => {
  const prompt = gen.buildUserPrompt({ ...base, agentConfig: { ...base.agentConfig, leadCapture: { enabled: false } } });
  expect(prompt).not.toContain('capture_lead');
});

test('buildUserPrompt omits capture_lead when leadCapture is absent', () => {
  const prompt = gen.buildUserPrompt(base);
  expect(prompt).not.toContain('capture_lead');
});
