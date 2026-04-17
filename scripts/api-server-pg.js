#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const multer = require('multer');

let twilioLib = null;
function getTwilioLib() {
  if (twilioLib) return twilioLib;
  try {
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
    // eslint-disable-next-line global-require
    nodemailerLib = require('nodemailer');
    return nodemailerLib;
  } catch (e) {
    return null;
  }
}

const PORT = Number(process.env.PORT || 3005);
const DATA_DIR = process.env.BB_DATA_DIR
  ? String(process.env.BB_DATA_DIR)
  : path.join(process.cwd(), '.data');
const DATABASE_URL = (process.env.BB_DATABASE_URL || process.env.DATABASE_URL || '').trim();

if (!DATABASE_URL) {
  // This file is only intended to run when BB_DATABASE_URL is configured.
  // The docker-compose entrypoint uses api-server.js for SQLite mode.
  // Keep this hard-fail to avoid silently running without persistence.
  // eslint-disable-next-line no-console
  console.error('[api] Missing BB_DATABASE_URL (or DATABASE_URL).');
  process.exit(1);
}

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
const REQUIRE_2FA_ON_SIGNUP = envFlag(process.env.BB_REQUIRE_2FA_ON_SIGNUP, false);
const DEBUG_2FA_RETURN_CODE = envFlag(process.env.BB_DEBUG_2FA_RETURN_CODE, false);
const DEBUG_2FA_DELIVERY_ERRORS = envFlag(process.env.BB_DEBUG_2FA_DELIVERY_ERRORS, false);
const LOG_REQUESTS = envFlag(process.env.BB_DEBUG_REQUESTS, true);

// 2FA delivery toggles
const ENABLE_EMAIL_2FA = envFlag(process.env.BB_ENABLE_EMAIL_2FA, true);
const ENABLE_SMS_2FA = envFlag(process.env.BB_ENABLE_SMS_2FA, false);

// 2FA delivery (SMS only).
const TWILIO_ACCOUNT_SID = (process.env.BB_TWILIO_ACCOUNT_SID || '').trim();
const TWILIO_AUTH_TOKEN = (process.env.BB_TWILIO_AUTH_TOKEN || '').trim();
const TWILIO_FROM = (process.env.BB_TWILIO_FROM || '').trim();
const TWILIO_MESSAGING_SERVICE_SID = (process.env.BB_TWILIO_MESSAGING_SERVICE_SID || '').trim();

// 2FA delivery (Email)
const SMTP_URL = (process.env.BB_SMTP_URL || '').trim();
const EMAIL_FROM = (process.env.BB_EMAIL_FROM || '').trim();
const EMAIL_2FA_SUBJECT = (process.env.BB_EMAIL_2FA_SUBJECT || 'BuddyBoard verification code').trim();
const EMAIL_PASSWORD_RESET_SUBJECT = (process.env.BB_EMAIL_PASSWORD_RESET_SUBJECT || 'BuddyBoard password reset').trim();

const RETURN_PASSWORD_RESET_CODE = envFlag(process.env.BB_RETURN_PASSWORD_RESET_CODE, NODE_ENV !== 'production');
const PASSWORD_RESET_TTL_MINUTES = Math.max(5, Number(process.env.BB_PASSWORD_RESET_TTL_MINUTES || 30));

const slog = require('./logger');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

ensureDir(DATA_DIR);

const UPLOAD_DIR = process.env.BB_UPLOAD_DIR
  ? String(process.env.BB_UPLOAD_DIR)
  : path.join(DATA_DIR, 'uploads');

ensureDir(UPLOAD_DIR);

function nowISO() {
  return new Date().toISOString();
}

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const s = String(value);
  // If it looks like an ISO string already, keep it.
  if (s.includes('T') && s.endsWith('Z')) return s;
  return s;
}

