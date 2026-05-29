const https = require('https');
const { buildCaptureLeadTool } = require('./retellToolConfig');

const RETELL_HOST = 'api.retellai.com';

// Minimal native-https JSON request to the Retell API.
function retellRequest(method, path, apiKey, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Authorization': `Bearer ${apiKey}` };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = https.request({ hostname: RETELL_HOST, path, method, headers, timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data || '{}')); } catch (_) { resolve({}); }
        } else {
          const err = new Error(`Retell API error ${res.statusCode}: ${data}`);
          err.statusCode = res.statusCode;
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Retell API request timed out')));
    if (payload) req.write(payload);
    req.end();
  });
}

// Live Retell HTTP layer. Overridable in tests via the `deps` argument.
function defaultDeps(apiKey) {
  return {
    getAgent: (agentId) => retellRequest('GET', `/get-agent/${agentId}`, apiKey),
    getLlm: (llmId) => retellRequest('GET', `/get-retell-llm/${llmId}`, apiKey),
    updateLlm: (llmId, body) => retellRequest('PATCH', `/update-retell-llm/${llmId}`, apiKey, body)
  };
}

/**
 * Sync a client's config to its Retell LLM (the agent's response engine).
 * Updates the DRAFT LLM with general_prompt (script) and/or general_tools
 * (capture_lead, merged with existing tools). Stage-only — does not publish.
 *
 * @param client  LyraForge client record
 * @param opts    { includeScript=true, includeLeadTool=true, baseUrl, secret }
 * @param deps    optional injected { getAgent, getLlm, updateLlm } (tests)
 * @returns       { llmId, toolsPushed, scriptPushed, agentVersion }
 */
async function syncAgentToRetell(client, opts = {}, deps = null) {
  const { includeScript = true, includeLeadTool = true, baseUrl, secret } = opts;
  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) throw new Error('RETELL_API_KEY is not set');

  const agentId = client.agentConfig && client.agentConfig.retellAgentId;
  if (!agentId) throw new Error('Retell Agent ID is not set in agent config');

  const d = deps || defaultDeps(apiKey);

  const agent = await d.getAgent(agentId);
  const engine = agent.response_engine || {};
  if (engine.type !== 'retell-llm' || !engine.llm_id) {
    const e = new Error(`Agent response engine is "${engine.type || 'unknown'}"; sync supports Retell LLM agents only`);
    e.code = 'UNSUPPORTED_ENGINE';
    throw e;
  }
  const llmId = engine.llm_id;

  const lc = client.agentConfig.leadCapture || {};
  const wantTool = includeLeadTool && lc.enabled !== false;
  const wantScript = includeScript && !!client.generatedScript;

  const body = {};
  let toolsPushed = false;
  let scriptPushed = false;

  if (wantTool) {
    const llm = await d.getLlm(llmId);
    const existing = Array.isArray(llm.general_tools) ? llm.general_tools : [];
    const tool = buildCaptureLeadTool(client, { baseUrl, secret });
    body.general_tools = existing.filter(t => t.name !== 'capture_lead').concat([tool]);
    toolsPushed = true;
  }

  if (wantScript) {
    body.general_prompt = client.generatedScript;
    scriptPushed = true;
  }

  if (!toolsPushed && !scriptPushed) {
    const e = new Error('Nothing to sync — no generated script and lead capture is disabled');
    e.code = 'NOTHING_TO_SYNC';
    throw e;
  }

  await d.updateLlm(llmId, body);
  return { llmId, toolsPushed, scriptPushed, agentVersion: agent.version };
}

module.exports = { syncAgentToRetell };
