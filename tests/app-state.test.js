const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeRoleOverride,
  isDevSwitcherUser,
  getMfaFreshnessWindowMs,
  DEFAULT_MFA_WINDOW_MS,
  DEV_MFA_WINDOW_MS,
} = require('../src/utils/authState');
const { attachTherapistsToChildren, mergeById } = require('../src/utils/directoryState');
const { humanizeScreenLabel } = require('../src/utils/screenLabels');
const { getStorageScopeId, buildScopedStorageKeys, STORAGE_SCOPE_FALLBACK } = require('../src/utils/storageScope');

test('normalizeRoleOverride maps supported role aliases', () => {
  assert.equal(normalizeRoleOverride(' Administrator '), 'admin');
  assert.equal(normalizeRoleOverride('therapist'), 'therapist');
  assert.equal(normalizeRoleOverride('parent'), 'parent');
  assert.equal(normalizeRoleOverride('unknown'), '');
});

test('dev switcher user and MFA window honor the controlled dev account', () => {
  assert.equal(isDevSwitcherUser('dev@communitybridge.app'), true);
  assert.equal(isDevSwitcherUser('other@communitybridge.app'), false);
  assert.equal(getMfaFreshnessWindowMs({ email: 'dev@communitybridge.app' }), DEV_MFA_WINDOW_MS);
  assert.equal(getMfaFreshnessWindowMs({ email: 'other@communitybridge.app' }), DEFAULT_MFA_WINDOW_MS);
});

test('mergeById appends only new records', () => {
  const existing = [{ id: '1', name: 'one' }];
  const additions = [{ id: '1', name: 'duplicate' }, { id: '2', name: 'two' }];
  assert.deepEqual(mergeById(existing, additions), [
    { id: '1', name: 'one' },
    { id: '2', name: 'two' },
  ]);
});

test('attachTherapistsToChildren uses server-normalized assignments when present', () => {
  const children = [{ id: 'child-1' }];
  const therapists = [
    { id: 'aba-1', name: 'ABA One' },
    { id: 'bcba-1', name: 'BCBA One' },
  ];
  const aba = {
    assignments: [{ childId: 'child-1', session: 'AM', abaId: 'aba-1' }],
    supervision: [{ abaId: 'aba-1', bcbaId: 'bcba-1' }],
  };

  const [mapped] = attachTherapistsToChildren(children, therapists, aba);
  assert.equal(mapped.amTherapist.name, 'ABA One');
  assert.equal(mapped.pmTherapist, null);
  assert.equal(mapped.bcaTherapist.name, 'BCBA One');
});

test('attachTherapistsToChildren falls back to assignedABA when no normalized assignments exist', () => {
  const children = [{ id: 'child-2', session: 'PM', assignedABA: ['aba-2'] }];
  const therapists = [{ id: 'aba-2', name: 'ABA Two', supervisedBy: 'bcba-2' }, { id: 'bcba-2', name: 'BCBA Two' }];
  const [mapped] = attachTherapistsToChildren(children, therapists, null);
  assert.equal(mapped.amTherapist, null);
  assert.equal(mapped.pmTherapist.name, 'ABA Two');
  assert.equal(mapped.bcaTherapist.name, 'BCBA Two');
});

test('humanizeScreenLabel inserts spaces for route-like screen names', () => {
  assert.equal(humanizeScreenLabel('MyChildMain'), 'My Child Main');
  assert.equal(humanizeScreenLabel('CareTeam'), 'Care Team');
  assert.equal(humanizeScreenLabel('program_documents'), 'program documents');
});

test('getStorageScopeId scopes cache keys to a stable per-user id', () => {
  assert.equal(getStorageScopeId({ id: 'User-123' }), 'user-123');
  assert.equal(getStorageScopeId({ uid: 'Firebase UID' }), 'firebase_uid');
  assert.equal(getStorageScopeId({ email: 'Person+One@Example.com' }), 'person_one_example.com');
  assert.equal(getStorageScopeId(null), STORAGE_SCOPE_FALLBACK);
});

test('buildScopedStorageKeys creates distinct keys per user scope', () => {
  const alpha = buildScopedStorageKeys({ id: 'alpha' });
  const beta = buildScopedStorageKeys({ id: 'beta' });
  assert.equal(alpha.posts, 'bbs_posts_v1::alpha');
  assert.equal(alpha.messages, 'bbs_messages_v1::alpha');
  assert.notEqual(alpha.posts, beta.posts);
  assert.notEqual(alpha.blocked, beta.blocked);
});