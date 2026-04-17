import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

export { Sentry };

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

export function initSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN || getExpoExtraValue('EXPO_PUBLIC_SENTRY_DSN');
  if (!dsn) return;

  const environment = process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT || getExpoExtraValue('EXPO_PUBLIC_SENTRY_ENVIRONMENT');

  Sentry.init({
    dsn,
    environment: environment || undefined,
    enableNative: true,
  });
}
