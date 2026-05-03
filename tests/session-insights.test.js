const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeSummary,
  mapSummaryToParentSections,
  toMoodLabel,
} = require('../src/features/sessionInsights/services/sessionInsightsMappers');
const {
  buildChildProgressInsightsFromSummaries,
  normalizeTherapistDocumentationInsights,
  normalizeOrganizationInsights,
} = require('../src/features/sessionInsights/services/sessionInsightsAggregates');

test('normalizeSummary converts backend summary payloads into UI-safe fields', () => {
  const normalized = normalizeSummary({
    sessionId: 'session-1',
    childId: 'child-1',
    approvedAt: '2026-05-01T14:00:00.000Z',
    summary: {
      session: {
        sessionId: 'session-1',
        student: { id: 'child-1' },
        date: '2026-05-01T13:30:00.000Z',
      },
      moodScore: { selectedValue: 4 },
      dailyRecap: {
        progressLevel: 'Moderate progress',
        independenceLevel: 'Minimal prompting',
        interferingBehaviorLevel: 'Low',
        therapistNarrative: 'Strong transitions after lunch.',
      },
      monthlyGoal: { description: 'Improve transitions' },
      successCriteriaMet: ['Stayed on task'],
      programsWorkedOn: ['Transitions'],
      interferingBehaviors: [{ behavior: 'Refusal', frequency: 1, intensity: 'Low' }],
    },
  });

  assert.equal(normalized.sessionId, 'session-1');
  assert.equal(normalized.childId, 'child-1');
  assert.equal(normalized.moodScore.value, 4);
  assert.equal(normalized.moodScore.label, toMoodLabel(4));
  assert.equal(normalized.dailyRecap.therapistNarrative, 'Strong transitions after lunch.');
  assert.deepEqual(normalized.programsWorkedOn, ['Transitions']);
});

test('mapSummaryToParentSections builds readable parent-facing sections', () => {
  const sections = mapSummaryToParentSections(normalizeSummary({
    approvedAt: '2026-05-01T14:00:00.000Z',
    summary: {
      dailyRecap: { therapistNarrative: 'Solid session overall.' },
      monthlyGoal: { description: 'Expand communication' },
      successCriteriaMet: ['Requested break independently'],
      programsWorkedOn: ['Communication'],
      interferingBehaviors: [{ behavior: 'Elopement', frequency: 2, intensity: 'Moderate' }],
    },
  }));

  assert.equal(sections.length, 5);
  assert.equal(sections[0].content, 'Solid session overall.');
  assert.match(sections[4].content, /Elopement/);
});

test('buildChildProgressInsightsFromSummaries aggregates trends and totals', () => {
  const insights = buildChildProgressInsightsFromSummaries([
    {
      approvedAt: '2026-05-02T15:00:00.000Z',
      summary: {
        session: { student: { id: 'child-1' }, date: '2026-05-02T14:00:00.000Z' },
        moodScore: { selectedValue: 3 },
        dailyRecap: { independenceLevel: 'Moderate support', progressLevel: 'Moderate progress', therapistNarrative: 'Good day.' },
        successCriteriaMet: ['A'],
        programsWorkedOn: ['Program A'],
        interferingBehaviors: [{ behavior: 'Refusal', frequency: 2, intensity: 'Low' }],
      },
    },
    {
      approvedAt: '2026-05-01T15:00:00.000Z',
      summary: {
        session: { student: { id: 'child-1' }, date: '2026-05-01T14:00:00.000Z' },
        moodScore: { selectedValue: 5 },
        dailyRecap: { independenceLevel: 'Significant independence', progressLevel: 'Significant progress', therapistNarrative: 'Great day.' },
        successCriteriaMet: ['B', 'C'],
        programsWorkedOn: ['Program B'],
        interferingBehaviors: [{ behavior: 'Elopement', frequency: 1, intensity: 'Moderate' }],
      },
    },
  ], 'child-1');

  assert.equal(insights.childId, 'child-1');
  assert.equal(insights.stats.sessions, 2);
  assert.equal(insights.stats.averageMood, 4);
  assert.equal(insights.stats.successCriteriaCount, 3);
  assert.equal(insights.stats.behaviorEventsCount, 3);
  assert.equal(insights.trends.mood.length, 2);
  assert.equal(insights.latestSummary.childId, 'child-1');
});

test('normalizeTherapistDocumentationInsights and normalizeOrganizationInsights provide safe defaults', () => {
  const therapist = normalizeTherapistDocumentationInsights({
    stats: { sessionsEnded: '3', summariesGenerated: '2', summariesApproved: '1' },
    items: [{ sessionId: 'session-1', status: 'needs_review' }],
  });
  const organization = normalizeOrganizationInsights({
    stats: { activeChildren: '5', sessions: '8', approvedSummaries: '4' },
    campuses: [{ id: 'north' }],
  });

  assert.deepEqual(therapist.stats, {
    sessionsEnded: 3,
    summariesGenerated: 2,
    summariesApproved: 1,
    overdueSummaries: 0,
  });
  assert.equal(therapist.items.length, 1);
  assert.deepEqual(organization.stats, {
    activeChildren: 5,
    sessions: 8,
    approvedSummaries: 4,
    activeCampuses: 0,
  });
  assert.equal(organization.campuses.length, 1);
  assert.deepEqual(organization.programs, []);
});