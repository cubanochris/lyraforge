const path = require('path');
const fs = require('fs');
const os = require('os');

let analyticsEngine;
let callStore;
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'analytics-test-'));
  jest.resetModules();
  process.env.CLIENTS_DIR = path.join(tmpDir, 'clients');
  callStore = require('../lib/callStore');
  analyticsEngine = require('../services/analyticsEngine');
  analyticsEngine.clearCache();
});

afterEach(() => {
  analyticsEngine.clearCache();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.CLIENTS_DIR;
});

// ============ Test 1-2: getOverview basic functionality ============
test('getOverview returns empty overview when no calls exist', () => {
  const overview = analyticsEngine.getOverview('client-1', { rangeDays: 30 });
  expect(overview).toEqual({
    clientId: 'client-1',
    period: expect.any(String),
    totalCalls: 0,
    avgDurationMs: 0,
    avgDurationMinsRounded: 0,
    sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
    disconnectionReasons: {},
    trend: expect.any(Object)
  });
});

test('getOverview computes totalCalls correctly from ended calls', () => {
  const now = Date.now();
  callStore.upsertCall('client-1', 'call-1', {
    status: 'ended',
    startTimestamp: now - 86400000 * 2,
    endTimestamp: now - 86400000 * 2 + 1000
  });
  callStore.upsertCall('client-1', 'call-2', {
    status: 'ended',
    startTimestamp: now - 86400000,
    endTimestamp: now - 86400000 + 1000
  });
  const overview = analyticsEngine.getOverview('client-1', { rangeDays: 30 });
  expect(overview.totalCalls).toBe(2);
});

// ============ Test 3: avgDurationMs calculation ============
test('getOverview calculates avgDurationMs from ended calls', () => {
  const now = Date.now();
  callStore.upsertCall('client-1', 'call-1', {
    status: 'ended',
    startTimestamp: now - 86400000,
    durationMs: 60000 // 1 minute
  });
  callStore.upsertCall('client-1', 'call-2', {
    status: 'ended',
    startTimestamp: now - 86400000 * 2,
    durationMs: 120000 // 2 minutes
  });
  const overview = analyticsEngine.getOverview('client-1', { rangeDays: 30 });
  expect(overview.avgDurationMs).toBe(90000); // (60000 + 120000) / 2
  expect(overview.avgDurationMinsRounded).toBe(2); // 90000ms = 1.5min, rounded up to 2
});

// ============ Test 4: sentiment breakdown ============
test('getOverview groups sentiments correctly', () => {
  callStore.upsertCall('client-1', 'call-1', {
    status: 'analyzed',
    sentiment: 'positive'
  });
  callStore.upsertCall('client-1', 'call-2', {
    status: 'analyzed',
    sentiment: 'positive'
  });
  callStore.upsertCall('client-1', 'call-3', {
    status: 'analyzed',
    sentiment: 'neutral'
  });
  callStore.upsertCall('client-1', 'call-4', {
    status: 'analyzed',
    sentiment: 'negative'
  });
  const overview = analyticsEngine.getOverview('client-1', { rangeDays: 30 });
  expect(overview.sentimentBreakdown).toEqual({
    positive: 2,
    neutral: 1,
    negative: 1
  });
});

// ============ Test 5: disconnectionReasons grouping ============
test('getOverview groups disconnectionReasons with null mapped to "other"', () => {
  callStore.upsertCall('client-1', 'call-1', {
    status: 'ended',
    disconnectionReason: 'customer_hangup'
  });
  callStore.upsertCall('client-1', 'call-2', {
    status: 'ended',
    disconnectionReason: 'customer_hangup'
  });
  callStore.upsertCall('client-1', 'call-3', {
    status: 'ended',
    disconnectionReason: 'agent_hangup'
  });
  callStore.upsertCall('client-1', 'call-4', {
    status: 'ended',
    disconnectionReason: null
  });
  callStore.upsertCall('client-1', 'call-5', {
    status: 'ended',
    disconnectionReason: null
  });
  const overview = analyticsEngine.getOverview('client-1', { rangeDays: 30 });
  expect(overview.disconnectionReasons).toEqual({
    customer_hangup: 2,
    agent_hangup: 1,
    other: 2
  });
});

// ============ Test 6: date range filtering (7-day) ============
test('getOverview filters calls by 7-day range', () => {
  const now = Date.now();
  const oneDayMs = 86400000;
  // Create calls spanning different time periods
  callStore.upsertCall('client-1', 'call-recent', {
    status: 'ended',
    startTimestamp: now - oneDayMs * 2 // 2 days ago
  });
  callStore.upsertCall('client-1', 'call-old', {
    status: 'ended',
    startTimestamp: now - oneDayMs * 10 // 10 days ago
  });
  const overview = analyticsEngine.getOverview('client-1', { rangeDays: 7 });
  expect(overview.totalCalls).toBe(1);
});

