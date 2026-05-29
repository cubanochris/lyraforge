const path = require('path');
const fs = require('fs');
const os = require('os');
const request = require('supertest');

jest.mock('../services/retell', () => ({
  syncAgentToRetell: jest.fn(),
  listAgents: jest.fn(), listPhoneNumbers: jest.fn(), listVoices: jest.fn(),
  createLlm: jest.fn(), createAgent: jest.fn(), createPhoneNumber: jest.fn(),
  publishAgent: jest.fn(), updatePhoneNumber: jest.fn()
}));
const retell = require('../services/retell');

let app, store, tmpDir, client;
const AUTH = 'Basic ' + Buffer.from('admin:test-pass').toString('base64');

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provision-'));
  jest.resetModules();
  jest.doMock('../services/retell', () => retell);
  process.env.CLIENTS_DIR = path.join(tmpDir, 'clients');
  process.env.ADMIN_PASSWORD = 'test-pass';
  process.env.RETELL_API_KEY = 'test-key';
  store = require('../lib/clientStore');
  app = require('../app');
  client = store.createClient({ clientContact: { name: 'Biz' } });
  Object.values(retell).forEach(fn => typeof fn === 'function' && fn.mockReset && fn.mockReset());
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  ['CLIENTS_DIR','ADMIN_PASSWORD','RETELL_API_KEY'].forEach(k => delete process.env[k]);
});

// ── /retell-provision ─────────────────────────────────────────────────────

test('provision: 401 without auth', async () => {
  const res = await request(app).post('/api/clients/' + client.id + '/retell-provision')
    .send({ voiceId: 'retell-Cimo', areaCode: '415' });
  expect(res.status).toBe(401);
});

test('provision: 400 when voiceId missing', async () => {
  const res = await request(app).post('/api/clients/' + client.id + '/retell-provision')
    .set('Authorization', AUTH).send({ areaCode: '415' });
  expect(res.status).toBe(400);
});

test('provision: 400 when areaCode missing', async () => {
  const res = await request(app).post('/api/clients/' + client.id + '/retell-provision')
    .set('Authorization', AUTH).send({ voiceId: 'retell-Cimo' });
  expect(res.status).toBe(400);
});

test('provision: 409 when retellAgentId already set', async () => {
  store.updateClient(client.id, { agentConfig: { ...client.agentConfig, retellAgentId: 'agent_exists' } });
  const res = await request(app).post('/api/clients/' + client.id + '/retell-provision')
    .set('Authorization', AUTH).send({ voiceId: 'retell-Cimo', areaCode: '415' });
  expect(res.status).toBe(409);
});

test('provision: full success saves all three ids on client', async () => {
  retell.createLlm.mockResolvedValue({ llm_id: 'llm_new' });
  retell.createAgent.mockResolvedValue({ agent_id: 'agent_new' });
  retell.createPhoneNumber.mockResolvedValue({ phone_number: '+14155550001' });
  const res = await request(app).post('/api/clients/' + client.id + '/retell-provision')
    .set('Authorization', AUTH).send({ voiceId: 'retell-Cimo', areaCode: '415', agentName: 'Biz Bot' });
  expect(res.status).toBe(200);
  expect(res.body.llmId).toBe('llm_new');
  expect(res.body.agentId).toBe('agent_new');
  expect(res.body.phoneNumber).toBe('+14155550001');
  const saved = store.getClient(client.id);
  expect(saved.agentConfig.retellLlmId).toBe('llm_new');
  expect(saved.agentConfig.retellAgentId).toBe('agent_new');
  expect(saved.agentConfig.retellPhoneNumber).toBe('+14155550001');
});

