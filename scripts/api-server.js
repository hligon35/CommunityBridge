#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const multer = require('multer');
let twilioLib = null;
function getTwilioLib() {
  if (twilioLib) return twilioLib;
  try {
    // Lazy require so the server can still boot even if the dependency
    // is missing in a given deployment image.
    // eslint-disable-next-line global-require
    twilioLib = require('twilio');
    return twilioLib;
  } catch (e) {
    return null;
  }
}

let nodemailerLib = null;
function getNodemailerLib() {
  if (nodemailerLib) return nodemailerLib;
  try {
    // Lazy require so the server can still boot even if the dependency
    // is missing in a given deployment image.
    // eslint-disable-next-line global-require
    nodemailerLib = require('nodemailer');
    return nodemailerLib;
  } catch (e) {
    return null;
  }
}

const PORT = Number(process.env.PORT || 3005);
const DB_PATH = process.env.BB_DB_PATH || path.join(process.cwd(), '.data', 'buddyboard.sqlite');
const JWT_SECRET = process.env.BB_JWT_SECRET || '';
const NODE_ENV = String(process.env.NODE_ENV || '').trim().toLowerCase();
const PUBLIC_BASE_URL = (process.env.BB_PUBLIC_BASE_URL || '').trim();

function envFlag(value, defaultValue = false) {
  if (value == null) return defaultValue;
  const v = String(value).trim().toLowerCase();
  if (v === '') return defaultValue;
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
  return defaultValue;
}

const ALLOW_SIGNUP = envFlag(process.env.BB_ALLOW_SIGNUP, true);
// IMPORTANT:
// Requiring 2FA on signup by default will hard-fail account creation when email/SMS delivery
// isn't configured (e.g. missing BB_SMTP_URL/BB_EMAIL_FROM). Default to OFF unless explicitly enabled.
const REQUIRE_2FA_ON_SIGNUP = envFlag(process.env.BB_REQUIRE_2FA_ON_SIGNUP, false);
const DEBUG_2FA_RETURN_CODE = envFlag(process.env.BB_DEBUG_2FA_RETURN_CODE, false);
// When enabled, include the underlying delivery failure message in API responses.
// Keep disabled in production by default to avoid leaking implementation details.
const DEBUG_2FA_DELIVERY_ERRORS = envFlag(process.env.BB_DEBUG_2FA_DELIVERY_ERRORS, false);
const LOG_REQUESTS = envFlag(process.env.BB_DEBUG_REQUESTS, true);

// 2FA delivery toggles
// Default: email enabled, SMS disabled.
const ENABLE_EMAIL_2FA = envFlag(process.env.BB_ENABLE_EMAIL_2FA, true);
const ENABLE_SMS_2FA = envFlag(process.env.BB_ENABLE_SMS_2FA, false);

// 2FA delivery (SMS only).
// Configure Twilio in production/TestFlight:
// - BB_TWILIO_ACCOUNT_SID
// - BB_TWILIO_AUTH_TOKEN
// - BB_TWILIO_FROM (E.164, e.g. +15551234567) OR BB_TWILIO_MESSAGING_SERVICE_SID
const TWILIO_ACCOUNT_SID = (process.env.BB_TWILIO_ACCOUNT_SID || '').trim();
const TWILIO_AUTH_TOKEN = (process.env.BB_TWILIO_AUTH_TOKEN || '').trim();
const TWILIO_FROM = (process.env.BB_TWILIO_FROM || '').trim();
const TWILIO_MESSAGING_SERVICE_SID = (process.env.BB_TWILIO_MESSAGING_SERVICE_SID || '').trim();

// 2FA delivery (Email)
// Configure SMTP:
// - BB_SMTP_URL (e.g. smtp://user:pass@smtp.example.com:587)
// - BB_EMAIL_FROM (e.g. BuddyBoard <no-reply@example.com>)
const SMTP_URL = (process.env.BB_SMTP_URL || '').trim();
const EMAIL_FROM = (process.env.BB_EMAIL_FROM || '').trim();
const EMAIL_2FA_SUBJECT = (process.env.BB_EMAIL_2FA_SUBJECT || 'BuddyBoard verification code').trim();
const EMAIL_PASSWORD_RESET_SUBJECT = (process.env.BB_EMAIL_PASSWORD_RESET_SUBJECT || 'BuddyBoard password reset').trim();

const RETURN_PASSWORD_RESET_CODE = envFlag(process.env.BB_RETURN_PASSWORD_RESET_CODE, NODE_ENV !== 'production');
const PASSWORD_RESET_TTL_MINUTES = Math.max(5, Number(process.env.BB_PASSWORD_RESET_TTL_MINUTES || 30));

const slog = require('./logger');

function twilioEnabled() {
  if (!ENABLE_SMS_2FA) return false;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return false;
  if (TWILIO_MESSAGING_SERVICE_SID) return true;
  return !!TWILIO_FROM;
}

function emailEnabled() {
  if (!ENABLE_EMAIL_2FA) return false;
  return !!(SMTP_URL && EMAIL_FROM);
}

let twilioClient = null;
function getTwilioClient() {
  if (!twilioEnabled()) return null;
  if (twilioClient) return twilioClient;
  const twilio = getTwilioLib();
  if (!twilio) {
    throw new Error("Missing dependency 'twilio' in this server build. Rebuild your Docker image after installing dependencies (npm ci) so the twilio package is included.");
  }
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return twilioClient;
}

function normalizeE164Phone(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  // allow spaces/dashes/parentheses; require leading + for international safety
  const cleaned = raw.replace(/[\s\-().]/g, '');
  if (!cleaned.startsWith('+')) return '';
  const digits = cleaned.slice(1).replace(/\D/g, '');
  const out = `+${digits}`;
  if (!/^\+\d{10,15}$/.test(out)) return '';
  return out;
}

async function send2faCodeSms({ to, code }) {
  const client = getTwilioClient();
  if (!client) {
    throw new Error('2FA SMS delivery is not configured (set BB_TWILIO_ACCOUNT_SID/BB_TWILIO_AUTH_TOKEN and BB_TWILIO_FROM or BB_TWILIO_MESSAGING_SERVICE_SID)');
  }

  const body = `BuddyBoard verification code: ${code}. Expires in 5 minutes.`;
  const msg = {
    to,
    body,
  };
  if (TWILIO_MESSAGING_SERVICE_SID) msg.messagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
  else msg.from = TWILIO_FROM;

  await client.messages.create(msg);
}

let emailTransporter = null;
function getEmailTransporter() {
  if (!emailEnabled()) return null;
  if (emailTransporter) return emailTransporter;
  const nodemailer = getNodemailerLib();
  if (!nodemailer) {
    throw new Error("Missing dependency 'nodemailer' in this server build. Rebuild your Docker image after installing dependencies (npm ci) so the nodemailer package is included.");
  }
  emailTransporter = nodemailer.createTransport(SMTP_URL);
  return emailTransporter;
}

function normalizeEmail(input) {
  const v = String(input || '').trim().toLowerCase();
  if (!v) return '';
  // Minimal sanity check; avoid strict RFC parsing.
  if (!/^\S+@\S+\.[^\s@]+$/.test(v)) return '';
  return v;
}

async function send2faCodeEmail({ to, code }) {
  const destination = normalizeEmail(to);
  if (!destination) throw new Error('Invalid email destination');

  const transporter = getEmailTransporter();
  if (!transporter) {
    throw new Error('2FA email delivery is not configured (set BB_SMTP_URL and BB_EMAIL_FROM, and ensure BB_ENABLE_EMAIL_2FA=1)');
  }

  const text = `BuddyBoard verification code: ${code}. Expires in 5 minutes.`;
  await transporter.sendMail({
    from: EMAIL_FROM,
    to: destination,
    subject: EMAIL_2FA_SUBJECT,
    text,
  });
}

async function deliver2faCode({ method, destination, code }) {
  const m = String(method || '').trim().toLowerCase();
  if (m === 'sms') {
    if (!ENABLE_SMS_2FA) throw new Error('SMS 2FA is disabled');
    return send2faCodeSms({ to: destination, code });
  }
  if (m === 'email') {
    if (!ENABLE_EMAIL_2FA) throw new Error('Email 2FA is disabled');
    return send2faCodeEmail({ to: destination, code });
  }
  throw new Error('Unsupported 2FA method');
}

// Ephemeral 2FA challenges for dev/testing.
// NOTE: This is in-memory and resets when the server restarts.
const twoFaChallenges = new Map();

const TWOFA_CODE_TTL_MS = 5 * 60 * 1000;
const TWOFA_RESEND_COOLDOWN_MS = 5 * 60 * 1000;

function nanoIdShort() {
  // nanoId() exists in this file; keep challenge IDs short/unique.
  // Avoid external deps to keep scripts self-contained.
  return `ch_${nanoId().slice(-10)}`;
}

function maskDest(method, value) {
  const v = String(value || '');
  if (!v) return '';
  if (method === 'sms') {
    const last = v.replace(/\D/g, '').slice(-4);
    return last ? `***-***-${last}` : '***';
  }
  // email
  const at = v.indexOf('@');
  if (at <= 1) return '***';
  return `${v[0]}***${v.slice(at)}`;
}

function maskEmail(email) {
  const v = String(email || '').trim().toLowerCase();
  const at = v.indexOf('@');
  if (at <= 1) return '***';
  return `${v[0]}***${v.slice(at)}`;
}

function newOtpCode() {
  // 6-digit numeric code.
  return String(Math.floor(100000 + Math.random() * 900000));
}

function create2faChallenge({ userId, method, destination }) {
  const challengeId = nanoIdShort();
  const code = newOtpCode();
  const now = Date.now();
  const expiresAt = now + TWOFA_CODE_TTL_MS;
  twoFaChallenges.set(challengeId, { userId, method, destination, code, expiresAt, attempts: 0, lastSentAt: now });
  return { challengeId, code, expiresAt };
}

function resend2faChallenge(challengeId) {
  const ch = twoFaChallenges.get(challengeId);
  if (!ch) return { ok: false, status: 404, error: 'invalid challenge' };

  const now = Date.now();
  const last = Number(ch.lastSentAt || 0);
  const waitMs = (last + TWOFA_RESEND_COOLDOWN_MS) - now;
  if (waitMs > 0) {
    return {
      ok: false,
      status: 429,
      error: 'Too many requests; please wait before requesting another code',
      retryAfterSec: Math.ceil(waitMs / 1000),
    };
  }

  ch.code = newOtpCode();
  ch.expiresAt = now + TWOFA_CODE_TTL_MS;
  ch.attempts = 0;
  ch.lastSentAt = now;
  twoFaChallenges.set(challengeId, ch);
  return { ok: true, challengeId, code: ch.code, expiresAt: ch.expiresAt, method: ch.method, destination: ch.destination };
}

