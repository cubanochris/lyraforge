const path = require('path');
const fs = require('fs');
const os = require('os');
const request = require('supertest');

let app, store, leadStore, tmpDir, client;
const AUTH = 'Basic ' + Buffer.from('admin:test-pass').toString('base64');

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leads-route-'));
  jest.resetModules();
  process.env.CLIENTS_DIR = path.join(tmpDir, 'clients');
  process.env.ADMIN_PASSWORD = 'test-pass';
  store = require('../lib/clientStore');
  leadStore = require('../lib/leadStore');
  app = require('../app');
  client = store.createClient({ clientContact: { name: 'Biz' } });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.CLIENTS_DIR;
  delete process.env.ADMIN_PASSWORD;
});

test('PUT rejects forward mode with no destination', async () => {
  const res = await request(app).put('/api/clients/' + client.id)
    .set('Authorization', AUTH).set('Content-Type', 'application/json')
    .send({ agentConfig: { leadCapture: { mode: 'forward', forwardEmail: '', forwardWebhookUrl: '', forwardSms: '' } } });
  expect(res.status).toBe(400);
});

test('PUT accepts forward mode with a destination and deep-merges leadCapture', async () => {
  const res = await request(app).put('/api/clients/' + client.id)
    .set('Authorization', AUTH).set('Content-Type', 'application/json')
    .send({ agentConfig: { leadCapture: { mode: 'forward', forwardEmail: 'a@b.com' } } });
  expect(res.status).toBe(200);
  const saved = store.getClient(client.id);
  expect(saved.agentConfig.leadCapture.mode).toBe('forward');
  expect(saved.agentConfig.leadCapture.forwardEmail).toBe('a@b.com');
  expect(saved.agentConfig.leadCapture.enabled).toBe(true);
});

test('GET /:id/leads (store mode) returns lead content, no auth required', async () => {
  leadStore.create(client.id, { name: 'Sam', phone: '555', reason: 'callback', mode: 'store', capturedAt: '2026-05-01T00:00:00.000Z' });
  const res = await request(app).get('/api/clients/' + client.id + '/leads');
  expect(res.status).toBe(200);
  expect(res.body.mode).toBe('store');
  expect(res.body.leads[0].name).toBe('Sam');
});

test('GET /:id/leads (forward mode) returns count only, no content', async () => {
  store.updateClient(client.id, { agentConfig: { ...client.agentConfig,
    leadCapture: { enabled: true, mode: 'forward', forwardEmail: 'a@b.com', forwardWebhookUrl: '', forwardSms: '' } } });
  leadStore.create(client.id, { mode: 'forward', forwarded: true, channels: ['email'] });
  const res = await request(app).get('/api/clients/' + client.id + '/leads');
  expect(res.status).toBe(200);
  expect(res.body.mode).toBe('forward');
  expect(res.body.count).toBe(1);
  expect(res.body.leads).toBeUndefined();
});

test('GET /:id/leads/count is admin-only and returns total + forwardFailed', async () => {
  leadStore.create(client.id, { name: 'Sam', phone: '5', mode: 'store' });
  leadStore.create(client.id, { name: 'Lost', phone: '6', mode: 'forward', forwardFailed: true });
  const unauth = await request(app).get('/api/clients/' + client.id + '/leads/count');
  expect(unauth.status).toBe(401);
  const res = await request(app).get('/api/clients/' + client.id + '/leads/count').set('Authorization', AUTH);
  expect(res.status).toBe(200);
  expect(res.body.count).toBe(2);
  expect(res.body.forwardFailed).toBe(1);
});

test('GET /:id/leads/failed (admin) returns flagged content for recovery', async () => {
  leadStore.create(client.id, { name: 'Lost', phone: '6', mode: 'forward', forwardFailed: true });
  leadStore.create(client.id, { name: 'Fine', phone: '7', mode: 'store' });
  const res = await request(app).get('/api/clients/' + client.id + '/leads/failed').set('Authorization', AUTH);
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(1);
  expect(res.body[0].name).toBe('Lost');
});
