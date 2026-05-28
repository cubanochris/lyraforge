const path = require('path');
const fs = require('fs');
const os = require('os');

let callStore;
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calls-test-'));
  jest.resetModules();
  process.env.CLIENTS_DIR = path.join(tmpDir, 'clients');
  callStore = require('../lib/callStore');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.CLIENTS_DIR;
});

test('upsertCall creates a new call record', () => {
  const record = callStore.upsertCall('client-1', 'call-abc', { status: 'in_progress', startTimestamp: 1000 });
  expect(record.callId).toBe('call-abc');
  expect(record.clientId).toBe('client-1');
  expect(record.status).toBe('in_progress');
  expect(record.startTimestamp).toBe(1000);
});

test('upsertCall merges fields on subsequent calls', () => {
  callStore.upsertCall('client-1', 'call-abc', { status: 'in_progress', startTimestamp: 1000 });
  const record = callStore.upsertCall('client-1', 'call-abc', { status: 'ended', endTimestamp: 2000 });
  expect(record.startTimestamp).toBe(1000);
  expect(record.endTimestamp).toBe(2000);
  expect(record.status).toBe('ended');
});

test('listCalls returns empty array when no calls exist', () => {
  expect(callStore.listCalls('client-1')).toEqual([]);
});

test('listCalls returns calls sorted by startTimestamp descending', () => {
  callStore.upsertCall('client-1', 'call-a', { startTimestamp: 1000 });
  callStore.upsertCall('client-1', 'call-b', { startTimestamp: 3000 });
  callStore.upsertCall('client-1', 'call-c', { startTimestamp: 2000 });
  const calls = callStore.listCalls('client-1');
  expect(calls.map(c => c.callId)).toEqual(['call-b', 'call-c', 'call-a']);
});

test('listCalls respects limit', () => {
  for (let i = 0; i < 10; i++) {
    callStore.upsertCall('client-1', `call-${i}`, { startTimestamp: i * 1000 });
  }
  expect(callStore.listCalls('client-1', 3)).toHaveLength(3);
});

test('listCalls handles records without startTimestamp without crashing', () => {
  callStore.upsertCall('client-1', 'call-no-ts', { status: 'in_progress' });
  callStore.upsertCall('client-1', 'call-with-ts', { startTimestamp: 5000 });
  const calls = callStore.listCalls('client-1');
  expect(calls).toHaveLength(2);
  expect(calls[0].callId).toBe('call-with-ts'); // higher timestamp sorts first
});
