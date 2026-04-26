import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Api from './Api';
import { getAuthInstance, getAuthInitError } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { resetToLogin, resetToTwoFactor } from './navigationRef';
import { logger, setDebugContext } from './utils/logger';
import { reportErrorToSentry } from './utils/reportError';

const AuthContext = createContext(null);
const MFA_VERIFIED_CACHE_KEY = 'bb_mfa_verified_at_cache_v1';
const DEV_ROLE_OVERRIDE_KEY = 'bb_dev_role_override_v1';
const DEV_SWITCH_EMAIL = 'dev@communitybridge.app';

function normalizeRoleOverride(role) {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'admin' || value === 'administrator') return 'admin';
  if (value === 'therapist') return 'therapist';
  if (value === 'parent') return 'parent';
  return '';
}

function isDevSwitcherUser(email) {
  return __DEV__ && String(email || '').trim().toLowerCase() === DEV_SWITCH_EMAIL;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [devRoleOverride, setDevRoleOverride] = useState('');

  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaVerified, setMfaVerified] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);

  const mfaRequiredRef = useRef(false);
  useEffect(() => {
    mfaRequiredRef.current = Boolean(mfaRequired);
  }, [mfaRequired]);

  function markMfaRequired() {
    if (mfaRequiredRef.current) {
      try { console.info('[auth] markMfaRequired: already gated, skipping'); } catch (_) {}
      return;
    }
    try { console.info('[auth] markMfaRequired: gating UI and resetting to TwoFactor'); } catch (_) {}
    // Firestore rules for key collections (posts, urgentMemos, etc.) only deny reads
    // with "Missing or insufficient permissions" when orgSettings/main.mfaEnabled == true
    // and the user isn't verified. Treat that as a reliable signal to gate the UI.
    setMfaRequired(true);
    setMfaVerified(false);
    resetToTwoFactor();
  }

  function isMfaFresh(profile) {
    try {
      // Firestore security rules require mfaVerifiedAt to be a Timestamp.
      // If older data stored it as a string, treat it as not verified.
      if (profile && profile.mfaVerifiedAtIsTimestamp === false) return false;
      const iso = profile?.mfaVerifiedAt;
      if (!iso) return false;
      const ts = Date.parse(String(iso));
      if (!Number.isFinite(ts)) return false;
      const days30 = 30 * 24 * 60 * 60 * 1000;
      return Date.now() - ts < days30;
    } catch (_) {
      return false;
    }
  }

  async function readCachedMfaVerifiedAt() {
    try {
      const raw = await AsyncStorage.getItem(MFA_VERIFIED_CACHE_KEY);
      return raw ? String(raw) : null;
    } catch (_) {
      return null;
    }
  }

  async function writeCachedMfaVerifiedAt(value) {
    try {
      if (!value) {
        await AsyncStorage.removeItem(MFA_VERIFIED_CACHE_KEY);
        return;
      }
      await AsyncStorage.setItem(MFA_VERIFIED_CACHE_KEY, String(value));
    } catch (_) {
      // ignore cache failures
    }
  }

  async function clearCachedMfaVerifiedAt() {
    try {
      await AsyncStorage.removeItem(MFA_VERIFIED_CACHE_KEY);
    } catch (_) {
      // ignore cache failures
    }
  }

  async function readDevRoleOverride() {
    try {
      return normalizeRoleOverride(await AsyncStorage.getItem(DEV_ROLE_OVERRIDE_KEY));
    } catch (_) {
      return '';
    }
  }

  async function writeDevRoleOverride(role) {
    try {
      const normalized = normalizeRoleOverride(role);
      if (!normalized) {
        await AsyncStorage.removeItem(DEV_ROLE_OVERRIDE_KEY);
        return '';
      }
      await AsyncStorage.setItem(DEV_ROLE_OVERRIDE_KEY, normalized);
      return normalized;
    } catch (_) {
      return '';
    }
  }

  function applyDevRoleOverride(nextUser, overrideRole) {
    if (!nextUser) return nextUser;
    if (!isDevSwitcherUser(nextUser.email)) return nextUser;
    const normalized = normalizeRoleOverride(overrideRole);
    if (!normalized) return nextUser;
    return {
      ...nextUser,
      devBaseRole: nextUser.role,
      role: normalized,
    };
  }

  async function refreshMfaState() {
    const a = getAuthInstance();
    const fbUser = a?.currentUser || null;
    if (!fbUser) {
      setMfaRequired(false);
      setMfaVerified(false);
      return { required: false, verified: false, needsMfa: false };
    }

    setMfaLoading(true);
    try {
      // Prefer a forced refresh, but do not fail the MFA flow if securetoken is temporarily
      // unreachable. Firestore rules key off mfaVerifiedAt on the user document.
      try {
        const t = await fbUser.getIdToken(true);
        setToken(String(t || ''));
      } catch (e) {
        try { console.warn('[auth] refreshMfaState: forced token refresh failed; using cached token', e?.message || e); } catch (_) {}
        try {
          const fallbackToken = await fbUser.getIdToken(false);
          setToken(String(fallbackToken || ''));
        } catch (_) {}
      }

      const readProfileWithRetry = async () => {
        let lastProfile = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          // Give the verify endpoint's Firestore write a brief moment to become visible.
          if (attempt > 0) {
            await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
          }
          const profile = await Api.me().catch((e) => {
            try { console.warn('[auth] refreshMfaState: me() failed', e?.code, e?.message); } catch (_) {}
            return null;
          });
          lastProfile = profile;
          if (!mfaRequiredRef.current || isMfaFresh(profile)) return profile;
        }
        return lastProfile;
      };

      const profile = await readProfileWithRetry();
      if (profile) setUser(profile);
      if (isMfaFresh(profile)) {
        await writeCachedMfaVerifiedAt(profile?.mfaVerifiedAt);
      }

      const org = await Api.getOrgSettings().catch((e) => { try { console.warn('[auth] refreshMfaState: getOrgSettings() failed', e?.code, e?.message); } catch (_) {} return null; });
      // If we've already inferred MFA is required from permission-denied errors,
      // don't accidentally clear the gate due to a transient orgSettings read failure.
      const required = Boolean(org?.item?.mfaEnabled) || Boolean(mfaRequiredRef.current);
      let verified = !required || isMfaFresh(profile);
      if (!verified && required && !profile) {
        const cachedMfaVerifiedAt = await readCachedMfaVerifiedAt();
        verified = isMfaFresh({ mfaVerifiedAt: cachedMfaVerifiedAt, mfaVerifiedAtIsTimestamp: true });
      }
      try { console.info('[auth] refreshMfaState result', { required, verified, hasProfile: !!profile, mfaVerifiedAt: profile?.mfaVerifiedAt }); } catch (_) {}
      setMfaRequired(required);
      setMfaVerified(verified);
      return { required, verified, needsMfa: required && !verified };
    } finally {
      setMfaLoading(false);
    }
  }

  // Note: Firestore "permission-denied" is commonly caused by security rules (e.g. MFA gates)
  // and is not the same thing as an invalid/expired login. Treat it as a gate to resolve,
  // not a reason to sign the user out.
  useEffect(() => {
    Api.setUnauthorizedHandler(async (info) => {
      try {
        logger.warn('auth', 'Unauthorized handler invoked', info);
      } catch (_) {}

      // First, try to refresh MFA gate state. This will allow AppNavigator to push the
      // user to TwoFactor when org MFA is enabled, without a disruptive sign-out.
      try {
        await refreshMfaState();
      } catch (_) {}

      // If this was a true HTTP 401 (e.g. from a REST endpoint), sign out.
      // Today the handler is also invoked for Firestore permission errors; do not force
      // logout for those.
      const method = info?.method ? String(info.method).toUpperCase() : '';
      if (method === 'FIRESTORE') return;
      if (Number(info?.status) === 401) {
        logout().catch(() => {});
      }
    });
    return () => Api.setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    const a = getAuthInstance();
    if (!a) {
      const initErr = getAuthInitError();
      try {
        reportErrorToSentry(initErr || new Error('Firebase Auth failed to initialize.'), {
          area: 'firebase',
          action: 'auth_init',
          hasAuthInstance: false,
        });
      } catch (_) {}
      setAuthError(initErr || new Error('Firebase Auth failed to initialize.'));
      setToken(null);
      setUser(null);
      setLoading(false);
      return;
    }

    const unsub = onAuthStateChanged(a, async (fbUser) => {
      setLoading(true);
      setAuthError(null);
      try {
        if (!fbUser) {
          setToken(null);
          setUser(null);
          setDevRoleOverride('');
          setMfaRequired(false);
          setMfaVerified(false);
          return;
        }

        // Always treat a Firebase user as authenticated, even if downstream Firestore
        // reads are temporarily blocked by security rules (e.g. MFA gate).
        const t = await fbUser.getIdToken();
        setToken(String(t || ''));

        // Load user profile document (role, etc.). If it fails (permission-denied),
        // keep a minimal user so the app doesn't bounce to Login.
        let profile = null;
        let profileErrorCode = null;
        try {
          profile = await Api.me();
        } catch (e) {
          setAuthError(e);
          profileErrorCode = String(e?.code || '').toLowerCase();
          profile = null;
        }

        const profileForState = profile || {
          id: fbUser.uid,
          name: fbUser.displayName || '',
          email: fbUser.email || '',
          role: isDevSwitcherUser(fbUser.email) ? 'admin' : 'parent',
        };
        const storedOverride = isDevSwitcherUser(fbUser.email) ? await readDevRoleOverride() : '';
        setDevRoleOverride(storedOverride);
        setUser(applyDevRoleOverride(profileForState, storedOverride));

        // If the profile read was blocked by security rules, this is almost certainly
        // the MFA gate. Mark required immediately so the UI never briefly flashes Main.
        const isPermDenied = !!profileErrorCode && profileErrorCode.includes('permission-denied');
        if (isPermDenied) {
          try { console.info('[auth] profile read permission-denied on sign-in → gating MFA'); } catch (_) {}
          setMfaRequired(true);
          setMfaVerified(false);
          // Best-effort navigate; stack may not be ready yet, resetToTwoFactor retries.
          try { resetToTwoFactor(); } catch (_) {}
        }

        // Compute MFA gate (based on orgSettings + profile.mfaVerifiedAt).
        // If profile cannot be read, treat verification as false when required.
        let required = isPermDenied; // start with the inferred gate
        try {
          const org = await Api.getOrgSettings().catch(() => null);
          required = Boolean(org?.item?.mfaEnabled) || required;
        } catch (e) {
          // If org settings can't be loaded, keep the existing values.
          setAuthError(e);
          return;
        }

        if (isMfaFresh(profile)) {
          await writeCachedMfaVerifiedAt(profile?.mfaVerifiedAt);
        }

        let verified = !required || (profile ? isMfaFresh(profile) : false);
        if (!verified && required && !isPermDenied && !profile) {
          const cachedMfaVerifiedAt = await readCachedMfaVerifiedAt();
          verified = isMfaFresh({ mfaVerifiedAt: cachedMfaVerifiedAt, mfaVerifiedAtIsTimestamp: true });
        }
        setMfaRequired(required);
        setMfaVerified(verified);
      } finally {
        setLoading(false);
      }
    });
    return () => {
      try { unsub && unsub(); } catch (_) {}
    };
  }, []);

  useEffect(() => {
    try {
      setDebugContext({
        userId: user?.id,
        role: user?.role,
        hasToken: !!token,
      });
    } catch (_) {}
  }, [user, token]);

  async function login(email, password) {
    const res = await Api.login(email, password);
    // onAuthStateChanged will refresh token/user; still return the API response for screens.
    return res;
  }

  async function loginWithGoogle(idToken) {
    const res = await Api.loginWithGoogle(idToken);
    return res;
  }

  async function logout() {
    const a = getAuthInstance();
    let signedOut = false;
    try {
      if (a) {
        await signOut(a);
        signedOut = true;
      }
    } catch (e) {
      // If signOut fails, do NOT clear local auth state. Otherwise we briefly show Login
      // and then bounce back when Firebase still considers the user signed in.
      try {
        logger.warn('auth', 'signOut failed; keeping session', {
          message: e?.message || String(e),
          code: e?.code,
        });
      } catch (_) {}
      setAuthError(e);
    }

    if (!signedOut && a?.currentUser) return;

    try {
      await SecureStore.deleteItemAsync('bb_bio_enabled');
      await SecureStore.deleteItemAsync('bb_bio_user');
    } catch (_) {
      // ignore
    }

    await clearCachedMfaVerifiedAt();

    setToken(null);
    setUser(null);
    resetToLogin();
  }

  async function setAuth(_) {
    // Legacy compatibility: REST token injection is not supported with Firebase Auth.
    const err = new Error('Biometric token sign-in is not supported with Firebase Auth. Please sign in normally.');
    err.code = 'BB_SET_AUTH_UNSUPPORTED';
    throw err;
  }

  async function setRole(nextRole) {
    if (!__DEV__) return;
    const normalized = normalizeRoleOverride(nextRole);
    if (!normalized) return;
    if (!isDevSwitcherUser(user?.email)) return;

    setDevRoleOverride(normalized);
    await writeDevRoleOverride(normalized);
    setUser((current) => {
      if (!current) return current;
      return {
        ...current,
        devBaseRole: current.devBaseRole || current.role,
        role: normalized,
      };
    });
  }

  const valueWithMfa = useMemo(
    () => ({
      token,
      user,
      loading,
      login,
      loginWithGoogle,
      logout,
      setAuth,
      setRole,
      authError,
      mfaRequired,
      mfaVerified,
      mfaLoading,
      needsMfa: Boolean(mfaRequired && !mfaVerified),
      markMfaRequired,
      refreshMfaState,
    }),
    [token, user, loading, authError, mfaRequired, mfaVerified, mfaLoading]
  );

  return <AuthContext.Provider value={valueWithMfa}>{children}</AuthContext.Provider>;
}

export default AuthContext;
