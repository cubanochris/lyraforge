const { syncAgentToRetell } = require('../services/retell');

function makeClient(over = {}) {
  return {
    id: 'c1',
    generatedScript: 'You are Acme reception...',
    agentConfig: {
      retellAgentId: 'agent_X',
      leadCapture: { enabled: true, mode: 'store' },
      ...over.agentConfig
    },
    ...over
  };
}

function makeDeps(over = {}) {
  return {
    getAgent: jest.fn().mockResolvedValue({
      version: 3,
      response_engine: { type: 'retell-llm', llm_id: 'llm_1' }
    }),
    getLlm: jest.fn().mockResolvedValue({ general_tools: [{ type: 'custom', name: 'end_call' }] }),
    updateLlm: jest.fn().mockResolvedValue({ llm_id: 'llm_1' }),
    ...over
  };
}

const OPTS = { baseUrl: 'https://app.example.com', secret: 'sek' };

beforeEach(() => { process.env.RETELL_API_KEY = 'key'; });
afterEach(() => { delete process.env.RETELL_API_KEY; });

test('resolves llm_id from the agent and PATCHes update-retell-llm', async () => {
  const deps = makeDeps();
  const res = await syncAgentToRetell(makeClient(), OPTS, deps);
  expect(deps.getAgent).toHaveBeenCalledWith('agent_X');
  expect(deps.updateLlm).toHaveBeenCalledTimes(1);
  expect(deps.updateLlm.mock.calls[0][0]).toBe('llm_1');
  expect(res).toEqual({ llmId: 'llm_1', toolsPushed: true, scriptPushed: true, agentVersion: 3 });
});

test('merges capture_lead into general_tools, preserving existing tools', async () => {
  const deps = makeDeps();
  await syncAgentToRetell(makeClient(), OPTS, deps);
  const body = deps.updateLlm.mock.calls[0][1];
  const names = body.general_tools.map(t => t.name);
  expect(names).toContain('end_call');
  expect(names.filter(n => n === 'capture_lead')).toHaveLength(1);
  expect(body.general_prompt).toBe('You are Acme reception...');
});

test('replaces an existing capture_lead tool instead of duplicating it', async () => {
  const deps = makeDeps({
    getLlm: jest.fn().mockResolvedValue({
      general_tools: [{ type: 'custom', name: 'capture_lead', url: 'https://old' }]
    })
  });
  await syncAgentToRetell(makeClient(), OPTS, deps);
  const tools = deps.updateLlm.mock.calls[0][1].general_tools;
  expect(tools.filter(t => t.name === 'capture_lead')).toHaveLength(1);
  expect(tools.find(t => t.name === 'capture_lead').url).toBe('https://app.example.com/api/functions/capture-lead');
});

test('includeLeadTool:false omits tools and skips getLlm', async () => {
  const deps = makeDeps();
  await syncAgentToRetell(makeClient(), { ...OPTS, includeLeadTool: false }, deps);
  const body = deps.updateLlm.mock.calls[0][1];
  expect(body.general_tools).toBeUndefined();
  expect(body.general_prompt).toBe('You are Acme reception...');
  expect(deps.getLlm).not.toHaveBeenCalled();
});

test('includeScript:false omits general_prompt but still pushes tools', async () => {
  const deps = makeDeps();
  const res = await syncAgentToRetell(makeClient(), { ...OPTS, includeScript: false }, deps);
  const body = deps.updateLlm.mock.calls[0][1];
  expect(body.general_prompt).toBeUndefined();
  expect(body.general_tools.map(t => t.name)).toContain('capture_lead');
  expect(res.scriptPushed).toBe(false);
});

test('tolerates an LLM with no general_tools array', async () => {
  const deps = makeDeps({ getLlm: jest.fn().mockResolvedValue({}) });
  await syncAgentToRetell(makeClient(), OPTS, deps);
  expect(deps.updateLlm.mock.calls[0][1].general_tools.map(t => t.name)).toEqual(['capture_lead']);
});

test('throws NOTHING_TO_SYNC when there is no script and lead capture is disabled', async () => {
  const client = makeClient({ generatedScript: '', agentConfig: { retellAgentId: 'agent_X', leadCapture: { enabled: false } } });
  await expect(syncAgentToRetell(client, OPTS, makeDeps())).rejects.toMatchObject({ code: 'NOTHING_TO_SYNC' });
});

test('does not push the tool when leadCapture is disabled', async () => {
  const deps = makeDeps();
  const client = makeClient({ agentConfig: { retellAgentId: 'agent_X', leadCapture: { enabled: false } } });
  const res = await syncAgentToRetell(client, OPTS, deps);
  expect(res.toolsPushed).toBe(false);
  expect(deps.updateLlm.mock.calls[0][1].general_tools).toBeUndefined();
});

test('throws UNSUPPORTED_ENGINE for non-retell-llm agents', async () => {
  const deps = makeDeps({
    getAgent: jest.fn().mockResolvedValue({ response_engine: { type: 'conversation-flow', conversation_flow_id: 'cf_1' } })
  });
  await expect(syncAgentToRetell(makeClient(), OPTS, deps)).rejects.toMatchObject({ code: 'UNSUPPORTED_ENGINE' });
  expect(deps.updateLlm).not.toHaveBeenCalled();
});

test('throws when RETELL_API_KEY is missing', async () => {
  delete process.env.RETELL_API_KEY;
  await expect(syncAgentToRetell(makeClient(), OPTS, makeDeps())).rejects.toThrow('RETELL_API_KEY');
});

test('throws when retellAgentId is missing', async () => {
  const client = makeClient({ agentConfig: { retellAgentId: '' } });
  await expect(syncAgentToRetell(client, OPTS, makeDeps())).rejects.toThrow('Agent ID');
});
