const store = require('../lib/clientStore');
const callStore = require('../lib/callStore');

/**
 * Aggregate analytics data with optional time range filtering
 * @param {string|null} range - '7', '30', '90', or null for 'all'
 * @returns {object} Analytics data
 */
function getAnalyticsOverview(range = 30) {
  const clients = store.listClients();
  const rangeMs = range ? range * 24 * 60 * 60 * 1000 : null;
  const cutoffTime = rangeMs ? Date.now() - rangeMs : null;

  // Collect all calls within range
  const callsByClient = {};
  const allCalls = [];

  clients.forEach(client => {
    const calls = callStore.listCalls(client.id, 1000); // Get up to 1000 calls
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

  // Calculate metrics
  const totalCalls = allCalls.length;
  const totalDuration = allCalls.reduce((sum, c) => sum + (c.duration || 0), 0);
  const avgDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;

  const positiveCount = allCalls.filter(c =>
    c.sentiment === 'positive' || c.sentimentScore > 0.5
  ).length;
  const positiveRate = totalCalls > 0 ? (positiveCount / totalCalls) * 100 : 0;

  // Active clients: those with calls in range or status !== 'pending'
  const activeClients = clients.filter(c =>
    callsByClient[c.id] || c.status !== 'pending'
  ).length;

  // Pipeline health breakdown
  const pipelineHealth = {
    pending: clients.filter(c => c.status === 'pending').length,
    review: clients.filter(c => c.status === 'review').length,
    scripted: clients.filter(c => c.status === 'scripted').length,
    live: clients.filter(c => c.status === 'live').length,
    paused: clients.filter(c => c.status === 'paused').length
  };

  // Subscription tier breakdown
  const subscriptionTiers = {
    'Starter': 0,
    'Professional': 0,
    'Business Pro': 0,
    'Enterprise': 0
  };
  clients.forEach(c => {
    const tier = c.subscription || 'Starter';
    if (subscriptionTiers.hasOwnProperty(tier)) subscriptionTiers[tier]++;
  });

  // Call volume by day (last 30 days or range)
  const dayCount = range || 30;
  const callVolumeByDay = {};
  for (let i = 0; i < dayCount; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    callVolumeByDay[dateStr] = 0;
  }

  allCalls.forEach(call => {
    if (call.startTimestamp) {
      const callDate = new Date(call.startTimestamp).toISOString().split('T')[0];
      if (callVolumeByDay.hasOwnProperty(callDate)) {
        callVolumeByDay[callDate]++;
      }
    }
  });

  // Client summary list
  const clientsSummary = clients.map(client => {
    const clientCalls = callsByClient[client.id] || [];
    const clientDuration = clientCalls.reduce((sum, c) => sum + (c.duration || 0), 0);
    const clientAvgDuration = clientCalls.length > 0 ? clientDuration / clientCalls.length : 0;

    const clientPositive = clientCalls.filter(c =>
      c.sentiment === 'positive' || c.sentimentScore > 0.5
    ).length;
    const clientSentimentPct = clientCalls.length > 0
      ? (clientPositive / clientCalls.length) * 100
      : 0;

    return {
      id: client.id,
      businessName: client.businessInfo?.businessName || 'Unnamed',
      calls: clientCalls.length,
      avgDuration: clientAvgDuration,
      sentiment: Math.round(clientSentimentPct),
      status: client.status,
      subscription: client.subscription || 'Starter'
    };
  });

  // Calculate trend: compare first half to second half of range
  let prevTotalCalls = 0, prevAvgDuration = 0, prevPositiveRate = 0;
  if (totalCalls > 0) {
    const midPoint = Math.floor(allCalls.length / 2);
    const firstHalf = allCalls.slice(0, midPoint);
    const secondHalf = allCalls.slice(midPoint);

    if (firstHalf.length > 0) {
      prevTotalCalls = firstHalf.length;
      prevAvgDuration = firstHalf.reduce((s, c) => s + (c.duration || 0), 0) / firstHalf.length;
      const firstPositive = firstHalf.filter(c => c.sentiment === 'positive' || c.sentimentScore > 0.5).length;
      prevPositiveRate = (firstPositive / firstHalf.length) * 100;
    }
  }

  const trends = {
    totalCalls: totalCalls - prevTotalCalls,
    avgDuration: avgDuration - prevAvgDuration,
    positiveRate: positiveRate - prevPositiveRate,
    clientCount: 0 // Can't really trend this meaningfully
  };

  return {
    range,
    timestamp: new Date().toISOString(),
    summary: {
      totalCalls,
      avgDuration,
      positiveRate: Math.round(positiveRate),
      clientCount: activeClients,
      trends
    },
    pipelineHealth,
    subscriptionTiers,
    callVolumeByDay,
    clients: clientsSummary
  };
}

/**
 * Get analytics for a specific client
 * @param {string} clientId
 * @param {string|null} range - '7', '30', '90', or null for 'all'
 * @returns {object} Client analytics
 */
function getClientAnalytics(clientId, range = 30) {
  const client = store.getClient(clientId);
  if (!client) return null;

  const rangeMs = range ? range * 24 * 60 * 60 * 1000 : null;
  const cutoffTime = rangeMs ? Date.now() - rangeMs : null;

  let calls = callStore.listCalls(clientId, 1000);
  calls = calls.filter(call => {
    if (!cutoffTime) return true;
    const callTime = call.startTimestamp || call.createdAt;
    return callTime ? new Date(callTime).getTime() >= cutoffTime : false;
  });

  const totalCalls = calls.length;
  const totalDuration = calls.reduce((sum, c) => sum + (c.duration || 0), 0);
  const avgDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;

  const positiveCount = calls.filter(c =>
    c.sentiment === 'positive' || c.sentimentScore > 0.5
  ).length;
  const positiveRate = totalCalls > 0 ? (positiveCount / totalCalls) * 100 : 0;

  const sentimentBreakdown = {
    positive: 0,
    neutral: 0,
    negative: 0
  };
  calls.forEach(c => {
    if (c.sentiment === 'positive' || c.sentimentScore > 0.5) sentimentBreakdown.positive++;
    else if (c.sentiment === 'negative' || c.sentimentScore < -0.5) sentimentBreakdown.negative++;
    else sentimentBreakdown.neutral++;
  });

  // Best performing days
  const dayMetrics = {};
  calls.forEach(call => {
    if (call.startTimestamp) {
      const day = new Date(call.startTimestamp).toISOString().split('T')[0];
      if (!dayMetrics[day]) dayMetrics[day] = { calls: 0, sentiment: [] };
      dayMetrics[day].calls++;
      if (call.sentimentScore) dayMetrics[day].sentiment.push(call.sentimentScore);
    }
  });

  return {
    clientId,
    clientName: client.businessInfo?.businessName || 'Unnamed',
    range,
    timestamp: new Date().toISOString(),
    summary: {
      totalCalls,
      avgDuration,
      positiveRate: Math.round(positiveRate),
      status: client.status
    },
    sentimentBreakdown,
    dayMetrics,
    recentCalls: calls.slice(0, 10)
  };
}

module.exports = {
  getAnalyticsOverview,
  getClientAnalytics
};
