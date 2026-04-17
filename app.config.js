// Dynamic Expo config to ensure EXPO_PUBLIC_* values are available at runtime
// via Constants.expoConfig.extra (not just process.env).
module.exports = ({ config }) => {
  const extra = { ...(config.extra || {}) };

  const keys = [
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
