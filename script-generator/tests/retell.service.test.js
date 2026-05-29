const https = require('https');

// Stub retellRequest so tests don't hit the network.
// Each test injects its own deps; this just prevents module-load errors.
jest.mock('https');

// Re-require with a clean module registry so env vars work
let retell;
beforeEach(() => {
  jest.resetModules();
  process.env.RETELL_API_KEY = 'test-key';
  retell = require('../services/retell');
});
afterEach(() => { delete process.env.RETELL_API_KEY; });

function makeDeps(overrides = {}) {
  return {
    listAgents: jest.fn().mockResolvedValue([{ agent_id: 'a1', agent_name: 'Test' }]),
    listPhoneNumbers: jest.fn().mockResolvedValue([{ phone_number: '+14155550000' }]),
    listVoices: jest.fn().mockResolvedValue([{ voice_id: 'retell-Cimo', voice_name: 'Cimo', gender: 'male' }]),
    createLlm: jest.fn().mockResolvedValue({ llm_id: 'llm_new' }),
    createAgent: jest.fn().mockResolvedValue({ agent_id: 'agent_new' }),
    createPhoneNumber: jest.fn().mockResolvedValue({ phone_number: '+14155550001' }),
    publishAgent: jest.fn().mockResolvedValue({ agent_id: 'a1', version: 3, is_published: true }),
    updatePhoneNumber: jest.fn().mockResolvedValue({ phone_number: '+14155550000' }),
    ...overrides
  };
}

test('listAgents calls the dep and returns result', async () => {
  const deps = makeDeps();
  const result = await retell.listAgents(deps);
  expect(deps.listAgents).toHaveBeenCalledTimes(1);
  expect(result[0].agent_id).toBe('a1');
});

test('listPhoneNumbers calls the dep and returns result', async () => {
  const deps = makeDeps();
  const result = await retell.listPhoneNumbers(deps);
  expect(deps.listPhoneNumbers).toHaveBeenCalledTimes(1);
  expect(result[0].phone_number).toBe('+14155550000');
});

test('listVoices calls the dep and returns result', async () => {
  const deps = makeDeps();
  const result = await retell.listVoices(deps);
  expect(deps.listVoices).toHaveBeenCalledTimes(1);
  expect(result[0].voice_id).toBe('retell-Cimo');
});

test('createLlm calls dep with body and returns llm_id', async () => {
  const deps = makeDeps();
  const result = await retell.createLlm({}, deps);
  expect(deps.createLlm).toHaveBeenCalledWith({});
  expect(result.llm_id).toBe('llm_new');
});

test('createAgent calls dep with body and returns agent_id', async () => {
  const deps = makeDeps();
  const body = { response_engine: { type: 'retell-llm', llm_id: 'llm_new' }, voice_id: 'retell-Cimo' };
  const result = await retell.createAgent(body, deps);
  expect(deps.createAgent).toHaveBeenCalledWith(body);
  expect(result.agent_id).toBe('agent_new');
});

test('createPhoneNumber calls dep with body', async () => {
  const deps = makeDeps();
  const body = { area_code: 415, inbound_agents: [{ agent_id: 'agent_new', weight: 1 }] };
  const result = await retell.createPhoneNumber(body, deps);
  expect(deps.createPhoneNumber).toHaveBeenCalledWith(body);
  expect(result.phone_number).toBe('+14155550001');
});

test('publishAgent calls dep with agentId and version', async () => {
  const deps = makeDeps();
  const result = await retell.publishAgent('a1', 2, deps);
  expect(deps.publishAgent).toHaveBeenCalledWith('a1', 2);
  expect(result.is_published).toBe(true);
});

test('updatePhoneNumber calls dep with phoneNumber and body', async () => {
  const deps = makeDeps();
  const body = { inbound_agents: [{ agent_id: 'a1', agent_version: 'latest_published', weight: 1 }] };
  const result = await retell.updatePhoneNumber('+14155550000', body, deps);
  expect(deps.updatePhoneNumber).toHaveBeenCalledWith('+14155550000', body);
  expect(result.phone_number).toBe('+14155550000');
});

test('throws when RETELL_API_KEY is missing', async () => {
  delete process.env.RETELL_API_KEY;
  await expect(retell.listAgents()).rejects.toThrow('RETELL_API_KEY');
});
