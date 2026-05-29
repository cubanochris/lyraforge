const path = require('path');
const fs = require('fs');
const os = require('os');

let leadStore;
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leads-test-'));
  jest.resetModules();
  process.env.CLIENTS_DIR = path.join(tmpDir, 'clients');
  leadStore = require('../lib/leadStore');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.CLIENTS_DIR;
});

test('create assigns id + capturedAt and persists the record', () => {
  const rec = leadStore.create('client-1', { name: 'Sam', phone: '555', mode: 'store' });
  expect(rec.id).toBeTruthy();
  expect(rec.capturedAt).toBeTruthy();
  expect(rec.name).toBe('Sam');
  const list = leadStore.list('client-1');
  expect(list).toHaveLength(1);
  expect(list[0].id).toBe(rec.id);
});

test('list sorts by capturedAt descending and respects limit', () => {
  const a = leadStore.create('c', { name: 'A', capturedAt: '2026-01-01T00:00:00.000Z' });
  const b = leadStore.create('c', { name: 'B', capturedAt: '2026-02-01T00:00:00.000Z' });
  const list = leadStore.list('c', 1);
  expect(list).toHaveLength(1);
  expect(list[0].id).toBe(b.id);
  expect(a.id).not.toBe(b.id);
});

test('count returns number of stored leads', () => {
  expect(leadStore.count('c')).toBe(0);
  leadStore.create('c', { name: 'A' });
  leadStore.create('c', { name: 'B' });
  expect(leadStore.count('c')).toBe(2);
});

test('list returns [] for unknown client', () => {
  expect(leadStore.list('missing')).toEqual([]);
});

test('create rejects an id with path-traversal characters', () => {
  expect(() => leadStore.create('../evil', { name: 'X' })).toThrow();
});
