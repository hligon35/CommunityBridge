const test = require('node:test');
const assert = require('node:assert/strict');

const {
  signApprovalAccessToken,
  verifyApprovalAccessToken,
  assertApprovalLinkInviteIsActive,
  buildInvitePasswordCompletionProfileUpdate,
} = require('../scripts/managed-access-auth');

const JWT_SECRET = 'unit-test-secret';

function buildPayload(overrides = {}) {
  return {
    inviteId: 'invite-123',
    userId: 'user-123',
    email: 'owner@example.com',
    organizationId: 'org-123',
    exp: Date.now() + 60_000,
    ...overrides,
  };
}

function buildInviteRow(overrides = {}) {
  return {
    id: 'invite-123',
    user_id: 'user-123',
    email: 'owner@example.com',
    organization_id: 'org-123',
    first_login_at: null,
    used_at: null,
    revoked_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

test('approval token round-trips with organization context', () => {
  const payload = buildPayload();
  const token = signApprovalAccessToken({ jwtSecret: JWT_SECRET, payload });
  assert.deepEqual(verifyApprovalAccessToken({ token, jwtSecret: JWT_SECRET }), payload);
});

test('approval invite becomes unusable after first login starts', () => {
  const payload = buildPayload();
  assert.throws(
    () => assertApprovalLinkInviteIsActive({
      payload,
      inviteRow: buildInviteRow({ first_login_at: new Date().toISOString() }),
    }),
    /approval access link is no longer active/
  );
});

test('approval invite enforces organization binding', () => {
  const payload = buildPayload({ organizationId: 'org-999' });
  assert.throws(
    () => assertApprovalLinkInviteIsActive({ payload, inviteRow: buildInviteRow() }),
    /approval access link is invalid for this organization/
  );
});

test('password completion profile patch upgrades the account to active state', () => {
  const patch = buildInvitePasswordCompletionProfileUpdate('server-timestamp');
  assert.deepEqual(patch, {
    passwordSetupRequired: false,
    inviteStatus: 'accepted',
    accountStatus: 'active',
    onboardingStatus: 'active',
    updatedAt: 'server-timestamp',
  });
});
