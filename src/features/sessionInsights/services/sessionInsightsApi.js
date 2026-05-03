const Api = require('../../../Api');
const {
  normalizeLatestSummaryResult,
  normalizeChildSummaryList,
} = require('./sessionInsightsMappers');
const {
  buildChildProgressInsightsFromSummaries,
  normalizeTherapistDocumentationInsights,
  normalizeOrganizationInsights,
} = require('./sessionInsightsAggregates');

function makeEmptyErrorSafe(error, fallback) {
  const status = Number(error?.httpStatus || 0);
  if (status === 404 || status === 501 || status === 503) return fallback;
  if (String(error?.code || '').includes('API_REQUIRED')) return fallback;
  throw error;
}

async function getLatestChildSessionSummary(childId) {
  try {
    const result = await Api.getLatestChildSessionSummary(childId);
    return normalizeLatestSummaryResult(result);
  } catch (error) {
    return makeEmptyErrorSafe(error, { ok: true, childId: String(childId || '').trim(), summary: null });
  }
}

async function getChildSessionSummaries(childId, options = {}) {
  const limit = Number(options?.limit || options?.pageSize || 20) || 20;
  try {
    const result = await Api.getChildSessionSummaries(childId, limit);
    return normalizeChildSummaryList(result);
  } catch (error) {
    return makeEmptyErrorSafe(error, { ok: true, childId: String(childId || '').trim(), items: [] });
  }
}

async function getChildProgressInsights(childId, options = {}) {
  try {
    if (typeof Api.getChildProgressInsights === 'function') {
      const result = await Api.getChildProgressInsights(childId, options);
      return result;
    }
    const summaries = await getChildSessionSummaries(childId, options);
    return buildChildProgressInsightsFromSummaries(summaries.items, childId);
  } catch (error) {
    return makeEmptyErrorSafe(error, buildChildProgressInsightsFromSummaries([], childId));
  }
}

async function getTherapistDocumentationInsights(options = {}) {
  try {
    if (typeof Api.getTherapistDocumentationInsights === 'function') {
      const result = await Api.getTherapistDocumentationInsights(options);
      return normalizeTherapistDocumentationInsights(result);
    }
    return normalizeTherapistDocumentationInsights({ ok: true, stats: {}, items: [] });
  } catch (error) {
    return makeEmptyErrorSafe(error, normalizeTherapistDocumentationInsights({ ok: true, stats: {}, items: [] }));
  }
}

async function getOrganizationInsights(options = {}) {
  try {
    if (typeof Api.getOrganizationInsights === 'function') {
      const result = await Api.getOrganizationInsights(options);
      return normalizeOrganizationInsights(result);
    }
    return normalizeOrganizationInsights({ ok: true, stats: {}, campuses: [], programs: [] });
  } catch (error) {
    return makeEmptyErrorSafe(error, normalizeOrganizationInsights({ ok: true, stats: {}, campuses: [], programs: [] }));
  }
}

async function getSessionSummaryArtifact(sessionId) {
  try {
    if (typeof Api.getTherapySessionSummaryText !== 'function') return { ok: true, text: '' };
    return await Api.getTherapySessionSummaryText(sessionId);
  } catch (error) {
    return makeEmptyErrorSafe(error, { ok: true, text: '' });
  }
}

module.exports = {
  getLatestChildSessionSummary,
  getChildSessionSummaries,
  getChildProgressInsights,
  getTherapistDocumentationInsights,
  getOrganizationInsights,
  getSessionSummaryArtifact,
};