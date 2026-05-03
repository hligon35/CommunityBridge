const { normalizeSummary, toTrendPoint, toNumber } = require('./sessionInsightsMappers');

function average(values) {
  const numbers = (Array.isArray(values) ? values : []).map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (!numbers.length) return null;
  return Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 10) / 10;
}

function progressLevelToValue(level) {
  const normalized = String(level || '').trim().toLowerCase();
  if (normalized.includes('significant')) return 4;
  if (normalized.includes('moderate')) return 3;
  if (normalized.includes('minimal') || normalized.includes('slight')) return 2;
  if (normalized.includes('no')) return 1;
  return 0;
}

function groupByDate(items, valueSelector) {
  const grouped = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const normalized = normalizeSummary(item) || item;
    const dateLabel = normalized?.sessionDateLabel || '—';
    const value = valueSelector(normalized);
    if (!grouped.has(dateLabel)) grouped.set(dateLabel, []);
    grouped.get(dateLabel).push(value);
  });
  return Array.from(grouped.entries()).map(([label, values]) => ({ label, values }));
}

function buildChildProgressInsightsFromSummaries(items, childId) {
  const summaries = (Array.isArray(items) ? items : []).map((item) => normalizeSummary(item)).filter(Boolean);
  const moodTrend = groupByDate(summaries, (summary) => summary?.moodScore?.value).map((entry) => toTrendPoint(entry.label, average(entry.values)));
  const behaviorTrend = groupByDate(summaries, (summary) => (summary?.interferingBehaviors || []).reduce((sum, item) => sum + (Number(item?.frequency) || 0), 0)).map((entry) => toTrendPoint(entry.label, average(entry.values)));
  const independenceTrend = groupByDate(summaries, (summary) => progressLevelToValue(summary?.dailyRecap?.independenceLevel)).map((entry) => toTrendPoint(entry.label, average(entry.values)));
  const progressTrend = groupByDate(summaries, (summary) => progressLevelToValue(summary?.dailyRecap?.progressLevel)).map((entry) => toTrendPoint(entry.label, average(entry.values)));
  const averageMood = average(summaries.map((summary) => summary?.moodScore?.value));

  return {
    ok: true,
    childId: String(childId || '').trim(),
    range: {
      from: summaries.length ? summaries[summaries.length - 1]?.sessionDate || '' : '',
      to: summaries.length ? summaries[0]?.sessionDate || '' : '',
    },
    stats: {
      sessions: summaries.length,
      approvedSummaries: summaries.length,
      averageMood,
      successCriteriaCount: summaries.reduce((sum, summary) => sum + (summary?.successCriteriaMet?.length || 0), 0),
      programsWorkedOnCount: summaries.reduce((sum, summary) => sum + (summary?.programsWorkedOn?.length || 0), 0),
      behaviorEventsCount: summaries.reduce((sum, summary) => sum + (summary?.interferingBehaviors || []).reduce((innerSum, item) => innerSum + (Number(item?.frequency) || 0), 0), 0),
    },
    trends: {
      mood: moodTrend,
      behaviorFrequency: behaviorTrend,
      independence: independenceTrend,
      progressLevel: progressTrend,
    },
    latestSummary: summaries[0] || null,
  };
}

function normalizeTherapistDocumentationInsights(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return {
    ok: true,
    stats: {
      sessionsEnded: toNumber(payload?.stats?.sessionsEnded, 0) || 0,
      summariesGenerated: toNumber(payload?.stats?.summariesGenerated, 0) || 0,
      summariesApproved: toNumber(payload?.stats?.summariesApproved, 0) || 0,
      overdueSummaries: toNumber(payload?.stats?.overdueSummaries, 0) || 0,
    },
    items,
  };
}

function normalizeOrganizationInsights(payload) {
  return {
    ok: true,
    stats: {
      activeChildren: toNumber(payload?.stats?.activeChildren, 0) || 0,
      sessions: toNumber(payload?.stats?.sessions, 0) || 0,
      approvedSummaries: toNumber(payload?.stats?.approvedSummaries, 0) || 0,
      activeCampuses: toNumber(payload?.stats?.activeCampuses, 0) || 0,
    },
    campuses: Array.isArray(payload?.campuses) ? payload.campuses : [],
    programs: Array.isArray(payload?.programs) ? payload.programs : [],
  };
}

module.exports = {
  average,
  progressLevelToValue,
  buildChildProgressInsightsFromSummaries,
  normalizeTherapistDocumentationInsights,
  normalizeOrganizationInsights,
};