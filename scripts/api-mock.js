const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');

const PORT = Number(process.env.PORT || 3006);

const app = express();
app.use(cors());
app.use(bodyParser.json());

const upload = multer({ storage: multer.memoryStorage() });

const slog = require('./logger');
const LOG_REQUESTS = (() => {
  const v = process.env.BB_DEBUG_REQUESTS;
  if (v == null) return true;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return true;
})();

function nowISO() {
  return new Date().toISOString();
}

function nanoId() {
  return `mock_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

// In-memory 2FA challenges (mock)
const twoFaChallenges = new Map();
const TWOFA_CODE_TTL_MS = 5 * 60 * 1000;
const TWOFA_RESEND_COOLDOWN_MS = 5 * 60 * 1000;
function newOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function create2faChallenge({ userId, method, destination }) {
  const challengeId = `mock_${Math.random().toString(16).slice(2, 10)}`;
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
  if (String(code || '').trim() !== String(ch.code)) return { ok: false, error: 'invalid code' };
  twoFaChallenges.delete(challengeId);
  return { ok: true, userId: ch.userId, method: ch.method, destination: ch.destination };
}

if (LOG_REQUESTS) {
  app.use((req, res, next) => {
    const startedAt = Date.now();
    const path = req.originalUrl || req.url;
    const method = (req.method || 'GET').toUpperCase();
    slog.debug('req', `${method} ${path}`, { hasAuth: !!(req.headers && req.headers.authorization) });
    res.on('finish', () => {
      slog.info('req', `${method} ${path} -> ${res.statusCode} (${Date.now() - startedAt}ms)`);
    });
    next();
  });
}

// In-memory mock data
let posts = [
  { id: 1, author: 'Teacher', text: 'Welcome to BuddyBoard!', likes: 0, shares: 0, comments: [], createdAt: new Date().toISOString() }
];
let messages = [];
let urgentMemos = [];
let timeChangeProposals = [];
let pushTokens = []; // { token, userId, platform, enabled, preferences, updatedAt }

// Stable mock users keyed by normalized email.
const usersByEmail = new Map();

function normalizeEmail(email) {
  try {
    return String(email || '').trim().toLowerCase();
  } catch (e) {
    return '';
  }
}

function stableUserIdForEmail(email) {
  // Deterministic, URL-safe-ish id for repeat logins.
  const e = normalizeEmail(email);
  const hex = Buffer.from(e).toString('hex').slice(0, 24);
  return `mock-user-${hex || 'anon'}`;
}

function getOrCreateUserForEmail(email, { name = 'Mock User', role = 'parent' } = {}) {
  const norm = normalizeEmail(email);
  if (!norm) return null;
  const existing = usersByEmail.get(norm);
  if (existing) return existing;
  const user = { id: stableUserIdForEmail(norm), name, email: norm, role };
  usersByEmail.set(norm, user);
  return user;
}

function nanoId() {
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.post('/api/arrival/ping', (req, res) => {
  // Best-effort stub for arrival detector.
  return res.json({ ok: true });
});

app.post('/api/auth/login', (req, res) => {
  const email = (req.body && req.body.email) ? normalizeEmail(req.body.email) : '';
  const password = (req.body && req.body.password) ? String(req.body.password) : '';
  if (!email || !password) return res.status(400).json({ ok: false, error: 'email and password required' });

  // Mock accepts any credentials and returns a stable user for this email.
  const user = getOrCreateUserForEmail(email, { name: 'Mock User', role: 'parent' });
  const token = `mock-token-${Date.now()}`;
  slog.info('auth', 'Login success (mock)', { userId: user.id });
  return res.json({ token, user });
});

app.get('/api/auth/me', (req, res) => {
  // Minimal mock implementation; real server enforces auth.
  return res.json({ ok: true, user: { id: 'mock', name: 'Mock User', email: 'mock@example.com', role: 'parent' } });
});

// Minimal auth endpoints for client end-to-end testing.
// This mock accepts any signup and uses 2FA verify to mint a fake token.
app.post('/api/auth/signup', (req, res) => {
  const email = (req.body && req.body.email) ? normalizeEmail(req.body.email) : '';
  const name = (req.body && req.body.name) ? String(req.body.name).trim() : '';
  const role = (req.body && req.body.role) ? String(req.body.role).trim() : 'parent';
  const twoFaMethod = (req.body && req.body.twoFaMethod) ? String(req.body.twoFaMethod).trim().toLowerCase() : 'email';
  const phone = (req.body && req.body.phone) ? String(req.body.phone).trim() : '';

  if (!email || !name) return res.status(400).json({ ok: false, error: 'name and email required' });

  if (usersByEmail.has(email)) {
    return res.status(409).json({ ok: false, error: 'email already exists' });
  }

  const user = getOrCreateUserForEmail(email, { name: name || 'Mock User', role });
  const method = (twoFaMethod === 'sms' || twoFaMethod === 'email') ? twoFaMethod : 'email';
  let destination = '';
  if (method === 'sms') {
    destination = String(phone || '').trim();
    if (!destination) return res.status(400).json({ ok: false, error: 'phone required for sms 2fa' });
  } else {
    destination = String(email || '').trim().toLowerCase();
    if (!destination) return res.status(400).json({ ok: false, error: 'email required for email 2fa' });
  }

  const ch = create2faChallenge({ userId: user.id, method, destination });
  slog.info('auth', '2FA challenge created (mock signup)', { method, userId: user.id });
  slog.debug('auth', '2FA code (mock)', { challengeId: ch.challengeId, code: ch.code });
  return res.status(201).json({ ok: true, user, requires2fa: true, method, challengeId: ch.challengeId, devCode: ch.code });
});

app.post('/api/auth/2fa/verify', (req, res) => {
  const challengeId = (req.body && req.body.challengeId) ? String(req.body.challengeId).trim() : '';
  const code = (req.body && req.body.code) ? String(req.body.code).trim() : '';
  if (!challengeId || !code) return res.status(400).json({ ok: false, error: 'challengeId and code required' });

  const result = consume2faChallenge(challengeId, code);
  if (!result.ok) return res.status(401).json({ ok: false, error: result.error || 'verification failed' });

  // If this was an email challenge, the destination is the normalized email.
  const email = normalizeEmail(result.destination);
  const user = email
    ? (getOrCreateUserForEmail(email, { name: 'Mock User', role: 'parent' }) || { id: result.userId, name: 'Mock User', email, role: 'parent' })
    : { id: result.userId, name: 'Mock User', email: 'mock@example.com', role: 'parent' };
  const token = `mock-token-${Date.now()}`;
  slog.info('auth', '2FA verified (mock); token issued', { userId: user.id, method: result.method });
  return res.json({ ok: true, token, user });
});

app.post('/api/auth/2fa/resend', (req, res) => {
  const challengeId = (req.body && req.body.challengeId) ? String(req.body.challengeId).trim() : '';
  if (!challengeId) return res.status(400).json({ ok: false, error: 'challengeId required' });

  const updated = resend2faChallenge(challengeId);
  if (!updated.ok) {
    const payload = { ok: false, error: updated.error || 'resend failed' };
    if (updated.retryAfterSec) payload.retryAfterSec = updated.retryAfterSec;
    return res.status(updated.status || 400).json(payload);
  }

  slog.info('auth', '2FA code resent (mock)', { challengeId, method: updated.method });
  return res.json({ ok: true, method: updated.method, challengeId, devCode: updated.code });
});
app.get('/api/board', (req, res) => res.json(posts));
app.post('/api/board', (req, res) => {
  const id = posts.length ? posts[posts.length-1].id + 1 : 1;
  const item = { id, author: req.body.author || 'Dev', text: req.body.text || '', likes: 0, shares: 0, comments: [], createdAt: new Date().toISOString() };
  posts.unshift(item);
  res.status(201).json(item);
});

app.post('/api/board/like', (req, res) => {
  const { postId } = req.body;
  const p = posts.find(x => x.id === postId);
  if (p) p.likes = Number(p.likes || 0) + 1;
  res.json({ id: postId, likes: Number(p?.likes) || 0, shares: Number(p?.shares) || 0 });
});

app.post('/api/board/share', (req, res) => {
  const { postId } = req.body;
  const p = posts.find(x => x.id === postId);
  if (p) p.shares = Number(p.shares || 0) + 1;
  res.json({ id: postId, likes: Number(p?.likes) || 0, shares: Number(p?.shares) || 0 });
});

app.post('/api/board/comments', (req, res) => {
  const { postId, comment } = req.body || {};
  if (!postId || comment == null) return res.status(400).json({ ok: false, error: 'postId and comment required' });

  const p = posts.find((x) => x.id === postId);
  if (!p) return res.status(404).json({ ok: false, error: 'post not found' });
  p.comments = Array.isArray(p.comments) ? p.comments : [];

  const author = { id: 'mock', name: 'Mock User' };
  const createdAt = nowISO();

  let body = '';
  let parentId = null;
  let clientId = null;
  if (typeof comment === 'string') {
    body = comment;
  } else if (comment && typeof comment === 'object') {
    if (comment.body != null) body = String(comment.body);
    else if (comment.text != null) body = String(comment.text);
    parentId = comment.parentId ? String(comment.parentId) : null;
    clientId = comment.id ? String(comment.id) : null;
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
    p.comments.push(created);
  } else {
    const parent = p.comments.find((c) => c && String(c.id) === String(parentId));
    if (!parent) return res.status(404).json({ ok: false, error: 'parent comment not found' });
    const id = clientId || nanoId();
    created = makeBase(id);
    parent.replies = Array.isArray(parent.replies) ? parent.replies : [];
    parent.replies.push(created);
  }

  slog.debug('api', 'Comment created (mock)', { postId, parentId: parentId || undefined, commentId: created?.id });
  return res.status(201).json(created);
});

app.post('/api/board/comments/react', (req, res) => {
  const { postId, commentId, emoji } = req.body || {};
  if (!postId || !commentId || !emoji) return res.status(400).json({ ok: false, error: 'postId, commentId, emoji required' });

  const p = posts.find((x) => x.id === postId);
  if (!p) return res.status(404).json({ ok: false, error: 'post not found' });
  const comments = Array.isArray(p.comments) ? p.comments : [];
  const uid = 'mock';

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

  slog.debug('api', 'Comment reacted (mock)', { postId, commentId, emoji });
  return res.json(updated);
});

app.get('/api/messages', (req, res) => res.json(messages));
app.post('/api/messages', (req, res) => {
  const id = messages.length ? messages[messages.length-1].id + 1 : 1;
  const m = { id, title: req.body.title || '', body: req.body.body || '', sender: req.body.sender || 'Dev', date: new Date().toISOString(), read: false };
  messages.unshift(m);
  res.status(201).json(m);
});

app.get('/api/urgent-memos', (req, res) => res.json(urgentMemos));
app.post('/api/urgent-memos', (req, res) => {
  const payload = (req.body && typeof req.body === 'object') ? req.body : {};
  const t = nowISO();
  const id = payload.id ? String(payload.id) : nanoId();
  const title = payload.title ? String(payload.title) : (payload.subject ? String(payload.subject) : 'Urgent');
  const body = payload.body ? String(payload.body) : (payload.note ? String(payload.note) : '');
  const status = payload.status ? String(payload.status) : (payload.type === 'time_update' ? 'pending' : (payload.type ? 'sent' : undefined));
  const m = { ...payload, id, title, body, status, date: t, createdAt: t, ack: false };
  urgentMemos.unshift(m);
  res.status(201).json(m);
});

app.post('/api/urgent-memos/respond', (req, res) => {
  const memoId = (req.body && (req.body.memoId || req.body.id)) ? String(req.body.memoId || req.body.id) : '';
  const action = (req.body && (req.body.action || req.body.status)) ? String(req.body.action || req.body.status) : '';
  if (!memoId || !action) return res.status(400).json({ ok: false, error: 'memoId and action required' });

  const idx = urgentMemos.findIndex((m) => m && String(m.id) === String(memoId));
  if (idx < 0) return res.status(404).json({ ok: false, error: 'memo not found' });
  const t = nowISO();
  urgentMemos[idx] = { ...urgentMemos[idx], status: action, respondedAt: t };
  slog.info('api', 'Urgent memo responded (mock)', { memoId, action });
  return res.json({ ok: true, memo: urgentMemos[idx] });
});

app.post('/api/urgent-memos/read', (req, res) => {
  const ids = Array.isArray(req.body.memoIds) ? req.body.memoIds : [];
  urgentMemos.forEach(u => { if (ids.includes(u.id)) u.ack = true; });
  res.json({ ok: true });
});

// Admin responds to a memo/alert
app.post('/api/urgent-memos/respond', (req, res) => {
  const memoId = req.body && req.body.memoId ? String(req.body.memoId) : '';
  const action = req.body && req.body.action ? String(req.body.action) : '';
  if (!memoId || !action) return res.status(400).json({ ok: false, error: 'memoId and action required' });
  const idx = urgentMemos.findIndex((m) => String(m.id) === memoId);
  if (idx === -1) return res.status(404).json({ ok: false, error: 'not found' });
  const t = new Date().toISOString();
  urgentMemos[idx] = { ...urgentMemos[idx], status: action, respondedAt: t, updatedAt: t };
  res.json({ ok: true, id: memoId, status: action, respondedAt: t, updatedAt: t });
});

// Arrival ping: store an arrival alert for admins (deduped)
app.post('/api/arrival/ping', (req, res) => {
  const p = req.body || {};
  const role = (p.role || '').toString().toLowerCase();
  if (role !== 'parent' && role !== 'therapist') return res.json({ ok: true });
  const actorId = p.userId ? String(p.userId) : 'unknown';
  const childId = p.childId != null ? String(p.childId) : null;

  const recent = urgentMemos.find((m) => m.type === 'arrival_alert' && m.proposerId === actorId && String(m.childId || '') === String(childId || '') && (Date.now() - new Date(m.createdAt).getTime()) < 10 * 60 * 1000);
  if (!recent) {
    const createdAt = new Date().toISOString();
    urgentMemos.unshift({
      id: nanoId(),
      type: 'arrival_alert',
      status: 'pending',
      proposerId: actorId,
      actorRole: role,
      childId,
      title: role === 'therapist' ? 'Therapist Arrival' : 'Parent Arrival',
      body: '',
      note: '',
      meta: {
        lat: p.lat != null ? Number(p.lat) : null,
        lng: p.lng != null ? Number(p.lng) : null,
        distanceMiles: p.distanceMiles != null ? Number(p.distanceMiles) : null,
        dropZoneMiles: p.dropZoneMiles != null ? Number(p.dropZoneMiles) : null,
        when: p.when || createdAt,
      },
      recipients: [],
      ack: false,
      respondedAt: null,
      date: createdAt,
      createdAt,
      updatedAt: createdAt,
    });
  }
  res.json({ ok: true });
});

app.get('/api/children/time-change-proposals', (req, res) => res.json(timeChangeProposals));
app.post('/api/children/propose-time-change', (req, res) => {
  const id = timeChangeProposals.length ? timeChangeProposals[timeChangeProposals.length-1].id + 1 : 1;
  const p = { id, childId: req.body.childId || 1, type: req.body.type || 'pickup', proposedISO: req.body.proposedISO || new Date().toISOString(), note: req.body.note || '', proposerId: req.body.proposerId || 0 };
  timeChangeProposals.unshift(p);
  res.status(201).json(p);
});

app.post('/api/children/respond-time-change', (req, res) => {
  const { proposalId, action } = req.body;
  const idx = timeChangeProposals.findIndex(t => t.id === proposalId);
  if (idx !== -1) {
    const item = timeChangeProposals[idx];
    item.action = action;
    res.json({ ok: true, item });
  } else res.status(404).json({ error: 'not found' });
});

app.post('/api/media/sign', (req, res) => {
  // return fake presign info
  const key = req.body.key || `uploads/${Date.now()}`;
  res.json({ url: `http://minio:9000/${key}`, fields: {}, key });
});

