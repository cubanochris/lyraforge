# Retell Webhook & Call Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receive Retell call lifecycle webhooks, store a call log per client, and surface call history in the admin dashboard.

**Architecture:** A `POST /api/webhooks/retell` endpoint (registered before `express.json()` so we can read the raw body for HMAC-SHA256 signature verification) receives `call_started`, `call_ended`, and `call_analyzed` events. Each event is matched to a client via `agentConfig.retellAgentId` and upserted into a per-client call record in `data/calls/<clientId>/<callId>.json`. The admin detail view gets a Calls button that opens a modal showing recent call history.

**Tech Stack:** Node.js, Express, Node `crypto` (built-in), vanilla JS frontend, Jest + Supertest for tests.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/callStore.js` | Create | upsertCall, listCalls — file-per-call storage |
| `routes/webhooks.js` | Create | POST /api/webhooks/retell, signature verification |
| `routes/clients.js` | Modify | Add GET /:id/calls endpoint |
| `app.js` | Modify | Register webhooks router BEFORE express.json() |
| `public/admin.html` | Modify | Calls button + call log modal in detail view |
| `tests/callStore.test.js` | Create | Unit tests for callStore |
| `tests/webhooks.route.test.js` | Create | Integration tests for webhook endpoint |

---

### Task 1: callStore — storage layer

**Files:**
- Create: `lib/callStore.js`
- Create: `tests/callStore.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/callStore.test.js
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
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd "C:\Users\Chris\Projects\AI Receptionist\AI script generator"
npx jest tests/callStore.test.js --runInBand
```
Expected: FAIL — `Cannot find module '../lib/callStore'`

- [ ] **Step 3: Implement callStore**

```javascript
// lib/callStore.js
const fs = require('fs');
const path = require('path');

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
  const dir = clientCallsDir(clientId);
  fs.mkdirSync(dir, { recursive: true });
  const file = callPath(clientId, callId);
  const existing = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : { callId, clientId };
  const updated = { ...existing, ...fields, updatedAt: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(updated, null, 2));
  return updated;
}