test('provision: partial failure at createAgent saves llmId and returns 502 with step', async () => {
  retell.createLlm.mockResolvedValue({ llm_id: 'llm_new' });
  retell.createAgent.mockRejectedValue(new Error('Retell API error 500: fail'));
  const res = await request(app).post('/api/clients/' + client.id + '/retell-provision')
    .set('Authorization', AUTH).send({ voiceId: 'retell-Cimo', areaCode: '415' });
  expect(res.status).toBe(502);
  expect(res.body.step).toBe('createAgent');
  expect(res.body.saved.retellLlmId).toBe('llm_new');
  const saved = store.getClient(client.id);
  expect(saved.agentConfig.retellLlmId).toBe('llm_new');
  expect(saved.agentConfig.retellAgentId).toBe('');
});

test('provision: skips createLlm when retellLlmId already set (resume from step 2)', async () => {
  store.updateClient(client.id, { agentConfig: { ...client.agentConfig, retellLlmId: 'llm_existing' } });
  retell.createAgent.mockResolvedValue({ agent_id: 'agent_new' });
  retell.createPhoneNumber.mockResolvedValue({ phone_number: '+14155550001' });
  await request(app).post('/api/clients/' + client.id + '/retell-provision')
    .set('Authorization', AUTH).send({ voiceId: 'retell-Cimo', areaCode: '415' });
  expect(retell.createLlm).not.toHaveBeenCalled();
  expect(retell.createAgent).toHaveBeenCalledTimes(1);
});

// ── /retell-golive ────────────────────────────────────────────────────────

test('golive: 401 without auth', async () => {
  const res = await request(app).post('/api/clients/' + client.id + '/retell-golive');
  expect(res.status).toBe(401);
});

test('golive: 400 when no retellAgentId', async () => {
  const res = await request(app).post('/api/clients/' + client.id + '/retell-golive').set('Authorization', AUTH);
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/provision/i);
});

test('golive: 400 when no lastSyncedAgentVersion', async () => {
  store.updateClient(client.id, { agentConfig: { ...client.agentConfig, retellAgentId: 'agent_X' } });
  const res = await request(app).post('/api/clients/' + client.id + '/retell-golive').set('Authorization', AUTH);
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/push/i);
});

test('golive: 400 when already live on this version', async () => {
  store.updateClient(client.id, {
    agentConfig: { ...client.agentConfig, retellAgentId: 'agent_X' },
    lastSyncedAgentVersion: 3, lastPublishedAgentVersion: 3
  });
  const res = await request(app).post('/api/clients/' + client.id + '/retell-golive').set('Authorization', AUTH);
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/already live/i);
});

test('golive: success with phone number — publishes and repoints', async () => {
  store.updateClient(client.id, {
    agentConfig: { ...client.agentConfig, retellAgentId: 'agent_X', retellPhoneNumber: '+14155550001' },
    lastSyncedAgentVersion: 5
  });
  retell.publishAgent.mockResolvedValue({ agent_id: 'agent_X', version: 5, is_published: true });
  retell.updatePhoneNumber.mockResolvedValue({ phone_number: '+14155550001' });
  const res = await request(app).post('/api/clients/' + client.id + '/retell-golive').set('Authorization', AUTH);
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(res.body.publishedVersion).toBe(5);
  expect(retell.updatePhoneNumber).toHaveBeenCalledTimes(1);
  const saved = store.getClient(client.id);
  expect(saved.status).toBe('live');
  expect(saved.lastPublishedAgentVersion).toBe(5);
  expect(saved.lastGoLiveAt).not.toBeNull();
});

test('golive: success without phone number — publishes only, no updatePhoneNumber', async () => {
  store.updateClient(client.id, {
    agentConfig: { ...client.agentConfig, retellAgentId: 'agent_X', retellPhoneNumber: '' },
    lastSyncedAgentVersion: 2
  });
  retell.publishAgent.mockResolvedValue({ agent_id: 'agent_X', version: 2, is_published: true });
  const res = await request(app).post('/api/clients/' + client.id + '/retell-golive').set('Authorization', AUTH);
  expect(res.status).toBe(200);
  expect(retell.updatePhoneNumber).not.toHaveBeenCalled();
  expect(res.body.note).toMatch(/no phone/i);
});
