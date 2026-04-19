import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

function getExpoExtraValue(key) {
  try {
    return (
      Constants?.expoConfig?.extra?.[key] ??
      Constants?.easConfig?.extra?.[key] ??
      Constants?.manifest2?.extra?.[key] ??
      Constants?.manifest?.extra?.[key]
    );
  } catch (_) {
    return undefined;
  }
}

function getExpoPublicEnv(key) {
  // IMPORTANT: Expo inlines EXPO_PUBLIC_* vars only for *static* references.
  // Dynamic lookups like process.env[key] will often be empty in production.
  try {
    switch (String(key || '')) {
      case 'EXPO_PUBLIC_FIREBASE_API_KEY':
        return String(
          process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||
            getExpoExtraValue('EXPO_PUBLIC_FIREBASE_API_KEY') ||
            ''
        );
      case 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN':
        return String(
          process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ||
            getExpoExtraValue('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN') ||
            ''
        );
      case 'EXPO_PUBLIC_FIREBASE_PROJECT_ID':
        return String(
          process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ||
            getExpoExtraValue('EXPO_PUBLIC_FIREBASE_PROJECT_ID') ||
            ''
        );
      case 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET':
        return String(
          process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ||
            getExpoExtraValue('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET') ||
            ''
        );
      case 'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID':
        return String(
          process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
            getExpoExtraValue('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID') ||
            ''
        );
      case 'EXPO_PUBLIC_FIREBASE_APP_ID':
        return String(
          process.env.EXPO_PUBLIC_FIREBASE_APP_ID ||
            getExpoExtraValue('EXPO_PUBLIC_FIREBASE_APP_ID') ||
            ''
        );
      case 'EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID':
        return String(
          process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ||
            getExpoExtraValue('EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID') ||
            ''
        );
      case 'EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION':
        return String(
          process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION ||
            getExpoExtraValue('EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION') ||
            ''
        );
      default:
        return '';
    }
  } catch (_) {
    return '';
  }
}

function getFirebaseConfigFromGoogleServices() {
  try {
    // eslint-disable-next-line global-require
    const gs = require('../google-services.json');

    const projectId = String(gs?.project_info?.project_id || '');
    const storageBucket = String(gs?.project_info?.storage_bucket || '');
    const messagingSenderId = String(gs?.project_info?.project_number || '');

    const client0 = Array.isArray(gs?.client) ? gs.client[0] : null;
    const appId = String(client0?.client_info?.mobilesdk_app_id || '');

    const apiKey = String(
      (Array.isArray(client0?.api_key)
        ? client0.api_key[0]?.current_key
        : client0?.api_key?.current_key) ||
        ''
    );

    return {
      apiKey,
      projectId,
      storageBucket,
      messagingSenderId,
      appId,
      authDomain: projectId ? `${projectId}.firebaseapp.com` : '',
    };
  } catch (_) {
    return null;
  }
}

const fromGoogleServices = getFirebaseConfigFromGoogleServices();

const firebaseConfig = {
  apiKey: getExpoPublicEnv('EXPO_PUBLIC_FIREBASE_API_KEY') || fromGoogleServices?.apiKey || '',
  authDomain: getExpoPublicEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN') || fromGoogleServices?.authDomain || '',
  projectId: getExpoPublicEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID') || fromGoogleServices?.projectId || '',
  storageBucket: getExpoPublicEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET') || fromGoogleServices?.storageBucket || '',
  messagingSenderId: getExpoPublicEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID') || fromGoogleServices?.messagingSenderId || '',
  appId: getExpoPublicEnv('EXPO_PUBLIC_FIREBASE_APP_ID') || fromGoogleServices?.appId || '',
  measurementId: getExpoPublicEnv('EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID'),
};

const required = ['apiKey', 'projectId', 'appId'];
const missing = required.filter((k) => !firebaseConfig[k]);
if (missing.length) {
  // Don’t crash the app at import-time; AuthContext will surface a friendly error.
  try {
    console.warn(`[firebase] Missing Firebase config: ${missing.join(', ')}`);
  } catch (_) {}
}

const APP_GLOBAL_KEY = '__bb_firebase_app_instance__';
const APP_ERROR_GLOBAL_KEY = '__bb_firebase_app_init_error__';

function getFirebaseApp() {
  try {
    const cached = globalThis?.[APP_GLOBAL_KEY];
    if (cached) return cached;
  } catch (_) {}

  // If config is obviously missing, avoid creating a broken app instance.
  if (missing.length) {
    const err = new Error(`Firebase config missing: ${missing.join(', ')}`);
    err.code = 'BB_FIREBASE_CONFIG_MISSING';
    try {
      if (globalThis) {
        globalThis[APP_GLOBAL_KEY] = null;
        globalThis[APP_ERROR_GLOBAL_KEY] = err;
      }
    } catch (_) {}
    return null;
  }

  let app = null;
  let initErr = null;

  try {
    if (getApps().length) {
      app = getApp();
    } else {
      initializeApp(firebaseConfig);
      app = getApp();
    }
  } catch (e) {
    initErr = e || new Error('Firebase app initialization failed');
    app = null;
    try {
      console.warn('[firebase] App initialization failed', initErr);
    } catch (_) {}
  }

  try {
    if (globalThis) {
      globalThis[APP_GLOBAL_KEY] = app;
      globalThis[APP_ERROR_GLOBAL_KEY] = initErr;
    }
  } catch (_) {}

  return app;
}

