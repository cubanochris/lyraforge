const path = require('path');
const fs = require('fs');
const os = require('os');

// Point store at a temp dir so tests don't touch real data
let tmpDir;
let store;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clients-'));
  jest.resetModules();
  process.env.CLIENTS_DIR = tmpDir;
  store = require('../lib/clientStore');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.CLIENTS_DIR;
});

test('createClient returns client with id and pending status', () => {
  const client = store.createClient({ clientContact: { name: 'Alice', email: 'a@b.com' } });
  expect(client.id).toBeDefined();
  expect(client.status).toBe('pending');
  expect(client.clientContact.name).toBe('Alice');
});

test('getClient retrieves a saved client', () => {
  const created = store.createClient({ clientContact: { name: 'Bob' } });
  const fetched = store.getClient(created.id);
  expect(fetched.id).toBe(created.id);
  expect(fetched.clientContact.name).toBe('Bob');
});

test('getClient returns null for unknown id', () => {
  expect(store.getClient('nonexistent')).toBeNull();
});

test('updateClient merges fields without overwriting unrelated fields', () => {
  const client = store.createClient({ clientContact: { name: 'Carol' } });
  const updated = store.updateClient(client.id, { status: 'review', internalNotes: 'test' });
  expect(updated.status).toBe('review');
  expect(updated.internalNotes).toBe('test');
  expect(updated.clientContact.name).toBe('Carol');
});

test('updateClient returns null for unknown id', () => {
  expect(store.updateClient('nonexistent', { status: 'live' })).toBeNull();
});

test('listClients returns all clients sorted by updatedAt descending', () => {
  store.createClient({ clientContact: { name: 'First' } });
  store.createClient({ clientContact: { name: 'Second' } });
  const list = store.listClients();
  expect(list.length).toBe(2);
  expect(list[0].updatedAt >= list[1].updatedAt).toBe(true);
});

test('createClient seeds leadCapture defaults', () => {
  const client = store.createClient({ clientContact: { name: 'Dana' } });
  expect(client.agentConfig.leadCapture).toEqual({
    enabled: true, mode: 'store', forwardEmail: '', forwardWebhookUrl: '', forwardSms: ''
  });
});

test('findClientByAgentId returns the client whose agentConfig.retellAgentId matches', () => {
  const a = store.createClient({ clientContact: { name: 'A' } });
  store.updateClient(a.id, { agentConfig: { ...a.agentConfig, retellAgentId: 'agent_123' } });
  store.createClient({ clientContact: { name: 'B' } });
  const found = store.findClientByAgentId('agent_123');
  expect(found && found.id).toBe(a.id);
});

test('findClientByAgentId returns null for unknown or empty agentId', () => {
  store.createClient({ clientContact: { name: 'A' } });
  expect(store.findClientByAgentId('nope')).toBeNull();
  expect(store.findClientByAgentId('')).toBeNull();
});

test('createClient backfills leadCapture even when data supplies a partial agentConfig', () => {
  const client = store.createClient({ agentConfig: { tone: 'friendly' } });
  expect(client.agentConfig.tone).toBe('friendly');
  expect(client.agentConfig.leadCapture).toEqual({
    enabled: true, mode: 'store', forwardEmail: '', forwardWebhookUrl: '', forwardSms: ''
  });
});
