const path = require('path');
const fs = require('fs');
const os = require('os');
const request = require('supertest');

jest.mock('../services/retell', () => ({ syncAgentToRetell: jest.fn() }));
const { syncAgentToRetell } = require('../services/retell');

let app, store, tmpDir, client;
const AUTH = 'Basic ' + Buffer.from('admin:test-pass').toString('base64');

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retell-sync-'));
  jest.resetModules();
  jest.doMock('../services/retell', () => ({ syncAgentToRetell }));
  process.env.CLIENTS_DIR = path.join(tmpDir, 'clients');
  process.env.ADMIN_PASSWORD = 'test-pass';
  process.env.FUNCTION_SECRET = 'sek';
  store = require('../lib/clientStore');
  app = require('../app');
  client = store.createClient({ clientContact: { name: 'Biz' } });
  syncAgentToRetell.mockReset();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.CLIENTS_DIR;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.FUNCTION_SECRET;
});

test('401 without auth', async () => {
  const res = await request(app).post('/api/clients/' + client.id + '/retell-sync');
  expect(res.status).toBe(401);
});

test('400 when retellAgentId is not set', async () => {
  const res = await request(app).post('/api/clients/' + client.id + '/retell-sync').set('Authorization', AUTH);
  expect(res.status).toBe(400);
  expect(syncAgentToRetell).not.toHaveBeenCalled();
});

test('400 when FUNCTION_SECRET is unset', async () => {
  delete process.env.FUNCTION_SECRET;
  store.updateClient(client.id, { agentConfig: { ...client.agentConfig, retellAgentId: 'agent_X' } });
  const res = await request(app).post('/api/clients/' + client.id + '/retell-sync').set('Authorization', AUTH);
  expect(res.status).toBe(400);
});

test('200 success returns sync result and passes baseUrl + secret', async () => {
  store.updateClient(client.id, { agentConfig: { ...client.agentConfig, retellAgentId: 'agent_X' } });
  syncAgentToRetell.mockResolvedValue({ llmId: 'llm_1', toolsPushed: true, scriptPushed: false, agentVersion: 2 });
  const res = await request(app).post('/api/clients/' + client.id + '/retell-sync').set('Authorization', AUTH);
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(res.body.llmId).toBe('llm_1');
  expect(typeof res.body.note).toBe('string');
  const opts = syncAgentToRetell.mock.calls[0][1];
  expect(opts.secret).toBe('sek');
  expect(opts.baseUrl).toMatch(/^https?:\/\//);
});

test('marks the client live when the script was pushed', async () => {
  store.updateClient(client.id, { agentConfig: { ...client.agentConfig, retellAgentId: 'agent_X' } });
  syncAgentToRetell.mockResolvedValue({ llmId: 'llm_1', toolsPushed: true, scriptPushed: true, agentVersion: 1 });
  await request(app).post('/api/clients/' + client.id + '/retell-sync').set('Authorization', AUTH);
  expect(store.getClient(client.id).status).toBe('live');
});

test('422 when the agent is not a retell-llm', async () => {
  store.updateClient(client.id, { agentConfig: { ...client.agentConfig, retellAgentId: 'agent_X' } });
  const err = new Error('Agent response engine is "conversation-flow"; sync supports Retell LLM agents only');
  err.code = 'UNSUPPORTED_ENGINE';
  syncAgentToRetell.mockRejectedValue(err);
  const res = await request(app).post('/api/clients/' + client.id + '/retell-sync').set('Authorization', AUTH);
  expect(res.status).toBe(422);
});

test('502 when the Retell API errors', async () => {
  store.updateClient(client.id, { agentConfig: { ...client.agentConfig, retellAgentId: 'agent_X' } });
  syncAgentToRetell.mockRejectedValue(new Error('Retell API error 500: boom'));
  const res = await request(app).post('/api/clients/' + client.id + '/retell-sync').set('Authorization', AUTH);
  expect(res.status).toBe(502);
});
