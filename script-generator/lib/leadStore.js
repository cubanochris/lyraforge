const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function validateId(id) {
  if (!/^[\w-]+$/.test(id)) throw new Error(`Invalid ID: ${id}`);
}

function leadsBaseDir() {
  if (process.env.CLIENTS_DIR) {
    return path.join(process.env.CLIENTS_DIR, '..', 'leads');
  }
  return path.join(__dirname, '..', 'data', 'leads');
}

function clientLeadsDir(clientId) {
  return path.join(leadsBaseDir(), clientId);
}

function create(clientId, fields) {
  validateId(clientId);
  const dir = clientLeadsDir(clientId);
  fs.mkdirSync(dir, { recursive: true });
  const record = {
    id: crypto.randomUUID(),
    capturedAt: new Date().toISOString(),
    ...fields
  };
  fs.writeFileSync(path.join(dir, `${record.id}.json`), JSON.stringify(record, null, 2));
  return record;
}

function list(clientId, limit = 100) {
  validateId(clientId);
  const dir = clientLeadsDir(clientId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
      catch (_) { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (b.capturedAt || '').localeCompare(a.capturedAt || ''))
    .slice(0, limit);
}

function count(clientId) {
  validateId(clientId);
  const dir = clientLeadsDir(clientId);
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).length;
}

module.exports = { create, list, count };
