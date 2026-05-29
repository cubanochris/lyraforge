const path = require('path');
const fs = require('fs');
const os = require('os');
const request = require('supertest');

jest.mock('../services/retell', () => ({
  syncAgentToRetell: jest.fn(),
  listAgents: jest.fn(),
  listPhoneNumbers: jest.fn(),
  listVoices: jest.fn(),
  createLlm: jest.fn(), createAgent: jest.fn(), createPhoneNumber: jest.fn(),
  publishAgent: jest.fn(), updatePhoneNumber: jest.fn()
}));
const retell = require('../services/retell');

let app, tmpDir;
const AUTH = 'Basic ' + Buffer.from('admin:test-pass').toString('base64');

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retell-routes-'));
  jest.resetModules();
  jest.doMock('../services/retell', () => retell);
  process.env.CLIENTS_DIR = path.join(tmpDir, 'clients');
  process.env.ADMIN_PASSWORD = 'test-pass';
  process.env.RETELL_API_KEY = 'test-key';
  app = require('../app');
  retell.listAgents.mockReset();
  retell.listPhoneNumbers.mockReset();
  retell.listVoices.mockReset();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.CLIENTS_DIR;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.RETELL_API_KEY;
});

test('GET /api/retell/agents requires auth', async () => {
  const res = await request(app).get('/api/retell/agents');
  expect(res.status).toBe(401);
});

test('GET /api/retell/agents returns agent list', async () => {
  retell.listAgents.mockResolvedValue([{ agent_id: 'a1', agent_name: 'Biz Bot' }]);
  const res = await request(app).get('/api/retell/agents').set('Authorization', AUTH);
  expect(res.status).toBe(200);
  expect(res.body[0].agent_id).toBe('a1');
});

test('GET /api/retell/agents returns 502 on Retell error', async () => {
  retell.listAgents.mockRejectedValue(new Error('Retell API error 500: oops'));
  const res = await request(app).get('/api/retell/agents').set('Authorization', AUTH);
  expect(res.status).toBe(502);
  expect(res.body.error).toMatch(/Retell API error/);
});

test('GET /api/retell/phone-numbers requires auth', async () => {
  const res = await request(app).get('/api/retell/phone-numbers');
  expect(res.status).toBe(401);
});

test('GET /api/retell/phone-numbers returns phone list', async () => {
  retell.listPhoneNumbers.mockResolvedValue([{ phone_number: '+14155550000' }]);
  const res = await request(app).get('/api/retell/phone-numbers').set('Authorization', AUTH);
  expect(res.status).toBe(200);
  expect(res.body[0].phone_number).toBe('+14155550000');
});

test('GET /api/retell/voices requires auth', async () => {
  const res = await request(app).get('/api/retell/voices');
  expect(res.status).toBe(401);
});

test('GET /api/retell/voices returns voice list', async () => {
  retell.listVoices.mockResolvedValue([{ voice_id: 'retell-Cimo', voice_name: 'Cimo', gender: 'male' }]);
  const res = await request(app).get('/api/retell/voices').set('Authorization', AUTH);
  expect(res.status).toBe(200);
  expect(res.body[0].voice_id).toBe('retell-Cimo');
});
