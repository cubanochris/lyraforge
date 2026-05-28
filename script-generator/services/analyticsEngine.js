const store = require('../lib/clientStore');
const callStore = require('../lib/callStore');

const RECENT_CALLS_LIMIT = 10;
const MAX_CALLS_FETCH = 1000;
const DEFAULT_RANGE_DAYS = 30;
const CACHE_TTL = 60000; // 60 seconds
const SENTIMENT_POSITIVE_THRESHOLD = 0.5;
const SENTIMENT_NEGATIVE_THRESHOLD = -0.5;

// TTL-based in-memory cache
const cache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key, data) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
  return data;
}

function clearCache() {
  cache.clear();
}

function invalidate(clientId) {
  for (const key of cache.keys()) {
    if (key.includes(clientId) || key.startsWith('global:')) {
      cache.delete(key);
    }
  }
}

// Week-of-year key matching test expectations (Math.ceil(dayOfYear / 7))
function weekKey(timestamp) {
  const d = new Date(timestamp);
  const start = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = Math.ceil((d - start) / 86400000) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function filterByRange(calls, rangeDays) {
  if (!rangeDays) return calls;
  const cutoff = Date.now() - rangeDays * 86400000;
  return calls.filter(c => !c.startTimestamp || c.startTimestamp >= cutoff);
}

function computeSummary(calls) {
  const totalCalls = calls.length;
  const totalDuration = calls.reduce((s, c) => s + (c.durationMs || 0), 0);
  const avgDurationMs = totalCalls > 0 ? totalDuration / totalCalls : 0;
  const avgDurationMinsRounded = Math.ceil(avgDurationMs / 60000);

  const sentimentBreakdown = { positive: 0, neutral: 0, negative: 0 };
  const disconnectionReasons = {};

  calls.forEach(c => {
    const s = c.sentiment;
    if (s === 'positive' || c.sentimentScore > SENTIMENT_POSITIVE_THRESHOLD) sentimentBreakdown.positive++;
    else if (s === 'negative' || c.sentimentScore < SENTIMENT_NEGATIVE_THRESHOLD) sentimentBreakdown.negative++;
    else if (s === 'neutral') sentimentBreakdown.neutral++;

    if (c.disconnectionReason !== undefined) {
      const reason = c.disconnectionReason || 'other';
      disconnectionReasons[reason] = (disconnectionReasons[reason] || 0) + 1;
    }
  });

  return { totalCalls, avgDurationMs, avgDurationMinsRounded, sentimentBreakdown, disconnectionReasons };
}

function computeTrend(currentCalls, prevCalls) {
  const currentCount = currentCalls.length;
  const prevCount = prevCalls.length;

  const currentAvg = currentCount > 0
    ? currentCalls.reduce((s, c) => s + (c.durationMs || 0), 0) / currentCount : 0;
  const prevAvg = prevCount > 0
    ? prevCalls.reduce((s, c) => s + (c.durationMs || 0), 0) / prevCount : 0;

  return {
    callsChangePercent: prevCount > 0 ? Math.round((currentCount - prevCount) / prevCount * 100) : 0,
    avgDurationChangePercent: prevAvg > 0 ? Math.round((currentAvg - prevAvg) / prevAvg * 100) : 0
  };
}

/**
 * Get per-client analytics overview with optional time range.
 * @param {string} clientId
 * @param {{ rangeDays: number|null }} options
 * @returns {{ clientId, period, totalCalls, avgDurationMs, avgDurationMinsRounded, sentimentBreakdown, disconnectionReasons, trend }}
 */
function getOverview(clientId, options = {}) {
  const rangeDays = options.rangeDays !== undefined ? options.rangeDays : DEFAULT_RANGE_DAYS;
  const cacheKey = `overview:${clientId}:${rangeDays}`;

  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const allCalls = callStore.listCalls(clientId, MAX_CALLS_FETCH);
  const currentCalls = filterByRange(allCalls, rangeDays);
  const summary = computeSummary(currentCalls);

  const period = rangeDays ? `Last ${rangeDays} days` : 'All time';
  let trend = null;

  if (rangeDays) {
    const cutoff = Date.now() - rangeDays * 86400000;
    const prevCutoff = cutoff - rangeDays * 86400000;
    const prevCalls = allCalls.filter(c => {
      const ts = c.startTimestamp || 0;
      return ts >= prevCutoff && ts < cutoff;
    });
    trend = computeTrend(currentCalls, prevCalls);
  }

  return cacheSet(cacheKey, { clientId, period, ...summary, trend });
}

/**
 * Get per-client analytics with weekly breakdown.
 * @param {string} clientId
 * @param {{ rangeDays: number|null }} options
 * @returns {{ overview, weeklyBreakdown }}
 */
function getClientAnalytics(clientId, options = {}) {
  const rangeDays = options.rangeDays !== undefined ? options.rangeDays : DEFAULT_RANGE_DAYS;
  const cacheKey = `client:${clientId}:${rangeDays}`;

  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const overview = getOverview(clientId, options);

  const allCalls = callStore.listCalls(clientId, MAX_CALLS_FETCH);
  const currentCalls = filterByRange(allCalls, rangeDays);

  const weekMap = {};
  currentCalls.forEach(c => {
    if (!c.startTimestamp) return;
    const key = weekKey(c.startTimestamp);
    if (!weekMap[key]) weekMap[key] = { week: key, totalCalls: 0 };
    weekMap[key].totalCalls++;
  });
  const weeklyBreakdown = Object.values(weekMap).sort((a, b) => a.week.localeCompare(b.week));

  return cacheSet(cacheKey, { overview, weeklyBreakdown });
}

/**
 * Get global dashboard overview across all clients.
 * @param {number|null} rangeDays - days to look back, null for all time
 * @returns {{ range, timestamp, summary, pipelineHealth, subscriptionTiers, callVolumeByDay, clients }}
 */
function getAnalyticsOverview(rangeDays = DEFAULT_RANGE_DAYS) {
  const cacheKey = `global:overview:${rangeDays}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const clients = store.listClients();
  const cutoffTime = rangeDays ? Date.now() - rangeDays * 86400000 : null;

  const callsByClient = {};
  const allCalls = [];

  clients.forEach(client => {
    const calls = callStore.listCalls(client.id, MAX_CALLS_FETCH);
    const filtered = calls.filter(call => {
      if (!cutoffTime) return true;
      const callTime = call.startTimestamp || call.createdAt;
      return callTime ? new Date(callTime).getTime() >= cutoffTime : false;
    });
    if (filtered.length > 0) {
      callsByClient[client.id] = filtered;
      allCalls.push(...filtered.map(c => ({ ...c, clientId: client.id })));
    }
  });

  const totalCalls = allCalls.length;
  const totalDuration = allCalls.reduce((s, c) => s + (c.duration || c.durationMs || 0), 0);
  const avgDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
  const positiveCount = allCalls.filter(c =>
    c.sentiment === 'positive' || c.sentimentScore > SENTIMENT_POSITIVE_THRESHOLD
  ).length;
  const positiveRate = totalCalls > 0 ? (positiveCount / totalCalls) * 100 : 0;
  const activeClients = clients.filter(c => callsByClient[c.id] || c.status !== 'pending').length;

  const pipelineHealth = {
    pending: clients.filter(c => c.status === 'pending').length,
    review: clients.filter(c => c.status === 'review').length,
    scripted: clients.filter(c => c.status === 'scripted').length,
    live: clients.filter(c => c.status === 'live').length,
    paused: clients.filter(c => c.status === 'paused').length
  };

  const subscriptionTiers = { 'Starter': 0, 'Professional': 0, 'Business Pro': 0, 'Enterprise': 0 };
  clients.forEach(c => {
    const tier = c.subscription || 'Starter';
    if (Object.prototype.hasOwnProperty.call(subscriptionTiers, tier)) subscriptionTiers[tier]++;
  });

  const dayCount = rangeDays || 30;
  const callVolumeByDay = {};
  for (let i = 0; i < dayCount; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    callVolumeByDay[d.toISOString().split('T')[0]] = 0;
  }
  allCalls.forEach(call => {
    if (call.startTimestamp) {
      const callDate = new Date(call.startTimestamp).toISOString().split('T')[0];
      if (Object.prototype.hasOwnProperty.call(callVolumeByDay, callDate)) {
        callVolumeByDay[callDate]++;
      }
    }
  });

  // Trend: compare second half vs first half of calls
  let prevTotalCalls = 0, prevAvgDuration = 0, prevPositiveRate = 0;
  if (totalCalls > 0) {
    const mid = Math.floor(allCalls.length / 2);
    const firstHalf = allCalls.slice(0, mid);
    if (firstHalf.length > 0) {
      prevTotalCalls = firstHalf.length;
      prevAvgDuration = firstHalf.reduce((s, c) => s + (c.duration || c.durationMs || 0), 0) / firstHalf.length;
      const firstPositive = firstHalf.filter(c =>
        c.sentiment === 'positive' || c.sentimentScore > SENTIMENT_POSITIVE_THRESHOLD
      ).length;
      prevPositiveRate = (firstPositive / firstHalf.length) * 100;
    }
  }

  const clientsSummary = clients.map(client => {
    const clientCalls = callsByClient[client.id] || [];
    const clientDuration = clientCalls.reduce((s, c) => s + (c.duration || c.durationMs || 0), 0);
    const clientAvgDuration = clientCalls.length > 0 ? clientDuration / clientCalls.length : 0;
    const clientPositive = clientCalls.filter(c =>
      c.sentiment === 'positive' || c.sentimentScore > SENTIMENT_POSITIVE_THRESHOLD
    ).length;
    return {
      id: client.id,
      businessName: client.businessInfo?.businessName || 'Unnamed',
      calls: clientCalls.length,
      avgDuration: clientAvgDuration,
      sentiment: Math.round(clientCalls.length > 0 ? (clientPositive / clientCalls.length) * 100 : 0),
      status: client.status,
      subscription: client.subscription || 'Starter'
    };
  });

  return cacheSet(cacheKey, {
    range: rangeDays,
    timestamp: new Date().toISOString(),
    summary: {
      totalCalls, avgDuration,
      positiveRate: Math.round(positiveRate),
      clientCount: activeClients,
      trends: {
        totalCalls: totalCalls - prevTotalCalls,
        avgDuration: avgDuration - prevAvgDuration,
        positiveRate: positiveRate - prevPositiveRate,
        clientCount: 0
      }
    },
    pipelineHealth, subscriptionTiers, callVolumeByDay,
    clients: clientsSummary
  });
}

module.exports = {
  getOverview,
  getClientAnalytics,
  getAnalyticsOverview,
  clearCache,
  invalidate,
  RECENT_CALLS_LIMIT,
  MAX_CALLS_FETCH,
  DEFAULT_RANGE_DAYS
};
