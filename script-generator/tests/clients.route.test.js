const request = require('supertest');
const path = require('path');
const fs = require('fs');
const os = require('os');

let app;
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clients-'));
  jest.resetModules();
  process.env.CLIENTS_DIR = tmpDir;
  process.env.ADMIN_PASSWORD = 'testpass';
  app = require('../app');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.CLIENTS_DIR;
  delete process.env.ADMIN_PASSWORD;
});

function adminAuth() {
  return 'Basic ' + Buffer.from('admin:testpass').toString('base64');
}

test('GET /api/clients requires auth', async () => {
  const res = await request(app).get('/api/clients');
  expect(res.status).toBe(401);
});

test('GET /api/clients succeeds with correct password', async () => {
  const res = await request(app)
    .get('/api/clients')
    .set('Authorization', adminAuth());
  expect(res.status).toBe(200);
});

test('GET /api/clients rejects wrong password', async () => {
  const res = await request(app)
    .get('/api/clients')
    .set('Authorization', 'Basic ' + Buffer.from('admin:wrong').toString('base64'));
  expect(res.status).toBe(401);
});

test('POST /api/clients creates a client and returns id + clientUrl', async () => {
  const res = await request(app)
    .post('/api/clients')
    .set('Authorization', adminAuth())
    .send({ clientContact: { name: 'Alice', email: 'alice@test.com' } });
  expect(res.status).toBe(201);
  expect(res.body.id).toBeDefined();
  expect(res.body.clientUrl).toContain('/client/');
});

test('GET /api/clients returns array', async () => {
  await request(app)
    .post('/api/clients')
    .set('Authorization', adminAuth())
    .send({ clientContact: { name: 'Bob' } });
  const res = await request(app)
    .get('/api/clients')
    .set('Authorization', adminAuth());
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body.length).toBe(1);
});

test('GET /api/clients/:id with auth returns full client', async () => {
  const created = await request(app)
    .post('/api/clients')
    .set('Authorization', adminAuth())
    .send({ clientContact: { name: 'Carol' } });
  const id = created.body.id;
  const res = await request(app)
    .get(`/api/clients/${id}`)
    .set('Authorization', adminAuth());
  expect(res.status).toBe(200);
  expect(res.body.agentConfig).toBeDefined();
});

test('GET /api/clients/:id without auth returns only businessInfo and status', async () => {
  const created = await request(app)
    .post('/api/clients')
    .set('Authorization', adminAuth())
    .send({ clientContact: { name: 'Dan' } });
  const id = created.body.id;
  const res = await request(app).get(`/api/clients/${id}`);
  expect(res.status).toBe(200);
  expect(res.body.businessInfo).toBeDefined();
  expect(res.body.agentConfig).toBeUndefined();
  expect(res.body.clientContact).toBeUndefined();
});

test('GET /api/clients/:id returns 404 for unknown id', async () => {
  const res = await request(app).get('/api/clients/nonexistent');
  expect(res.status).toBe(404);
});

test('PUT /api/clients/:id with auth updates agentConfig', async () => {
  const created = await request(app)
    .post('/api/clients')
    .set('Authorization', adminAuth())
    .send({});
  const id = created.body.id;
  const res = await request(app)
    .put(`/api/clients/${id}`)
    .set('Authorization', adminAuth())
    .send({ agentConfig: { tone: 'friendly' } });
  expect(res.status).toBe(200);
  expect(res.body.agentConfig.tone).toBe('friendly');
});

test('PUT /api/clients/:id without auth only updates businessInfo and sets status to review', async () => {
  const created = await request(app)
    .post('/api/clients')
    .set('Authorization', adminAuth())
    .send({});
  const id = created.body.id;
  const res = await request(app)
    .put(`/api/clients/${id}`)
    .send({ businessInfo: { businessName: 'Test Co' }, agentConfig: { tone: 'formal' } });
  expect(res.status).toBe(200);
  expect(res.body.businessInfo.businessName).toBe('Test Co');
  expect(res.body.agentConfig.tone).toBe('professional'); // unchanged
  expect(res.body.status).toBe('review');
});

test('POST /api/clients/:id/generate returns 400 if no goals configured', async () => {
  const created = await request(app)
    .post('/api/clients')
    .set('Authorization', adminAuth())
    .send({});
  const res = await request(app)
    .post(`/api/clients/${created.body.id}/generate`)
    .set('Authorization', adminAuth());
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/goal/i);
});

test('POST /api/clients/:id/push returns 400 if no script generated yet', async () => {
  const created = await request(app)
    .post('/api/clients')
    .set('Authorization', adminAuth())
    .send({});
  const res = await request(app)
    .post(`/api/clients/${created.body.id}/push`)
    .set('Authorization', adminAuth());
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/script/i);
});

test('POST /api/clients/:id/push returns 400 if no Retell agent ID', async () => {
  const created = await request(app)
    .post('/api/clients')
    .set('Authorization', adminAuth())
    .send({});
  const id = created.body.id;
  // Inject a script directly into the store
  const store = require('../lib/clientStore');
  store.updateClient(id, { generatedScript: 'Hello', agentConfig: { retellAgentId: '' } });
  const res = await request(app)
    .post(`/api/clients/${id}/push`)
    .set('Authorization', adminAuth());
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/agent id/i);
});