function listCalls(clientId, limit = 50) {
  const dir = clientCallsDir(clientId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .sort((a, b) => (b.startTimestamp || 0) - (a.startTimestamp || 0))
    .slice(0, limit);
}

module.exports = { upsertCall, listCalls };
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx jest tests/callStore.test.js --runInBand
```
Expected: PASS — 5 tests pass

- [ ] **Step 5: Commit**

```
git add lib/callStore.js tests/callStore.test.js
git commit -m "feat: add call log storage (upsertCall, listCalls)"
```

---

### Task 2: Webhook route — receive and verify Retell events

**Files:**
- Create: `routes/webhooks.js`
- Create: `tests/webhooks.route.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/webhooks.route.test.js
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
  // Create a client with a known agentId
  const clientRes = await request(app)
    .post('/api/clients')
    .set('Authorization', 'Basic ' + Buffer.from(':test-pass').toString('base64'))
    .send({ agentConfig: { retellAgentId: 'agent-123' } });
  const clientId = clientRes.body.id;

  const body = JSON.stringify({ event: 'call_started', call: { call_id: 'call-xyz', agent_id: 'agent-123', start_timestamp: 1000 } });
  const sig = sign(body, 'test-retell-key');
  const res = await request(app)
    .post('/api/webhooks/retell')
    .set('Content-Type', 'application/json')
    .set('x-retell-signature', sig)
    .send(body);
  expect(res.status).toBe(200);

  const callsRes = await request(app)
    .get(`/api/clients/${clientId}/calls`)
    .set('Authorization', 'Basic ' + Buffer.from(':test-pass').toString('base64'));
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
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx jest tests/webhooks.route.test.js --runInBand
```
Expected: FAIL — `Cannot find module '../routes/webhooks'` or route not registered

- [ ] **Step 3: Implement routes/webhooks.js**

```javascript
// routes/webhooks.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const callStore = require('../lib/callStore');
const clientStore = require('../lib/clientStore');

function verifySignature(rawBody, signature) {
  if (!process.env.RETELL_API_KEY || !signature) return false;
  const expected = crypto
    .createHmac('sha256', process.env.RETELL_API_KEY)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch (_) {
    return false;
  }
}

function findClientByAgentId(agentId) {
  return clientStore.listClients().find(
    c => c.agentConfig && c.agentConfig.retellAgentId === agentId
  ) || null;
}

router.post('/retell', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-retell-signature'];
  if (!verifySignature(req.body, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try { payload = JSON.parse(req.body); } catch (_) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { event, call } = payload;
  if (!call || !call.agent_id) return res.sendStatus(200);

  const client = findClientByAgentId(call.agent_id);
  if (!client) return res.sendStatus(200);

  const callId = call.call_id;

  if (event === 'call_started') {
    callStore.upsertCall(client.id, callId, {
      agentId: call.agent_id,
      startTimestamp: call.start_timestamp || null,
      fromNumber: call.from_number || null,
      toNumber: call.to_number || null,
      status: 'in_progress'
    });
  } else if (event === 'call_ended') {
    callStore.upsertCall(client.id, callId, {
      agentId: call.agent_id,
      startTimestamp: call.start_timestamp || null,
      endTimestamp: call.end_timestamp || null,
      durationMs: (call.end_timestamp && call.start_timestamp)
        ? call.end_timestamp - call.start_timestamp : null,
      disconnectionReason: call.disconnection_reason || null,
      status: 'ended'
    });
  } else if (event === 'call_analyzed') {
    callStore.upsertCall(client.id, callId, {
      agentId: call.agent_id,
      transcript: call.transcript || null,
      summary: (call.call_analysis && call.call_analysis.call_summary) || null,
      sentiment: (call.call_analysis && call.call_analysis.user_sentiment) || null,
      status: 'analyzed'
    });
  }

  res.sendStatus(200);
});

module.exports = router;
```

- [ ] **Step 4: Register webhook route in app.js BEFORE express.json()**

The webhook needs the raw request body for signature verification. It must be registered before `app.use(express.json())` or the body stream will already be consumed.

Open `app.js` and change the routes section:

```javascript
// ── Routes ──────────────────────────────────────────────────────────────────
const scriptsRouter = require('./routes/scripts');
const clientsRouter = require('./routes/clients');
const retellRouter = require('./routes/retell');
const webhooksRouter = require('./routes/webhooks');

// Webhooks MUST come before express.json() — needs raw body for signature verification
app.use('/api/webhooks', webhooksRouter);

app.use(express.json()); // ← move this line to be AFTER webhook registration

app.use('/api/scripts', scriptsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/retell', retellRouter);
```

The current `app.js` has `app.use(express.json())` at line 19, before routes. Move it to after the webhook registration. The full middleware section should look like:

```javascript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limit: 20 generation requests per minute per IP
app.use('/api/scripts/generate', rateLimit({
  windowMs: 60000,
  max: 20,
  message: { success: false, error: 'Too many requests — slow down' }
}));

const scriptsRouter = require('./routes/scripts');
const clientsRouter = require('./routes/clients');
const retellRouter = require('./routes/retell');
const webhooksRouter = require('./routes/webhooks');

// Webhooks before express.json() — needs raw body for HMAC verification
app.use('/api/webhooks', webhooksRouter);
app.use(express.json());

app.use('/api/scripts', scriptsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/retell', retellRouter);
```

- [ ] **Step 5: Run tests to verify they pass**

```
npx jest tests/webhooks.route.test.js --runInBand
```
Expected: PASS — 5 tests pass

- [ ] **Step 6: Run full test suite**

```
npx jest --runInBand
```
Expected: all existing tests still pass

- [ ] **Step 7: Commit**

```
git add routes/webhooks.js lib/callStore.js app.js tests/webhooks.route.test.js
git commit -m "feat: add Retell webhook receiver with HMAC signature verification"
```

---

### Task 3: GET /api/clients/:id/calls endpoint

**Files:**
- Modify: `routes/clients.js`

- [ ] **Step 1: Add the route**

Open `routes/clients.js`. At the top, add the callStore require after the existing requires:

```javascript
const callStore = require('../lib/callStore');
```

Then add this route before `module.exports = router;`:

```javascript
// GET /api/clients/:id/calls — call log for a client (admin only)
router.get('/:id/calls', adminAuth, (req, res) => {
  const client = store.getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(callStore.listCalls(req.params.id));
});
```

- [ ] **Step 2: Verify manually**

Start the server:
```
node app.js
```

In a separate terminal, create a test client and check the calls endpoint:
```powershell
$auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(':lyraforge'))
$client = Invoke-RestMethod -Method POST -Uri http://localhost:3001/api/clients -Headers @{Authorization=$auth;'Content-Type'='application/json'} -Body '{}'
Invoke-RestMethod -Uri "http://localhost:3001/api/clients/$($client.id)/calls" -Headers @{Authorization=$auth}
```
Expected: `[]` (empty array)

- [ ] **Step 3: Run full test suite**

```
npx jest --runInBand
```
Expected: all tests pass

- [ ] **Step 4: Commit**

```
git add routes/clients.js
git commit -m "feat: add GET /api/clients/:id/calls endpoint"
```

---

### Task 4: Call log UI in admin dashboard

**Files:**
- Modify: `public/admin.html`

- [ ] **Step 1: Add Calls button to detail header**

In `admin.html`, find the detail header buttons div (around line 171):

```html
    <div style="display:flex;gap:8px;">
      <button class="btn btn-ghost btn-sm" onclick="copyClientLink()">Copy Client Link</button>
      <button class="btn btn-ghost btn-sm" onclick="saveClientDetail()">Save Changes</button>
    </div>
```

Replace with:

```html
    <div style="display:flex;gap:8px;">
      <button class="btn btn-ghost btn-sm" onclick="showCallLog()">&#128222; Calls</button>
      <button class="btn btn-ghost btn-sm" onclick="copyClientLink()">Copy Client Link</button>
      <button class="btn btn-ghost btn-sm" onclick="saveClientDetail()">Save Changes</button>
    </div>
```

- [ ] **Step 2: Add call log modal CSS**

In the `<style>` block, after the existing `.script-modal` styles, add:

```css
    /* Call log modal */
    .calllog-modal { display: none; position: fixed; inset: 0; background: #0a0f1a; z-index: 400; flex-direction: column; }
    .calllog-modal.active { display: flex; }
    .calllog-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: #0d1424; border-bottom: 1px solid #1e293b; flex-shrink: 0; }
    .calllog-modal-title { font-size: 13px; font-weight: 700; color: #22c55e; }
    .calllog-modal-body { flex: 1; overflow-y: auto; padding: 20px; }
    .call-row { background: #1e293b; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; display: grid; grid-template-columns: 160px 80px 80px 1fr; gap: 12px; align-items: start; }
    .call-row-label { font-size: 10px; color: #64748b; margin-bottom: 2px; }
    .call-row-val { font-size: 11px; color: #f8fafc; }
    .sentiment-positive { color: #22c55e; }
    .sentiment-negative { color: #ef4444; }
    .sentiment-neutral { color: #94a3b8; }
    .call-summary { font-size: 11px; color: #94a3b8; line-height: 1.5; }
    .no-calls { font-size: 12px; color: #334155; font-style: italic; padding: 40px; text-align: center; }
```

- [ ] **Step 3: Add call log modal HTML**

After the script modal `</div>` and before `<div class="toast" id="toast"></div>`, add:

```html
<!-- Call log modal -->
<div class="calllog-modal" id="calllog-modal">
  <div class="calllog-modal-header">
    <span class="calllog-modal-title">&#128222; Call Log</span>
    <button class="btn btn-ghost btn-sm" onclick="closeCallLog()">&#10005; Close</button>
  </div>
  <div class="calllog-modal-body" id="calllog-body">
    <div class="no-calls">Loading…</div>
  </div>
</div>
```

- [ ] **Step 4: Add showCallLog, closeCallLog, renderCallLog JS functions**

In the `<script>` block, after the `closeScriptModal` function, add:

```javascript
  async function showCallLog() {
    document.getElementById('calllog-modal').classList.add('active');
    document.getElementById('calllog-body').innerHTML = '<div class="no-calls">Loading…</div>';
    var res = await fetch('/api/clients/' + currentClientId + '/calls', {
      headers: { 'Authorization': authHeader() }
    });
    var calls = res.ok ? await res.json() : [];
    renderCallLog(calls);
  }

  function closeCallLog() {
    document.getElementById('calllog-modal').classList.remove('active');
  }

  function renderCallLog(calls) {
    var body = document.getElementById('calllog-body');
    if (!calls.length) {
      body.innerHTML = '<div class="no-calls">No calls recorded yet. Calls appear here after Retell sends webhook events.</div>';
      return;
    }
    body.innerHTML = calls.map(function(c) {
      var date = c.startTimestamp ? new Date(c.startTimestamp).toLocaleString() : '—';
      var dur = c.durationMs ? Math.round(c.durationMs / 1000) + 's' : '—';
      var sentimentClass = c.sentiment ? 'sentiment-' + c.sentiment.toLowerCase() : 'sentiment-neutral';
      var sentiment = c.sentiment ? c.sentiment : '—';
      var summary = c.summary ? escHtml(c.summary) : '<span style="color:#475569">No summary yet</span>';
      return '<div class="call-row">' +
        '<div><div class="call-row-label">DATE</div><div class="call-row-val">' + escHtml(date) + '</div></div>' +
        '<div><div class="call-row-label">DURATION</div><div class="call-row-val">' + escHtml(dur) + '</div></div>' +
        '<div><div class="call-row-label">SENTIMENT</div><div class="call-row-val ' + sentimentClass + '">' + escHtml(sentiment) + '</div></div>' +
        '<div><div class="call-row-label">SUMMARY</div><div class="call-summary">' + summary + '</div></div>' +
        '</div>';
    }).join('');
  }
```

- [ ] **Step 5: Start the server and verify UI manually**

```
node app.js
```

Open `http://localhost:3001/admin`, log in, open any client detail view, click the **📞 Calls** button. Should open the call log modal showing "No calls recorded yet."

- [ ] **Step 6: Commit**

```
git add public/admin.html
git commit -m "feat: add call log modal to admin detail view"
```

---

### Task 5: Deploy and configure webhook in Retell

**Files:** None (configuration only)

- [ ] **Step 1: Push to GitHub and deploy**

```
# Copy changed files to lyraforge-temp and push
# (done via the standard lyraforge-temp workflow)
git push origin main
```

Wait for Railway to redeploy and verify health check:
```
curl https://lyraforge-production.up.railway.app/health
```

- [ ] **Step 2: Configure webhook URL in Retell dashboard**

1. Log into Retell dashboard → **Webhooks** tab
2. Set webhook URL to: `https://lyraforge-production.up.railway.app/api/webhooks/retell`
3. Enable events: `call_started`, `call_ended`, `call_analyzed`
4. Save

- [ ] **Step 3: Test with a real call**

Place a test call to one of your Retell numbers. After the call ends:
1. Open the admin dashboard
2. Open the client whose agent handled the call
3. Click **📞 Calls**
4. Verify the call appears with duration and summary

---

## Self-Review

**Spec coverage:**
- ✅ Webhook endpoint `POST /api/webhooks/retell`
- ✅ HMAC-SHA256 signature verification using `x-retell-signature`
- ✅ Events: `call_started`, `call_ended`, `call_analyzed`
- ✅ Match event to client via `agentConfig.retellAgentId`
- ✅ Store call log per client
- ✅ `GET /api/clients/:id/calls` API endpoint
- ✅ Call log modal in admin dashboard with date, duration, sentiment, summary
- ✅ Persists on Railway volume (inherits `CLIENTS_DIR` → `calls/` sibling dir)
- ✅ Tests for callStore and webhook route

**Placeholder scan:** None found.

**Type consistency:**
- `callStore.upsertCall(clientId, callId, fields)` — used consistently in webhooks.js and tests
- `callStore.listCalls(clientId, limit?)` — used consistently in clients.js and tests
- `call.call_id`, `call.agent_id`, `call.start_timestamp`, `call.end_timestamp` — Retell field names used consistently throughout
