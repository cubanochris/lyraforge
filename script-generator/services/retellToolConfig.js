// Builds the Retell "custom function" tool spec for capturing leads.
// In v1 this JSON is shown in the admin UI and pasted into the Retell dashboard.
function buildCaptureLeadTool(client, { baseUrl, secret }) {
  return {
    type: 'custom',
    name: 'capture_lead',
    description: "Collect the caller's contact details when they want a callback or " +
      "cannot be helped live. Call this once you have at least the caller's name and phone number.",
    speak_during_execution: false,
    speak_after_execution: true,
    url: `${baseUrl}/api/functions/capture-lead`,
    headers: { Authorization: `Bearer ${secret}` },
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Caller's full name" },
        phone: { type: 'string', description: 'Best callback phone number' },
        email: { type: 'string', description: "Caller's email, if offered" },
        reason: { type: 'string', description: "Why they're calling / what they need" },
        preferred_callback_time: { type: 'string', description: "When they'd like to be called back, if mentioned" }
      },
      required: ['name', 'phone']
    }
  };
}

module.exports = { buildCaptureLeadTool };