function consume2faChallenge(challengeId, code) {
  const ch = twoFaChallenges.get(challengeId);
  if (!ch) return { ok: false, error: 'invalid challenge' };
  if (Date.now() > ch.expiresAt) {
    twoFaChallenges.delete(challengeId);
    return { ok: false, error: 'challenge expired' };
  }
  ch.attempts += 1;
  if (ch.attempts > 10) {
    twoFaChallenges.delete(challengeId);
    return { ok: false, error: 'too many attempts' };
  }
  if (String(code || '').trim() !== String(ch.code)) {
    return { ok: false, error: 'invalid code' };
  }
  twoFaChallenges.delete(challengeId);
  return { ok: true, userId: ch.userId, method: ch.method };
}
// Dev compatibility: allow the mobile app's __DEV__ auto-login token.
// Default: enabled outside production, disabled in production.
const ALLOW_DEV_TOKEN = envFlag(process.env.BB_ALLOW_DEV_TOKEN, NODE_ENV !== 'production');

const ADMIN_EMAIL = process.env.BB_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.BB_ADMIN_PASSWORD || '';
const ADMIN_NAME = process.env.BB_ADMIN_NAME || 'Admin';

const GOOGLE_CLIENT_IDS = String(process.env.BB_GOOGLE_CLIENT_IDS || '').trim();
let googleClient = null;
try {
  if (GOOGLE_CLIENT_IDS) {
    const { OAuth2Client } = require('google-auth-library');
    googleClient = new OAuth2Client();
  }
} catch (e) {
  googleClient = null;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function nowISO() {
  return new Date().toISOString();
}

function nanoId() {
  // simple, dependency-free id
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

ensureDir(path.dirname(DB_PATH));
const db = new Database(DB_PATH);

const UPLOAD_DIR = process.env.BB_UPLOAD_DIR
  ? String(process.env.BB_UPLOAD_DIR)
  : path.join(path.dirname(DB_PATH), 'uploads');

ensureDir(UPLOAD_DIR);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT,
  phone TEXT,
  address TEXT,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS directory_children (
  id TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS directory_parents (
  id TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS directory_therapists (
  id TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Normalized ABA relationships (derived from directory JSON).
CREATE TABLE IF NOT EXISTS aba_supervision (
  aba_id TEXT PRIMARY KEY,
  bcba_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS child_aba_assignments (
  child_id TEXT NOT NULL,
  session TEXT NOT NULL,
  aba_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (child_id, session)
);

CREATE TABLE IF NOT EXISTS org_settings (
  id TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_json TEXT,
  title TEXT,
  body TEXT,
  image TEXT,
  likes INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  comments_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  body TEXT NOT NULL,
  sender_json TEXT,
  to_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS urgent_memos (
  id TEXT PRIMARY KEY,
  type TEXT,
  status TEXT,
  proposer_id TEXT,
  actor_role TEXT,
  child_id TEXT,
  title TEXT,
  body TEXT,
  note TEXT,
  meta_json TEXT,
  memo_json TEXT,
  responded_at TEXT,
  ack INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS time_change_proposals (
  id TEXT PRIMARY KEY,
  child_id TEXT,
  type TEXT,
  proposed_iso TEXT,
  note TEXT,
  proposer_id TEXT,
  action TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT,
  platform TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  preferences_json TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS arrival_pings (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  role TEXT,
  child_id TEXT,
  lat REAL,
  lng REAL,
  event_id TEXT,
  when_iso TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
`);

try {
  db.exec('CREATE INDEX IF NOT EXISTS aba_supervision_bcba_idx ON aba_supervision (bcba_id)');
  db.exec('CREATE INDEX IF NOT EXISTS child_aba_assignments_aba_idx ON child_aba_assignments (aba_id)');
  db.exec('CREATE INDEX IF NOT EXISTS password_resets_user_id_idx ON password_resets (user_id)');
} catch (_) {
  // ignore
}

function passwordResetEmailConfigured() {
  return !!(SMTP_URL && EMAIL_FROM);
}

let passwordResetTransporter = null;
function getPasswordResetEmailTransporter() {
  if (!passwordResetEmailConfigured()) return null;
  if (passwordResetTransporter) return passwordResetTransporter;
  const nodemailer = getNodemailerLib();
  if (!nodemailer) {
    throw new Error("Missing dependency 'nodemailer' in this server build. Rebuild your Docker image after installing dependencies (npm ci) so the nodemailer package is included.");
  }
  passwordResetTransporter = nodemailer.createTransport(SMTP_URL);
  return passwordResetTransporter;
}

function hashResetCode(code) {
  const raw = String(code || '');
  return crypto.createHash('sha256').update(`${raw}:${JWT_SECRET}`).digest('hex');
}

function generateResetCode() {
  // 12 hex chars (~48 bits). Short enough to type; large enough to avoid guessing.
  return crypto.randomBytes(6).toString('hex');
}

async function sendPasswordResetEmail({ to, code }) {
  const destination = normalizeEmail(to);
  if (!destination) throw new Error('Invalid email destination');

  const transporter = getPasswordResetEmailTransporter();
  if (!transporter) {
    throw new Error('Password reset email delivery is not configured (set BB_SMTP_URL and BB_EMAIL_FROM)');
  }

  const text = `BuddyBoard password reset code: ${code}.\n\nEnter this code in the app to set a new password.\n\nThis code expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.`;
  await transporter.sendMail({
    from: EMAIL_FROM,
    to: destination,
    subject: EMAIL_PASSWORD_RESET_SUBJECT,
    text,
  });
}

function isAdminRole(role) {
  const r = safeString(role).trim().toLowerCase();
  return r === 'admin' || r === 'administrator';
}

function requireAdmin(req, res, next) {
  try {
    if (req.user && isAdminRole(req.user.role)) return next();
  } catch (e) {}
  return res.status(403).json({ ok: false, error: 'admin required' });
}

function ensureUserProfileColumns() {
  try {
    const cols = db.prepare("PRAGMA table_info('users')").all();
    const names = new Set((cols || []).map((c) => String(c.name || '').toLowerCase()));

    if (!names.has('avatar')) {
      db.exec('ALTER TABLE users ADD COLUMN avatar TEXT');
    }
    if (!names.has('phone')) {
      db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
    }
    if (!names.has('address')) {
      db.exec('ALTER TABLE users ADD COLUMN address TEXT');
    }
  } catch (e) {
    console.warn('[api] users table migration failed:', e && e.message ? e.message : String(e));
  }
}

ensureUserProfileColumns();

function ensureUserEmailCaseInsensitiveUniqueness() {
  try {
    // If duplicates already exist (older DBs), creating a unique index will fail.
    const dups = db
      .prepare("SELECT lower(email) AS email_lc, COUNT(*) AS c FROM users GROUP BY lower(email) HAVING c > 1")
      .all();
    if (Array.isArray(dups) && dups.length) {
      slog.warn('db', 'Duplicate user emails detected; cannot enforce case-insensitive uniqueness until cleaned up', { duplicates: dups.length });
      return;
    }

    // Enforce case-insensitive uniqueness going forward.
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_email_nocase_idx ON users(email COLLATE NOCASE)");
  } catch (e) {
    slog.warn('db', 'users email NOCASE uniqueness index skipped', { message: e?.message || String(e) });
  }
}

ensureUserEmailCaseInsensitiveUniqueness();

// Lightweight migrations for older databases.
try {
  const cols = db.prepare("PRAGMA table_info('urgent_memos')").all().map((c) => String(c.name));
  const ensureCol = (name, ddl) => { if (!cols.includes(name)) db.exec(ddl); };
  ensureCol('memo_json', "ALTER TABLE urgent_memos ADD COLUMN memo_json TEXT");
  ensureCol('status', "ALTER TABLE urgent_memos ADD COLUMN status TEXT");
  ensureCol('responded_at', "ALTER TABLE urgent_memos ADD COLUMN responded_at TEXT");
} catch (e) {
  slog.warn('db', 'urgent_memos migration skipped', { message: e?.message || String(e) });
}

function safeJsonParse(text, fallback) {
  try {
    if (!text) return fallback;
    return JSON.parse(text);
  } catch (_) {
    return fallback;
  }
}

function normalizeSession(value) {
  const s = safeString(value).trim().toUpperCase();
  if (s === 'AM' || s === 'PM') return s;
  return null;
}

function normalizeId(value) {
  const s = safeString(value).trim();
  return s || null;
}

function deriveChildAbaAssignments(child) {
  try {
    const childId = normalizeId(child && child.id);
    if (!childId) return [];

    const rawAssigned = (child && (child.assignedABA || child.assigned_ABA || child.assigned)) || [];
    const assignedArr = Array.isArray(rawAssigned) ? rawAssigned : [rawAssigned];
    const assigned = assignedArr
      .map((x) => normalizeId(x))
      .filter(Boolean);

    if (!assigned.length) return [];

    const sess = normalizeSession(child && child.session);

    if (assigned.length === 1) {
      if (sess) return [{ childId, session: sess, abaId: assigned[0] }];
      return [{ childId, session: 'AM', abaId: assigned[0] }];
    }

    if (sess === 'AM') {
      return [
        { childId, session: 'AM', abaId: assigned[0] },
        { childId, session: 'PM', abaId: assigned[1] },
      ];
    }
    if (sess === 'PM') {
      return [
        { childId, session: 'PM', abaId: assigned[0] },
        { childId, session: 'AM', abaId: assigned[1] },
      ];
    }
    return [
      { childId, session: 'AM', abaId: assigned[0] },
      { childId, session: 'PM', abaId: assigned[1] },
    ];
  } catch (_) {
    return [];
  }
}

function rebuildAbaRelationshipsFromDirectorySqlite(now) {
  const therapistRows = db.prepare('SELECT data_json FROM directory_therapists').all();
  const therapists = (therapistRows || [])
    .map((r) => safeJsonParse(String(r && r.data_json ? r.data_json : ''), null))
    .filter(Boolean);

  const supervision = new Map();
  for (const t of therapists) {
    const abaId = normalizeId(t && t.id);
    const bcbaId = normalizeId(t && (t.supervisedBy || t.supervised_by));
    if (abaId && bcbaId) supervision.set(abaId, bcbaId);
  }

  const childRows = db.prepare('SELECT data_json FROM directory_children').all();
  const children = (childRows || [])
    .map((r) => safeJsonParse(String(r && r.data_json ? r.data_json : ''), null))
    .filter(Boolean);

  const assignments = new Map();
  for (const c of children) {
    const pairs = deriveChildAbaAssignments(c);
    for (const p of pairs) assignments.set(`${p.childId}|${p.session}`, p);
  }

  db.prepare('DELETE FROM child_aba_assignments').run();
  db.prepare('DELETE FROM aba_supervision').run();

  const upsertSupervision = db.prepare(
    'INSERT INTO aba_supervision (aba_id, bcba_id, created_at, updated_at) VALUES (?,?,?,?)\n' +
    'ON CONFLICT(aba_id) DO UPDATE SET bcba_id=excluded.bcba_id, updated_at=excluded.updated_at'
  );
  const upsertAssignment = db.prepare(
    'INSERT INTO child_aba_assignments (child_id, session, aba_id, created_at, updated_at) VALUES (?,?,?,?,?)\n' +
    'ON CONFLICT(child_id, session) DO UPDATE SET aba_id=excluded.aba_id, updated_at=excluded.updated_at'
  );

  for (const [abaId, bcbaId] of supervision.entries()) {
    upsertSupervision.run(abaId, bcbaId, now, now);
  }
  for (const p of assignments.values()) {
    upsertAssignment.run(p.childId, p.session, p.abaId, now, now);
  }

  return { supervision: supervision.size, assignments: assignments.size };
}

// Best-effort: keep ABA relationship tables in sync at startup.
try {
  rebuildAbaRelationshipsFromDirectorySqlite(nowISO());
} catch (_) {
  // ignore
}

function roleLower(u) {
  try { return String(u && u.role ? u.role : '').trim().toLowerCase(); } catch (_) { return ''; }
}

function isAdminUser(u) {
  const r = roleLower(u);
  return r === 'admin' || r === 'administrator';
}

function safeString(v) {
  try {
    if (v == null) return '';
    return String(v);
  } catch (_) {
    return '';
  }
}

function hasExpoPushToken(token) {
  const t = safeString(token).trim();
  return t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken[');
}

function pushPrefAllows(preferences, kind) {
  // Preferences are opt-in toggles stored by the mobile Settings screen.
  // If preferences are missing/empty, default to allowing pushes.
  if (!preferences || typeof preferences !== 'object') return true;
  const keys = Object.keys(preferences);
  if (!keys.length) return true;
  if (kind === 'updates') return Boolean(preferences.updates ?? preferences.other ?? true);
  if (kind === 'other') return Boolean(preferences.other ?? preferences.updates ?? true);
  // fallback
  return true;
}

async function sendExpoPush(tokens, { title, body, data } = {}) {
  try {
    if (!Array.isArray(tokens) || !tokens.length) return { ok: true, skipped: true, reason: 'no-tokens' };
    if (typeof fetch !== 'function') {
      console.warn('[api] fetch() not available; skipping push send');
      return { ok: false, skipped: true, reason: 'no-fetch' };
    }

    const unique = Array.from(new Set(tokens.map((t) => safeString(t).trim()))).filter(hasExpoPushToken);
    if (!unique.length) return { ok: true, skipped: true, reason: 'no-valid-tokens' };

    const messages = unique.map((to) => ({
      to,
      title: safeString(title || 'BuddyBoard'),
      body: safeString(body || ''),
      data: (data && typeof data === 'object') ? data : {},
      sound: 'default',
    }));

    const resp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    const json = await resp.json().catch(() => null);

    // Best-effort cleanup for invalid/unregistered tokens.
    // Expo returns tickets in the same order as the messages array.
    try {
      const tickets = json && Array.isArray(json.data) ? json.data : null;
      if (resp.ok && tickets && tickets.length === messages.length) {
        const tokensToDelete = [];
        for (let i = 0; i < tickets.length; i += 1) {
          if (shouldDeleteTokenForExpoError(tickets[i])) tokensToDelete.push(messages[i].to);
        }
        const deleted = deletePushTokens(tokensToDelete);
        if (deleted) console.log(`[api] push cleanup: deleted ${deleted} invalid token(s)`);
      }
    } catch (_) {
      // ignore cleanup failures
    }

    return { ok: resp.ok, status: resp.status, expo: json };
  } catch (e) {
    console.warn('[api] push send failed', e && e.message ? e.message : String(e));
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function getAdminUserIds() {
  try {
    const rows = db.prepare('SELECT id, role FROM users').all();
    const ids = [];
    for (const r of rows) {
      const role = safeString(r.role).trim().toLowerCase();
      if (role === 'admin' || role === 'administrator') ids.push(String(r.id));
    }
    // Dev convenience: allow dev-token users to receive admin pushes.
    ids.push('dev');
    return Array.from(new Set(ids.filter(Boolean)));
  } catch (_) {
    return ['dev'];
  }
}

function getPushTokensForUsers(userIds, { kind } = {}) {
  try {
    if (!Array.isArray(userIds) || !userIds.length) return [];
    const placeholders = userIds.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT token, enabled, preferences_json FROM push_tokens WHERE enabled = 1 AND user_id IN (${placeholders})`
    ).all(...userIds.map(String));

    const out = [];
    for (const row of rows) {
      const token = safeString(row.token).trim();
      if (!token) continue;
      const prefs = safeJsonParse(row.preferences_json, {});
      if (kind && !pushPrefAllows(prefs, kind)) continue;
      out.push(token);
    }
    return Array.from(new Set(out));
  } catch (_) {
    return [];
  }
}

function deletePushTokens(tokens) {
  try {
    if (!Array.isArray(tokens) || !tokens.length) return 0;
    const unique = Array.from(new Set(tokens.map((t) => safeString(t).trim()))).filter(Boolean);
    if (!unique.length) return 0;
    const placeholders = unique.map(() => '?').join(',');
    const info = db.prepare(`DELETE FROM push_tokens WHERE token IN (${placeholders})`).run(...unique);
    return Number(info && typeof info.changes === 'number' ? info.changes : 0);
  } catch (_) {
    return 0;
  }
}

function shouldDeleteTokenForExpoError(expoTicket) {
  // Expo ticket format: { status: 'error', message, details: { error: 'DeviceNotRegistered' | ... } }
  try {
    if (!expoTicket || expoTicket.status !== 'error') return false;
    const details = expoTicket.details && typeof expoTicket.details === 'object' ? expoTicket.details : {};
    const code = safeString(details.error).trim();
    // Only delete for terminal token problems.
    return code === 'DeviceNotRegistered' || code === 'InvalidExpoPushToken';
  } catch (_) {
    return false;
  }
}

function normalizeRecipients(input) {
  if (!Array.isArray(input)) return [];
  const ids = [];
  for (const item of input) {
    if (!item) continue;
    if (typeof item === 'string' || typeof item === 'number') ids.push(String(item));
    else if (typeof item === 'object' && item.id != null) ids.push(String(item.id));
  }
  return Array.from(new Set(ids.filter(Boolean)));
}

function userToClient(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatar: row.avatar || '',
    phone: row.phone || '',
    address: row.address || '',
    role: row.role,
  };
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function requireJwtConfigured() {
  if (!JWT_SECRET) {
    console.warn('[api] Missing BB_JWT_SECRET. Set this in server environment for production.');
  }
}

requireJwtConfigured();

// Seed admin user if configured
try {
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    const normalizedAdminEmail = String(ADMIN_EMAIL).trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(normalizedAdminEmail);
    if (!existing) {
      const id = nanoId();
      const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
      const t = nowISO();
      db.prepare('INSERT INTO users (id,email,password_hash,name,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
        .run(id, normalizedAdminEmail, hash, ADMIN_NAME, 'ADMIN', t, t);
      console.log('[api] Seeded admin user:', normalizedAdminEmail);
    }
  }
} catch (e) {
  console.warn('[api] Admin seed failed:', e && e.message ? e.message : String(e));
}

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));

// Serve uploaded media. Files are stored under the same host-mounted .data dir.
app.use('/uploads', express.static(UPLOAD_DIR));

function buildPublicUrl(req, pathname) {
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (PUBLIC_BASE_URL) return `${PUBLIC_BASE_URL.replace(/\/$/, '')}${p}`;
  const proto = (req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']).split(',')[0].trim() : '') || req.protocol;
  const host = (req.headers['x-forwarded-host'] ? String(req.headers['x-forwarded-host']).split(',')[0].trim() : '') || req.get('host');
  return `${proto}://${host}${p}`;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const orig = (file && file.originalname) ? String(file.originalname) : 'upload';
      const ext = path.extname(orig).slice(0, 12);
      const safeBase = path.basename(orig, ext).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'file';
      cb(null, `${nanoId()}_${safeBase}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = String(header).startsWith('Bearer ') ? String(header).slice(7) : '';

  if (ALLOW_DEV_TOKEN && token === 'dev-token') {
    req.user = { id: 'dev', email: 'dev@example.com', name: 'Developer', role: 'ADMIN' };
    return next();
  }

  if (!token) return res.status(401).json({ ok: false, error: 'missing auth token' });
  if (!JWT_SECRET) return res.status(500).json({ ok: false, error: 'server missing BB_JWT_SECRET' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const userId = payload && payload.sub ? String(payload.sub) : '';
    if (!userId) return res.status(401).json({ ok: false, error: 'invalid token' });

    const row = db.prepare('SELECT id,email,name,avatar,phone,address,role FROM users WHERE id = ?').get(userId);
    if (!row) return res.status(401).json({ ok: false, error: 'user not found' });
    req.user = userToClient(row);
    return next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'invalid token' });
  }
}

function isParentRole(role) {
  const r = safeString(role).trim().toLowerCase();
  return r.includes('parent');
}

function isTherapistRole(role) {
  const r = safeString(role).trim().toLowerCase();
  return r.includes('therapist') || r.includes('bcba');
}

function isBcbaRole(role) {
  const r = safeString(role).trim().toLowerCase();
  return r.includes('bcba');
}

function pickDirectoryRecordForUser(user, records) {
  const uid = safeString(user && user.id).trim();
  if (uid) {
    const byId = (records || []).find((r) => r && safeString(r.id).trim() === uid);
    if (byId) return byId;
  }
  const uEmail = normalizeEmail(user && user.email);
  if (uEmail) {
    const matches = (records || []).filter((r) => r && normalizeEmail(r.email) === uEmail);
    if (matches.length) return matches[0];
  }
  return null;
}

function childHasParentId(child, parentId) {
  const pid = safeString(parentId).trim();
  if (!pid) return false;
  const list = Array.isArray(child && child.parents) ? child.parents : [];
  return list.some((p) => {
    if (!p) return false;
    if (typeof p === 'string' || typeof p === 'number') return safeString(p).trim() === pid;
    if (typeof p === 'object' && p.id != null) return safeString(p.id).trim() === pid;
    return false;
  });
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Directory (SQLite-backed). Admin-only for now.
app.get('/api/directory', authMiddleware, requireAdmin, (req, res) => {
  try {
    const children = db.prepare('SELECT data_json FROM directory_children ORDER BY updated_at DESC').all()
      .map((r) => {
        try { return JSON.parse(String(r.data_json || '')); } catch (e) { return null; }
      }).filter(Boolean);
    const parents = db.prepare('SELECT data_json FROM directory_parents ORDER BY updated_at DESC').all()
      .map((r) => {
        try { return JSON.parse(String(r.data_json || '')); } catch (e) { return null; }
      }).filter(Boolean);
    const therapists = db.prepare('SELECT data_json FROM directory_therapists ORDER BY updated_at DESC').all()
      .map((r) => {
        try { return JSON.parse(String(r.data_json || '')); } catch (e) { return null; }
      }).filter(Boolean);

    const assignments = db.prepare('SELECT child_id, session, aba_id FROM child_aba_assignments ORDER BY child_id ASC').all()
      .map((r) => ({ childId: r.child_id, session: r.session, abaId: r.aba_id }));
    const supervision = db.prepare('SELECT aba_id, bcba_id FROM aba_supervision ORDER BY aba_id ASC').all()
      .map((r) => ({ abaId: r.aba_id, bcbaId: r.bcba_id }));

    return res.json({ ok: true, children, parents, therapists, aba: { assignments, supervision } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Directory scope for the current user (safe for non-admins).
app.get('/api/directory/me', authMiddleware, (req, res) => {
  try {
    const allChildren = db.prepare('SELECT data_json FROM directory_children ORDER BY updated_at DESC').all()
      .map((r) => {
        try { return JSON.parse(String(r.data_json || '')); } catch (e) { return null; }
      }).filter(Boolean);
    const allParents = db.prepare('SELECT data_json FROM directory_parents ORDER BY updated_at DESC').all()
      .map((r) => {
        try { return JSON.parse(String(r.data_json || '')); } catch (e) { return null; }
      }).filter(Boolean);
    const allTherapists = db.prepare('SELECT data_json FROM directory_therapists ORDER BY updated_at DESC').all()
      .map((r) => {
        try { return JSON.parse(String(r.data_json || '')); } catch (e) { return null; }
      }).filter(Boolean);

    const allAssignments = db.prepare('SELECT child_id, session, aba_id FROM child_aba_assignments ORDER BY child_id ASC').all()
      .map((r) => ({ childId: r.child_id, session: r.session, abaId: r.aba_id }));
    const allSupervision = db.prepare('SELECT aba_id, bcba_id FROM aba_supervision ORDER BY aba_id ASC').all()
      .map((r) => ({ abaId: r.aba_id, bcbaId: r.bcba_id }));

    if (req.user && isAdminRole(req.user.role)) {
      return res.json({ ok: true, children: allChildren, parents: allParents, therapists: allTherapists, aba: { assignments: allAssignments, supervision: allSupervision } });
    }

    const role = safeString(req.user && req.user.role);
    const wantParent = isParentRole(role);
    const wantTherapist = isTherapistRole(role);
    const wantBcba = isBcbaRole(role);

    const outChildIds = new Set();
    const outParentIds = new Set();
    const outTherapistIds = new Set();

    const supervisionByAba = new Map();
    (allSupervision || []).forEach((s) => {
      const abaId = safeString(s && s.abaId).trim();
      const bcbaId = safeString(s && s.bcbaId).trim();
      if (abaId && bcbaId) supervisionByAba.set(abaId, bcbaId);
    });

    const assignmentsByChild = new Map();
    (allAssignments || []).forEach((a) => {
      const childId = safeString(a && a.childId).trim();
      const abaId = safeString(a && a.abaId).trim();
      const session = safeString(a && a.session).trim().toUpperCase();
      if (!childId || !abaId) return;
      const list = assignmentsByChild.get(childId) || [];
      list.push({ childId, session, abaId });
      assignmentsByChild.set(childId, list);
    });

    if (wantParent) {
      const meParent = pickDirectoryRecordForUser(req.user, allParents);
      if (!meParent) {
        return res.json({ ok: true, children: [], parents: [], therapists: [], aba: { assignments: [], supervision: [] }, unlinked: true });
      }

      const meParentId = safeString(meParent.id).trim();
      (allChildren || []).forEach((c) => {
        const childId = safeString(c && c.id).trim();
        if (!childId) return;
        if (!childHasParentId(c, meParentId)) return;
        outChildIds.add(childId);

        const parentList = Array.isArray(c && c.parents) ? c.parents : [];
        parentList.forEach((p) => {
          const pid = (typeof p === 'object' && p && p.id != null) ? safeString(p.id).trim() : safeString(p).trim();
          if (pid) outParentIds.add(pid);
        });

        const childAssignments = assignmentsByChild.get(childId) || [];
        childAssignments.forEach((a) => {
          if (a.abaId) outTherapistIds.add(a.abaId);
        });

        const rawAssigned = (c && (c.assignedABA || c.assigned_ABA || c.assigned)) || [];
        const assignedArr = Array.isArray(rawAssigned) ? rawAssigned : [rawAssigned];
        assignedArr.forEach((id) => {
          const tid = safeString(id).trim();
          if (tid) outTherapistIds.add(tid);
        });
      });

      Array.from(outTherapistIds).forEach((abaId) => {
        const bcbaId = supervisionByAba.get(abaId);
        if (bcbaId) outTherapistIds.add(bcbaId);
      });
    } else if (wantTherapist) {
      const meTherapist = pickDirectoryRecordForUser(req.user, allTherapists);
      if (!meTherapist) {
        return res.json({ ok: true, children: [], parents: [], therapists: [], aba: { assignments: [], supervision: [] }, unlinked: true });
      }

      const meTherapistId = safeString(meTherapist.id).trim();
      if (meTherapistId) outTherapistIds.add(meTherapistId);

      if (wantBcba) {
        (allSupervision || []).forEach((s) => {
          if (safeString(s && s.bcbaId).trim() === meTherapistId) {
            const abaId = safeString(s && s.abaId).trim();
            if (abaId) outTherapistIds.add(abaId);
          }
        });
      } else {
        const bcbaId = supervisionByAba.get(meTherapistId) || safeString(meTherapist.supervisedBy || meTherapist.supervised_by).trim();
        if (bcbaId) outTherapistIds.add(bcbaId);
      }

      (allAssignments || []).forEach((a) => {
        const childId = safeString(a && a.childId).trim();
        const abaId = safeString(a && a.abaId).trim();
        if (!childId || !abaId) return;
        if (wantBcba) {
          if (outTherapistIds.has(abaId) && abaId !== meTherapistId) outChildIds.add(childId);
        } else {
          if (abaId === meTherapistId) outChildIds.add(childId);
        }
      });

      (allChildren || []).forEach((c) => {
        const childId = safeString(c && c.id).trim();
        if (!childId || !outChildIds.has(childId)) return;

        const parentList = Array.isArray(c && c.parents) ? c.parents : [];
        parentList.forEach((p) => {
          const pid = (typeof p === 'object' && p && p.id != null) ? safeString(p.id).trim() : safeString(p).trim();
          if (pid) outParentIds.add(pid);
        });

        const childAssignments = assignmentsByChild.get(childId) || [];
        childAssignments.forEach((aa) => {
          if (aa.abaId) outTherapistIds.add(aa.abaId);
        });
      });

      Array.from(outTherapistIds).forEach((abaId) => {
        const bcbaId = supervisionByAba.get(abaId);
        if (bcbaId) outTherapistIds.add(bcbaId);
      });
    } else {
      return res.json({ ok: true, children: [], parents: [], therapists: [], aba: { assignments: [], supervision: [] } });
    }

    const children = (allChildren || []).filter((c) => {
      const id = safeString(c && c.id).trim();
      return id && outChildIds.has(id);
    });
    const parents = (allParents || []).filter((p) => {
      const id = safeString(p && p.id).trim();
      return id && outParentIds.has(id);
    });
    const therapists = (allTherapists || []).filter((t) => {
      const id = safeString(t && t.id).trim();
      return id && outTherapistIds.has(id);
    });

    const abaAssignments = (allAssignments || []).filter((a) => {
      const childId = safeString(a && a.childId).trim();
      const abaId = safeString(a && a.abaId).trim();
      return childId && abaId && outChildIds.has(childId) && outTherapistIds.has(abaId);
    });
    const abaSupervision = (allSupervision || []).filter((s) => {
      const abaId = safeString(s && s.abaId).trim();
      const bcbaId = safeString(s && s.bcbaId).trim();
      return abaId && bcbaId && outTherapistIds.has(abaId) && outTherapistIds.has(bcbaId);
    });

    return res.json({ ok: true, children, parents, therapists, aba: { assignments: abaAssignments, supervision: abaSupervision } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/api/directory/merge', authMiddleware, requireAdmin, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const children = Array.isArray(body.children) ? body.children : [];
  const parents = Array.isArray(body.parents) ? body.parents : [];
  const therapists = Array.isArray(body.therapists) ? body.therapists : [];

  function normalize(items) {
    const out = [];
    for (const it of items) {
      if (!it || typeof it !== 'object') continue;
      const id = it.id != null ? String(it.id).trim() : '';
      if (!id) continue;
      out.push({ id, item: { ...it, id } });
    }
    return out;
  }

  const c = normalize(children);
  const p = normalize(parents);
  const t = normalize(therapists);
  const now = nowISO();

  const upsertChild = db.prepare(
    'INSERT INTO directory_children (id, data_json, created_at, updated_at) VALUES (?,?,?,?)\n' +
    'ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at'
  );
  const upsertParent = db.prepare(
    'INSERT INTO directory_parents (id, data_json, created_at, updated_at) VALUES (?,?,?,?)\n' +
    'ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at'
  );
  const upsertTherapist = db.prepare(
    'INSERT INTO directory_therapists (id, data_json, created_at, updated_at) VALUES (?,?,?,?)\n' +
    'ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at'
  );

  const tx = db.transaction(() => {
    for (const row of c) upsertChild.run(row.id, JSON.stringify(row.item), now, now);
    for (const row of p) upsertParent.run(row.id, JSON.stringify(row.item), now, now);
    for (const row of t) upsertTherapist.run(row.id, JSON.stringify(row.item), now, now);

    rebuildAbaRelationshipsFromDirectorySqlite(now);
  });

  try {
    tx();
    return res.json({ ok: true, upserted: { children: c.length, parents: p.length, therapists: t.length } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// ABA relationship maintenance (admin-only)
app.post('/api/aba/refresh', authMiddleware, requireAdmin, (req, res) => {
  const now = nowISO();
  try {
    const tx = db.transaction(() => rebuildAbaRelationshipsFromDirectorySqlite(now));
    const rebuilt = tx();
    return res.json({ ok: true, rebuilt });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Org settings (arrival/business location). Readable by any authed user; writable by admins.
app.get('/api/org-settings', authMiddleware, (req, res) => {
  try {
    const row = db.prepare('SELECT data_json FROM org_settings WHERE id = ?').get('default');
    let item = null;
    if (row && row.data_json) {
      try { item = JSON.parse(String(row.data_json)); } catch (e) { item = null; }
    }
    return res.json({ ok: true, item });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.put('/api/org-settings', authMiddleware, requireAdmin, (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const address = payload.address != null ? String(payload.address) : '';
  const lat = payload.lat != null ? Number(payload.lat) : null;
  const lng = payload.lng != null ? Number(payload.lng) : null;
  const dropZoneMiles = payload.dropZoneMiles != null ? Number(payload.dropZoneMiles) : null;
  const orgArrivalEnabled = (typeof payload.orgArrivalEnabled === 'boolean') ? payload.orgArrivalEnabled : null;

  const item = {
    address,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    dropZoneMiles: Number.isFinite(dropZoneMiles) ? dropZoneMiles : null,
    orgArrivalEnabled: orgArrivalEnabled,
  };
  const now = nowISO();

  try {
    db.prepare(
      'INSERT INTO org_settings (id, data_json, created_at, updated_at) VALUES (?,?,?,?)\n' +
      'ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at'
    ).run('default', JSON.stringify(item), now, now);
    return res.json({ ok: true, item });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Request logging (dev-friendly)
if (LOG_REQUESTS) {
  app.use((req, res, next) => {
    const startedAt = Date.now();
    const path = req.originalUrl || req.url;
    const method = (req.method || 'GET').toUpperCase();

    slog.debug('req', `${method} ${path}`, { hasAuth: !!(req.headers && req.headers.authorization) });

    res.on('finish', () => {
      const ms = Date.now() - startedAt;
      slog.info('req', `${method} ${path} -> ${res.statusCode} (${ms}ms)`);
    });

    next();
  });
}

// Auth
app.post('/api/auth/login', (req, res) => {
  const email = (req.body && req.body.email) ? String(req.body.email).trim().toLowerCase() : '';
  const password = (req.body && req.body.password) ? String(req.body.password) : '';
  if (!email || !password) return res.status(400).json({ ok: false, error: 'email and password required' });

  slog.debug('auth', 'Login attempt', { email: maskEmail(email) });

  // Treat emails case-insensitively (SQLite comparisons are case-sensitive by default).
  const row = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
  if (!row) return res.status(401).json({ ok: false, error: 'invalid credentials' });
  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) return res.status(401).json({ ok: false, error: 'invalid credentials' });

  if (!JWT_SECRET) return res.status(500).json({ ok: false, error: 'server missing BB_JWT_SECRET' });

  const user = userToClient(row);
  const token = signToken(user);
  slog.info('auth', 'Login success', { userId: user?.id, email: maskEmail(email) });
  res.json({ token, user });
});

// Password reset (request a reset code)
app.post('/api/auth/forgot-password', async (req, res) => {
  const email = (req.body && req.body.email) ? String(req.body.email).trim().toLowerCase() : '';
  if (!email) return res.status(400).json({ ok: false, error: 'email required' });
  if (!JWT_SECRET) return res.status(500).json({ ok: false, error: 'server missing BB_JWT_SECRET' });

  // Always return ok to avoid account enumeration.
  try {
    const row = db.prepare('SELECT id,email FROM users WHERE lower(email) = ?').get(email);
    if (row && row.id) {
      const resetCode = generateResetCode();
      const tokenHash = hashResetCode(resetCode);
      const createdAt = nowISO();
      const expiresAt = new Date(Date.now() + (PASSWORD_RESET_TTL_MINUTES * 60 * 1000)).toISOString();

      try {
        db.prepare('INSERT INTO password_resets (id, user_id, token_hash, expires_at, used_at, created_at) VALUES (?,?,?,?,?,?)')
          .run(nanoId(), String(row.id), tokenHash, expiresAt, null, createdAt);
      } catch (e) {
        // Non-fatal: still attempt delivery.
      }

      // Try to deliver via email if configured; otherwise log.
      try {
        if (passwordResetEmailConfigured()) {
          await sendPasswordResetEmail({ to: email, code: resetCode });
        } else {
          slog.warn('auth', 'Password reset requested but SMTP not configured; logging reset code', { email: maskEmail(email), resetCode });
        }
      } catch (e) {
        slog.error('auth', 'Password reset delivery failed', { email: maskEmail(email), message: e?.message || String(e) });
        // Fall back to logging for internal/dev convenience.
        slog.warn('auth', 'Password reset code (fallback)', { email: maskEmail(email), resetCode });
      }

      const payload = { ok: true };
      if (RETURN_PASSWORD_RESET_CODE) payload.resetCode = resetCode;
      return res.json(payload);
    }
  } catch (e) {
    // ignore
  }

  return res.json({ ok: true });
});

// Password reset (consume code and set a new password)
app.post('/api/auth/reset-password', (req, res) => {
  const email = (req.body && req.body.email) ? String(req.body.email).trim().toLowerCase() : '';
  const resetCode = (req.body && (req.body.resetCode || req.body.code || req.body.token)) ? String(req.body.resetCode || req.body.code || req.body.token).trim() : '';
  const newPassword = (req.body && req.body.newPassword) ? String(req.body.newPassword) : '';
  if (!email || !resetCode || !newPassword) return res.status(400).json({ ok: false, error: 'email, resetCode, newPassword required' });
  if (String(newPassword).length < 6) return res.status(400).json({ ok: false, error: 'password must be at least 6 characters' });
  if (!JWT_SECRET) return res.status(500).json({ ok: false, error: 'server missing BB_JWT_SECRET' });

  try {
    const user = db.prepare('SELECT id,email FROM users WHERE lower(email) = ?').get(email);
    if (!user || !user.id) return res.status(400).json({ ok: false, error: 'invalid code' });

    const tokenHash = hashResetCode(resetCode);
    const now = nowISO();
    const row = db.prepare(
      'SELECT * FROM password_resets WHERE user_id = ? AND token_hash = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1'
    ).get(String(user.id), tokenHash, now);

    if (!row) return res.status(400).json({ ok: false, error: 'invalid or expired code' });

    const hash = bcrypt.hashSync(newPassword, 12);
    const tx = db.transaction(() => {
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, now, String(user.id));
      db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(now, String(row.id));
    });
    tx();

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/api/auth/google', async (req, res) => {
  const idToken = (req.body && req.body.idToken) ? String(req.body.idToken).trim() : '';
  if (!idToken) return res.status(400).json({ ok: false, error: 'idToken required' });
  if (!JWT_SECRET) return res.status(500).json({ ok: false, error: 'server missing BB_JWT_SECRET' });

  if (!GOOGLE_CLIENT_IDS || !googleClient) {
    return res.status(501).json({ ok: false, error: 'Google sign-in is not configured on this server (set BB_GOOGLE_CLIENT_IDS)' });
  }

  try {
    const audience = GOOGLE_CLIENT_IDS.split(',').map((s) => s.trim()).filter(Boolean);
    const ticket = await googleClient.verifyIdToken({ idToken, audience });
    const payload = ticket && ticket.getPayload ? ticket.getPayload() : null;
    const email = payload && payload.email ? String(payload.email).trim().toLowerCase() : '';
    const name = payload && (payload.name || payload.given_name) ? String(payload.name || payload.given_name).trim() : '';

    if (!email) return res.status(400).json({ ok: false, error: 'Google token missing email' });

    let row = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
    if (!row) {
      const id = nanoId();
      const t = nowISO();
      // Users created via Google still need a password_hash due to schema constraints.
      // Generate an unguessable random hash.
      const randomSecret = `${nanoId()}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      const hash = bcrypt.hashSync(randomSecret, 12);
      try {
        db.prepare('INSERT INTO users (id,email,password_hash,name,phone,address,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(id, email, hash, name || 'User', '', '', 'parent', t, t);
        row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      } catch (e) {
        // If a duplicate email slipped in (race, older DB collation), fall back to the existing account.
        row = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
      }
    }

    const user = userToClient(row);
    const token = signToken(user);
    return res.json({ ok: true, token, user });
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'invalid Google token' });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.put('/api/auth/me', authMiddleware, (req, res) => {
  const name = (req.body && req.body.name != null) ? String(req.body.name).trim() : undefined;
  const email = (req.body && req.body.email != null) ? String(req.body.email).trim().toLowerCase() : undefined;
  const avatarRaw = (req.body && req.body.avatar != null) ? String(req.body.avatar).trim() : undefined;
  const phoneRaw = (req.body && req.body.phone != null) ? String(req.body.phone).trim() : undefined;
  const address = (req.body && req.body.address != null) ? String(req.body.address).trim() : undefined;
  const newPassword = (req.body && req.body.password != null) ? String(req.body.password) : undefined;

  if (name !== undefined && !name) return res.status(400).json({ ok: false, error: 'name cannot be empty' });
  if (email !== undefined && !email) return res.status(400).json({ ok: false, error: 'email cannot be empty' });

  let avatar = avatarRaw;
  if (avatar !== undefined) {
    if (!avatar) avatar = '';
    // Allow:
    // - absolute URLs (http/https)
    // - local uploads served by this API (/uploads/...)
    const ok = avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('/uploads/');
    if (!ok) return res.status(400).json({ ok: false, error: 'avatar must be a valid URL or /uploads/... path' });
    if (avatar.length > 2048) return res.status(400).json({ ok: false, error: 'avatar URL too long' });
  }

  let phone = phoneRaw;
  if (phone !== undefined) {
    if (!phone) phone = '';
    else {
      const normalized = normalizeE164Phone(phone);
      if (!normalized) {
        return res.status(400).json({ ok: false, error: 'phone must be in E.164 format (e.g. +15551234567)' });
      }
      phone = normalized;
    }
  }

  if (newPassword !== undefined) {
    if (!String(newPassword).trim()) return res.status(400).json({ ok: false, error: 'password cannot be empty' });
    if (String(newPassword).length < 6) return res.status(400).json({ ok: false, error: 'password must be at least 6 characters' });
  }

  try {
    const userId = String(req.user.id);

    if (email !== undefined) {
      const existing = db.prepare('SELECT id FROM users WHERE lower(email) = ? AND id <> ?').get(email, userId);
      if (existing) return res.status(409).json({ ok: false, error: 'email already exists' });
    }

    const fields = [];
    const values = [];

    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (email !== undefined) { fields.push('email = ?'); values.push(email); }
    if (avatar !== undefined) { fields.push('avatar = ?'); values.push(avatar); }
    if (phone !== undefined) { fields.push('phone = ?'); values.push(phone); }
    if (address !== undefined) { fields.push('address = ?'); values.push(address); }
    if (newPassword !== undefined) {
      const hash = bcrypt.hashSync(newPassword, 12);
      fields.push('password_hash = ?');
      values.push(hash);
    }

    if (!fields.length) {
      return res.status(400).json({ ok: false, error: 'no fields to update' });
    }

    fields.push('updated_at = ?');
    values.push(nowISO());
    values.push(userId);

    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const row = db.prepare('SELECT id,email,name,avatar,phone,address,role FROM users WHERE id = ?').get(userId);
    if (!row) return res.status(404).json({ ok: false, error: 'user not found' });
    if (!JWT_SECRET) return res.status(500).json({ ok: false, error: 'server missing BB_JWT_SECRET' });

    const user = userToClient(row);
    const token = signToken(user);
    return res.json({ ok: true, token, user });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'update failed' });
  }
});

// Optional signup (off by default)
app.post('/api/auth/signup', async (req, res) => {
  if (!ALLOW_SIGNUP) return res.status(403).json({ ok: false, error: 'signup disabled' });

  const email = (req.body && req.body.email) ? String(req.body.email).trim().toLowerCase() : '';
  const password = (req.body && req.body.password) ? String(req.body.password) : '';
  const name = (req.body && req.body.name) ? String(req.body.name).trim() : '';
  const role = (req.body && req.body.role) ? String(req.body.role).trim() : 'parent';
  const twoFaMethod = (req.body && req.body.twoFaMethod) ? String(req.body.twoFaMethod).trim().toLowerCase() : 'email';
  const phone = (req.body && req.body.phone) ? String(req.body.phone).trim() : '';

  if (!email || !password || !name) return res.status(400).json({ ok: false, error: 'name, email, password required' });
  if (!JWT_SECRET) return res.status(500).json({ ok: false, error: 'server missing BB_JWT_SECRET' });

  const exists = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
  if (exists) return res.status(409).json({ ok: false, error: 'email already exists' });

  // If 2FA is required, validate delivery configuration before creating an account.
  if (REQUIRE_2FA_ON_SIGNUP) {
    const method = (twoFaMethod === 'sms' || twoFaMethod === 'email') ? twoFaMethod : 'email';
    if (method === 'sms') {
      if (!ENABLE_SMS_2FA) return res.status(400).json({ ok: false, error: 'SMS 2FA is currently disabled' });
      if (!twilioEnabled()) {
        return res.status(503).json({
          ok: false,
          error: '2FA SMS delivery is not configured (set BB_TWILIO_ACCOUNT_SID/BB_TWILIO_AUTH_TOKEN and BB_TWILIO_FROM or BB_TWILIO_MESSAGING_SERVICE_SID)',
        });
      }
    } else {
      if (!ENABLE_EMAIL_2FA) return res.status(400).json({ ok: false, error: 'Email 2FA is currently disabled' });
      if (!emailEnabled() && !DEBUG_2FA_RETURN_CODE) {
        return res.status(503).json({
          ok: false,
          error: '2FA email delivery is not configured (set BB_SMTP_URL and BB_EMAIL_FROM, and ensure BB_ENABLE_EMAIL_2FA=1)',
        });
      }
    }
  }

  const id = nanoId();
  const hash = bcrypt.hashSync(password, 12);
  const t = nowISO();
  try {
    db.prepare('INSERT INTO users (id,email,password_hash,name,phone,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, email, hash, name, phone, role, t, t);
  } catch (e) {
    // If a duplicate email got created concurrently, return a consistent error.
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('unique') || msg.includes('constraint')) {
      return res.status(409).json({ ok: false, error: 'email already exists' });
    }
    return res.status(500).json({ ok: false, error: e?.message || 'signup failed' });
  }

  const user = { id, email, name, role };

  // For end-to-end testing, default to requiring 2FA on signup.
  if (REQUIRE_2FA_ON_SIGNUP) {
    const method = (twoFaMethod === 'sms' || twoFaMethod === 'email') ? twoFaMethod : 'email';
    if (method === 'sms' && !ENABLE_SMS_2FA) {
      return res.status(400).json({ ok: false, error: 'SMS 2FA is currently disabled' });
    }
    if (method === 'email' && !ENABLE_EMAIL_2FA) {
      return res.status(400).json({ ok: false, error: 'Email 2FA is currently disabled' });
    }

    let destination = '';
    if (method === 'sms') {
      destination = normalizeE164Phone(phone);
      if (!destination) {
        return res.status(400).json({ ok: false, error: 'phone required for sms 2fa (E.164 format, e.g. +15551234567)' });
      }
    } else {
      destination = normalizeEmail(email);
      if (!destination) {
        return res.status(400).json({ ok: false, error: 'valid email required for email 2fa' });
      }
    }

    const ch = create2faChallenge({ userId: id, method, destination });
    slog.info('auth', '2FA challenge created (signup)', { method, to: maskDest(method, destination), userId: id });

    // Deliver the code (production/TestFlight). Only log/return the code when explicitly enabled.
    if (DEBUG_2FA_RETURN_CODE) {
      slog.debug('auth', '2FA code (dev)', { challengeId: ch.challengeId, code: ch.code });
    } else {
      try {
        await deliver2faCode({ method, destination, code: ch.code });
        slog.info('auth', '2FA code delivered', { method, to: maskDest(method, destination), challengeId: ch.challengeId });
      } catch (e) {
        // Roll back created user on delivery failure to avoid orphan accounts.
        try { db.prepare('DELETE FROM users WHERE id = ?').run(id); } catch (_) {}
        try { twoFaChallenges.delete(ch.challengeId); } catch (_) {}
        slog.error('auth', '2FA delivery failed', { method, to: maskDest(method, destination), message: e?.message || String(e) });
        const payload = { ok: false, error: '2FA delivery failed; contact support' };
        if (DEBUG_2FA_DELIVERY_ERRORS) payload.debug = (e?.message || String(e));
        return res.status(500).json(payload);
      }
    }

    const payload = {
      ok: true,
      user,
      requires2fa: true,
      method,
      to: maskDest(method, destination),
      challengeId: ch.challengeId,
    };
    if (DEBUG_2FA_RETURN_CODE) payload.devCode = ch.code;
    return res.status(201).json(payload);
  }

  const token = signToken(user);
  return res.status(201).json({ token, user, requires2fa: false });
});

// Verify 2FA challenge and mint an auth token.
app.post('/api/auth/2fa/verify', (req, res) => {
  const challengeId = (req.body && req.body.challengeId) ? String(req.body.challengeId).trim() : '';
  const code = (req.body && req.body.code) ? String(req.body.code).trim() : '';
  if (!challengeId || !code) return res.status(400).json({ ok: false, error: 'challengeId and code required' });

  const result = consume2faChallenge(challengeId, code);
  if (!result.ok) return res.status(401).json({ ok: false, error: result.error || 'verification failed' });

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(result.userId);
  if (!row) return res.status(404).json({ ok: false, error: 'user not found' });
  if (!JWT_SECRET) return res.status(500).json({ ok: false, error: 'server missing BB_JWT_SECRET' });

  const user = userToClient(row);
  const token = signToken(user);
  slog.info('auth', '2FA verified; token issued', { userId: user?.id, method: result.method });
  return res.json({ ok: true, token, user });
});

// Resend SMS 2FA code with a cooldown.
app.post('/api/auth/2fa/resend', async (req, res) => {
  const challengeId = (req.body && req.body.challengeId) ? String(req.body.challengeId).trim() : '';
  if (!challengeId) return res.status(400).json({ ok: false, error: 'challengeId required' });

  const updated = resend2faChallenge(challengeId);
  if (!updated.ok) {
    const status = updated.status || 400;
    const payload = { ok: false, error: updated.error || 'resend failed' };
    if (updated.retryAfterSec) payload.retryAfterSec = updated.retryAfterSec;
    return res.status(status).json(payload);
  }

  if (DEBUG_2FA_RETURN_CODE) {
    slog.debug('auth', '2FA code resent (dev)', { challengeId, code: updated.code });
    return res.json({ ok: true, method: updated.method, to: maskDest(updated.method, updated.destination), challengeId, devCode: updated.code });
  }

  try {
    await deliver2faCode({ method: updated.method, destination: updated.destination, code: updated.code });
    slog.info('auth', '2FA code resent', { method: updated.method, to: maskDest(updated.method, updated.destination), challengeId });
    return res.json({ ok: true, method: updated.method, to: maskDest(updated.method, updated.destination), challengeId });
  } catch (e) {
    slog.error('auth', '2FA resend failed', { method: updated.method, to: maskDest(updated.method, updated.destination), message: e?.message || String(e) });
    const payload = { ok: false, error: '2FA delivery failed; contact support' };
    if (DEBUG_2FA_DELIVERY_ERRORS) payload.debug = (e?.message || String(e));
    return res.status(500).json(payload);
  }
});

// Board / Posts
app.get('/api/board', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM posts ORDER BY datetime(created_at) DESC').all();

  // Attach the latest avatar URL from the users table (author_json may be a snapshot).
  let avatarByUserId = {};
  try {
    const authorIds = Array.from(
      new Set(
        rows
          .map((r) => {
            const a = safeJsonParse(r.author_json, null);
            return a && a.id ? String(a.id) : '';
          })
          .filter(Boolean)
      )
    );

    if (authorIds.length) {
      const placeholders = authorIds.map(() => '?').join(',');
      const urows = db.prepare(`SELECT id, avatar FROM users WHERE id IN (${placeholders})`).all(...authorIds);
      avatarByUserId = (urows || []).reduce((acc, u) => {
        const id = u && u.id ? String(u.id) : '';
        if (id) acc[id] = u && u.avatar ? String(u.avatar) : '';
        return acc;
      }, {});
    }
  } catch (e) {
    // ignore; fallback to pravatar client-side
  }

  const out = rows.map((r) => {
    let author = safeJsonParse(r.author_json, null);
    if (author && author.id) {
      const a = avatarByUserId[String(author.id)] || '';
      if (a) author = { ...author, avatar: a };
    }
    const comments = safeJsonParse(r.comments_json, []);
    return {
      id: r.id,
      author,
      title: r.title || '',
      body: r.body || '',
      text: r.body || '',
      image: r.image || undefined,
      likes: r.likes || 0,
      shares: r.shares || 0,
      comments,
      createdAt: r.created_at,
    };
  });
  res.json(out);
});

app.post('/api/board', authMiddleware, (req, res) => {
  const title = (req.body && req.body.title) ? String(req.body.title) : '';
  const body = (req.body && (req.body.body || req.body.text)) ? String(req.body.body || req.body.text) : '';
  const image = (req.body && req.body.image) ? String(req.body.image) : null;

  const id = nanoId();
  const t = nowISO();
  const author = req.user ? { id: req.user.id, name: req.user.name, avatar: req.user.avatar || '' } : null;
  db.prepare('INSERT INTO posts (id, author_json, title, body, image, likes, shares, comments_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(id, JSON.stringify(author), title, body, image, 0, 0, JSON.stringify([]), t, t);

  res.status(201).json({
    id,
    author,
    title,
    body,
    text: body,
    image: image || undefined,
    likes: 0,
    shares: 0,
    comments: [],
    createdAt: t,
  });
});

app.post('/api/board/like', authMiddleware, (req, res) => {
  const postId = (req.body && req.body.postId) ? String(req.body.postId) : '';
  if (!postId) return res.status(400).json({ ok: false, error: 'postId required' });
  db.prepare('UPDATE posts SET likes = likes + 1, updated_at = ? WHERE id = ?').run(nowISO(), postId);
  const row = db.prepare('SELECT likes, shares FROM posts WHERE id = ?').get(postId);
  return res.json({ id: postId, likes: Number(row?.likes) || 0, shares: Number(row?.shares) || 0 });
});

app.post('/api/board/share', authMiddleware, (req, res) => {
  const postId = (req.body && req.body.postId) ? String(req.body.postId) : '';
  if (!postId) return res.status(400).json({ ok: false, error: 'postId required' });
  db.prepare('UPDATE posts SET shares = shares + 1, updated_at = ? WHERE id = ?').run(nowISO(), postId);
  const row = db.prepare('SELECT likes, shares FROM posts WHERE id = ?').get(postId);
  return res.json({ id: postId, likes: Number(row?.likes) || 0, shares: Number(row?.shares) || 0 });
});

app.post('/api/board/comments', authMiddleware, (req, res) => {
  const postId = (req.body && req.body.postId) ? String(req.body.postId) : '';
  const raw = (req.body && req.body.comment) ? req.body.comment : null;
  if (!postId || raw == null) return res.status(400).json({ ok: false, error: 'postId and comment required' });

  const row = db.prepare('SELECT comments_json FROM posts WHERE id = ?').get(postId);
  if (!row) return res.status(404).json({ ok: false, error: 'post not found' });

  const comments = safeJsonParse(row.comments_json, []);

  const author = { id: req.user.id, name: req.user.name, avatar: req.user.avatar || '' };
  const createdAt = nowISO();

  let body = '';
  let parentId = null;
  let clientId = null;
  if (typeof raw === 'string') {
    body = raw;
  } else if (raw && typeof raw === 'object') {
    if (raw.body != null) body = String(raw.body);
    else if (raw.text != null) body = String(raw.text);
    parentId = raw.parentId ? String(raw.parentId) : null;
    clientId = raw.id ? String(raw.id) : null;
  }
  if (!body) return res.status(400).json({ ok: false, error: 'comment body required' });

  const makeBase = (id) => ({
    id,
    body,
    author,
    createdAt,
    reactions: {},
    userReactions: {},
  });

  let created = null;
  if (!parentId) {
    const id = clientId || nanoId();
    created = { ...makeBase(id), replies: [] };
    comments.push(created);
  } else {
    const parent = comments.find((c) => c && String(c.id) === String(parentId));
    if (!parent) return res.status(404).json({ ok: false, error: 'parent comment not found' });
    const id = clientId || nanoId();
    created = makeBase(id);
    parent.replies = Array.isArray(parent.replies) ? parent.replies : [];
    parent.replies.push(created);
  }

  db.prepare('UPDATE posts SET comments_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(comments), nowISO(), postId);
  slog.debug('api', 'Comment created', { postId, parentId: parentId || undefined, commentId: created?.id });
  return res.status(201).json(created);
});

// React to a comment (toggle per-user reactions)
app.post('/api/board/comments/react', authMiddleware, (req, res) => {
  const postId = (req.body && req.body.postId) ? String(req.body.postId) : '';
  const commentId = (req.body && req.body.commentId) ? String(req.body.commentId) : '';
  const emoji = (req.body && req.body.emoji) ? String(req.body.emoji) : '';
  if (!postId || !commentId || !emoji) return res.status(400).json({ ok: false, error: 'postId, commentId, emoji required' });

  const row = db.prepare('SELECT comments_json FROM posts WHERE id = ?').get(postId);
  if (!row) return res.status(404).json({ ok: false, error: 'post not found' });

  const comments = safeJsonParse(row.comments_json, []);
  const uid = req.user?.id ? String(req.user.id) : 'anonymous';

  const applyReaction = (c) => {
    if (!c || String(c.id) !== String(commentId)) return false;
    c.reactions = (c.reactions && typeof c.reactions === 'object') ? c.reactions : {};
    c.userReactions = (c.userReactions && typeof c.userReactions === 'object') ? c.userReactions : {};
    const prev = c.userReactions[uid];
    if (prev === emoji) {
      c.reactions[emoji] = Math.max(0, Number(c.reactions[emoji] || 1) - 1);
      delete c.userReactions[uid];
    } else {
      if (prev) c.reactions[prev] = Math.max(0, Number(c.reactions[prev] || 1) - 1);
      c.reactions[emoji] = Number(c.reactions[emoji] || 0) + 1;
      c.userReactions[uid] = emoji;
    }
    return true;
  };

  let updated = null;
  for (const c of comments) {
    if (applyReaction(c)) { updated = c; break; }
    if (Array.isArray(c?.replies)) {
      for (const r of c.replies) {
        if (applyReaction(r)) { updated = r; break; }
      }
      if (updated) break;
    }
  }
  if (!updated) return res.status(404).json({ ok: false, error: 'comment not found' });

  db.prepare('UPDATE posts SET comments_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(comments), nowISO(), postId);
  slog.debug('api', 'Comment reacted', { postId, commentId, emoji });
  return res.json(updated);
});

// Messages / Chats
app.get('/api/messages', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM messages ORDER BY datetime(created_at) ASC').all();
  const parsed = rows.map((r) => {
    const sender = safeJsonParse(r.sender_json, null);
    const to = safeJsonParse(r.to_json, []);
    return {
      id: r.id,
      threadId: r.thread_id || undefined,
      body: r.body,
      sender,
      to,
      createdAt: r.created_at,
    };
  });

  // Overlay latest avatars so identity stays correct even if profile avatars change.
  try {
    const ids = new Set();
    for (const m of parsed) {
      if (m?.sender?.id) ids.add(String(m.sender.id));
      if (Array.isArray(m?.to)) {
        for (const t of m.to) {
          if (t?.id) ids.add(String(t.id));
        }
      }
    }
    const idList = Array.from(ids);
    if (idList.length) {
      const placeholders = idList.map(() => '?').join(',');
      const urows = db.prepare(`SELECT id, avatar FROM users WHERE id IN (${placeholders})`).all(...idList);
      const avatarById = new Map(urows.map((u) => [String(u.id), u.avatar]));
      for (const m of parsed) {
        if (m?.sender?.id) {
          const a = avatarById.get(String(m.sender.id));
          if (a) m.sender = { ...m.sender, avatar: a };
        }
        if (Array.isArray(m?.to)) {
          m.to = m.to.map((t) => {
            if (!t?.id) return t;
            const a = avatarById.get(String(t.id));
            return a ? { ...t, avatar: a } : t;
          });
        }
      }
    }
  } catch (e) {
    // Non-fatal: messages still return without avatar overlay.
  }

  res.json(parsed);
});

app.post('/api/messages', authMiddleware, (req, res) => {
  const threadId = (req.body && (req.body.threadId || req.body.thread_id)) ? String(req.body.threadId || req.body.thread_id) : null;
  const body = (req.body && req.body.body) ? String(req.body.body) : '';
  const to = (req.body && Array.isArray(req.body.to)) ? req.body.to : [];
  if (!body) return res.status(400).json({ ok: false, error: 'body required' });

  const id = nanoId();
  const t = nowISO();
  const sender = req.user ? { id: req.user.id, name: req.user.name, avatar: req.user.avatar } : null;

  db.prepare('INSERT INTO messages (id, thread_id, body, sender_json, to_json, created_at) VALUES (?,?,?,?,?,?)')
    .run(id, threadId, body, JSON.stringify(sender), JSON.stringify(to), t);

  res.status(201).json({ id, threadId: threadId || undefined, body, sender, to, createdAt: t });
});

// Urgent memos
app.get('/api/urgent-memos', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM urgent_memos ORDER BY datetime(created_at) DESC').all();
  res.json(rows.map((r) => {
    const memo = safeJsonParse(r.memo_json, null);
    const base = (memo && typeof memo === 'object') ? memo : {};
    const createdAt = r.created_at;
    const title = r.title || base.title || base.subject || 'Urgent';
    const body = r.body || base.body || base.note || '';
    return {
      ...base,
      id: r.id,
      title,
      body,
      ack: Boolean(r.ack),
      status: r.status || base.status || undefined,
      respondedAt: r.responded_at || base.respondedAt || undefined,
      date: base.date || createdAt,
      createdAt,
    };
  }));
});

app.post('/api/urgent-memos', authMiddleware, (req, res) => {
  const payload = (req.body && typeof req.body === 'object') ? req.body : {};
  const id = payload.id ? String(payload.id) : nanoId();
  const t = nowISO();
  const title = payload.title ? String(payload.title) : (payload.subject ? String(payload.subject) : 'Urgent');
  const body = payload.body ? String(payload.body) : (payload.note ? String(payload.note) : '');
  const status = payload.status ? String(payload.status) : (payload.type === 'time_update' ? 'pending' : (payload.type ? 'sent' : null));
  const memoObj = { ...payload, id, title, body, createdAt: t, date: t, status: status || payload.status };

  db.prepare('INSERT OR REPLACE INTO urgent_memos (id, title, body, memo_json, status, responded_at, ack, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, title, body, JSON.stringify(memoObj), status, null, 0, t);
  slog.info('api', 'Urgent memo created', { memoId: id, type: memoObj.type, status: status || undefined });
  res.status(201).json(memoObj);
});

app.post('/api/urgent-memos/respond', authMiddleware, (req, res) => {
  const memoId = (req.body && (req.body.memoId || req.body.id)) ? String(req.body.memoId || req.body.id) : '';
  const action = (req.body && (req.body.action || req.body.status)) ? String(req.body.action || req.body.status) : '';
  if (!memoId || !action) return res.status(400).json({ ok: false, error: 'memoId and action required' });

  const row = db.prepare('SELECT * FROM urgent_memos WHERE id = ?').get(memoId);
  if (!row) return res.status(404).json({ ok: false, error: 'memo not found' });

  const t = nowISO();
  const memo = safeJsonParse(row.memo_json, null);
  const base = (memo && typeof memo === 'object') ? memo : {};
  const next = { ...base, id: memoId, status: action, respondedAt: t };

  db.prepare('UPDATE urgent_memos SET status = ?, responded_at = ?, memo_json = ? WHERE id = ?')
    .run(action, t, JSON.stringify(next), memoId);
  slog.info('api', 'Urgent memo responded', { memoId, action });
  return res.json({ ok: true, memo: next });
});

app.post('/api/urgent-memos/read', authMiddleware, (req, res) => {
  const ids = Array.isArray(req.body && req.body.memoIds) ? req.body.memoIds.map(String) : [];
  if (!ids.length) return res.json({ ok: true });
  const t = nowISO();
  const stmt = db.prepare('UPDATE urgent_memos SET ack = 1 WHERE id = ?');
  const tx = db.transaction((arr) => { arr.forEach((id) => stmt.run(id)); });
  tx(ids);
  res.json({ ok: true, updatedAt: t });
});

// Arrival pings (stores basic history)
app.post('/api/arrival/ping', authMiddleware, (req, res) => {
  const payload = req.body || {};
  const id = nanoId();
  const createdAt = nowISO();
  db.prepare('INSERT INTO arrival_pings (id, user_id, role, child_id, lat, lng, event_id, when_iso, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(
      id,
      payload.userId ? String(payload.userId) : (req.user ? String(req.user.id) : null),
      payload.role ? String(payload.role) : (req.user ? String(req.user.role) : null),
      payload.childId ? String(payload.childId) : null,
      Number.isFinite(Number(payload.lat)) ? Number(payload.lat) : null,
      Number.isFinite(Number(payload.lng)) ? Number(payload.lng) : null,
      payload.eventId ? String(payload.eventId) : null,
      payload.when ? String(payload.when) : null,
      createdAt
    );

  // Generate an admin-facing arrival alert (deduped) when a parent/therapist arrives.
  // Client already enforces schedule window and drop-zone check; the server stores a single alert
  // per user/child/shift within a short window to avoid spamming.
  try {
    const r = String(payload.role || (req.user ? req.user.role : '') || '').trim().toLowerCase();
    if (r === 'parent' || r === 'therapist') {
      const actorId = payload.userId ? String(payload.userId) : (req.user ? String(req.user.id) : '');
      const childId = payload.childId != null ? String(payload.childId) : null;
      const shiftId = payload.shiftId != null ? String(payload.shiftId) : null;
      const withinMins = 10;

      const recent = db.prepare(`
        SELECT id FROM urgent_memos
        WHERE type = 'arrival_alert'
          AND proposer_id = ?
          AND (child_id IS ? OR child_id = ?)
          AND (json_extract(meta_json, '$.shiftId') IS ? OR json_extract(meta_json, '$.shiftId') = ?)
          AND datetime(created_at) > datetime('now', ?)
        LIMIT 1
      `).get(
        actorId,
        childId, childId,
        shiftId, shiftId,
        `-${withinMins} minutes`
      );

      if (!recent) {
        const alertId = nanoId();
        const t = nowISO();
        const meta = {
          lat: Number.isFinite(Number(payload.lat)) ? Number(payload.lat) : null,
          lng: Number.isFinite(Number(payload.lng)) ? Number(payload.lng) : null,
          distanceMiles: payload.distanceMiles != null ? Number(payload.distanceMiles) : null,
          dropZoneMiles: payload.dropZoneMiles != null ? Number(payload.dropZoneMiles) : null,
          eventId: payload.eventId ? String(payload.eventId) : null,
          shiftId: shiftId,
          when: payload.when ? String(payload.when) : null,
        };
        const title = r === 'therapist' ? 'Therapist Arrival' : 'Parent Arrival';
        const note = ''; // UI can derive display copy
        db.prepare(`
          INSERT INTO urgent_memos (
            id, type, status, proposer_id, actor_role, child_id, title, body, note, meta_json, ack, created_at, updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          alertId,
          'arrival_alert',
          'pending',
          actorId,
          r,
          childId,
          title,
          '',
          note,
          JSON.stringify(meta),
          0,
          t,
          t
        );

        // Push notify admins
        try {
          const adminIds = getAdminUserIds();
          const tokens = getPushTokensForUsers(adminIds, { kind: 'updates' });
          setTimeout(() => {
            sendExpoPush(tokens, {
              title,
              body: 'Arrival detected. Open Alerts.',
              data: { kind: 'arrival_alert', memoId: alertId, actorId, actorRole: r, childId },
            }).catch(() => {});
          }, 0);
        } catch (_) {
          // ignore
        }
      }
    }
  } catch (_) {
    // ignore alert generation failures
  }

  res.json({ ok: true });
});

// Time change proposals
app.get('/api/children/time-change-proposals', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM time_change_proposals ORDER BY datetime(created_at) DESC').all();
  res.json(rows.map((r) => ({
    id: r.id,
    childId: r.child_id,
    type: r.type,
    proposedISO: r.proposed_iso,
    note: r.note,
    proposerId: r.proposer_id,
    action: r.action,
    createdAt: r.created_at,
  })));
});

app.post('/api/children/propose-time-change', authMiddleware, (req, res) => {
  const id = nanoId();
  const p = req.body || {};
  const createdAt = nowISO();
  db.prepare('INSERT INTO time_change_proposals (id, child_id, type, proposed_iso, note, proposer_id, action, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(
      id,
      p.childId != null ? String(p.childId) : null,
      p.type ? String(p.type) : 'pickup',
      p.proposedISO ? String(p.proposedISO) : createdAt,
      p.note ? String(p.note) : '',
      p.proposerId != null ? String(p.proposerId) : (req.user ? String(req.user.id) : null),
      null,
      createdAt
    );
  res.status(201).json({ id, ...p, proposerId: p.proposerId != null ? String(p.proposerId) : (req.user ? String(req.user.id) : null), createdAt });
});

app.post('/api/children/respond-time-change', authMiddleware, (req, res) => {
  const proposalId = (req.body && req.body.proposalId) ? String(req.body.proposalId) : '';
  const action = (req.body && req.body.action) ? String(req.body.action) : '';
  if (!proposalId || !action) return res.status(400).json({ ok: false, error: 'proposalId and action required' });
  db.prepare('UPDATE time_change_proposals SET action = ? WHERE id = ?').run(action, proposalId);
  const row = db.prepare('SELECT * FROM time_change_proposals WHERE id = ?').get(proposalId);
  if (!row) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({
    ok: true,
    item: {
      id: row.id,
      childId: row.child_id,
      type: row.type,
      proposedISO: row.proposed_iso,
      note: row.note,
      proposerId: row.proposer_id,
      action: row.action,
      createdAt: row.created_at,
    },
  });
});

// Push tokens
app.post('/api/push/register', authMiddleware, (req, res) => {
  const token = (req.body && req.body.token) ? String(req.body.token) : '';
  const userId = (req.body && req.body.userId) ? String(req.body.userId) : (req.user ? String(req.user.id) : '');
  const platform = (req.body && req.body.platform) ? String(req.body.platform) : '';
  const enabled = (req.body && typeof req.body.enabled === 'boolean') ? (req.body.enabled ? 1 : 0) : 1;
  const preferences = (req.body && typeof req.body.preferences === 'object') ? req.body.preferences : {};

  if (!token) return res.status(400).json({ ok: false, error: 'token required' });

  const t = nowISO();
  db.prepare(`
    INSERT INTO push_tokens (token, user_id, platform, enabled, preferences_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET
      user_id=excluded.user_id,
      platform=excluded.platform,
      enabled=excluded.enabled,
      preferences_json=excluded.preferences_json,
      updated_at=excluded.updated_at
  `).run(token, userId, platform, enabled, JSON.stringify(preferences), t);

  res.json({ ok: true, stored: true });
});

app.post('/api/push/unregister', authMiddleware, (req, res) => {
  const token = (req.body && req.body.token) ? String(req.body.token) : '';
  if (!token) return res.status(400).json({ ok: false, error: 'token required' });
  db.prepare('DELETE FROM push_tokens WHERE token = ?').run(token);
  res.json({ ok: true, removed: true });
});

// Minimal compatibility endpoints for features not yet backed
app.post('/api/media/sign', authMiddleware, (req, res) => {
  const key = (req.body && req.body.key) ? String(req.body.key) : `uploads/${Date.now()}`;
  res.json({ url: `http://localhost:9000/${key}`, fields: {}, key });
});

app.get('/api/link/preview', authMiddleware, (req, res) => {
  const url = (req.query && req.query.url) ? String(req.query.url) : '';
  res.json({ ok: true, url, title: url, description: '', image: '' });
});

// Media upload (local disk). The mobile app uses this when attaching an image to a post.
// Expects multipart/form-data with a `file` field.
app.post('/api/media/upload', authMiddleware, upload.single('file'), (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ ok: false, error: 'file required' });

  const relPath = `/uploads/${encodeURIComponent(f.filename)}`;
  const url = buildPublicUrl(req, relPath);

  res.status(201).json({
    ok: true,
    url,
    path: relPath,
    filename: f.filename,
    mimetype: f.mimetype,
    size: f.size,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[api] BuddyBoard API listening on :${PORT}`);
  console.log(`[api] DB: ${DB_PATH}`);
});

process.on('uncaughtException', (e) => {
  console.error('[api] Uncaught', e);
});
