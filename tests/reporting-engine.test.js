const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAttendanceSummary,
  buildBehaviorTrendSeries,
  buildMoodTrendSeries,
  buildProgramMasteryTable,
  buildSchoolWideAnalytics,
} = require('../src/features/reporting/services/reportingEngine');

test('buildBehaviorTrendSeries groups monthly behavior frequency', () => {
  const series = buildBehaviorTrendSeries([
    {
      approvedAt: '2026-04-01T09:00:00.000Z',
      summary: {
        interferingBehaviors: [
          { behavior: 'Refusal', frequency: 2, intensity: 'Low' },
          { behavior: 'Tantrum', frequency: 1, intensity: 'Moderate' },
        ],
      },
    },
    {
      approvedAt: '2026-04-18T09:00:00.000Z',
      summary: {
        interferingBehaviors: [{ behavior: 'Refusal', frequency: 3, intensity: 'High' }],
      },
    },
  ]);

  assert.equal(series.length, 1);
  assert.equal(series[0].label, '2026-04');
  assert.equal(series[0].value, 6);
  assert.equal(series[0].intensityAverage, 3);
});

test('buildMoodTrendSeries averages mood scores by month', () => {
  const series = buildMoodTrendSeries([
    { recordedAt: '2026-03-10T08:00:00.000Z', score: 9 },
    { recordedAt: '2026-03-11T08:00:00.000Z', score: 12 },
  ]);

  assert.deepEqual(series, [{ label: '2026-03', value: 10.5 }]);
});

test('buildProgramMasteryTable counts sessions by program label', () => {
  const rows = buildProgramMasteryTable([
    { summary: { programsWorkedOn: ['Manding', 'Transitions'], successCriteriaMet: ['A'] } },
    { summary: { programsWorkedOn: ['Manding'], successCriteriaMet: ['A', 'B'] } },
  ]);

  assert.equal(rows[0].program, 'Manding');
  assert.equal(rows[0].sessions, 2);
  assert.equal(rows[0].milestones, 3);
});

test('buildAttendanceSummary totals present absent and tardy entries', () => {
  const summary = buildAttendanceSummary([
    { status: 'present' },
    { status: 'present' },
    { status: 'tardy' },
    { status: 'absent' },
  ]);

  assert.deepEqual(summary, { present: 2, absent: 1, tardy: 1 });
});

test('buildSchoolWideAnalytics aggregates session totals and parent engagement', () => {
  const analytics = buildSchoolWideAnalytics({
    summariesByChild: {
      alpha: [{ approvedAt: '2026-03-01T09:00:00.000Z', summary: { programsWorkedOn: ['Manding'], interferingBehaviors: [{ behavior: 'Refusal', frequency: 1 }] } }],
      bravo: [{ approvedAt: '2026-03-02T09:00:00.000Z', summary: { programsWorkedOn: ['Transitions'], interferingBehaviors: [] } }],
    },
    children: [{ id: 'alpha' }, { id: 'bravo' }],
    urgentMemos: [{ childId: 'alpha' }, { childId: 'alpha' }, { childId: 'bravo' }],
  });

  assert.equal(analytics.activeLearners, 2);
  assert.equal(analytics.totalSessions, 2);
  assert.equal(analytics.masteryTable.length, 2);
  assert.deepEqual(analytics.parentEngagement, [{ label: 'alpha', value: 2 }, { label: 'bravo', value: 1 }]);
});