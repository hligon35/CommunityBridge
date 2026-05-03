const crypto = require('crypto');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function base64UrlEncodeJson(value) {
  return Buffer.from(JSON.stringify(value || {}), 'utf8').toString('base64url');
}

function base64UrlDecodeJson(value) {
  return JSON.parse(Buffer.from(String(value || ''), 'base64url').toString('utf8'));
}

function signApprovalAccessToken({ jwtSecret, payload }) {
  const secret = String(jwtSecret || '').trim();
  if (!secret) throw new Error('jwt secret is required');
  const encoded = base64UrlEncodeJson(payload);
  const signature = crypto.createHmac('sha256', `${secret}:approval-link`).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyApprovalAccessToken({ token, jwtSecret, nowMs = Date.now() }) {
  const secret = String(jwtSecret || '').trim();
  if (!secret) throw new Error('jwt secret is required');
  const raw = String(token || '').trim();
  if (!raw || !raw.includes('.')) throw new Error('invalid approval access token');
  const [encoded, providedSignature] = raw.split('.');
  const expectedSignature = crypto.createHmac('sha256', `${secret}:approval-link`).update(encoded).digest('base64url');
  const providedBuffer = Buffer.from(providedSignature || '', 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature || '', 'utf8');
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error('invalid approval access token');
  }
  const payload = base64UrlDecodeJson(encoded);
  const expiresAt = Number(payload?.exp || 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) {
    throw new Error('approval access link expired');
  }
  return payload;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function assertApprovalLinkInviteIsActive({ payload, inviteRow, nowMs = Date.now() }) {
  if (!inviteRow) throw new Error('approval access link is no longer active');

  const inviteId = String(inviteRow.id || inviteRow.inviteId || '').trim();
  const userId = String(inviteRow.user_id || inviteRow.userId || '').trim();
  const email = normalizeEmail(inviteRow.email);
  const organizationId = String(inviteRow.organization_id || inviteRow.organizationId || '').trim();
  const firstLoginAt = inviteRow.first_login_at || inviteRow.firstLoginAt;
  const usedAt = inviteRow.used_at || inviteRow.usedAt;
  const revokedAt = inviteRow.revoked_at || inviteRow.revokedAt;
  const expiresAtMs = toMillis(inviteRow.expires_at || inviteRow.expiresAt);

  if (inviteId !== String(payload?.inviteId || '').trim()) throw new Error('approval access link is no longer active');
  if (userId !== String(payload?.userId || '').trim()) throw new Error('approval access link is no longer active');
  if (email !== normalizeEmail(payload?.email)) throw new Error('approval access link is no longer active');
  if (firstLoginAt || usedAt || revokedAt) throw new Error('approval access link is no longer active');
  if (expiresAtMs && expiresAtMs <= nowMs) throw new Error('approval access link is no longer active');
  if (String(payload?.organizationId || '').trim() && organizationId !== String(payload.organizationId).trim()) {
    throw new Error('approval access link is invalid for this organization');
  }

  return inviteRow;
}

function buildInvitePasswordCompletionProfileUpdate(updatedAtValue) {
  return {
    passwordSetupRequired: false,
    inviteStatus: 'accepted',
    accountStatus: 'active',
    onboardingStatus: 'active',
    updatedAt: updatedAtValue,
  };
}

module.exports = {
  signApprovalAccessToken,
  verifyApprovalAccessToken,
  assertApprovalLinkInviteIsActive,
  buildInvitePasswordCompletionProfileUpdate,
};