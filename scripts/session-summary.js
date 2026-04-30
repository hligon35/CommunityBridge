const MOOD_SCALE = Object.freeze([
  {
    value: 1,
    label: 'Very Upset',
    rangeDescription: 'Severely dysregulated; crying, yelling, meltdown behavior; unable to participate.',
  },
  {
    value: 2,
    label: 'Upset',
    rangeDescription: 'Dysregulated; frustrated or irritable; difficulty transitioning; frequent prompting needed.',
  },
  {
    value: 3,
    label: 'Neutral',
    rangeDescription: 'Calm, baseline; participates with typical prompting; stable mood.',
  },
  {
    value: 4,
    label: 'Happy',
    rangeDescription: 'Regulated; engaged and cooperative; positive affect.',
  },
  {
    value: 5,
    label: 'Very Happy',
    rangeDescription: 'Highly regulated; enthusiastic; initiates interaction; smooth transitions.',
  },
]);

const DEFAULT_SUMMARY_FILENAME = 'SessionSummary.txt';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeString(value) {
  try {
    return String(value == null ? '' : value);
  } catch (_) {
    return '';
  }
}

function clampMoodScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(1, Math.min(5, Math.round(score)));
}

function normalizeIntensity(value) {
  const normalized = safeString(value).trim().toLowerCase();
  const map = {
    none: 'None',
    precursor: 'Precursor',
    low: 'Low',
    moderate: 'Moderate',
    high: 'High',
    detracting: 'Detracting',
    hazardous: 'Hazardous',
  };
  return map[normalized] || 'Moderate';
}

function deepMerge(base, override) {
  if (Array.isArray(override)) return clone(override);
  if (!override || typeof override !== 'object') return override === undefined ? clone(base) : override;
  const out = base && typeof base === 'object' && !Array.isArray(base) ? clone(base) : {};
  Object.entries(override).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      out[key] = clone(value);
      return;
    }
    if (value && typeof value === 'object') {
      out[key] = deepMerge(out[key], value);
      return;
    }
    out[key] = value;
  });
  return out;
}

function createSessionSummaryTemplate({ sessionId, sessionDate, childId, childName }) {
  return {
    session: {
      sessionId: safeString(sessionId).trim(),
      date: safeString(sessionDate).trim(),
      student: {
        id: safeString(childId).trim(),
        name: safeString(childName).trim(),
      },
    },
    moodScore: {
      selectedValue: null,
      selectedLabel: null,
      scale: clone(MOOD_SCALE),
    },
    dailyRecap: {
      progressLevel: null,
      interferingBehaviorLevel: null,
      independenceLevel: null,
      therapistNarrative: '',
    },
    monthlyGoal: {
      category: null,
      description: '',
      targetCriteria: '',
    },
    successCriteriaMet: [],
    programsWorkedOn: [],
    interferingBehaviors: [],
    meals: [],
    toileting: [],
    generatedFromEventLog: true,
    therapistEdited: false,
    approvedByTherapistId: null,
    approvedAt: null,
  };
}

