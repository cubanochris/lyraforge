const forwarder = require('../services/leadForwarder');

const LEAD = { clientId: 'c', name: 'Sam', phone: '555-1212', reason: 'callback' };

test('forwardLead attempts only the configured channels', async () => {
  const sendEmail = jest.fn().mockResolvedValue();
  const postWebhook = jest.fn().mockResolvedValue();
  const sendSms = jest.fn().mockResolvedValue();
  const r = await forwarder.forwardLead(LEAD, { email: 'a@b.com' }, { sendEmail, postWebhook, sendSms });
  expect(sendEmail).toHaveBeenCalledTimes(1);
  expect(postWebhook).not.toHaveBeenCalled();
  expect(sendSms).not.toHaveBeenCalled();
  expect(r.anySucceeded).toBe(true);
  expect(r.succeeded).toEqual(['email']);
});

test('forwardLead reports partial success when one channel fails', async () => {
  const deps = {
    sendEmail: jest.fn().mockRejectedValue(new Error('smtp down')),
    postWebhook: jest.fn().mockResolvedValue(),
    sendSms: jest.fn().mockResolvedValue()
  };
  const r = await forwarder.forwardLead(LEAD, { email: 'a@b.com', webhookUrl: 'https://x.com/hook' }, deps);
  expect(r.results.email).toBe(false);
  expect(r.results.webhook).toBe(true);
  expect(r.anySucceeded).toBe(true);
  expect(r.succeeded).toEqual(['webhook']);
});

test('forwardLead reports total failure when every channel fails', async () => {
  const fail = () => Promise.reject(new Error('nope'));
  const deps = { sendEmail: jest.fn(fail), postWebhook: jest.fn(fail), sendSms: jest.fn(fail) };
  const r = await forwarder.forwardLead(LEAD, { email: 'a@b.com', sms: '+15551212' }, deps);
  expect(r.anySucceeded).toBe(false);
  expect(r.succeeded).toEqual([]);
});

test('isSafeWebhookUrl rejects non-https and private/loopback hosts', () => {
  expect(forwarder.isSafeWebhookUrl('https://hooks.example.com/x')).toBe(true);
  expect(forwarder.isSafeWebhookUrl('http://hooks.example.com/x')).toBe(false);
  expect(forwarder.isSafeWebhookUrl('https://localhost/x')).toBe(false);
  expect(forwarder.isSafeWebhookUrl('https://127.0.0.1/x')).toBe(false);
  expect(forwarder.isSafeWebhookUrl('https://10.0.0.5/x')).toBe(false);
  expect(forwarder.isSafeWebhookUrl('https://192.168.1.1/x')).toBe(false);
  expect(forwarder.isSafeWebhookUrl('not a url')).toBe(false);
});

test('isSafeWebhookUrl rejects private/loopback IPv6 literals but allows public domains starting with f', () => {
  expect(forwarder.isSafeWebhookUrl('https://[::1]/x')).toBe(false);                 // loopback
  expect(forwarder.isSafeWebhookUrl('https://[::ffff:127.0.0.1]/x')).toBe(false);    // IPv4-mapped
  expect(forwarder.isSafeWebhookUrl('https://[fc00::1]/x')).toBe(false);             // ULA
  expect(forwarder.isSafeWebhookUrl('https://[fe80::1]/x')).toBe(false);             // link-local
  expect(forwarder.isSafeWebhookUrl('https://fd-company.com/x')).toBe(true);         // not an IPv6 literal
});
