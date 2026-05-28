const CallScriptGenerator = require('./services/script-generator');

const generator = new CallScriptGenerator(process.env.CLAUDE_API_KEY);

// Generate script with multiple goals
const result = await generator.generateScript({
  selectedGoals: ['book_appointment', 'qualify_lead'],
  businessData: { businessId: 'biz_123' },
  tone: 'professional',
  includeObjectionHandling: true,
  maxDurationMinutes: 5
});

console.log(result.script); // The generated script JSON