// ============ Test 7: date range filtering (30-day) ============
test('getOverview filters calls by 30-day range', () => {
  const now = Date.now();
  const oneDayMs = 86400000;
  callStore.upsertCall('client-1', 'call-recent', {
    status: 'ended',
    startTimestamp: now - oneDayMs * 15
  });
  callStore.upsertCall('client-1', 'call-very-old', {
    status: 'ended',
    startTimestamp: now - oneDayMs * 45
  });
  const overview = analyticsEngine.getOverview('client-1', { rangeDays: 30 });
  expect(overview.totalCalls).toBe(1);
});

// ============ Test 8: trend calculation for 7-day range ============
test('getOverview calculates trend for 7-day range comparing with previous 7 days', () => {
  const now = Date.now();
  const oneDayMs = 86400000;
  // Current period: 2 calls in last 7 days
  callStore.upsertCall('client-1', 'call-current-1', {
    status: 'ended',
    startTimestamp: now - oneDayMs * 2,
    durationMs: 60000
  });
  callStore.upsertCall('client-1', 'call-current-2', {
    status: 'ended',
    startTimestamp: now - oneDayMs * 3,
    durationMs: 80000
  });
  // Previous period: 1 call 8-14 days ago
  callStore.upsertCall('client-1', 'call-previous-1', {
    status: 'ended',
    startTimestamp: now - oneDayMs * 10,
    durationMs: 100000
  });
  const overview = analyticsEngine.getOverview('client-1', { rangeDays: 7 });
  expect(overview.trend).toEqual({
    callsChangePercent: 100, // 2 calls vs 1 call = 100% increase
    avgDurationChangePercent: -30 // avg 70k vs 100k = -30%
  });
});

// ============ Test 9: trend calculation for 30-day range ============
test('getOverview calculates trend for 30-day range comparing with previous 30 days', () => {
  const now = Date.now();
  const oneDayMs = 86400000;
  // Current period: 3 calls in last 30 days
  callStore.upsertCall('client-1', 'call-current-1', {
    status: 'ended',
    startTimestamp: now - oneDayMs * 10,
    durationMs: 60000
  });
  callStore.upsertCall('client-1', 'call-current-2', {
    status: 'ended',
    startTimestamp: now - oneDayMs * 15,
    durationMs: 90000
  });
  callStore.upsertCall('client-1', 'call-current-3', {
    status: 'ended',
    startTimestamp: now - oneDayMs * 20,
    durationMs: 120000
  });
  // Previous period: 2 calls 31-60 days ago
  callStore.upsertCall('client-1', 'call-previous-1', {
    status: 'ended',
    startTimestamp: now - oneDayMs * 40,
    durationMs: 100000
  });
  callStore.upsertCall('client-1', 'call-previous-2', {
    status: 'ended',
    startTimestamp: now - oneDayMs * 50,
    durationMs: 100000
  });
  const overview = analyticsEngine.getOverview('client-1', { rangeDays: 30 });
  expect(overview.trend).toEqual({
    callsChangePercent: 50, // 3 calls vs 2 calls = 50% increase
    avgDurationChangePercent: -10 // avg 90k vs 100k = -10%
  });
});

// ============ Test 10: all-time period (no trend) ============
test('getOverview returns null trend for all-time (rangeDays: null)', () => {
  callStore.upsertCall('client-1', 'call-1', {
    status: 'ended',
    startTimestamp: Date.now() - 86400000 * 100,
    durationMs: 60000
  });
  const overview = analyticsEngine.getOverview('client-1', { rangeDays: null });
  expect(overview.trend).toBeNull();
});

// ============ Test 11: getClientAnalytics for 7-day range ============
test('getClientAnalytics returns client analytics with 7-day range', () => {
  const now = Date.now();
  const oneDayMs = 86400000;
  callStore.upsertCall('client-1', 'call-1', {
    status: 'ended',
    startTimestamp: now - oneDayMs * 2,
    durationMs: 60000,
    sentiment: 'positive',
    disconnectionReason: 'customer_hangup'
  });
  const analytics = analyticsEngine.getClientAnalytics('client-1', { rangeDays: 7 });
  expect(analytics).toEqual({
    overview: expect.any(Object),
    weeklyBreakdown: expect.any(Array)
  });
  expect(analytics.overview.totalCalls).toBe(1);
  expect(analytics.weeklyBreakdown).toBeTruthy();
});

// ============ Test 12: weeklyBreakdown aggregates by ISO week ============
test('getClientAnalytics weeklyBreakdown aggregates calls by ISO week', () => {
  // Create calls in different weeks
  // 2026-05-04 through 2026-05-10 is week 18
  // 2026-05-11 through 2026-05-17 is week 19
  const d1 = new Date('2026-05-04'); // Week 18
  const d2 = new Date('2026-05-11'); // Week 19
  callStore.upsertCall('client-1', 'call-1', {
    status: 'ended',
    startTimestamp: d1.getTime(),
    durationMs: 60000,
    sentiment: 'positive'
  });
  callStore.upsertCall('client-1', 'call-2', {
    status: 'ended',
    startTimestamp: d1.getTime(),
    durationMs: 90000,
    sentiment: 'positive'
  });
  callStore.upsertCall('client-1', 'call-3', {
    status: 'ended',
    startTimestamp: d2.getTime(),
    durationMs: 120000,
    sentiment: 'neutral'
  });
  const analytics = analyticsEngine.getClientAnalytics('client-1', { rangeDays: null });
  expect(analytics.weeklyBreakdown).toHaveLength(2);
  const week18 = analytics.weeklyBreakdown.find(w => w.week === '2026-W18');
  const week19 = analytics.weeklyBreakdown.find(w => w.week === '2026-W19');
  expect(week18.totalCalls).toBe(2);
  expect(week19.totalCalls).toBe(1);
});

