const path = require('path');
const fs = require('fs');
const os = require('os');

let request, app, clientStore, callStore, tmpDir;

beforeEach(() => {
  jest.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-test-'));
  process.env.CLIENTS_DIR = path.join(tmpDir, 'clients');
  process.env.CALLS_DIR = path.join(tmpDir, 'calls');
  process.env.ADMIN_PASSWORD = 'test';
  request = require('supertest');
  app = require('../app');
  clientStore = require('../lib/clientStore');
  callStore = require('../lib/callStore');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.CLIENTS_DIR;
  delete process.env.CALLS_DIR;
  delete process.env.ADMIN_PASSWORD;
});

test('returns 404 for unknown client', async () => {
  const res = await request(app).get('/api/clients/unknown-id/usage');
  expect(res.status).toBe(404);
});

test('returns zero counts when no calls exist', async () => {
  const client = clientStore.createClient({ clientContact: { name: 'Test' }, subscription: 'Starter' });
  const res = await request(app).get(`/api/clients/${client.id}/usage`);
  expect(res.status).toBe(200);
  expect(res.body.calls.thisRange).toBe(0);
  expect(res.body.calls.allTime).toBe(0);
  expect(res.body.calls.minutesThisRange).toBe(0);
  expect(res.body.sentiment).toEqual({ positive: 0, neutral: 0, negative: 0 });
  expect(res.body.monthlyRate).toBe(497);
});

test('counts calls and minutes in current month', async () => {
  const client = clientStore.createClient({ clientContact: { name: 'Test' }, subscription: 'Professional' });
  const now = Date.now();
  callStore.upsertCall(client.id, 'call-1', { startTimestamp: now - 86400000, durationMs: 60000, sentiment: 'positive' });
  callStore.upsertCall(client.id, 'call-2', { startTimestamp: now - 86400000 * 2, durationMs: 120000, sentiment: 'neutral' });
  const res = await request(app).get(`/api/clients/${client.id}/usage?range=month`);
  expect(res.body.calls.thisRange).toBe(2);
  expect(res.body.calls.minutesThisRange).toBe(3);
  expect(res.body.sentiment.positive).toBe(1);
  expect(res.body.sentiment.neutral).toBe(1);
  expect(res.body.monthlyRate).toBe(997);
});

test('excludes calls older than current month', async () => {
  const client = clientStore.createClient({ clientContact: { name: 'Test' } });
  callStore.upsertCall(client.id, 'old-call', { startTimestamp: Date.now() - 86400000 * 60, durationMs: 60000 });
  const res = await request(app).get(`/api/clients/${client.id}/usage?range=month`);
  expect(res.body.calls.thisRange).toBe(0);
  expect(res.body.calls.allTime).toBe(1);
});

test('range=all returns all calls', async () => {
  const client = clientStore.createClient({ clientContact: { name: 'Test' } });
  callStore.upsertCall(client.id, 'old', { startTimestamp: Date.now() - 86400000 * 60, durationMs: 30000 });
  callStore.upsertCall(client.id, 'recent', { startTimestamp: Date.now() - 86400000, durationMs: 30000 });
  const res = await request(app).get(`/api/clients/${client.id}/usage?range=all`);
  expect(res.body.calls.thisRange).toBe(2);
});

test('does not expose admin fields', async () => {
  const client = clientStore.createClient({ clientContact: { name: 'Test' }, internalNotes: 'SECRET' });
  const res = await request(app).get(`/api/clients/${client.id}/usage`);
  expect(res.body.internalNotes).toBeUndefined();
  expect(res.body.agentConfig).toBeUndefined();
  expect(res.body.generatedScript).toBeUndefined();
});

test('recentCalls capped at 20 entries', async () => {
  const client = clientStore.createClient({ clientContact: { name: 'Test' } });
  for (let i = 0; i < 25; i++) {
    callStore.upsertCall(client.id, `call-${i}`, { startTimestamp: Date.now() - i * 3600000, durationMs: 30000 });
  }
  const res = await request(app).get(`/api/clients/${client.id}/usage?range=all`);
  expect(res.body.recentCalls.length).toBe(20);
});

test('recentCalls only exposes date, durationMs, sentiment', async () => {
  const client = clientStore.createClient({ clientContact: { name: 'Test' } });
  callStore.upsertCall(client.id, 'call-1', { startTimestamp: Date.now(), durationMs: 60000, sentiment: 'positive', summary: 'SECRET' });
  const res = await request(app).get(`/api/clients/${client.id}/usage?range=all`);
  const call = res.body.recentCalls[0];
  expect(call.date).toBeDefined();
  expect(call.durationMs).toBe(60000);
  expect(call.sentiment).toBe('positive');
  expect(call.summary).toBeUndefined();
});
