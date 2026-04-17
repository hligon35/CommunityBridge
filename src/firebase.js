import { Platform } from 'react-native';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth/react-native';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

function getAsyncStorageModule() {
  // AsyncStorage isn't supported on web; avoid importing it there.
  if (Platform?.OS === 'web') return null;
  try {
    // eslint-disable-next-line global-require
    return require('@react-native-async-storage/async-storage')?.default || null;
  } catch (_) {
    return null;
  }
}

function getExpoPublicEnv(key) {
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key] != null) {
      return String(process.env[key]);
    }
  } catch (_) {
    // ignore
  }
  return '';
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

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

function shouldFallbackToGetAuth(error) {
  const message = String(error?.message || '');
  const code = String(error?.code || '');
  // Fast Refresh / multiple initialization.
  if (code === 'auth/already-initialized') return true;
  if (message.toLowerCase().includes('already been initialized')) return true;
  // If the auth component isn't registered yet for some reason, don't crash the app.
  if (message.toLowerCase().includes('component auth has not been registered yet')) return true;
  return false;
}

const AUTH_GLOBAL_KEY = '__bb_firebase_auth_instance__';
let authInstance = globalThis?.[AUTH_GLOBAL_KEY];

if (!authInstance) {
  try {
    if (Platform?.OS === 'web') {
      authInstance = getAuth(firebaseApp);
    } else {
      const AsyncStorage = getAsyncStorageModule();
      if (!AsyncStorage) {
        try {
          console.warn('[firebase] AsyncStorage not available; auth persistence will be in-memory only');
        } catch (_) {}
        authInstance = getAuth(firebaseApp);
      } else {
        try {
          authInstance = initializeAuth(firebaseApp, {
            persistence: getReactNativePersistence(AsyncStorage),
          });
        } catch (e) {
          // If Auth was initialized elsewhere (Fast Refresh), reuse it.
          if (shouldFallbackToGetAuth(e)) {
            authInstance = getAuth(firebaseApp);
          } else {
            try {
              console.warn('[firebase] Failed to initializeAuth with persistence', e);
            } catch (_) {}
            authInstance = getAuth(firebaseApp);
          }
        }
      }
    }
  } catch (e) {
    // Final safety net: never crash the app at import-time due to auth initialization.
    try {
      console.warn('[firebase] Auth initialization failed', e);
    } catch (_) {}
    authInstance = null;
  }

  try {
    if (globalThis) globalThis[AUTH_GLOBAL_KEY] = authInstance;
  } catch (_) {
    // ignore
  }
}

export const auth = authInstance;
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

const region = getExpoPublicEnv('EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION') || 'us-central1';
export const functions = getFunctions(firebaseApp, region);
