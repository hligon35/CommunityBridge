function toDate(value) {
  const date = new Date(String(value || ''));
  return Number.isFinite(date.getTime()) ? date : null;
}

function monthKeyFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean)));
}

function numericAverage(values) {
  const items = (Array.isArray(values) ? values : []).map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (!items.length) return 0;
  return items.reduce((sum, value) => sum + value, 0) / items.length;
}

function buildBehaviorTrendSeries(sessionSummaries) {
  const buckets = new Map();
  (Array.isArray(sessionSummaries) ? sessionSummaries : []).forEach((item) => {
    const sourceDate = toDate(item?.approvedAt || item?.sessionDate || item?.createdAt);
    if (!sourceDate) return;
    const key = monthKeyFromDate(sourceDate);
    const current = buckets.get(key) || { label: key, frequency: 0, intensityTotal: 0, intensityCount: 0 };
    (Array.isArray(item?.summary?.interferingBehaviors) ? item.summary.interferingBehaviors : []).forEach((entry) => {
      current.frequency += Number(entry?.frequency) || 0;
      const intensity = String(entry?.intensity || '').trim().toLowerCase();
      const intensityScore = intensity === 'hazardous' ? 5 : intensity === 'high' ? 4 : intensity === 'moderate' ? 3 : intensity === 'low' ? 2 : intensity === 'precursor' ? 1 : 0;
      if (intensityScore) {
        current.intensityTotal += intensityScore;
        current.intensityCount += 1;
      }
    });
    buckets.set(key, current);
  });
  return Array.from(buckets.values())
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((item) => ({
      label: item.label,
      value: item.frequency,
      intensityAverage: item.intensityCount ? Number((item.intensityTotal / item.intensityCount).toFixed(1)) : 0,
    }));
}

function buildMoodTrendSeries(moodHistory) {
  const buckets = new Map();
  (Array.isArray(moodHistory) ? moodHistory : []).forEach((entry) => {
    const date = toDate(entry?.recordedAt || entry?.createdAt);
    if (!date) return;
    const key = monthKeyFromDate(date);
    const current = buckets.get(key) || [];
    current.push(Number(entry?.score) || 0);
    buckets.set(key, current);
  });
  return Array.from(buckets.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([label, values]) => ({ label, value: Number(numericAverage(values).toFixed(1)) }));
}

function buildProgramMasteryTable(sessionSummaries) {
  const rows = new Map();
  (Array.isArray(sessionSummaries) ? sessionSummaries : []).forEach((item) => {
    const sessionPrograms = uniqueStrings(item?.summary?.programsWorkedOn);
    sessionPrograms.forEach((programName) => {
      const current = rows.get(programName) || { program: programName, sessions: 0, milestones: 0 };
      current.sessions += 1;
      current.milestones += Array.isArray(item?.summary?.successCriteriaMet) ? item.summary.successCriteriaMet.length : 0;
      rows.set(programName, current);
    });
  });
  return Array.from(rows.values()).sort((left, right) => right.sessions - left.sessions);
}

function buildReinforcerEffectiveness(sessionSummaries) {
  const rows = new Map();
  (Array.isArray(sessionSummaries) ? sessionSummaries : []).forEach((item) => {
    const narrative = String(item?.summary?.dailyRecap?.therapistNarrative || '').toLowerCase();
    const labels = uniqueStrings(item?.summary?.programsWorkedOn);
    labels.forEach((label) => {
      const current = rows.get(label) || { reinforcer: label, usage: 0, momentum: 0 };
      current.usage += 1;
      if (narrative.includes('independent') || narrative.includes('improved')) current.momentum += 1;
      rows.set(label, current);
    });
  });
  return Array.from(rows.values()).sort((left, right) => right.usage - left.usage).slice(0, 6);
}

function buildMonthlySummary(sessionSummaries) {
  const summary = new Map();
  (Array.isArray(sessionSummaries) ? sessionSummaries : []).forEach((item) => {
    const date = toDate(item?.approvedAt || item?.sessionDate || item?.createdAt);
    if (!date) return;
    const key = monthKeyFromDate(date);
    const current = summary.get(key) || { month: key, sessions: 0, programs: new Set(), behaviors: 0 };
    current.sessions += 1;
    uniqueStrings(item?.summary?.programsWorkedOn).forEach((value) => current.programs.add(value));
    current.behaviors += (Array.isArray(item?.summary?.interferingBehaviors) ? item.summary.interferingBehaviors.length : 0);
    summary.set(key, current);
  });
  return Array.from(summary.values())
    .sort((left, right) => left.month.localeCompare(right.month))
    .map((item) => ({ month: item.month, sessions: item.sessions, programsCovered: item.programs.size, behaviorsTracked: item.behaviors }));
}

function buildAttendanceSummary(attendanceItems) {
  const totals = { present: 0, absent: 0, tardy: 0 };
  (Array.isArray(attendanceItems) ? attendanceItems : []).forEach((item) => {
    const key = String(item?.status || '').trim().toLowerCase();
    if (key === 'present' || key === 'absent' || key === 'tardy') totals[key] += 1;
  });
  return totals;
}

function buildBehaviorHeatmap(sessionSummaries) {
  const dayMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = new Map();
  (Array.isArray(sessionSummaries) ? sessionSummaries : []).forEach((item) => {
    const date = toDate(item?.approvedAt || item?.sessionDate || item?.createdAt);
    if (!date) return;
    const key = `${dayMap[date.getDay()]} ${String(date.getHours()).padStart(2, '0')}:00`;
    const current = hours.get(key) || 0;
    hours.set(key, current + (Array.isArray(item?.summary?.interferingBehaviors) ? item.summary.interferingBehaviors.length : 0));
  });
  return Array.from(hours.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([label, value]) => ({ label, value }));
}

function buildSchoolWideAnalytics({ summariesByChild = {}, children = [], urgentMemos = [] }) {
  const summaryItems = Object.values(summariesByChild).flat();
  const behaviorHeatmap = buildBehaviorHeatmap(summaryItems);
  const masteryTable = buildProgramMasteryTable(summaryItems).slice(0, 8);
  const parentEngagement = (Array.isArray(urgentMemos) ? urgentMemos : []).reduce((acc, memo) => {
    const childId = String(memo?.childId || '').trim() || 'unlinked';
    acc[childId] = (acc[childId] || 0) + 1;
    return acc;
  }, {});
  return {
    activeLearners: Array.isArray(children) ? children.length : 0,
    totalSessions: summaryItems.length,
    behaviorHeatmap,
    masteryTable,
    parentEngagement: Object.entries(parentEngagement).map(([label, value]) => ({ label, value })),
  };
}

module.exports = {
  buildAttendanceSummary,
  buildBehaviorHeatmap,
  buildBehaviorTrendSeries,
  buildMoodTrendSeries,
  buildMonthlySummary,
  buildProgramMasteryTable,
  buildReinforcerEffectiveness,
  buildSchoolWideAnalytics,
};
