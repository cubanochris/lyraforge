const request = require('supertest');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

let app;
let tmpDir;

function sign(body, key) {
  return crypto.createHmac('sha256', key).update(body).digest('hex');
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webhook-test-'));
  jest.resetModules();
  process.env.CLIENTS_DIR = path.join(tmpDir, 'clients');
  process.env.RETELL_API_KEY = 'test-retell-key';
  process.env.ADMIN_PASSWORD = 'test-pass';
  app = require('../app');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.CLIENTS_DIR;
  delete process.env.RETELL_API_KEY;
  delete process.env.ADMIN_PASSWORD;
});

test('returns 401 when signature is missing', async () => {
  const body = JSON.stringify({ event: 'call_started', call: { call_id: 'c1', agent_id: 'a1' } });
  const res = await request(app)
    .post('/api/webhooks/retell')
    .set('Content-Type', 'application/json')
    .send(body);
  expect(res.status).toBe(401);
});

test('returns 401 when signature is wrong', async () => {
  const body = JSON.stringify({ event: 'call_started', call: { call_id: 'c1', agent_id: 'a1' } });
  const res = await request(app)
    .post('/api/webhooks/retell')
    .set('Content-Type', 'application/json')
    .set('x-retell-signature', 'badsig')
    .send(body);
  expect(res.status).toBe(401);
});

test('returns 200 and ignores event when no client matches agent_id', async () => {
  const body = JSON.stringify({ event: 'call_started', call: { call_id: 'c1', agent_id: 'unknown-agent', start_timestamp: 1000 } });
  const sig = sign(body, 'test-retell-key');
  const res = await request(app)
    .post('/api/webhooks/retell')
    .set('Content-Type', 'application/json')
    .set('x-retell-signature', sig)
    .send(body);
  expect(res.status).toBe(200);
});

test('call_started creates a call record for matching client', async () => {
  const clientRes = await request(app)
    .post('/api/clients')
    .set('Authorization', 'Basic ' + Buffer.from(':test-pass').toString('base64'))
    .send({ agentConfig: { retellAgentId: 'agent-123' } });
  const clientId = clientRes.body.id;

  const body = JSON.stringify({ event: 'call_started', call: { call_id: 'call-xyz', agent_id: 'agent-123', start_timestamp: 1000 } });
  const sig = sign(body, 'test-retell-key');
  await request(app)
    .post('/api/webhooks/retell')
    .set('Content-Type', 'application/json')
    .set('x-retell-signature', sig)
    .send(body);

  const callsRes = await request(app)
    .get(`/api/clients/${clientId}/calls`)
    .set('Authorization', 'Basic ' + Buffer.from(':test-pass').toString('base64'));
  expect(callsRes.status).toBe(200);
  expect(callsRes.body).toHaveLength(1);
  expect(callsRes.body[0].callId).toBe('call-xyz');
  expect(callsRes.body[0].status).toBe('in_progress');
});

test('call_ended updates an existing call record', async () => {
  const clientRes = await request(app)
    .post('/api/clients')
    .set('Authorization', 'Basic ' + Buffer.from(':test-pass').toString('base64'))
    .send({ agentConfig: { retellAgentId: 'agent-456' } });
  const clientId = clientRes.body.id;

  const startBody = JSON.stringify({ event: 'call_started', call: { call_id: 'call-end-test', agent_id: 'agent-456', start_timestamp: 1000 } });
  await request(app)
    .post('/api/webhooks/retell')
    .set('Content-Type', 'application/json')
    .set('x-retell-signature', sign(startBody, 'test-retell-key'))
    .send(startBody);

  const endBody = JSON.stringify({ event: 'call_ended', call: { call_id: 'call-end-test', agent_id: 'agent-456', start_timestamp: 1000, end_timestamp: 61000, disconnection_reason: 'hangup' } });
  const res = await request(app)
    .post('/api/webhooks/retell')
    .set('Content-Type', 'application/json')
    .set('x-retell-signature', sign(endBody, 'test-retell-key'))
    .send(endBody);
  expect(res.status).toBe(200);

  const callsRes = await request(app)
    .get(`/api/clients/${clientId}/calls`)
    .set('Authorization', 'Basic ' + Buffer.from(':test-pass').toString('base64'));
  expect(callsRes.body[0].status).toBe('ended');
  expect(callsRes.body[0].durationMs).toBe(60000);
  expect(callsRes.body[0].disconnectionReason).toBe('hangup');
});
