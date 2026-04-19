import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Api from './Api';
import { getAuthInstance, getAuthInitError } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { resetToLogin } from './navigationRef';
import { logger, setDebugContext } from './utils/logger';
import { reportErrorToSentry } from './utils/reportError';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaVerified, setMfaVerified] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);

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
      // Ensure token is current.
      const t = await fbUser.getIdToken();
      setToken(String(t || ''));

      const profile = await Api.me().catch(() => null);
      if (profile) setUser(profile);

      const org = await Api.getOrgSettings().catch(() => null);
      const required = Boolean(org?.item?.mfaEnabled);
      const verified = !required || isMfaFresh(profile);
      setMfaRequired(required);
      setMfaVerified(verified);
      return { required, verified, needsMfa: required && !verified };
    } finally {
      setMfaLoading(false);
    }
  }

  // If Firestore/Rules deny access, clear auth so the app can re-login cleanly.
  useEffect(() => {
    Api.setUnauthorizedHandler(() => {
      try {
        logger.warn('auth', 'Unauthorized from Firebase; signing out');
      } catch (_) {}
      logout().catch(() => {});
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
          setMfaRequired(false);
          setMfaVerified(false);
          return;
        }

        const t = await fbUser.getIdToken();
        setToken(String(t || ''));

        // Load user profile document (role, etc.)
        const profile = await Api.me().catch(() => null);
        setUser(profile || {
          id: fbUser.uid,
          name: fbUser.displayName || '',
          email: fbUser.email || '',
          role: 'parent',
        });

        // Compute MFA gate (based on orgSettings + profile.mfaVerifiedAt)
        try {
          const org = await Api.getOrgSettings().catch(() => null);
          const required = Boolean(org?.item?.mfaEnabled);
          const verified = !required || isMfaFresh(profile);
          setMfaRequired(required);
          setMfaVerified(verified);
        } catch (_) {
          setMfaRequired(false);
          setMfaVerified(false);
        }
      } catch (e) {
        setAuthError(e);
        setToken(null);
        setUser(null);
        setMfaRequired(false);
        setMfaVerified(false);
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
    try {
      const a = getAuthInstance();
      if (a) await signOut(a);
    } catch (_) {
      // ignore
    }

    try {
      await SecureStore.deleteItemAsync('bb_bio_enabled');
      await SecureStore.deleteItemAsync('bb_bio_user');
    } catch (_) {
      // ignore
    }

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

  const valueWithMfa = useMemo(
    () => ({
      token,
      user,
      loading,
      login,
      loginWithGoogle,
      logout,
      setAuth,
      authError,
      mfaRequired,
      mfaVerified,
      mfaLoading,
      needsMfa: Boolean(mfaRequired && !mfaVerified),
      refreshMfaState,
    }),
    [token, user, loading, authError, mfaRequired, mfaVerified, mfaLoading]
  );

  return <AuthContext.Provider value={valueWithMfa}>{children}</AuthContext.Provider>;
}

export default AuthContext;