// ============ Test 13: caching for getOverview ============
test('getOverview caches results and returns same object on second call', () => {
  callStore.upsertCall('client-1', 'call-1', {
    status: 'ended',
    startTimestamp: Date.now() - 86400000,
    durationMs: 60000
  });
  const result1 = analyticsEngine.getOverview('client-1', { rangeDays: 7 });
  const result2 = analyticsEngine.getOverview('client-1', { rangeDays: 7 });
  // Same reference means it came from cache
  expect(result1).toBe(result2);
});

// ============ Test 14: caching for getClientAnalytics ============
test('getClientAnalytics caches results per client ID', () => {
  callStore.upsertCall('client-abc', 'call-1', {
    status: 'ended',
    startTimestamp: Date.now() - 86400000,
    durationMs: 60000
  });
  const result1 = analyticsEngine.getClientAnalytics('client-abc', { rangeDays: 7 });
  const result2 = analyticsEngine.getClientAnalytics('client-abc', { rangeDays: 7 });
  // Same reference means it came from cache
  expect(result1).toBe(result2);
});

// ============ Test 15: clearCache clears all cache ============
test('clearCache clears all cached data', () => {
  callStore.upsertCall('client-1', 'call-1', {
    status: 'ended',
    startTimestamp: Date.now(),
    durationMs: 60000
  });
  const overview1 = analyticsEngine.getOverview('client-1', { rangeDays: 30 });
  expect(overview1.totalCalls).toBe(1);
  analyticsEngine.clearCache();
  // After adding more calls and clearing cache, next call should reflect new data
  callStore.upsertCall('client-1', 'call-2', {
    status: 'ended',
    startTimestamp: Date.now(),
    durationMs: 80000
  });
  const overview2 = analyticsEngine.getOverview('client-1', { rangeDays: 30 });
  expect(overview2.totalCalls).toBe(2); // Cache was cleared, so new data is included
});

// ============ Test 16: period format string ============
test('getOverview period string reflects the date range', () => {
  const overview = analyticsEngine.getOverview('client-1', { rangeDays: 7 });
  expect(overview.period).toMatch(/Last 7 days/);
});

test('getOverview period string for 30-day range', () => {
  const overview = analyticsEngine.getOverview('client-1', { rangeDays: 30 });
  expect(overview.period).toMatch(/Last 30 days/);
});

test('getOverview period string for all-time', () => {
  const overview = analyticsEngine.getOverview('client-1', { rangeDays: null });
  expect(overview.period).toMatch(/All time/);
});

// ============ Test 17: RECENT_CALLS_LIMIT constant ============
test('analyticsEngine exports RECENT_CALLS_LIMIT constant set to 10', () => {
  expect(analyticsEngine.RECENT_CALLS_LIMIT).toBe(10);
});

// ============ Test 18-19: getAnalyticsOverview global trend ============
test('getAnalyticsOverview computes trends against the preceding window', () => {
  const clientStore = require('../lib/clientStore');
  const client = clientStore.createClient({ subscription: 'Starter' });
  const now = Date.now();
  const day = 86400000;
  // Current 7-day window: 2 calls
  callStore.upsertCall(client.id, 'cur-1', { status: 'ended', startTimestamp: now - day * 2, durationMs: 60000 });
  callStore.upsertCall(client.id, 'cur-2', { status: 'ended', startTimestamp: now - day * 3, durationMs: 60000 });
  // Preceding 7-day window (8-14 days ago): 1 call
  callStore.upsertCall(client.id, 'prev-1', { status: 'ended', startTimestamp: now - day * 10, durationMs: 60000 });

  const overview = analyticsEngine.getAnalyticsOverview(7);
  expect(overview.summary.totalCalls).toBe(2); // preceding-window call excluded from current
  expect(overview.summary.trends.totalCalls).toBe(1); // 2 current - 1 previous
});

test('getAnalyticsOverview returns zero trends for all-time (no preceding window)', () => {
  const clientStore = require('../lib/clientStore');
  const client = clientStore.createClient({});
  callStore.upsertCall(client.id, 'c-1', { status: 'ended', startTimestamp: Date.now() - 86400000 * 100, durationMs: 60000 });

  const overview = analyticsEngine.getAnalyticsOverview(null);
  expect(overview.summary.totalCalls).toBe(1);
  expect(overview.summary.trends.totalCalls).toBe(0);
  expect(overview.summary.trends.avgDuration).toBe(0);
  expect(overview.summary.trends.positiveRate).toBe(0);
});
