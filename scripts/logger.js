// Lightweight ANSI logger for node scripts (api-server/api-mock)
// Controlled via CB_DEBUG_LOGS / CB_DEBUG_LOG_LEVEL (preferred) or BB_* (legacy).

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const ANSI = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  gray: '\u001b[90m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
  blue: '\u001b[34m',
  magenta: '\u001b[35m',
  green: '\u001b[32m',
};

function nowIso() {
  try { return new Date().toISOString(); } catch (e) { return String(Date.now()); }
}

function normalizeLevel(level) {
  const l = String(level || '').toLowerCase();
  return LEVELS[l] ? l : 'info';
}

function envFlag(value, fallback = false) {
  if (value == null) return fallback;
  const s = String(value).trim().toLowerCase();
  if (!s) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return fallback;
}

function shouldColor() {
  // Color by default in terminals; allow disabling.
  const enabled = envFlag(process.env.CB_DEBUG_LOG_COLORS || process.env.BB_DEBUG_LOG_COLORS, true);
  if (!enabled) return false;
  return !!process.stdout && !!process.stdout.isTTY;
}

function minLevel() {
  return normalizeLevel(process.env.CB_DEBUG_LOG_LEVEL || process.env.BB_DEBUG_LOG_LEVEL || 'debug');
}

function debugEnabled() {
  return envFlag(process.env.CB_DEBUG_LOGS || process.env.BB_DEBUG_LOGS, true);
}

function shouldLog(level) {
  const want = normalizeLevel(level);
  const min = minLevel();
  return LEVELS[want] >= LEVELS[min];
}

function levelColor(level) {
  if (level === 'error') return ANSI.red;
  if (level === 'warn') return ANSI.yellow;
  if (level === 'info') return ANSI.cyan;
  return ANSI.gray;
}

function tagColor(tag) {
  const t = String(tag || '').toLowerCase();
  if (t === 'auth') return ANSI.blue;
  if (t === 'api') return ANSI.cyan;
  if (t === 'db') return ANSI.magenta;
  if (t === 'req') return ANSI.green;
  return ANSI.gray;
}

function colorize(text, color) {
  if (!shouldColor()) return text;
  return `${color}${text}${ANSI.reset}`;
}

function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k).toLowerCase();
    if (key.includes('password') || key.includes('token') || key.includes('authorization') || key.includes('secret')) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

function baseLog(level, tag, message, data) {
  if (!debugEnabled() && level === 'debug') return;
  if (!shouldLog(level)) return;

  const ts = nowIso();
  const lvl = `[${String(level).toUpperCase()}]`;
  const t = `[${String(tag || 'app')}]`;

  const prefix = `${colorize(`[${ts}]`, ANSI.dim)} ${colorize(lvl, levelColor(level))} ${colorize(t, tagColor(tag))}`;
  const payload = data == null ? undefined : redact(data);

  try {
    if (level === 'error') console.error(prefix, message, payload ?? '');
    else if (level === 'warn') console.warn(prefix, message, payload ?? '');
    else console.log(prefix, message, payload ?? '');
  } catch (e) {
    // ignore
  }
}

module.exports = {
  debug(tag, message, data) { baseLog('debug', tag, message, data); },
  info(tag, message, data) { baseLog('info', tag, message, data); },
  warn(tag, message, data) { baseLog('warn', tag, message, data); },
  error(tag, message, data) { baseLog('error', tag, message, data); },
};
