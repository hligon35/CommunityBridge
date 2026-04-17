// Central helper for ID visibility and safe avatar seeds
import AsyncStorage from '@react-native-async-storage/async-storage';

const SHOW_IDS_KEY = 'settings_show_ids_v1';

let idVisibilityEnabled = false; // module-level cache

export async function initIdVisibilityFromStorage() {
  try {
    const v = await AsyncStorage.getItem(SHOW_IDS_KEY);
    idVisibilityEnabled = (v === '1');
    return idVisibilityEnabled;
  } catch (e) {
    return idVisibilityEnabled;
  }
}

export function setIdVisibilityEnabled(val) {
  idVisibilityEnabled = !!val;
  try {
    AsyncStorage.setItem(SHOW_IDS_KEY, idVisibilityEnabled ? '1' : '0');
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

export default {
  formatIdForDisplay,
  avatarSeed,
  pravatarUriFor,
  setIdVisibilityEnabled,
  initIdVisibilityFromStorage,
};
