const DEV_SWITCH_EMAIL = 'dev@communitybridge.app';
const DEFAULT_MFA_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const DEV_MFA_WINDOW_MS = 4 * 60 * 60 * 1000;

function normalizeRoleOverride(role) {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'admin' || value === 'administrator') return 'admin';
  if (value === 'therapist') return 'therapist';
  if (value === 'parent') return 'parent';
  return '';
}

function isDevSwitcherUser(email) {
  return String(email || '').trim().toLowerCase() === DEV_SWITCH_EMAIL;
}

function getMfaFreshnessWindowMs(profile) {
  const email = String(profile?.email || '').trim().toLowerCase();
  const isDevUser = profile?.devUser === true || email === DEV_SWITCH_EMAIL;
  return isDevUser ? DEV_MFA_WINDOW_MS : DEFAULT_MFA_WINDOW_MS;
}

module.exports = {
  DEV_SWITCH_EMAIL,
  DEFAULT_MFA_WINDOW_MS,
  DEV_MFA_WINDOW_MS,
  normalizeRoleOverride,
  isDevSwitcherUser,
  getMfaFreshnessWindowMs,
};