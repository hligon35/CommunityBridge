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
      } catch (e) {
        setAuthError(e);
        setToken(null);
        setUser(null);
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

  const value = useMemo(() => ({ token, user, loading, login, logout, setAuth, authError }), [token, user, loading, authError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
