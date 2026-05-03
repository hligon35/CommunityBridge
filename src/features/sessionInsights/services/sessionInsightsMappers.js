const {
  MOOD_LABELS,
  DEFAULT_STATUS_LABEL,
} = require('../constants/insightLabels');

function safeString(value, fallback = '') {
  try {
    const normalized = String(value == null ? '' : value).trim();
    return normalized || fallback;
  } catch (_) {
    return fallback;
  }
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toIso(value) {
  if (!value) return '';
  try {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return safeString(value);
    return parsed.toISOString();
  } catch (_) {
    return safeString(value);
  }
}

function toDateLabel(value) {
  const iso = toIso(value);
  if (!iso) return 'No date';
  try {
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch (_) {
    return 'No date';
  }
}

function toNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toMoodLabel(value) {
  const numeric = toNumber(value, null);
  if (numeric == null) return DEFAULT_STATUS_LABEL;
  return MOOD_LABELS[Math.round(numeric)] || DEFAULT_STATUS_LABEL;
}

function normalizeSummary(summary) {
  const payload = summary?.summary && typeof summary.summary === 'object' ? summary.summary : (summary && typeof summary === 'object' ? summary : null);
  if (!payload) return null;

  const sessionId = safeString(payload?.session?.sessionId || summary?.sessionId);
  const childId = safeString(payload?.session?.student?.id || payload?.childId || summary?.childId);
  const sessionDate = toIso(payload?.session?.date || summary?.sessionDate || summary?.approvedAt || summary?.updatedAt);
  const approvedAt = toIso(payload?.approvedAt || summary?.approvedAt);
  const selectedMood = toNumber(payload?.moodScore?.selectedValue, null);
  const progressLevel = safeString(payload?.dailyRecap?.progressLevel, DEFAULT_STATUS_LABEL);
  const independenceLevel = safeString(payload?.dailyRecap?.independenceLevel, DEFAULT_STATUS_LABEL);
  const interferingBehaviorLevel = safeString(payload?.dailyRecap?.interferingBehaviorLevel, DEFAULT_STATUS_LABEL);
  const therapistNarrative = safeString(payload?.dailyRecap?.therapistNarrative, 'No therapist note recorded.');
  const monthlyGoal = safeString(payload?.monthlyGoal?.description, 'No monthly goal recorded.');

  return {
    sessionId,
    childId,
    sessionDate,
    sessionDateLabel: toDateLabel(sessionDate),
    approvedAt,
    moodScore: {
      value: selectedMood,
      label: safeString(payload?.moodScore?.selectedLabel, toMoodLabel(selectedMood)),
    },
    dailyRecap: {
      progressLevel,
      independenceLevel,
      interferingBehaviorLevel,
      therapistNarrative,
    },
    monthlyGoal: {
      description: monthlyGoal,
      category: safeString(payload?.monthlyGoal?.category),
      targetCriteria: safeString(payload?.monthlyGoal?.targetCriteria),
    },
    successCriteriaMet: safeArray(payload?.successCriteriaMet).map((item) => safeString(item)).filter(Boolean),
    programsWorkedOn: safeArray(payload?.programsWorkedOn).map((item) => safeString(item)).filter(Boolean),
    interferingBehaviors: safeArray(payload?.interferingBehaviors).map((item) => ({
      behavior: safeString(item?.behavior, 'Behavior'),
      frequency: toNumber(item?.frequency, 0) || 0,
      intensity: safeString(item?.intensity, DEFAULT_STATUS_LABEL),
    })),
    meals: safeArray(payload?.meals).map((item) => ({ type: safeString(item?.type, 'Meal'), note: safeString(item?.note) })),
    toileting: safeArray(payload?.toileting).map((item) => ({ status: safeString(item?.status, 'Not recorded') })),
    summaryText: safeString(summary?.summaryText || payload?.summaryText || therapistNarrative),
    raw: payload,
  };
}

function normalizeLatestSummaryResult(result) {
  return {
    ok: result?.ok === true,
    childId: safeString(result?.childId),
    summary: normalizeSummary(result?.item || result?.summary || null),
  };
}

function normalizeChildSummaryList(result) {
  const items = safeArray(result?.items).map((item) => normalizeSummary(item)).filter(Boolean);
  return {
    ok: result?.ok === true,
    childId: safeString(result?.childId),
    items,
  };
}

function mapSummaryToParentSections(summary) {
  if (!summary) return [];
  return [
    { key: 'daily-recap', title: 'Session Summary', content: summary.dailyRecap.therapistNarrative },
    { key: 'monthly-goal', title: 'Monthly Focus', content: summary.monthlyGoal.description },
    { key: 'success-criteria', title: 'Milestones Met', content: summary.successCriteriaMet.length ? summary.successCriteriaMet.join(', ') : 'No milestones marked yet.' },
    { key: 'programs-worked-on', title: 'Programs Covered', content: summary.programsWorkedOn.length ? summary.programsWorkedOn.join(', ') : 'No programs recorded yet.' },
    { key: 'interfering-behavior', title: 'Behavior Tracking', content: summary.interferingBehaviors.length ? summary.interferingBehaviors.map((item) => `${item.behavior} (${item.frequency}x, ${item.intensity})`).join(', ') : 'No interfering behaviors recorded.' },
  ];
}

function toTrendPoint(label, value, meta = {}) {
  return {
    label: safeString(label, '—'),
    value: toNumber(value, 0) || 0,
    ...meta,
  };
}

module.exports = {
  normalizeSummary,
  normalizeLatestSummaryResult,
  normalizeChildSummaryList,
  mapSummaryToParentSections,
  toMoodLabel,
  toTrendPoint,
  toNumber,
  safeString,
};