function nanoId() {
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeEmail(input) {
  const e = String(input || '').trim().toLowerCase();
  return e.includes('@') ? e : '';
}

function jsonb(value) {
  if (value == null) return null;
  return JSON.stringify(value);
}

function maskEmail(email) {
  const e = String(email || '');
  const at = e.indexOf('@');
  if (at <= 1) return '***';
  return `${e.slice(0, 1)}***${e.slice(at)}`;
}

function safeString(v) {
  try {
    if (v == null) return '';
    return String(v);
  } catch (_) {
    return '';
  }
}

function roleLower(u) {
  try { return String(u && u.role ? u.role : '').trim().toLowerCase(); } catch (_) { return ''; }
}

function isAdminUser(u) {
  const r = roleLower(u);
  return r === 'admin' || r === 'administrator';
}

function hasExpoPushToken(token) {
  const t = safeString(token).trim();
  return t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken[');
}

function pushPrefAllows(preferences, kind) {
  if (!preferences || typeof preferences !== 'object') return true;
  const keys = Object.keys(preferences);
  if (!keys.length) return true;
  if (kind === 'updates') return Boolean(preferences.updates ?? preferences.other ?? true);
  if (kind === 'other') return Boolean(preferences.other ?? preferences.updates ?? true);
  return true;
}

function normalizeE164Phone(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const cleaned = raw.replace(/[\s\-().]/g, '');
  if (!cleaned.startsWith('+')) return '';
  if (!/^\+[1-9]\d{7,14}$/.test(cleaned)) return '';
  return cleaned;
}

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

let emailTransport = null;
function getEmailTransport() {
  if (!emailEnabled()) return null;
  if (emailTransport) return emailTransport;
  const nodemailer = getNodemailerLib();
  if (!nodemailer) {
    throw new Error("Missing dependency 'nodemailer' in this server build. Rebuild your Docker image after installing dependencies (npm ci) so the nodemailer package is included.");
  }
  emailTransport = nodemailer.createTransport(SMTP_URL);
  return emailTransport;
}

function maskDest(method, dest) {
  if (method === 'sms') {
    const d = String(dest || '');
    if (d.length <= 4) return '***';
    return `***${d.slice(-4)}`;
  }
  return maskEmail(dest);
}

async function deliver2faCode({ method, destination, code }) {
  if (method === 'sms') {
    const client = getTwilioClient();
    if (!client) throw new Error('SMS 2FA not configured');
    const msg = { body: `Your BuddyBoard verification code is ${code}` };
    if (TWILIO_MESSAGING_SERVICE_SID) msg.messagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
    else msg.from = TWILIO_FROM;
    msg.to = destination;
    await client.messages.create(msg);
    return;
  }

  const transport = getEmailTransport();
  if (!transport && !DEBUG_2FA_RETURN_CODE) throw new Error('Email 2FA not configured');
  if (!transport) return;

  await transport.sendMail({
    from: EMAIL_FROM,
    to: destination,
    subject: EMAIL_2FA_SUBJECT,
    text: `Your BuddyBoard verification code is ${code}`,
  });
}

// 2FA (in-memory)
const twoFaChallenges = new Map();
const TWOFA_CODE_TTL_MS = 10 * 60 * 1000;
const TWOFA_RESEND_COOLDOWN_MS = 30 * 1000;

function newOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function create2faChallenge({ userId, method, destination }) {
  const challengeId = nanoId();
  const now = Date.now();
  const code = newOtpCode();
  const ch = { challengeId, userId, method, destination, code, expiresAt: now + TWOFA_CODE_TTL_MS, attempts: 0, lastSentAt: now };
  twoFaChallenges.set(challengeId, ch);
  return ch;
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

// Dev compatibility token
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
    // eslint-disable-next-line no-console
    console.warn('[api] Missing BB_JWT_SECRET. Set this in server environment for production.');
  }
}

requireJwtConfigured();

function isPgUniqueViolation(e) {
  return String(e && e.code ? e.code : '') === '23505';
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function pgQueryOne(sql, params) {
  const result = await pool.query(sql, params);
  return result && Array.isArray(result.rows) ? result.rows[0] : null;
}

async function pgQueryAll(sql, params) {
  const result = await pool.query(sql, params);
  return result && Array.isArray(result.rows) ? result.rows : [];
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT,
      phone TEXT,
      address TEXT,
      role TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS directory_children (
      id TEXT PRIMARY KEY,
      data_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS directory_parents (
      id TEXT PRIMARY KEY,
      data_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS directory_therapists (
      id TEXT PRIMARY KEY,
      data_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    -- Normalized ABA relationships (derived from directory JSON).
    -- Supervision: ABA -> BCBA
    CREATE TABLE IF NOT EXISTS aba_supervision (
      aba_id TEXT PRIMARY KEY,
      bcba_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    -- Session-based child -> ABA assignment
    CREATE TABLE IF NOT EXISTS child_aba_assignments (
      child_id TEXT NOT NULL,
      session TEXT NOT NULL CHECK (session IN ('AM','PM')),
      aba_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (child_id, session)
    );

    CREATE TABLE IF NOT EXISTS org_settings (
      id TEXT PRIMARY KEY,
      data_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      author_json JSONB,
      title TEXT,
      body TEXT,
      image TEXT,
      likes INTEGER NOT NULL DEFAULT 0,
      shares INTEGER NOT NULL DEFAULT 0,
      comments_json JSONB,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT,
      body TEXT NOT NULL,
      sender_json JSONB,
      to_json JSONB,
      created_at TIMESTAMPTZ NOT NULL
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
      meta_json JSONB,
      memo_json JSONB,
      responded_at TIMESTAMPTZ,
      ack INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS time_change_proposals (
      id TEXT PRIMARY KEY,
      child_id TEXT,
      type TEXT,
      proposed_iso TEXT,
      note TEXT,
      proposer_id TEXT,
      action TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT,
      platform TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      preferences_json JSONB,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS arrival_pings (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      role TEXT,
      child_id TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      event_id TEXT,
      when_iso TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL
    );
  `);

  try {
    const dups = await pgQueryAll(
      'SELECT lower(email) AS email_lc, COUNT(*) AS c FROM users GROUP BY lower(email) HAVING COUNT(*) > 1',
      []
    );
    if (Array.isArray(dups) && dups.length) {
      slog.warn('db', 'Duplicate user emails detected; cannot enforce case-insensitive uniqueness until cleaned up', { duplicates: dups.length });
    } else {
      await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users ((lower(email)))');
    }
  } catch (e) {
    slog.warn('db', 'users lower(email) uniqueness index skipped', { message: e?.message || String(e) });
  }

  await pool.query('CREATE INDEX IF NOT EXISTS urgent_memos_created_at_idx ON urgent_memos (created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS urgent_memos_type_idx ON urgent_memos (type)');
  await pool.query('CREATE INDEX IF NOT EXISTS posts_created_at_idx ON posts (created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages (created_at ASC)');

  await pool.query('CREATE INDEX IF NOT EXISTS password_resets_user_id_idx ON password_resets (user_id)');

  await pool.query('CREATE INDEX IF NOT EXISTS aba_supervision_bcba_idx ON aba_supervision (bcba_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS child_aba_assignments_aba_idx ON child_aba_assignments (aba_id)');
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

function normalizeSession(value) {
  const s = safeString(value).trim().toUpperCase();
  if (s === 'AM' || s === 'PM') return s;
  return null;
}

function safeJsonObject(value) {
  try {
    if (!value) return null;
    if (typeof value === 'object') return value;
    return JSON.parse(String(value));
  } catch (_) {
    return null;
  }
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
      // No session info: default to AM.
      return [{ childId, session: 'AM', abaId: assigned[0] }];
    }

    // Two or more ids: treat first two as AM/PM pair.
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

async function rebuildAbaRelationshipsFromDirectoryPg(client) {
  const now = new Date();

  const therapistRows = await client.query('SELECT data_json FROM directory_therapists', []);
  const therapists = (therapistRows && Array.isArray(therapistRows.rows) ? therapistRows.rows : [])
    .map((r) => safeJsonObject(r.data_json))
    .filter(Boolean);

  const supervision = new Map();
  for (const t of therapists) {
    const abaId = normalizeId(t && t.id);
    const bcbaId = normalizeId(t && (t.supervisedBy || t.supervised_by));
    if (abaId && bcbaId) supervision.set(abaId, bcbaId);
  }

  const childRows = await client.query('SELECT data_json FROM directory_children', []);
  const children = (childRows && Array.isArray(childRows.rows) ? childRows.rows : [])
    .map((r) => safeJsonObject(r.data_json))
    .filter(Boolean);

  const assignments = new Map();
  for (const c of children) {
    const pairs = deriveChildAbaAssignments(c);
    for (const p of pairs) {
      assignments.set(`${p.childId}|${p.session}`, p);
    }
  }

  // Rebuild semantics: keep tables in sync with directory JSON.
  await client.query('DELETE FROM child_aba_assignments', []);
  await client.query('DELETE FROM aba_supervision', []);

  for (const [abaId, bcbaId] of supervision.entries()) {
    await client.query(
      `INSERT INTO aba_supervision (aba_id, bcba_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (aba_id) DO UPDATE SET bcba_id = EXCLUDED.bcba_id, updated_at = EXCLUDED.updated_at`,
      [abaId, bcbaId, now, now]
    );
  }

  for (const p of assignments.values()) {
    await client.query(
      `INSERT INTO child_aba_assignments (child_id, session, aba_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (child_id, session) DO UPDATE SET aba_id = EXCLUDED.aba_id, updated_at = EXCLUDED.updated_at`,
      [p.childId, p.session, p.abaId, now, now]
    );
  }

  return { supervision: supervision.size, assignments: assignments.size };
}

async function seedAdminUser() {
  try {
    if (!(ADMIN_EMAIL && ADMIN_PASSWORD)) return;
    const normalizedAdminEmail = String(ADMIN_EMAIL).trim().toLowerCase();
    const existing = await pgQueryOne('SELECT id FROM users WHERE lower(email) = $1', [normalizedAdminEmail]);
    if (existing) return;

    const id = nanoId();
    const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
    const t = new Date();

    await pool.query(
      'INSERT INTO users (id,email,password_hash,name,role,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, normalizedAdminEmail, hash, ADMIN_NAME, 'ADMIN', t, t]
    );
    // eslint-disable-next-line no-console
    console.log('[api] Seeded admin user:', normalizedAdminEmail);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[api] Admin seed failed:', e && e.message ? e.message : String(e));
  }
}

async function getAdminUserIds() {
  try {
    const rows = await pgQueryAll('SELECT id, role FROM users', []);
    const ids = [];
    for (const r of rows) {
      const role = safeString(r.role).trim().toLowerCase();
      if (role === 'admin' || role === 'administrator') ids.push(String(r.id));
    }
    ids.push('dev');
    return Array.from(new Set(ids.filter(Boolean)));
  } catch (_) {
    return ['dev'];
  }
}

async function getPushTokensForUsers(userIds, { kind } = {}) {
  try {
    if (!Array.isArray(userIds) || !userIds.length) return [];
    const rows = await pgQueryAll(
      'SELECT token, enabled, preferences_json FROM push_tokens WHERE enabled = 1 AND user_id = ANY($1::text[])',
      [userIds.map(String)]
    );

    const out = [];
    for (const row of rows) {
      const token = safeString(row.token).trim();
      if (!token) continue;
      const prefs = row.preferences_json && typeof row.preferences_json === 'object' ? row.preferences_json : {};
      if (kind && !pushPrefAllows(prefs, kind)) continue;
      out.push(token);
    }
    return Array.from(new Set(out));
  } catch (_) {
    return [];
  }
}

async function deletePushTokens(tokens) {
  try {
    if (!Array.isArray(tokens) || !tokens.length) return 0;
    const unique = Array.from(new Set(tokens.map((t) => safeString(t).trim()))).filter(Boolean);
    if (!unique.length) return 0;
    const info = await pool.query('DELETE FROM push_tokens WHERE token = ANY($1::text[])', [unique]);
    return Number(info && typeof info.rowCount === 'number' ? info.rowCount : 0);
  } catch (_) {
    return 0;
  }
}

function shouldDeleteTokenForExpoError(expoTicket) {
  try {
    if (!expoTicket || expoTicket.status !== 'error') return false;
    const details = expoTicket.details && typeof expoTicket.details === 'object' ? expoTicket.details : {};
    const code = safeString(details.error).trim();
    return code === 'DeviceNotRegistered' || code === 'InvalidExpoPushToken';
  } catch (_) {
    return false;
  }
}

async function sendExpoPush(tokens, { title, body, data } = {}) {
  try {
    if (!Array.isArray(tokens) || !tokens.length) return { ok: true, skipped: true, reason: 'no-tokens' };
    if (typeof fetch !== 'function') {
      // eslint-disable-next-line no-console
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

    try {
      const tickets = json && Array.isArray(json.data) ? json.data : null;
      if (resp.ok && tickets && tickets.length === messages.length) {
        const tokensToDelete = [];
        for (let i = 0; i < tickets.length; i += 1) {
          if (shouldDeleteTokenForExpoError(tickets[i])) tokensToDelete.push(messages[i].to);
        }
        const deleted = await deletePushTokens(tokensToDelete);
        if (deleted) console.log(`[api] push cleanup: deleted ${deleted} invalid token(s)`);
      }
    } catch (_) {
      // ignore
    }

    return { ok: resp.ok, status: resp.status, expo: json };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[api] push send failed', e && e.message ? e.message : String(e));
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));

// Serve uploads
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
  limits: { fileSize: 15 * 1024 * 1024 },
});

async function authMiddleware(req, res, next) {
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

    const row = await pgQueryOne('SELECT id,email,name,avatar,phone,address,role FROM users WHERE id = $1', [userId]);
    if (!row) return res.status(401).json({ ok: false, error: 'user not found' });
    req.user = userToClient(row);
    return next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'invalid token' });
  }
}

function requireAdmin(req, res, next) {
  try {
    if (req.user && isAdminRole(req.user.role)) return next();
  } catch (e) {}
  return res.status(403).json({ ok: false, error: 'admin required' });
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

// Directory (Postgres-backed). Admin-only for now.
app.get('/api/directory', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const [childrenRows, parentRows, therapistRows, assignRows, supervisionRows] = await Promise.all([
      pgQueryAll('SELECT data_json FROM directory_children ORDER BY updated_at DESC', []),
      pgQueryAll('SELECT data_json FROM directory_parents ORDER BY updated_at DESC', []),
      pgQueryAll('SELECT data_json FROM directory_therapists ORDER BY updated_at DESC', []),
      pgQueryAll('SELECT child_id, session, aba_id FROM child_aba_assignments ORDER BY child_id ASC', []),
      pgQueryAll('SELECT aba_id, bcba_id FROM aba_supervision ORDER BY aba_id ASC', []),
    ]);
    const children = (childrenRows || []).map((r) => r.data_json).filter(Boolean);
    const parents = (parentRows || []).map((r) => r.data_json).filter(Boolean);
    const therapists = (therapistRows || []).map((r) => r.data_json).filter(Boolean);

    const aba = {
      assignments: (assignRows || []).map((r) => ({ childId: r.child_id, session: r.session, abaId: r.aba_id })),
      supervision: (supervisionRows || []).map((r) => ({ abaId: r.aba_id, bcbaId: r.bcba_id })),
    };

    return res.json({ ok: true, children, parents, therapists, aba });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Directory scope for the current user (safe for non-admins).
// Returns only:
// - Parent: their children + family parents + related therapists (ABAs/BCBAs)
// - Therapist: assigned children + related parents + supervisor/team therapists
app.get('/api/directory/me', authMiddleware, async (req, res) => {
  try {
    const [childrenRows, parentRows, therapistRows, assignRows, supervisionRows] = await Promise.all([
      pgQueryAll('SELECT data_json FROM directory_children ORDER BY updated_at DESC', []),
      pgQueryAll('SELECT data_json FROM directory_parents ORDER BY updated_at DESC', []),
      pgQueryAll('SELECT data_json FROM directory_therapists ORDER BY updated_at DESC', []),
      pgQueryAll('SELECT child_id, session, aba_id FROM child_aba_assignments ORDER BY child_id ASC', []),
      pgQueryAll('SELECT aba_id, bcba_id FROM aba_supervision ORDER BY aba_id ASC', []),
    ]);

    const allChildren = (childrenRows || []).map((r) => r.data_json).filter(Boolean);
    const allParents = (parentRows || []).map((r) => r.data_json).filter(Boolean);
    const allTherapists = (therapistRows || []).map((r) => r.data_json).filter(Boolean);

    const allAssignments = (assignRows || []).map((r) => ({ childId: r.child_id, session: r.session, abaId: r.aba_id }));
    const allSupervision = (supervisionRows || []).map((r) => ({ abaId: r.aba_id, bcbaId: r.bcba_id }));

    // Admins can still see everything; this keeps behavior safe within existing permissions.
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

      // Add supervising BCBAs for included ABAs.
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

      // Team logic: ABA includes supervisor; BCBA includes supervised ABAs.
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

      // Assigned children: for BCBA include children for ABAs they supervise; otherwise only children where ABA == me.
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

      // Include parents and other session therapists for those children.
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

      // Add supervising BCBAs for included ABAs.
      Array.from(outTherapistIds).forEach((abaId) => {
        const bcbaId = supervisionByAba.get(abaId);
        if (bcbaId) outTherapistIds.add(bcbaId);
      });
    } else {
      // Unknown role: return nothing.
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

app.post('/api/directory/merge', authMiddleware, requireAdmin, async (req, res) => {
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
  const now = new Date();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const row of c) {
      await client.query(
        `INSERT INTO directory_children (id, data_json, created_at, updated_at)
         VALUES ($1, $2::jsonb, $3, $4)
         ON CONFLICT (id) DO UPDATE SET data_json = EXCLUDED.data_json, updated_at = EXCLUDED.updated_at`,
        [row.id, JSON.stringify(row.item), now, now]
      );
    }
    for (const row of p) {
      await client.query(
        `INSERT INTO directory_parents (id, data_json, created_at, updated_at)
         VALUES ($1, $2::jsonb, $3, $4)
         ON CONFLICT (id) DO UPDATE SET data_json = EXCLUDED.data_json, updated_at = EXCLUDED.updated_at`,
        [row.id, JSON.stringify(row.item), now, now]
      );
    }
    for (const row of t) {
      await client.query(
        `INSERT INTO directory_therapists (id, data_json, created_at, updated_at)
         VALUES ($1, $2::jsonb, $3, $4)
         ON CONFLICT (id) DO UPDATE SET data_json = EXCLUDED.data_json, updated_at = EXCLUDED.updated_at`,
        [row.id, JSON.stringify(row.item), now, now]
      );
    }

    // Keep normalized ABA relationships in sync with directory JSON.
    await rebuildAbaRelationshipsFromDirectoryPg(client);

    await client.query('COMMIT');
    return res.json({ ok: true, upserted: { children: c.length, parents: p.length, therapists: t.length } });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (e2) {}
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  } finally {
    client.release();
  }
});

// ABA relationship maintenance (admin-only)
app.post('/api/aba/refresh', authMiddleware, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const counts = await rebuildAbaRelationshipsFromDirectoryPg(client);
    await client.query('COMMIT');
    return res.json({ ok: true, rebuilt: counts });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (e2) {}
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  } finally {
    client.release();
  }
});

// Org settings (arrival/business location). Readable by any authed user; writable by admins.
app.get('/api/org-settings', authMiddleware, async (req, res) => {
  try {
    const row = await pgQueryOne('SELECT data_json FROM org_settings WHERE id = $1', ['default']);
    const item = row && row.data_json ? row.data_json : null;
    return res.json({ ok: true, item });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.put('/api/org-settings', authMiddleware, requireAdmin, async (req, res) => {
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

  const now = new Date();
  try {
    await pool.query(
      `INSERT INTO org_settings (id, data_json, created_at, updated_at)
       VALUES ($1, $2::jsonb, $3, $4)
       ON CONFLICT (id) DO UPDATE SET data_json = EXCLUDED.data_json, updated_at = EXCLUDED.updated_at`,
      ['default', JSON.stringify(item), now, now]
    );
    return res.json({ ok: true, item });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

if (LOG_REQUESTS) {
  app.use((req, res, next) => {
    const startedAt = Date.now();
    const p = req.originalUrl || req.url;
    const method = (req.method || 'GET').toUpperCase();

    slog.debug('req', `${method} ${p}`, { hasAuth: !!(req.headers && req.headers.authorization) });

    res.on('finish', () => {
      const ms = Date.now() - startedAt;
      slog.info('req', `${method} ${p} -> ${res.statusCode} (${ms}ms)`);
    });

    next();
  });
}

// Auth
app.post('/api/auth/login', async (req, res) => {
  const email = (req.body && req.body.email) ? String(req.body.email).trim().toLowerCase() : '';
  const password = (req.body && req.body.password) ? String(req.body.password) : '';
  if (!email || !password) return res.status(400).json({ ok: false, error: 'email and password required' });

  slog.debug('auth', 'Login attempt', { email: maskEmail(email) });

  const row = await pgQueryOne('SELECT * FROM users WHERE lower(email) = $1', [email]);
  if (!row) return res.status(401).json({ ok: false, error: 'invalid credentials' });
  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) return res.status(401).json({ ok: false, error: 'invalid credentials' });

  if (!JWT_SECRET) return res.status(500).json({ ok: false, error: 'server missing BB_JWT_SECRET' });

  const user = userToClient(row);
  const token = signToken(user);
  slog.info('auth', 'Login success', { userId: user?.id, email: maskEmail(email) });
  return res.json({ token, user });
});

// Password reset (request a reset code)
app.post('/api/auth/forgot-password', async (req, res) => {
  const email = (req.body && req.body.email) ? String(req.body.email).trim().toLowerCase() : '';
  if (!email) return res.status(400).json({ ok: false, error: 'email required' });
  if (!JWT_SECRET) return res.status(500).json({ ok: false, error: 'server missing BB_JWT_SECRET' });

  // Always return ok to avoid account enumeration.
  try {
    const user = await pgQueryOne('SELECT id,email FROM users WHERE lower(email) = $1', [email]);
    if (user && user.id) {
      const resetCode = generateResetCode();
      const tokenHash = hashResetCode(resetCode);
      const createdAt = new Date();
      const expiresAt = new Date(Date.now() + (PASSWORD_RESET_TTL_MINUTES * 60 * 1000));

      try {
        await pool.query(
          'INSERT INTO password_resets (id, user_id, token_hash, expires_at, used_at, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
          [nanoId(), String(user.id), tokenHash, expiresAt, null, createdAt]
        );
      } catch (e) {
        // Non-fatal: still attempt delivery.
      }

      try {
        if (passwordResetEmailConfigured()) {
          await sendPasswordResetEmail({ to: email, code: resetCode });
        } else {
          slog.warn('auth', 'Password reset requested but SMTP not configured; logging reset code', { email: maskEmail(email), resetCode });
        }
      } catch (e) {
        slog.error('auth', 'Password reset delivery failed', { email: maskEmail(email), message: e?.message || String(e) });
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
app.post('/api/auth/reset-password', async (req, res) => {
  const email = (req.body && req.body.email) ? String(req.body.email).trim().toLowerCase() : '';
  const resetCode = (req.body && (req.body.resetCode || req.body.code || req.body.token)) ? String(req.body.resetCode || req.body.code || req.body.token).trim() : '';
  const newPassword = (req.body && req.body.newPassword) ? String(req.body.newPassword) : '';
  if (!email || !resetCode || !newPassword) return res.status(400).json({ ok: false, error: 'email, resetCode, newPassword required' });
  if (String(newPassword).length < 6) return res.status(400).json({ ok: false, error: 'password must be at least 6 characters' });
  if (!JWT_SECRET) return res.status(500).json({ ok: false, error: 'server missing BB_JWT_SECRET' });

  try {
    const user = await pgQueryOne('SELECT id,email FROM users WHERE lower(email) = $1', [email]);
    if (!user || !user.id) return res.status(400).json({ ok: false, error: 'invalid code' });

    const tokenHash = hashResetCode(resetCode);
    const resetRow = await pgQueryOne(
      'SELECT id FROM password_resets WHERE user_id = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [String(user.id), tokenHash]
    );
    if (!resetRow || !resetRow.id) return res.status(400).json({ ok: false, error: 'invalid or expired code' });

    const hash = bcrypt.hashSync(newPassword, 12);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, String(user.id)]);
      await client.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [String(resetRow.id)]);
      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw e;
    } finally {
      client.release();
    }

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

    let row = await pgQueryOne('SELECT * FROM users WHERE lower(email) = $1', [email]);
    if (!row) {
      const id = nanoId();
      const t = new Date();
      const randomSecret = `${nanoId()}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      const hash = bcrypt.hashSync(randomSecret, 12);
      try {
        await pool.query(
          'INSERT INTO users (id,email,password_hash,name,phone,address,role,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [id, email, hash, name || 'User', '', '', 'parent', t, t]
        );
        row = await pgQueryOne('SELECT * FROM users WHERE id = $1', [id]);
      } catch (e) {
        row = await pgQueryOne('SELECT * FROM users WHERE lower(email) = $1', [email]);
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

app.put('/api/auth/me', authMiddleware, async (req, res) => {
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
    const ok = avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('/uploads/');
    if (!ok) return res.status(400).json({ ok: false, error: 'avatar must be a valid URL or /uploads/... path' });
    if (avatar.length > 2048) return res.status(400).json({ ok: false, error: 'avatar URL too long' });
  }

  let phone = phoneRaw;
  if (phone !== undefined) {
    if (!phone) phone = '';
    else {
      const normalized = normalizeE164Phone(phone);
      if (!normalized) return res.status(400).json({ ok: false, error: 'phone must be in E.164 format (e.g. +15551234567)' });
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
      const existing = await pgQueryOne('SELECT id FROM users WHERE lower(email) = $1 AND id <> $2', [email, userId]);
      if (existing) return res.status(409).json({ ok: false, error: 'email already exists' });
    }

    const sets = [];
    const values = [];
    let i = 1;

    if (name !== undefined) { sets.push(`name = $${i}`); values.push(name); i += 1; }
    if (email !== undefined) { sets.push(`email = $${i}`); values.push(email); i += 1; }
    if (avatar !== undefined) { sets.push(`avatar = $${i}`); values.push(avatar); i += 1; }
    if (phone !== undefined) { sets.push(`phone = $${i}`); values.push(phone); i += 1; }
    if (address !== undefined) { sets.push(`address = $${i}`); values.push(address); i += 1; }
    if (newPassword !== undefined) {
      const hash = bcrypt.hashSync(newPassword, 12);
      sets.push(`password_hash = $${i}`);
      values.push(hash);
      i += 1;
    }

    if (!sets.length) return res.status(400).json({ ok: false, error: 'no fields to update' });

    sets.push(`updated_at = $${i}`);
    values.push(new Date());
    i += 1;

    values.push(userId);
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i}`, values);

    const row = await pgQueryOne('SELECT id,email,name,avatar,phone,address,role FROM users WHERE id = $1', [userId]);
    if (!row) return res.status(404).json({ ok: false, error: 'user not found' });
    if (!JWT_SECRET) return res.status(500).json({ ok: false, error: 'server missing BB_JWT_SECRET' });

    const user = userToClient(row);
    const token = signToken(user);
    return res.json({ ok: true, token, user });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'update failed' });
  }
});

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

  const exists = await pgQueryOne('SELECT id FROM users WHERE lower(email) = $1', [email]);
  if (exists) return res.status(409).json({ ok: false, error: 'email already exists' });

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
  const t = new Date();

  try {
    await pool.query(
      'INSERT INTO users (id,email,password_hash,name,phone,role,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, email, hash, name, phone, role, t, t]
    );
  } catch (e) {
    if (isPgUniqueViolation(e)) return res.status(409).json({ ok: false, error: 'email already exists' });
    return res.status(500).json({ ok: false, error: e?.message || 'signup failed' });
  }

  const user = { id, email, name, role };

  if (REQUIRE_2FA_ON_SIGNUP) {
    const method = (twoFaMethod === 'sms' || twoFaMethod === 'email') ? twoFaMethod : 'email';
    if (method === 'sms' && !ENABLE_SMS_2FA) return res.status(400).json({ ok: false, error: 'SMS 2FA is currently disabled' });
    if (method === 'email' && !ENABLE_EMAIL_2FA) return res.status(400).json({ ok: false, error: 'Email 2FA is currently disabled' });

    let destination = '';
    if (method === 'sms') {
      destination = normalizeE164Phone(phone);
      if (!destination) return res.status(400).json({ ok: false, error: 'phone required for sms 2fa (E.164 format, e.g. +15551234567)' });
    } else {
      destination = normalizeEmail(email);
      if (!destination) return res.status(400).json({ ok: false, error: 'valid email required for email 2fa' });
    }

    const ch = create2faChallenge({ userId: id, method, destination });
    slog.info('auth', '2FA challenge created (signup)', { method, to: maskDest(method, destination), userId: id });

    if (DEBUG_2FA_RETURN_CODE) {
      slog.debug('auth', '2FA code (dev)', { challengeId: ch.challengeId, code: ch.code });
    } else {
      try {
        await deliver2faCode({ method, destination, code: ch.code });
        slog.info('auth', '2FA code delivered', { method, to: maskDest(method, destination), challengeId: ch.challengeId });
      } catch (e) {
        try { await pool.query('DELETE FROM users WHERE id = $1', [id]); } catch (_) {}
        try { twoFaChallenges.delete(ch.challengeId); } catch (_) {}
        slog.error('auth', '2FA delivery failed', { method, to: maskDest(method, destination), message: e?.message || String(e) });
        const payload = { ok: false, error: '2FA delivery failed; contact support' };
        if (DEBUG_2FA_DELIVERY_ERRORS) payload.debug = (e?.message || String(e));
        return res.status(500).json(payload);
      }
    }

    const payload = { ok: true, user, requires2fa: true, method, to: maskDest(method, destination), challengeId: ch.challengeId };
    if (DEBUG_2FA_RETURN_CODE) payload.devCode = ch.code;
    return res.status(201).json(payload);
  }

  const token = signToken(user);
  return res.status(201).json({ token, user, requires2fa: false });
});

app.post('/api/auth/2fa/verify', async (req, res) => {
  const challengeId = (req.body && req.body.challengeId) ? String(req.body.challengeId).trim() : '';
  const code = (req.body && req.body.code) ? String(req.body.code).trim() : '';
  if (!challengeId || !code) return res.status(400).json({ ok: false, error: 'challengeId and code required' });

  const result = consume2faChallenge(challengeId, code);
  if (!result.ok) return res.status(401).json({ ok: false, error: result.error || 'verification failed' });

  const row = await pgQueryOne('SELECT * FROM users WHERE id = $1', [result.userId]);
  if (!row) return res.status(404).json({ ok: false, error: 'user not found' });
  if (!JWT_SECRET) return res.status(500).json({ ok: false, error: 'server missing BB_JWT_SECRET' });

  const user = userToClient(row);
  const token = signToken(user);
  slog.info('auth', '2FA verified; token issued', { userId: user?.id, method: result.method });
  return res.json({ ok: true, token, user });
});

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
app.get('/api/board', authMiddleware, async (req, res) => {
  const rows = await pgQueryAll('SELECT * FROM posts ORDER BY created_at DESC', []);

  // Attach the latest avatar URL from the users table (author_json stores only a snapshot).
  const authorIds = Array.from(
    new Set(
      rows
        .map((r) => (r && r.author_json && typeof r.author_json === 'object' ? safeString(r.author_json.id) : ''))
        .filter(Boolean)
    )
  );

  const avatarByUserId = {};
  if (authorIds.length) {
    try {
      const urows = await pgQueryAll('SELECT id, avatar FROM users WHERE id = ANY($1::text[])', [authorIds]);
      for (const u of (urows || [])) {
        const id = safeString(u && u.id);
        if (!id) continue;
        avatarByUserId[id] = safeString(u && u.avatar) || '';
      }
    } catch (e) {
      // ignore; fallback to pravatar client-side
    }
  }

  const out = rows.map((r) => {
    let author = r.author_json && typeof r.author_json === 'object' ? r.author_json : null;
    if (author && author.id) {
      const a = avatarByUserId[String(author.id)] || '';
      if (a) author = { ...author, avatar: a };
    }
    const comments = Array.isArray(r.comments_json) ? r.comments_json : (r.comments_json && typeof r.comments_json === 'object' ? r.comments_json : []);
    return {
      id: r.id,
      author,
      title: r.title || '',
      body: r.body || '',
      text: r.body || '',
      image: r.image || undefined,
      likes: Number(r.likes) || 0,
      shares: Number(r.shares) || 0,
      comments,
      createdAt: toIso(r.created_at),
    };
  });
  res.json(out);
});

app.post('/api/board', authMiddleware, async (req, res) => {
  const title = (req.body && req.body.title) ? String(req.body.title) : '';
  const body = (req.body && (req.body.body || req.body.text)) ? String(req.body.body || req.body.text) : '';
  const image = (req.body && req.body.image) ? String(req.body.image) : null;

  const id = nanoId();
  const t = new Date();
  const author = req.user ? { id: req.user.id, name: req.user.name, avatar: req.user.avatar || '' } : null;

  await pool.query(
    'INSERT INTO posts (id, author_json, title, body, image, likes, shares, comments_json, created_at, updated_at) VALUES ($1,$2::jsonb,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)',
    [id, jsonb(author), title, body, image, 0, 0, jsonb([]), t, t]
  );

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
    createdAt: t.toISOString(),
  });
});

app.post('/api/board/like', authMiddleware, async (req, res) => {
  const postId = (req.body && req.body.postId) ? String(req.body.postId) : '';
  if (!postId) return res.status(400).json({ ok: false, error: 'postId required' });
  await pool.query('UPDATE posts SET likes = likes + 1, updated_at = $1 WHERE id = $2', [new Date(), postId]);
  const row = await pgQueryOne('SELECT likes, shares FROM posts WHERE id = $1', [postId]);
  return res.json({ id: postId, likes: Number(row?.likes) || 0, shares: Number(row?.shares) || 0 });
});

app.post('/api/board/share', authMiddleware, async (req, res) => {
  const postId = (req.body && req.body.postId) ? String(req.body.postId) : '';
  if (!postId) return res.status(400).json({ ok: false, error: 'postId required' });
  await pool.query('UPDATE posts SET shares = shares + 1, updated_at = $1 WHERE id = $2', [new Date(), postId]);
  const row = await pgQueryOne('SELECT likes, shares FROM posts WHERE id = $1', [postId]);
  return res.json({ id: postId, likes: Number(row?.likes) || 0, shares: Number(row?.shares) || 0 });
});

app.post('/api/board/comments', authMiddleware, async (req, res) => {
  const postId = (req.body && req.body.postId) ? String(req.body.postId) : '';
  const raw = (req.body && req.body.comment) ? req.body.comment : null;
  if (!postId || raw == null) return res.status(400).json({ ok: false, error: 'postId and comment required' });

  const row = await pgQueryOne('SELECT comments_json FROM posts WHERE id = $1', [postId]);
  if (!row) return res.status(404).json({ ok: false, error: 'post not found' });

  const comments = Array.isArray(row.comments_json) ? row.comments_json : [];

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

  await pool.query('UPDATE posts SET comments_json = $1::jsonb, updated_at = $2 WHERE id = $3', [jsonb(comments), new Date(), postId]);
  slog.debug('api', 'Comment created', { postId, parentId: parentId || undefined, commentId: created?.id });
  return res.status(201).json(created);
});

app.post('/api/board/comments/react', authMiddleware, async (req, res) => {
  const postId = (req.body && req.body.postId) ? String(req.body.postId) : '';
  const commentId = (req.body && req.body.commentId) ? String(req.body.commentId) : '';
  const emoji = (req.body && req.body.emoji) ? String(req.body.emoji) : '';
  if (!postId || !commentId || !emoji) return res.status(400).json({ ok: false, error: 'postId, commentId, emoji required' });

  const row = await pgQueryOne('SELECT comments_json FROM posts WHERE id = $1', [postId]);
  if (!row) return res.status(404).json({ ok: false, error: 'post not found' });

  const comments = Array.isArray(row.comments_json) ? row.comments_json : [];
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

  await pool.query('UPDATE posts SET comments_json = $1::jsonb, updated_at = $2 WHERE id = $3', [jsonb(comments), new Date(), postId]);
  slog.debug('api', 'Comment reacted', { postId, commentId, emoji });
  return res.json(updated);
});

// Messages / Chats
app.get('/api/messages', authMiddleware, async (req, res) => {
  const rows = await pgQueryAll('SELECT * FROM messages ORDER BY created_at ASC', []);
  const out = rows.map((r) => ({
    id: r.id,
    threadId: r.thread_id || undefined,
    body: r.body,
    sender: (r.sender_json && typeof r.sender_json === 'object') ? r.sender_json : null,
    to: Array.isArray(r.to_json) ? r.to_json : [],
    createdAt: toIso(r.created_at),
  }));

  // Overlay latest avatars so identity stays correct even if profile avatars change.
  try {
    const ids = new Set();
    for (const m of out) {
      if (m?.sender?.id) ids.add(String(m.sender.id));
      if (Array.isArray(m?.to)) {
        for (const t of m.to) {
          if (t?.id) ids.add(String(t.id));
        }
      }
    }

    const idList = Array.from(ids);
    if (idList.length) {
      const urows = await pgQueryAll('SELECT id, avatar FROM users WHERE id = ANY($1::text[])', [idList]);
      const avatarById = new Map(urows.map((u) => [String(u.id), u.avatar]));
      for (const m of out) {
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

  res.json(out);
});

app.post('/api/messages', authMiddleware, async (req, res) => {
  const threadId = (req.body && (req.body.threadId || req.body.thread_id)) ? String(req.body.threadId || req.body.thread_id) : null;
  const body = (req.body && req.body.body) ? String(req.body.body) : '';
  const to = (req.body && Array.isArray(req.body.to)) ? req.body.to : [];
  if (!body) return res.status(400).json({ ok: false, error: 'body required' });

  const id = nanoId();
  const t = new Date();
  const sender = req.user ? { id: req.user.id, name: req.user.name, avatar: req.user.avatar } : null;

  await pool.query(
    'INSERT INTO messages (id, thread_id, body, sender_json, to_json, created_at) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6)',
    [id, threadId, body, jsonb(sender), jsonb(to), t]
  );

  res.status(201).json({ id, threadId: threadId || undefined, body, sender, to, createdAt: t.toISOString() });
});

// Urgent memos
app.get('/api/urgent-memos', authMiddleware, async (req, res) => {
  const rows = await pgQueryAll('SELECT * FROM urgent_memos ORDER BY created_at DESC', []);
  res.json(rows.map((r) => {
    const memo = (r.memo_json && typeof r.memo_json === 'object') ? r.memo_json : null;
    const base = (memo && typeof memo === 'object') ? memo : {};
    const createdAt = toIso(r.created_at);
    const title = r.title || base.title || base.subject || 'Urgent';
    const body = r.body || base.body || base.note || '';
    return {
      ...base,
      id: r.id,
      title,
      body,
      ack: Boolean(r.ack),
      status: r.status || base.status || undefined,
      respondedAt: toIso(r.responded_at) || base.respondedAt || undefined,
      date: base.date || createdAt,
      createdAt,
    };
  }));
});

app.post('/api/urgent-memos', authMiddleware, async (req, res) => {
  const payload = (req.body && typeof req.body === 'object') ? req.body : {};
  const id = payload.id ? String(payload.id) : nanoId();
  const t = new Date();
  const title = payload.title ? String(payload.title) : (payload.subject ? String(payload.subject) : 'Urgent');
  const body = payload.body ? String(payload.body) : (payload.note ? String(payload.note) : '');
  const status = payload.status ? String(payload.status) : (payload.type === 'time_update' ? 'pending' : (payload.type ? 'sent' : null));
  const memoObj = { ...payload, id, title, body, createdAt: t.toISOString(), date: t.toISOString(), status: status || payload.status };

  await pool.query(
    `INSERT INTO urgent_memos (id, title, body, memo_json, status, responded_at, ack, created_at, updated_at)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET
       title=excluded.title,
       body=excluded.body,
       memo_json=excluded.memo_json,
       status=excluded.status,
       responded_at=excluded.responded_at,
       ack=excluded.ack,
       created_at=excluded.created_at,
       updated_at=excluded.updated_at`,
    [id, title, body, jsonb(memoObj), status, null, 0, t, t]
  );

  slog.info('api', 'Urgent memo created', { memoId: id, type: memoObj.type, status: status || undefined });
  res.status(201).json(memoObj);
});

app.post('/api/urgent-memos/respond', authMiddleware, async (req, res) => {
  const memoId = (req.body && (req.body.memoId || req.body.id)) ? String(req.body.memoId || req.body.id) : '';
  const action = (req.body && (req.body.action || req.body.status)) ? String(req.body.action || req.body.status) : '';
  if (!memoId || !action) return res.status(400).json({ ok: false, error: 'memoId and action required' });

  const row = await pgQueryOne('SELECT * FROM urgent_memos WHERE id = $1', [memoId]);
  if (!row) return res.status(404).json({ ok: false, error: 'memo not found' });

  const t = new Date();
  const base = (row.memo_json && typeof row.memo_json === 'object') ? row.memo_json : {};
  const next = { ...base, id: memoId, status: action, respondedAt: t.toISOString() };

  await pool.query(
    'UPDATE urgent_memos SET status = $1, responded_at = $2, memo_json = $3::jsonb, updated_at = $4 WHERE id = $5',
    [action, t, jsonb(next), t, memoId]
  );

  slog.info('api', 'Urgent memo responded', { memoId, action });
  return res.json({ ok: true, memo: next });
});

app.post('/api/urgent-memos/read', authMiddleware, async (req, res) => {
  const ids = Array.isArray(req.body && req.body.memoIds) ? req.body.memoIds.map(String) : [];
  if (!ids.length) return res.json({ ok: true });
  await pool.query('UPDATE urgent_memos SET ack = 1 WHERE id = ANY($1::text[])', [ids]);
  res.json({ ok: true, updatedAt: nowISO() });
});

// Arrival pings
app.post('/api/arrival/ping', authMiddleware, async (req, res) => {
  const payload = req.body || {};
  const id = nanoId();
  const createdAt = new Date();

  await pool.query(
    'INSERT INTO arrival_pings (id, user_id, role, child_id, lat, lng, event_id, when_iso, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      id,
      payload.userId ? String(payload.userId) : (req.user ? String(req.user.id) : null),
      payload.role ? String(payload.role) : (req.user ? String(req.user.role) : null),
      payload.childId ? String(payload.childId) : null,
      Number.isFinite(Number(payload.lat)) ? Number(payload.lat) : null,
      Number.isFinite(Number(payload.lng)) ? Number(payload.lng) : null,
      payload.eventId ? String(payload.eventId) : null,
      payload.when ? String(payload.when) : null,
      createdAt,
    ]
  );

  try {
    const r = String(payload.role || (req.user ? req.user.role : '') || '').trim().toLowerCase();
    if (r === 'parent' || r === 'therapist') {
      const actorId = payload.userId ? String(payload.userId) : (req.user ? String(req.user.id) : '');
      const childId = payload.childId != null ? String(payload.childId) : null;
      const shiftId = payload.shiftId != null ? String(payload.shiftId) : null;
      const withinMins = 10;

      const recent = await pgQueryOne(
        `SELECT id FROM urgent_memos
         WHERE type = 'arrival_alert'
           AND proposer_id = $1
           AND (($2::text IS NULL AND child_id IS NULL) OR child_id = $2)
           AND (($3::text IS NULL AND (meta_json->>'shiftId') IS NULL) OR (meta_json->>'shiftId') = $3)
           AND created_at > (now() - $4::interval)
         LIMIT 1`,
        [actorId, childId, shiftId, `${withinMins} minutes`]
      );

      if (!recent) {
        const alertId = nanoId();
        const t = new Date();
        const meta = {
          lat: Number.isFinite(Number(payload.lat)) ? Number(payload.lat) : null,
          lng: Number.isFinite(Number(payload.lng)) ? Number(payload.lng) : null,
          distanceMiles: payload.distanceMiles != null ? Number(payload.distanceMiles) : null,
          dropZoneMiles: payload.dropZoneMiles != null ? Number(payload.dropZoneMiles) : null,
          eventId: payload.eventId ? String(payload.eventId) : null,
          shiftId,
          when: payload.when ? String(payload.when) : null,
        };
        const title = r === 'therapist' ? 'Therapist Arrival' : 'Parent Arrival';

        await pool.query(
          `INSERT INTO urgent_memos (
            id, type, status, proposer_id, actor_role, child_id, title, body, note, meta_json, ack, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)`,
          [alertId, 'arrival_alert', 'pending', actorId, r, childId, title, '', '', jsonb(meta), 0, t, t]
        );

        try {
          const adminIds = await getAdminUserIds();
          const tokens = await getPushTokensForUsers(adminIds, { kind: 'updates' });
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
    // ignore
  }

  res.json({ ok: true });
});

// Time change proposals
app.get('/api/children/time-change-proposals', authMiddleware, async (req, res) => {
  const rows = await pgQueryAll('SELECT * FROM time_change_proposals ORDER BY created_at DESC', []);
  res.json(rows.map((r) => ({
    id: r.id,
    childId: r.child_id,
    type: r.type,
    proposedISO: r.proposed_iso,
    note: r.note,
    proposerId: r.proposer_id,
    action: r.action,
    createdAt: toIso(r.created_at),
  })));
});

app.post('/api/children/propose-time-change', authMiddleware, async (req, res) => {
  const id = nanoId();
  const p = req.body || {};
  const createdAt = new Date();

  await pool.query(
    'INSERT INTO time_change_proposals (id, child_id, type, proposed_iso, note, proposer_id, action, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      id,
      p.childId != null ? String(p.childId) : null,
      p.type ? String(p.type) : 'pickup',
      p.proposedISO ? String(p.proposedISO) : createdAt.toISOString(),
      p.note ? String(p.note) : '',
      p.proposerId != null ? String(p.proposerId) : (req.user ? String(req.user.id) : null),
      null,
      createdAt,
    ]
  );

  res.status(201).json({ id, ...p, proposerId: p.proposerId != null ? String(p.proposerId) : (req.user ? String(req.user.id) : null), createdAt: createdAt.toISOString() });
});

app.post('/api/children/respond-time-change', authMiddleware, async (req, res) => {
  const proposalId = (req.body && req.body.proposalId) ? String(req.body.proposalId) : '';
  const action = (req.body && req.body.action) ? String(req.body.action) : '';
  if (!proposalId || !action) return res.status(400).json({ ok: false, error: 'proposalId and action required' });

  await pool.query('UPDATE time_change_proposals SET action = $1 WHERE id = $2', [action, proposalId]);
  const row = await pgQueryOne('SELECT * FROM time_change_proposals WHERE id = $1', [proposalId]);
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
      createdAt: toIso(row.created_at),
    },
  });
});

// Push tokens
app.post('/api/push/register', authMiddleware, async (req, res) => {
  const token = (req.body && req.body.token) ? String(req.body.token) : '';
  const userId = (req.body && req.body.userId) ? String(req.body.userId) : (req.user ? String(req.user.id) : '');
  const platform = (req.body && req.body.platform) ? String(req.body.platform) : '';
  const enabled = (req.body && typeof req.body.enabled === 'boolean') ? (req.body.enabled ? 1 : 0) : 1;
  const preferences = (req.body && typeof req.body.preferences === 'object') ? req.body.preferences : {};

  if (!token) return res.status(400).json({ ok: false, error: 'token required' });

  const t = new Date();
  await pool.query(
    `INSERT INTO push_tokens (token, user_id, platform, enabled, preferences_json, updated_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6)
     ON CONFLICT (token) DO UPDATE SET
       user_id=excluded.user_id,
       platform=excluded.platform,
       enabled=excluded.enabled,
       preferences_json=excluded.preferences_json,
       updated_at=excluded.updated_at`,
    [token, userId, platform, enabled, jsonb(preferences), t]
  );

  res.json({ ok: true, stored: true });
});

app.post('/api/push/unregister', authMiddleware, async (req, res) => {
  const token = (req.body && req.body.token) ? String(req.body.token) : '';
  if (!token) return res.status(400).json({ ok: false, error: 'token required' });
  await pool.query('DELETE FROM push_tokens WHERE token = $1', [token]);
  res.json({ ok: true, removed: true });
});

// Minimal compatibility endpoints
app.post('/api/media/sign', authMiddleware, (req, res) => {
  const key = (req.body && req.body.key) ? String(req.body.key) : `uploads/${Date.now()}`;
  res.json({ url: `http://localhost:9000/${key}`, fields: {}, key });
});

app.get('/api/link/preview', authMiddleware, (req, res) => {
  const url = (req.query && req.query.url) ? String(req.query.url) : '';
  res.json({ ok: true, url, title: url, description: '', image: '' });
});

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

async function main() {
  await initDb();
  await seedAdminUser();

  // Best-effort: keep ABA relationship tables in sync at startup.
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await rebuildAbaRelationshipsFromDirectoryPg(client);
      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (e2) {}
    } finally {
      client.release();
    }
  } catch (_) {
    // ignore
  }

  app.listen(PORT, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`[api] BuddyBoard API listening on :${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`[api] Postgres: ${DATABASE_URL.replace(/:\/\/.*@/, '://***@')}`);
    // eslint-disable-next-line no-console
    console.log(`[api] Data dir: ${DATA_DIR}`);
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[api] Failed to start:', e);
  process.exit(1);
});

process.on('uncaughtException', (e) => {
  // eslint-disable-next-line no-console
  console.error('[api] Uncaught', e);
});
