// Central helper for ID visibility and safe avatar seeds
import { SETTINGS_KEYS, readBooleanSetting, writeBooleanSetting } from './appSettings';

const SHOW_IDS_KEY = SETTINGS_KEYS.showIds;

export const DEFAULT_AVATAR_SOURCE = require('../../assets/avatar.png');

let idVisibilityEnabled = false; // module-level cache

export async function initIdVisibilityFromStorage() {
  try {
    idVisibilityEnabled = await readBooleanSetting(SHOW_IDS_KEY, false);
    return idVisibilityEnabled;
  } catch (e) {
    return idVisibilityEnabled;
  }
}

export function setIdVisibilityEnabled(val) {
  idVisibilityEnabled = !!val;
  try {
    writeBooleanSetting(SHOW_IDS_KEY, idVisibilityEnabled);
  } catch (e) {}
}

export function formatIdForDisplay(id, { allow = false } = {}) {
  if (!id) return '';
  return (allow || idVisibilityEnabled) ? String(id) : '';
}

// Return a safe seed for avatar services without exposing raw IDs.
// Prefer email, then name, then a fixed 'anon' fallback.
export function avatarSeed(user) {
  if (!user) return 'anon';
  if (user.email) return encodeURIComponent(String(user.email));
  if (user.phone) return encodeURIComponent(String(user.phone));
  if (user.name) return encodeURIComponent(String(user.name));
  if (user.firstName || user.lastName) return encodeURIComponent(((user.firstName || '') + ' ' + (user.lastName || '')).trim());
  return 'anon';
}

// Convenience: return a pravatar URI using a safe seed
export function pravatarUriFor(user, size = 80) {
  const seed = avatarSeed(user);
  return `https://i.pravatar.cc/${size}?u=${seed}`;
}

// Prefer an explicit avatar URL, otherwise fall back to a bundled local image.
// Treat pravatar.cc (seeded placeholders) as "no avatar".
export function avatarSourceFor(user) {
  try {
    const raw = user?.avatar || user?.photoURL || null;
    if (raw && typeof raw === 'string') {
      const uri = raw.trim();
      if (uri && !uri.includes('pravatar.cc')) return { uri };
    }
  } catch (_) {
    // ignore
  }
  return DEFAULT_AVATAR_SOURCE;
}

export default {
  formatIdForDisplay,
  avatarSeed,
  pravatarUriFor,
  avatarSourceFor,
  DEFAULT_AVATAR_SOURCE,
  setIdVisibilityEnabled,
  initIdVisibilityFromStorage,
};