app.post('/api/media/upload', upload.single('file'), (req, res) => {
  // Minimal upload endpoint for dev/testing.
  const filename = req.file && req.file.originalname ? String(req.file.originalname) : `upload-${Date.now()}`;
  slog.info('media', 'Upload received (mock)', { hasFile: !!req.file, filename, bytes: req.file ? req.file.size : 0 });
  return res.json({ ok: true, url: `https://example.invalid/uploads/${encodeURIComponent(filename)}` });
});

app.get('/api/link/preview', (req, res) => {
  const url = (req.query && req.query.url) ? String(req.query.url) : '';
  if (!url) return res.status(400).json({ ok: false, error: 'url required' });
  // Minimal deterministic preview
  return res.json({
    url,
    title: url.replace(/^https?:\/\//i, '').slice(0, 64),
    description: '',
  });
});

// Push notifications (Expo)
app.post('/api/push/register', (req, res) => {
  const token = (req.body && req.body.token) ? String(req.body.token) : '';
  const userId = (req.body && req.body.userId) ? String(req.body.userId) : '';
  const platform = (req.body && req.body.platform) ? String(req.body.platform) : '';
  const enabled = (req.body && typeof req.body.enabled === 'boolean') ? req.body.enabled : true;
  const preferences = (req.body && typeof req.body.preferences === 'object') ? req.body.preferences : {};

  if (!token) return res.status(400).json({ ok: false, error: 'token required' });

  const now = new Date().toISOString();
  const idx = pushTokens.findIndex((t) => t.token === token);
  const record = { token, userId, platform, enabled, preferences, updatedAt: now };
  if (idx === -1) pushTokens.push(record);
  else pushTokens[idx] = record;

  res.json({ ok: true, stored: true });
});

app.post('/api/push/unregister', (req, res) => {
  const token = (req.body && req.body.token) ? String(req.body.token) : '';
  if (!token) return res.status(400).json({ ok: false, error: 'token required' });
  pushTokens = pushTokens.filter((t) => t.token !== token);
  res.json({ ok: true, removed: true });
});

app.get('/api/push/tokens', (req, res) => {
  res.json({ ok: true, tokens: pushTokens });
});

// Send a test push via Expo push service.
app.post('/api/push/send-test', async (req, res) => {
  const to = (req.body && req.body.to) ? String(req.body.to) : (pushTokens[0] ? pushTokens[0].token : '');
  if (!to) return res.status(400).json({ ok: false, error: 'no token available; register first' });

  const title = (req.body && req.body.title) ? String(req.body.title) : 'BuddyBoard Test';
  const body = (req.body && req.body.body) ? String(req.body.body) : 'This is a test push notification.';
  const data = (req.body && typeof req.body.data === 'object') ? req.body.data : { kind: 'test' };

  try {
    if (typeof fetch !== 'function') {
      return res.status(500).json({ ok: false, error: 'Node fetch() is not available. Use Node 18+ or add a fetch polyfill.' });
    }
    const payload = [{ to, title, body, data, sound: 'default' }];
    const resp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await resp.json();
    res.json({ ok: true, expo: json });
  } catch (e) {
    res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`API mock listening on port ${PORT}`));
