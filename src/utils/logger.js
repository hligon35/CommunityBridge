import { DEBUG_LOGS, DEBUG_LOG_COLORS, DEBUG_LOG_LEVEL } from '../config';

const MAX_LOGS = 200;

const state = {
  logs: [],
  context: {},
  options: {
    colors: undefined,
    minLevel: undefined,
  },
};

function isReactNative() {
  try {
    return typeof navigator !== 'undefined' && navigator && navigator.product === 'ReactNative';
  } catch (e) {
    return false;
  }
}

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function normalizeLevel(level) {
  const l = String(level || '').toLowerCase();
  return LEVELS[l] ? l : 'info';
}

function getMinLevel() {
  const configured = state.options.minLevel ?? DEBUG_LOG_LEVEL;
  return normalizeLevel(configured);
}

function shouldLog(level) {
  const want = normalizeLevel(level);
  const min = getMinLevel();
  return LEVELS[want] >= LEVELS[min];
}

function colorsEnabled() {
  const opt = state.options.colors;
  if (typeof opt === 'boolean') return opt;
  try {
    return !!DEBUG_LOG_COLORS;
  } catch (e) {
    return false;
  }
}

function supportsAnsiColors() {
  // Emit ANSI when explicitly enabled; Metro/VS Code terminals will render it.
  // On device logs, ANSI may show as raw characters, but it is still readable.
  if (!colorsEnabled()) return false;
  try {
    // If we are on a real terminal (Metro/Node), render colors.
    if (typeof process !== 'undefined' && !!process.stdout && process.stdout.isTTY) return true;
  } catch (e) {
    // ignore
  }

  // In React Native, logs are forwarded to Metro where ANSI is useful.
  // If the console doesn't support ANSI, it will still show plain text.
  if (isReactNative()) return true;

  return false;
}

const ANSI = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  blue: '\u001b[34m',
  magenta: '\u001b[35m',
  green: '\u001b[32m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
  gray: '\u001b[90m',
};

function colorize(level, text) {
  if (!supportsAnsiColors()) return text;
  if (level === 'error') return `${ANSI.red}${text}${ANSI.reset}`;
  if (level === 'warn') return `${ANSI.yellow}${text}${ANSI.reset}`;
  if (level === 'info') return `${ANSI.cyan}${text}${ANSI.reset}`;
  return `${ANSI.gray}${text}${ANSI.reset}`;
}

function tagColor(tag) {
  // Keep related categories close in color.
  // - UI interactions: green
  // - Networking/API: cyan
  // - App/Auth lifecycle: blue
  // - Error surfaces (boundary/global/promise): magenta
  const t = String(tag || '').toLowerCase();
  if (t === 'press' || t === 'ui' || t === 'nav') return ANSI.green;
  if (t === 'api') return ANSI.cyan;
  if (t === 'app' || t === 'auth') return ANSI.blue;
  if (t === 'boundary' || t === 'global' || t === 'promise') return ANSI.magenta;
  return ANSI.gray;
}

function colorizeTag(tag) {
  const raw = `[${String(tag || 'app')}]`;
  if (!supportsAnsiColors()) return raw;
  const c = tagColor(tag);
  // Slightly dim tags so level remains the primary signal.
  return `${ANSI.dim}${c}${raw}${ANSI.reset}`;
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch (e) {
    return String(Date.now());
  }
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && (v.constructor === Object || Object.getPrototypeOf(v) === null);
}

function isSensitiveKey(key) {
  const k = String(key || '').toLowerCase();
  return [
    'authorization', 'token', 'password', 'secret', 'email', 'name', 'firstname', 'lastname', 'phone', 'address',
    'body', 'note', 'notes', 'subject', 'message', 'child', 'parent', 'therapist', 'memo', 'proposer',
    'recipient', 'location', 'lat', 'lng', 'avatar', 'family', 'guardian', 'student',
  ].some((part) => k.includes(part));
}

function redactValue(key, value) {
  if (isSensitiveKey(key)) {
    return '[REDACTED]';
  }
  if (typeof value === 'string') {
    // Redact common Bearer tokens
    if (/^bearer\s+\S+/i.test(value)) return 'Bearer [REDACTED]';
  }
  return value;
}

function redactDeep(value, parentKey = '') {
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, parentKey));
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (isSensitiveKey(k) || isSensitiveKey(parentKey)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactDeep(redactValue(k, v), k);
      }
    }
    return out;
  }
  return redactValue(parentKey, value);
}

function redactObject(obj) {
  if (!isPlainObject(obj)) return obj;
  return redactDeep(obj);
}

function coerceData(data) {
  if (data == null) return undefined;
  if (isPlainObject(data)) return redactObject(data);
  return data;
}

function pushLog(entry) {
  state.logs.unshift(entry);
  if (state.logs.length > MAX_LOGS) state.logs.length = MAX_LOGS;
}

export function setDebugContext(patch) {
  if (!patch || typeof patch !== 'object') return;
  state.context = { ...state.context, ...redactObject(patch) };
}

export function getDebugContext() {
  return { ...state.context };
}

export function getRecentLogs(limit = 60) {
  const n = Math.max(0, Math.min(Number(limit) || 0, MAX_LOGS));
  return state.logs.slice(0, n);
}

export function logPress(name, data) {
  // Standardized category for press/tap events.
  // Kept at debug level to avoid noise unless DEBUG_LOGS is enabled.
  if (!shouldDebug()) return;
  baseLog('debug', 'press', name, data);
}

function shouldDebug() {
  try {
    return !!DEBUG_LOGS && shouldLog('debug');
  } catch (e) {
    return false;
  }
}

export function setLoggerOptions({ colors, minLevel } = {}) {
  if (typeof colors === 'boolean') state.options.colors = colors;
  if (typeof minLevel === 'string') state.options.minLevel = minLevel;
}

function baseLog(level, tag, message, data) {
  if (!shouldLog(level)) return;
  const entry = {
    t: nowIso(),
    level,
    tag: tag || 'app',
    message: String(message ?? ''),
    data: coerceData(data),
  };

  pushLog(entry);

  const lvl = `[${entry.level.toUpperCase()}]`;
  const prefix = `[${entry.t}] ${colorize(level, lvl)} ${colorizeTag(entry.tag)}`;
  try {
    if (level === 'error') console.error(prefix, entry.message, entry.data ?? '');
    else if (level === 'warn') console.warn(prefix, entry.message, entry.data ?? '');
    else console.log(prefix, entry.message, entry.data ?? '');
  } catch (e) {
    // ignore
  }
}

export const logger = {
  debug(tag, message, data) {
    if (!shouldDebug()) return;
    baseLog('debug', tag, message, data);
  },
  info(tag, message, data) {
    baseLog('info', tag, message, data);
  },
  warn(tag, message, data) {
    baseLog('warn', tag, message, data);
  },
  error(tag, message, data) {
    baseLog('error', tag, message, data);
  },
  press(name, data) {
    logPress(name, data);
  },
};

export default logger;
