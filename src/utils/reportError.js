import { Platform } from 'react-native';
import { Sentry } from '../sentry';

function safeString(value) {
  try {
    if (value == null) return '';
    return String(value);
  } catch (_) {
    return '';
  }
}

function getExpoDebugContext() {
  const ctx = {};

  try {
    // Optional deps in Expo builds; keep defensive to avoid bundling/runtime surprises.
    // eslint-disable-next-line global-require
    const Updates = require('expo-updates');
    ctx.updateId = safeString(Updates?.updateId);
    ctx.channel = safeString(Updates?.channel);
    ctx.runtimeVersion = safeString(Updates?.runtimeVersion);
    ctx.isEmbeddedLaunch = Boolean(Updates?.isEmbeddedLaunch);
  } catch (_) {
    // ignore
  }

  try {
    // eslint-disable-next-line global-require
    const Constants = require('expo-constants');
    const expoConfig = Constants?.expoConfig || Constants?.manifest || null;
    ctx.appVersion = safeString(expoConfig?.version);
    ctx.iosBuildNumber = safeString(expoConfig?.ios?.buildNumber);
    ctx.androidVersionCode = safeString(expoConfig?.android?.versionCode);
  } catch (_) {
    // ignore
  }

  ctx.platform = safeString(Platform?.OS);

  return ctx;
}

function normalizeError(err) {
  const e = err || new Error('Unknown error');
  const code = safeString(e?.code);
  const message = safeString(e?.message) || safeString(e);
  const name = safeString(e?.name);

  return { err: e, code, message, name };
}

/**
 * Capture an exception to Sentry with safe, non-PII context.
 * Returns the Sentry event id (string) or empty string if not captured.
 */
export function reportErrorToSentry(err, context = {}) {
  try {
    if (!Sentry) return '';

    const { err: normalizedErr, code, message, name } = normalizeError(err);
    const expo = getExpoDebugContext();

    const eventId = Sentry.withScope((scope) => {
      try {
        scope.setTag('bb_platform', expo.platform || 'unknown');
        if (context?.action) scope.setTag('bb_action', safeString(context.action));
        if (context?.area) scope.setTag('bb_area', safeString(context.area));

        if (code) scope.setTag('bb_error_code', code);
        if (name) scope.setTag('bb_error_name', name);

        scope.setContext('expo', expo);

        // Extra context should avoid PII (no emails, no names, no tokens)
        if (context && typeof context === 'object') {
          const extras = { ...context };
          delete extras.password;
          delete extras.email;
          delete extras.token;
          scope.setExtras(extras);
        }

        scope.setExtra('error_message', message);
      } catch (_) {
        // ignore scope failures
      }

      return Sentry.captureException(normalizedErr);
    });

    return safeString(eventId);
  } catch (_) {
    return '';
  }
}

export function formatSupportDetails({ code, eventId }) {
  const parts = [];
  if (code) parts.push(`Code: ${safeString(code)}`);
  if (eventId) parts.push(`Support code: ${safeString(eventId)}`);
  return parts.length ? `\n\n${parts.join('\n')}` : '';
}
