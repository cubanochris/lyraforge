const fs = require('fs');
const path = require('path');

function validateId(id) {
  if (!/^[\w-]+$/.test(id)) throw new Error(`Invalid ID: ${id}`);
}

function callsBaseDir() {
  if (process.env.CLIENTS_DIR) {
    return path.join(process.env.CLIENTS_DIR, '..', 'calls');
  }
  return path.join(__dirname, '..', 'data', 'calls');
}

function clientCallsDir(clientId) {
  return path.join(callsBaseDir(), clientId);
}

function callPath(clientId, callId) {
  return path.join(clientCallsDir(clientId), `${callId}.json`);
}

function upsertCall(clientId, callId, fields) {
  validateId(clientId);
  validateId(callId);
  const dir = clientCallsDir(clientId);
  fs.mkdirSync(dir, { recursive: true });
  const file = callPath(clientId, callId);
  let existing;
  try {
    existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { callId, clientId };
  } catch (_) {
    existing = { callId, clientId };
  }
  const updated = { ...existing, ...fields, updatedAt: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(updated, null, 2));
  return updated;
}

function listCalls(clientId, limit = 50) {
  validateId(clientId);
  const dir = clientCallsDir(clientId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
      catch (_) { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (b.startTimestamp || 0) - (a.startTimestamp || 0))
    .slice(0, limit);
}

module.exports = { upsertCall, listCalls };
