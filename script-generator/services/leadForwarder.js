const https = require('https');

const MAX_RETRIES = 2; // total attempts = MAX_RETRIES + 1

async function retry(fn, times) {
  let lastErr;
  for (let i = 0; i <= times; i++) {
    try { return await fn(); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

function isSafeWebhookUrl(url) {
  let u;
  try { u = new URL(url); } catch (_) { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname;
  // IPv6 literals — Node wraps them in brackets (e.g. "[::1]", "[::ffff:7f00:1]").
  if (host.startsWith('[')) {
    const inner = host.slice(1, -1).toLowerCase();
    if (inner === '::1' || inner === '::') return false;  // loopback / unspecified
    if (inner.startsWith('::ffff:')) return false;        // IPv4-mapped IPv6
    if (/^f[cd]/.test(inner)) return false;               // ULA  fc00::/7
    if (/^fe80/.test(inner)) return false;                // link-local
    return true;
  }
  if (host === 'localhost' || host === '0.0.0.0') return false;
  if (/^127\./.test(host)) return false;
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  return true;
}

function httpsPostJson(urlString, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers } },
      (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
          else reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function postWebhook(url, lead) {
  if (!isSafeWebhookUrl(url)) throw new Error('Unsafe or invalid webhook URL');
  return httpsPostJson(url, {}, lead);
}

async function sendEmail(lead, toEmail) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL;
  if (!key || !from) throw new Error('Email not configured (RESEND_API_KEY / LEAD_FROM_EMAIL)');
  const text = `New lead\n\nName: ${lead.name}\nPhone: ${lead.phone}\nEmail: ${lead.email || '-'}\n` +
    `Reason: ${lead.reason || '-'}\nPreferred callback: ${lead.preferredCallback || '-'}`;
  return httpsPostJson('https://api.resend.com/emails',
    { Authorization: `Bearer ${key}` },
    { from, to: toEmail, subject: `New lead: ${lead.name}`, text });
}

async function sendSms(lead, toNumber) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) throw new Error('SMS not configured (TWILIO_* env)');
  const body = `New lead — ${lead.name}, ${lead.phone}` + (lead.reason ? ` (${lead.reason})` : '');
  const form = new URLSearchParams({ To: toNumber, From: from, Body: body }).toString();
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'api.twilio.com', path: `/2010-04-01/Accounts/${sid}/Messages.json`, method: 'POST',
        auth: `${sid}:${token}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form) } },
      (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
          else reject(new Error(`Twilio HTTP ${res.statusCode}: ${data}`));
        });
      }
    );
    req.on('error', reject);
    req.write(form);
    req.end();
  });
}

/**
 * Forward a lead to the configured destinations. Each channel is best-effort
 * with a small retry. `deps` allows tests to inject the channel senders.
 * @returns {{ succeeded: string[], anySucceeded: boolean, results: Object }}
 */
async function forwardLead(lead, dest, deps = {}) {
  const _email = deps.sendEmail || sendEmail;
  const _webhook = deps.postWebhook || postWebhook;
  const _sms = deps.sendSms || sendSms;

  const attempts = [];
  if (dest.email) attempts.push(['email', () => _email(lead, dest.email)]);
  if (dest.webhookUrl) attempts.push(['webhook', () => _webhook(dest.webhookUrl, lead)]);
  if (dest.sms) attempts.push(['sms', () => _sms(lead, dest.sms)]);

  const results = {};
  for (const [name, fn] of attempts) {
    try { await retry(fn, MAX_RETRIES); results[name] = true; }
    catch (_) { results[name] = false; }
  }
  const succeeded = Object.keys(results).filter(k => results[k]);
  return { succeeded, anySucceeded: succeeded.length > 0, results };
}

module.exports = { forwardLead, isSafeWebhookUrl, sendEmail, sendSms, postWebhook };
