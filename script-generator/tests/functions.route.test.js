const path = require('path');
const fs = require('fs');
const os = require('os');
const request = require('supertest');

let app, clientStore, leadStore, leadForwarder, functionsRouter, tmpDir, client;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fn-test-'));
  jest.resetModules();
  process.env.CLIENTS_DIR = path.join(tmpDir, 'clients');
  process.env.FUNCTION_SECRET = 'test-secret';
  clientStore = require('../lib/clientStore');
  leadStore = require('../lib/leadStore');
  leadForwarder = require('../services/leadForwarder');
  functionsRouter = require('../routes/functions');
  app = require('../app');
  client = clientStore.createClient({ clientContact: { name: 'Biz' } });
  clientStore.updateClient(client.id, { agentConfig: { ...client.agentConfig, retellAgentId: 'agent_X' } });
  client = clientStore.getClient(client.id);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.CLIENTS_DIR;
  delete process.env.FUNCTION_SECRET;
});

function callBody(args) {
  return { call: { agent_id: 'agent_X', call_id: 'call_1' }, args };
}

test('rejects without the bearer secret', async () => {
  const res = await request(app).post('/api/functions/capture-lead').send(callBody({ name: 'A', phone: '5' }));
  expect(res.status).toBe(401);
});

test('rejects with a wrong bearer secret', async () => {
  const res = await request(app).post('/api/functions/capture-lead')
    .set('Authorization', 'Bearer wrong').send(callBody({ name: 'A', phone: '5' }));
  expect(res.status).toBe(401);
});

test('unknown agent_id responds success and stores nothing', async () => {
  const res = await request(app).post('/api/functions/capture-lead')
    .set('Authorization', 'Bearer test-secret')
    .send({ call: { agent_id: 'agent_UNKNOWN' }, args: { name: 'A', phone: '5' } });
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
});

test('missing name/phone asks the agent to collect them, does not store', async () => {
  const res = await request(app).post('/api/functions/capture-lead')
    .set('Authorization', 'Bearer test-secret').send(callBody({ reason: 'hi' }));
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(false);
  expect(leadStore.count(client.id)).toBe(0);
});

test('valid call returns an immediate confirmation message', async () => {
  const res = await request(app).post('/api/functions/capture-lead')
    .set('Authorization', 'Bearer test-secret').send(callBody({ name: 'Sam', phone: '555' }));
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(typeof res.body.message).toBe('string');
});

test('processLead in store mode persists full content', async () => {
  await functionsRouter.processLead(client, { clientId: client.id, callId: 'c1', name: 'Sam', phone: '555' });
  const leads = leadStore.list(client.id);
  expect(leads).toHaveLength(1);
  expect(leads[0].name).toBe('Sam');
  expect(leads[0].mode).toBe('store');
});

test('processLead in forward mode (success) stores a contentless record', async () => {
  clientStore.updateClient(client.id, { agentConfig: { ...client.agentConfig,
    retellAgentId: 'agent_X',
    leadCapture: { enabled: true, mode: 'forward', forwardEmail: 'a@b.com', forwardWebhookUrl: '', forwardSms: '' } } });
  const fwd = clientStore.getClient(client.id);
  jest.spyOn(leadForwarder, 'forwardLead').mockResolvedValue({ succeeded: ['email'], anySucceeded: true, results: { email: true } });
  await functionsRouter.processLead(fwd, { clientId: fwd.id, callId: 'c1', name: 'Sam', phone: '555', reason: 'x' });
  const leads = leadStore.list(fwd.id);
  expect(leads).toHaveLength(1);
  expect(leads[0].forwarded).toBe(true);
  expect(leads[0].name).toBeUndefined();
  expect(leads[0].channels).toEqual(['email']);
});

test('processLead in forward mode (total failure) stores full content flagged forwardFailed', async () => {
  clientStore.updateClient(client.id, { agentConfig: { ...client.agentConfig,
    retellAgentId: 'agent_X',
    leadCapture: { enabled: true, mode: 'forward', forwardEmail: 'a@b.com', forwardWebhookUrl: '', forwardSms: '' } } });
  const fwd = clientStore.getClient(client.id);
  jest.spyOn(leadForwarder, 'forwardLead').mockResolvedValue({ succeeded: [], anySucceeded: false, results: { email: false } });
  await functionsRouter.processLead(fwd, { clientId: fwd.id, callId: 'c1', name: 'Sam', phone: '555' });
  const leads = leadStore.list(fwd.id);
  expect(leads).toHaveLength(1);
  expect(leads[0].forwardFailed).toBe(true);
  expect(leads[0].name).toBe('Sam');
});
