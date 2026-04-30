const test = require('node:test');
const assert = require('node:assert/strict');
const { isChildLinkedToTherapist, resolveSelectedDashboardChild, resolveTherapyWorkspaceTarget } = require('../src/features/sessionTracking/utils/dashboardSessionTarget');

test('resolveSelectedDashboardChild returns selected child when present', () => {
  const children = [{ id: 'alpha', name: 'Alpha' }, { id: 'bravo', name: 'Bravo' }];
  const selected = resolveSelectedDashboardChild(children, 'bravo');
  assert.equal(selected.id, 'bravo');
});

test('resolveSelectedDashboardChild falls back to first child when selection missing', () => {
  const children = [{ id: 'alpha', name: 'Alpha' }, { id: 'bravo', name: 'Bravo' }];
  const selected = resolveSelectedDashboardChild(children, 'charlie');
  assert.equal(selected.id, 'alpha');
});

test('resolveSelectedDashboardChild returns null for empty input', () => {
  assert.equal(resolveSelectedDashboardChild([], 'alpha'), null);
});

test('isChildLinkedToTherapist matches normalized direct therapist objects', () => {
  const child = { amTherapist: { id: 'ABA-101' } };
  assert.equal(isChildLinkedToTherapist(child, 'aba-101'), true);
});

test('isChildLinkedToTherapist matches assignedABA fallback arrays', () => {
  const child = { assignedABA: ['aba-202'] };
  assert.equal(isChildLinkedToTherapist(child, 'aba-202'), true);
});

test('isChildLinkedToTherapist matches normalized staffIds arrays', () => {
  const child = { staffIds: ['staff-303'] };
  assert.equal(isChildLinkedToTherapist(child, 'staff-303'), true);
});

test('resolveTherapyWorkspaceTarget routes summary actions to SummaryReview with child params', () => {
  const target = resolveTherapyWorkspaceTarget('summary', 'child-101', false);
  assert.deepEqual(target, {
    routeName: 'SummaryReview',
    params: { childId: 'child-101' },
  });
});

test('resolveTherapyWorkspaceTarget routes tracker preview actions without child params', () => {
  const target = resolveTherapyWorkspaceTarget('tracker', null, true);
  assert.deepEqual(target, {
    routeName: 'TapTracker',
    params: { sessionPreview: true },
  });
});
