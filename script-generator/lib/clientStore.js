const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function clientsDir() {
  return process.env.CLIENTS_DIR || path.join(__dirname, '..', 'data', 'clients');
}

function clientPath(id) {
  return path.join(clientsDir(), `${id}.json`);
}

function readFile(id) {
  const file = clientPath(id);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeFile(client) {
  fs.mkdirSync(clientsDir(), { recursive: true });
  fs.writeFileSync(clientPath(client.id), JSON.stringify(client, null, 2));
}

function createClient(data) {
  const now = new Date().toISOString();
  const client = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    clientContact: {},
    internalNotes: '',
    goLiveDate: null,
    businessInfo: {
      businessName: '', industry: '', phone: '', location: '',
      website: '', hours: '', languages: '', services: '',
      pricing: '', staffNames: '', bookingLink: '',
      insurancePayment: '', faqs: '', afterHours: '',
      promotions: '', additionalContext: ''
    },
    agentConfig: {
      goals: [], tone: 'professional', maxDurationMinutes: 5,
      escalationRules: '', objectionHandlingStyle: 'soft',
      competitorHandling: '', customInstructions: '',
      retellAgentId: '', retellPhoneNumber: '', voiceSelection: ''
    },
    generatedScript: null,
    scriptGeneratedAt: null,
    lastPushedAt: null,
    ...data,
    status: 'pending'
  };
  writeFile(client);
  return client;
}

function getClient(id) {
  return readFile(id);
}

function updateClient(id, fields) {
  const client = readFile(id);
  if (!client) return null;
  const updated = { ...client, ...fields, updatedAt: new Date().toISOString() };
  writeFile(updated);
  return updated;
}

function listClients() {
  const dir = clientsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && f !== '.gitkeep.json')
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function deleteClient(id) {
  const file = clientPath(id);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

module.exports = { createClient, getClient, updateClient, listClients, deleteClient };