function buildTherapySessionSummary({ sessionId, sessionDate, childId, childName, events, existingSummary }) {
  const summary = createSessionSummaryTemplate({ sessionId, sessionDate, childId, childName });
  const safeEvents = Array.isArray(events) ? events : [];
  const noteParts = [];
  const programsWorkedOn = new Set();
  const successCriteriaMet = new Set();
  const behaviorMap = new Map();
  const meals = [];
  const toileting = [];
  const moodValues = [];

  safeEvents.forEach((event) => {
    const eventType = safeString(event?.eventType).trim().toLowerCase();
    const label = safeString(event?.label || event?.eventCode).trim();
    const metadata = event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};
    const frequencyDelta = Number.isFinite(Number(event?.frequencyDelta)) ? Number(event.frequencyDelta) : 1;

    if (eventType === 'mood') {
      const score = clampMoodScore(event?.value ?? metadata.score ?? metadata.selectedValue);
      if (score != null) moodValues.push(score);
      return;
    }

    if (eventType === 'meal') {
      const type = safeString(metadata.type || metadata.mealType || event?.value).trim();
      const note = safeString(metadata.note || label).trim();
      if (type) meals.push({ type, note: note || 'Ate some' });
      return;
    }

    if (eventType === 'toileting') {
      const status = safeString(metadata.status || event?.value || label).trim();
      if (status) toileting.push({ status });
      return;
    }

    if (eventType === 'program') {
      const programName = safeString(metadata.programName || label || event?.eventCode).trim();
      if (programName) programsWorkedOn.add(programName);
      return;
    }

    if (eventType === 'milestone') {
      const milestone = safeString(metadata.milestone || label || event?.eventCode).trim();
      if (milestone) successCriteriaMet.add(milestone);
      return;
    }

    if (eventType === 'behavior') {
      const key = safeString(label || event?.eventCode).trim() || 'Behavior';
      const current = behaviorMap.get(key) || { behavior: key, frequency: 0, intensity: 'None' };
      current.frequency += Math.max(1, frequencyDelta);
      const nextIntensity = normalizeIntensity(event?.intensity || metadata.intensity);
      const rank = ['None', 'Precursor', 'Low', 'Moderate', 'High', 'Detracting', 'Hazardous'];
      if (rank.indexOf(nextIntensity) > rank.indexOf(current.intensity)) current.intensity = nextIntensity;
      behaviorMap.set(key, current);
      return;
    }

    if (eventType === 'note') {
      const body = safeString(metadata.note || metadata.text || event?.value || label).trim();
      if (body) noteParts.push(body);
    }
  });

  if (moodValues.length) {
    const average = clampMoodScore(moodValues.reduce((sum, value) => sum + value, 0) / moodValues.length);
    const label = MOOD_SCALE.find((entry) => entry.value === average)?.label || null;
    summary.moodScore.selectedValue = average;
    summary.moodScore.selectedLabel = label;
  }

  summary.programsWorkedOn = Array.from(programsWorkedOn);
  summary.successCriteriaMet = Array.from(successCriteriaMet);
  summary.interferingBehaviors = Array.from(behaviorMap.values());
  summary.meals = meals;
  summary.toileting = toileting;
  summary.dailyRecap.therapistNarrative = noteParts.join(' ').trim();

  const progressSignals = summary.programsWorkedOn.length + summary.successCriteriaMet.length;
  if (progressSignals >= 6) summary.dailyRecap.progressLevel = 'Significant progress';
  else if (progressSignals >= 3) summary.dailyRecap.progressLevel = 'Moderate progress';
  else if (progressSignals >= 1) summary.dailyRecap.progressLevel = 'Minimal progress';
  else summary.dailyRecap.progressLevel = 'No progress';

  const highBehaviorCount = summary.interferingBehaviors.reduce((sum, behavior) => sum + Number(behavior.frequency || 0), 0);
  const maxBehaviorIntensity = summary.interferingBehaviors.reduce((best, behavior) => {
    const rank = ['None', 'Precursor', 'Low', 'Moderate', 'High', 'Detracting', 'Hazardous'];
    return rank.indexOf(behavior.intensity) > rank.indexOf(best) ? behavior.intensity : best;
  }, 'None');
  if (maxBehaviorIntensity === 'Hazardous' || highBehaviorCount >= 8) summary.dailyRecap.interferingBehaviorLevel = 'High';
  else if (maxBehaviorIntensity === 'High' || maxBehaviorIntensity === 'Detracting' || highBehaviorCount >= 4) summary.dailyRecap.interferingBehaviorLevel = 'Moderate';
  else if (highBehaviorCount >= 1 || maxBehaviorIntensity === 'Low' || maxBehaviorIntensity === 'Precursor') summary.dailyRecap.interferingBehaviorLevel = 'Minimal';
  else summary.dailyRecap.interferingBehaviorLevel = 'None';

  if (summary.successCriteriaMet.length >= 5) summary.dailyRecap.independenceLevel = 'Significant increase';
  else if (summary.successCriteriaMet.length >= 3) summary.dailyRecap.independenceLevel = 'Moderate increase';
  else if (summary.successCriteriaMet.length >= 1) summary.dailyRecap.independenceLevel = 'Slight increase';
  else summary.dailyRecap.independenceLevel = 'No change';

  if (existingSummary && typeof existingSummary === 'object') {
    const merged = deepMerge(summary, existingSummary);
    merged.generatedFromEventLog = true;
    merged.therapistEdited = true;
    return merged;
  }

  return summary;
}

function renderSessionSummaryText(summary) {
  return JSON.stringify(summary || {}, null, 2);
}

module.exports = {
  DEFAULT_SUMMARY_FILENAME,
  MOOD_SCALE,
  createSessionSummaryTemplate,
  buildTherapySessionSummary,
  renderSessionSummaryText,
};