export function getFirebaseAppInitError() {
  try {
    return globalThis?.[APP_ERROR_GLOBAL_KEY] || null;
  } catch (_) {
    return null;
  }
}

export const firebaseApp = getFirebaseApp();

const AUTH_GLOBAL_KEY = '__bb_firebase_auth_instance__';
const AUTH_ERROR_GLOBAL_KEY = '__bb_firebase_auth_init_error__';
const AUTH_INIT_ATTEMPTED_GLOBAL_KEY = '__bb_firebase_auth_init_attempted__';
const AUTH_REGISTERED_GLOBAL_KEY = '__bb_firebase_auth_registered__';
let authInstance = globalThis?.[AUTH_GLOBAL_KEY];
let authInitError = globalThis?.[AUTH_ERROR_GLOBAL_KEY] || null;

function ensureReactNativeAuthRegistered() {
  // In Firebase 10.x, `firebase/auth/react-native` is not exported.
  // The Auth component is registered by the RN build of `@firebase/auth`.
  // Our metro.config.js aliases `@firebase/auth` -> the RN entry, so requiring it
  // here guarantees registerAuth(...) runs before we call getAuth().
  if (Platform.OS === 'web') return true;

  try {
    if (globalThis?.[AUTH_REGISTERED_GLOBAL_KEY]) return true;
  } catch (_) {}

  try {
    // eslint-disable-next-line global-require
    require('@firebase/auth');
    try {
      if (globalThis) globalThis[AUTH_REGISTERED_GLOBAL_KEY] = true;
    } catch (_) {}
    return true;
  } catch (e) {
    const err = e || new Error('Failed to load @firebase/auth RN entry');
    try {
      console.warn('[firebase] Failed to register React Native Auth component', err);
    } catch (_) {}
    authInitError = err;
    try {
      if (globalThis) globalThis[AUTH_ERROR_GLOBAL_KEY] = err;
    } catch (_) {}
    return false;
  }
}

function getAsyncStorageMaybe() {
  try {
    // eslint-disable-next-line global-require
    const mod = require('@react-native-async-storage/async-storage');
    return mod?.default || mod?.AsyncStorage || mod || null;
  } catch (_) {
    return null;
  }
}

function isAuthComponentNotRegisteredError(e) {
  try {
    const msg = String(e?.message || '');
    return msg.includes('Component auth has not been registered yet');
  } catch (_) {
    return false;
  }
}

function markAuthInitAttempted() {
  try {
    if (globalThis) globalThis[AUTH_INIT_ATTEMPTED_GLOBAL_KEY] = true;
  } catch (_) {}
}

function hasAuthInitBeenAttempted() {
  try {
    return Boolean(globalThis?.[AUTH_INIT_ATTEMPTED_GLOBAL_KEY]);
  } catch (_) {
    return false;
  }
}

export function getAuthInstance() {
  let inst = null;
  try {
    inst = globalThis?.[AUTH_GLOBAL_KEY] || null;
  } catch (_) {
    inst = null;
  }
  if (inst) return inst;

  const app = getFirebaseApp();
  if (!app) {
    authInitError = getFirebaseAppInitError() || new Error('Firebase App is not initialized.');
    try {
      if (globalThis) {
        globalThis[AUTH_GLOBAL_KEY] = null;
        globalThis[AUTH_ERROR_GLOBAL_KEY] = authInitError;
      }
    } catch (_) {}
    return null;
  }

  // Ensure Auth is registered before calling getAuth()/initializeAuth.
  ensureReactNativeAuthRegistered();

  try {
    // Prefer explicit React Native Auth initialization to avoid web-targeted builds
    // throwing: "Component auth has not been registered yet".
    if (Platform.OS !== 'web') {
      const storage = getAsyncStorageMaybe();
      const persistence = storage ? getReactNativePersistence(storage) : undefined;

      if (persistence) {
        inst = initializeAuth(getApp(), { persistence });
      } else {
        // Fallback: attempt default auth. (This may still fail on some bundles.)
        inst = getAuth(getApp());
      }
    } else {
      inst = getAuth(getApp());
    }
    authInitError = null;
  } catch (e1) {
    // If already initialized (or init fails), fall back to getAuth().
    if (isAuthComponentNotRegisteredError(e1) && !hasAuthInitBeenAttempted()) {
      markAuthInitAttempted();
    }
    try {
      inst = getAuth(getApp());
      authInitError = null;
    } catch (e2) {
      authInitError = e2 || e1 || new Error('Firebase Auth initialization failed');
      inst = null;
    }
    try {
      console.warn('[firebase] Auth initialization failed', authInitError);
    } catch (_) {}
  }

  try {
    if (globalThis) {
      globalThis[AUTH_GLOBAL_KEY] = inst;
      globalThis[AUTH_ERROR_GLOBAL_KEY] = authInitError;
    }
  } catch (_) {
    // ignore
  }

  return inst;
}

export function getAuthInitError() {
  try {
    return globalThis?.[AUTH_ERROR_GLOBAL_KEY] || authInitError || null;
  } catch (_) {
    return authInitError || null;
  }
}

export const auth = getAuthInstance();
export const db = firebaseApp ? getFirestore(firebaseApp) : null;
export const storage = firebaseApp ? getStorage(firebaseApp) : null;

const region = getExpoPublicEnv('EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION') || 'us-central1';
export const functions = firebaseApp ? getFunctions(firebaseApp, region) : null;
