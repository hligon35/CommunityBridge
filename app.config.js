// Dynamic Expo config to ensure EXPO_PUBLIC_* values are available at runtime
// via Constants.expoConfig.extra (not just process.env).
module.exports = ({ config }) => {
  const extra = { ...(config.extra || {}) };

  const keys = [
    // Firebase (public config, required for Auth/Firestore/Functions)
    'EXPO_PUBLIC_FIREBASE_API_KEY',
    'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'EXPO_PUBLIC_FIREBASE_APP_ID',
    'EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID',
    'EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION',

    // Google OAuth (public client IDs)
    'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
    'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
    'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',

    'EXPO_PUBLIC_SENTRY_DSN',
    'EXPO_PUBLIC_SENTRY_ENVIRONMENT',
    'EXPO_PUBLIC_API_BASE_URL',
  ];

  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.length > 0) {
      extra[key] = value;
    }
  }

  return {
    ...config,
    extra,
  };
};
