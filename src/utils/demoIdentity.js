const { isSpecialAccessUser } = require('./authState');

const DEMO_ROLE_IDENTITIES = Object.freeze({
  admin: { id: 'admin-demo', name: 'Jordan Admin', email: 'admin-demo@communitybridge.app', role: 'admin' },
  therapist: { id: 'ABA-001', name: 'Daniel Lopez', email: 'daniel.lopez@communitybridge.app', role: 'therapist' },
  parent: { id: 'PT-001', name: 'Carlos Garcia', email: 'carlos.garcia@communitybridge.app', role: 'parent' },
});

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function getDemoRoleIdentity(role, fallbackUser) {
  const normalized = normalizeRole(role);
  const base = DEMO_ROLE_IDENTITIES[normalized] || null;
  if (!base) return fallbackUser || null;
  return {
    ...base,
    email: base.email || fallbackUser?.email || '',
  };
}

function getEffectiveChatIdentity(user) {
  if (!user) return user;
  if (!isSpecialAccessUser(user?.email)) return user;
  return getDemoRoleIdentity(user?.role, user) || user;
}

module.exports = {
  DEMO_ROLE_IDENTITIES,
  getDemoRoleIdentity,
  getEffectiveChatIdentity,
};