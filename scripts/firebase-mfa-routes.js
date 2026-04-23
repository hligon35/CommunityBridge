'use strict';

const crypto = require('crypto');

let firebaseAdmin = null;
function getAdmin() {
  if (firebaseAdmin) return firebaseAdmin;
  // eslint-disable-next-line global-require
  firebaseAdmin = require('firebase-admin');
  try {
    if (!firebaseAdmin.apps || !firebaseAdmin.apps.length) {
      firebaseAdmin.initializeApp();
    }
  } catch (_) {
    // initializeApp can throw if called twice; ignore.
  }
  return firebaseAdmin;
}

function safeString(v) {
  try {
    if (v == null) return '';
    return String(v);
  } catch (_) {
    return '';
  }
}

function nowMs() {
  return Date.now();
}

function randomDigits(len) {
  const n = Number(len) || 6;
  const max = 10 ** n;
  const v = crypto.randomInt(0, max);
  return String(v).padStart(n, '0');
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input || '')).digest('hex');
}

function getMfaSecret() {
  const fromEnv = safeString(process.env.CB_MFA_CODE_SECRET || process.env.BB_MFA_CODE_SECRET).trim();
  if (fromEnv) return fromEnv;
  const fromProject = safeString(process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT).trim();
  return fromProject || 'bb_mfa_default_secret';
}

function normalizeMethod(method) {
  const m = safeString(method).trim().toLowerCase();
  if (m === 'sms') return 'sms';
  return 'email';
}

function normalizePhone(phone) {
  return safeString(phone).trim();
}

function getDisplayEmail(email) {
  return safeString(email).trim();
}

function isDevOtpFallbackEnabled() {
  const env = safeString(process.env.NODE_ENV).trim().toLowerCase();
  // Default-on for non-production to keep local dev unblocked.
  return env !== 'production';
}

async function sendEmailOtp({ to, code }) {
  const smtpUrl = safeString(process.env.CB_SMTP_URL || process.env.BB_SMTP_URL).trim();
  if (!smtpUrl) {
    if (isDevOtpFallbackEnabled()) {
      // Local dev fallback: print the code to server logs.
      // Do NOT enable in production.
      // eslint-disable-next-line no-console
      console.log(`[mfa][dev] Email OTP for ${to}: ${code}`);
      return;
    }

    const err = new Error('Email 2FA is not configured (missing CB_SMTP_URL/BB_SMTP_URL).');
    err.code = 'BB_MFA_EMAIL_NOT_CONFIGURED';
    throw err;
  }

  let nodemailer;
  try {
    // eslint-disable-next-line global-require
    nodemailer = require('nodemailer');
  } catch (_) {
    if (isDevOtpFallbackEnabled()) {
      // eslint-disable-next-line no-console
      console.log(`[mfa][dev] Email OTP for ${to}: ${code}`);
      return;
    }

    const err = new Error('Email 2FA dependency missing (nodemailer).');
    err.code = 'BB_MFA_EMAIL_DEP_MISSING';
    throw err;
  }

  const from = safeString(
    process.env.CB_EMAIL_FROM ||
    process.env.BB_EMAIL_FROM ||
    process.env.CB_SMTP_FROM ||
    process.env.BB_SMTP_FROM ||
    'info@communitybridge.app'
  ).trim();

  const subject = safeString(process.env.CB_EMAIL_2FA_SUBJECT || process.env.BB_EMAIL_2FA_SUBJECT || 'CommunityBridge verification code').trim();
  const text = `Your CommunityBridge verification code is: ${code}\n\nThis code expires in 10 minutes.`;

  const transporter = nodemailer.createTransport(smtpUrl);
  await transporter.sendMail({ from, to, subject, text });
}

async function sendSmsOtp({ to, code }) {
  const sid = safeString(process.env.CB_TWILIO_ACCOUNT_SID || process.env.BB_TWILIO_ACCOUNT_SID).trim();
  const token = safeString(process.env.CB_TWILIO_AUTH_TOKEN || process.env.BB_TWILIO_AUTH_TOKEN).trim();
  if (!sid || !token) {
    if (isDevOtpFallbackEnabled()) {
      // eslint-disable-next-line no-console
      console.log(`[mfa][dev] SMS OTP for ${to}: ${code}`);
      return;
    }

    const err = new Error('SMS 2FA is not configured (missing CB_TWILIO_ACCOUNT_SID/CB_TWILIO_AUTH_TOKEN or BB_TWILIO_ACCOUNT_SID/BB_TWILIO_AUTH_TOKEN).');
    err.code = 'BB_MFA_SMS_NOT_CONFIGURED';
    throw err;
  }

  let twilioFactory;
  try {
    // eslint-disable-next-line global-require
    twilioFactory = require('twilio');
  } catch (_) {
    if (isDevOtpFallbackEnabled()) {
      // eslint-disable-next-line no-console
      console.log(`[mfa][dev] SMS OTP for ${to}: ${code}`);
      return;
    }

    const err = new Error('SMS 2FA dependency missing (twilio).');
    err.code = 'BB_MFA_SMS_DEP_MISSING';
    throw err;
  }

  const from = safeString(process.env.CB_TWILIO_FROM || process.env.BB_TWILIO_FROM).trim();
  const messagingServiceSid = safeString(process.env.CB_TWILIO_MESSAGING_SERVICE_SID || process.env.BB_TWILIO_MESSAGING_SERVICE_SID).trim();
  if (!from && !messagingServiceSid) {
    if (isDevOtpFallbackEnabled()) {
      // eslint-disable-next-line no-console
      console.log(`[mfa][dev] SMS OTP for ${to}: ${code}`);
      return;
    }

    const err = new Error('SMS 2FA missing CB_TWILIO_FROM/CB_TWILIO_MESSAGING_SERVICE_SID or BB_TWILIO_FROM/BB_TWILIO_MESSAGING_SERVICE_SID.');
    err.code = 'BB_MFA_SMS_FROM_MISSING';
    throw err;
  }

  const client = twilioFactory(sid, token);
  const msg = { to, body: `Your CommunityBridge verification code is: ${code}` };
  if (messagingServiceSid) msg.messagingServiceSid = messagingServiceSid;
  else msg.from = from;

  await client.messages.create(msg);
}

function sanitizeChallengeForClient({ method, to, sentAtMs, expiresAtMs }) {
  return {
    method: method || null,
    to: to || null,
    sentAt: Number.isFinite(Number(sentAtMs)) ? new Date(Number(sentAtMs)).toISOString() : null,
    expiresAt: Number.isFinite(Number(expiresAtMs)) ? new Date(Number(expiresAtMs)).toISOString() : null,
  };
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const raw = safeString(header);
  if (!raw.toLowerCase().startsWith('bearer ')) return '';
  return raw.slice(7).trim();
}

async function requireFirebaseUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    const err = new Error('Missing Authorization header.');
    err.httpStatus = 401;
    err.code = 'BB_NOT_AUTHENTICATED';
    throw err;
  }

  const admin = getAdmin();
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    if (!decoded || !decoded.uid) {
      const e = new Error('Invalid token.');
      e.httpStatus = 401;
      e.code = 'BB_NOT_AUTHENTICATED';
      throw e;
    }
    return decoded;
  } catch (e) {
    const err = new Error('Unauthorized.');
    err.httpStatus = 401;
    err.code = 'BB_NOT_AUTHENTICATED';
    err.cause = e;
    throw err;
  }
}

function sendError(res, err) {
  const status = Number(err?.httpStatus) || 400;
  const code = safeString(err?.code).trim() || 'BB_MFA_ERROR';
  const message = safeString(err?.message).trim() || 'Request failed.';
  return res.status(status).json({ ok: false, code, error: message });
}

function registerFirebaseMfaRoutes(app) {
  if (!app || typeof app.post !== 'function') throw new Error('registerFirebaseMfaRoutes requires an Express app');

  app.post('/api/mfa/send', async (req, res) => {
    try {
      const decoded = await requireFirebaseUser(req);
      const uid = safeString(decoded.uid).trim();
      if (!uid) {
        const err = new Error('Sign in required.');
        err.httpStatus = 401;
        err.code = 'BB_NOT_AUTHENTICATED';
        return sendError(res, err);
      }

      const method = normalizeMethod(req.body?.method || req.body?.channel || req.body?.type);
      const email = getDisplayEmail(decoded.email);

      let destination = null;
      if (method === 'email') {
        destination = email;
        if (!destination) {
          const err = new Error('No email address on account.');
          err.httpStatus = 400;
          err.code = 'BB_MFA_NO_EMAIL';
          return sendError(res, err);
        }
      } else {
        const phoneOverride = normalizePhone(req.body?.phone);
        if (phoneOverride) destination = phoneOverride;
        if (!destination) {
          const admin = getAdmin();
          const userSnap = await admin.firestore().collection('users').doc(uid).get();
          const userData = userSnap.exists ? (userSnap.data() || {}) : {};
          destination = normalizePhone(userData.phone || userData.phoneNumber || userData.mobile || '');
        }
        if (!destination) {
          const err = new Error('No phone number on profile.');
          err.httpStatus = 400;
          err.code = 'BB_MFA_NO_PHONE';
          return sendError(res, err);
        }
      }

      const admin = getAdmin();
      const ref = admin.firestore().collection('mfaChallenges').doc(uid);
      const now = admin.firestore.Timestamp.now();
      const cooldownMs = 60 * 1000;
      const ttlMs = 10 * 60 * 1000;

      const existing = await ref.get();
      if (existing.exists) {
        const prev = existing.data() || {};
        const prevSentAt = prev.sentAt && typeof prev.sentAt.toMillis === 'function' ? prev.sentAt.toMillis() : 0;
        if (prevSentAt && (nowMs() - prevSentAt) < cooldownMs) {
          const waitSec = Math.ceil((cooldownMs - (nowMs() - prevSentAt)) / 1000);
          const err = new Error(`Please wait ${waitSec}s before resending.`);
          err.httpStatus = 429;
          err.code = 'BB_MFA_RATE_LIMITED';
          return sendError(res, err);
        }
      }

      const code = randomDigits(6);
      const secret = getMfaSecret();
      const codeHash = sha256Hex(`${uid}:${code}:${secret}`);
      const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + ttlMs);

      await ref.set(
        {
          uid,
          method,
          to: destination,
          codeHash,
          attempts: 0,
          maxAttempts: 5,
          sentAt: now,
          expiresAt,
          updatedAt: now,
        },
        { merge: true }
      );

      try {
        if (method === 'sms') await sendSmsOtp({ to: destination, code });
        else await sendEmailOtp({ to: destination, code });
      } catch (e) {
        try { await ref.delete(); } catch (_) {}
        const msg = safeString(e?.message || e) || 'Failed to send verification code.';
        const err = new Error(msg);
        err.httpStatus = 500;
        err.code = safeString(e?.code).trim() || 'BB_MFA_DELIVERY_FAILED';
        return sendError(res, err);
      }

      return res.json({ ok: true, challenge: sanitizeChallengeForClient({ method, to: destination, sentAtMs: now.toMillis(), expiresAtMs: expiresAt.toMillis() }) });
    } catch (e) {
      return sendError(res, e);
    }
  });

  app.post('/api/mfa/verify', async (req, res) => {
    try {
      const decoded = await requireFirebaseUser(req);
      const uid = safeString(decoded.uid).trim();
      if (!uid) {
        const err = new Error('Sign in required.');
        err.httpStatus = 401;
        err.code = 'BB_NOT_AUTHENTICATED';
        return sendError(res, err);
      }

      const code = safeString(req.body?.code).trim();
      if (!/^[0-9]{4,8}$/.test(code)) {
        const err = new Error('Invalid code.');
        err.httpStatus = 400;
        err.code = 'BB_MFA_CODE_INVALID';
        return sendError(res, err);
      }

      const admin = getAdmin();
      const ref = admin.firestore().collection('mfaChallenges').doc(uid);
      const snap = await ref.get();
      if (!snap.exists) {
        const err = new Error('No active verification challenge.');
        err.httpStatus = 400;
        err.code = 'BB_MFA_NO_CHALLENGE';
        return sendError(res, err);
      }

      const ch = snap.data() || {};
      const expiresAtMs = ch.expiresAt && typeof ch.expiresAt.toMillis === 'function' ? ch.expiresAt.toMillis() : 0;
      if (!expiresAtMs || nowMs() > expiresAtMs) {
        try { await ref.delete(); } catch (_) {}
        const err = new Error('Verification code expired.');
        err.httpStatus = 400;
        err.code = 'BB_MFA_CODE_EXPIRED';
        return sendError(res, err);
      }

      const attempts = Number.isFinite(Number(ch.attempts)) ? Number(ch.attempts) : 0;
      const maxAttempts = Number.isFinite(Number(ch.maxAttempts)) ? Number(ch.maxAttempts) : 5;
      if (attempts >= maxAttempts) {
        try { await ref.delete(); } catch (_) {}
        const err = new Error('Too many attempts. Request a new code.');
        err.httpStatus = 429;
        err.code = 'BB_MFA_TOO_MANY_ATTEMPTS';
        return sendError(res, err);
      }

      const secret = getMfaSecret();
      const expected = safeString(ch.codeHash).trim();
      const actual = sha256Hex(`${uid}:${code}:${secret}`);
      if (!expected || expected !== actual) {
        await ref.set(
          { attempts: attempts + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
        const err = new Error('Incorrect code.');
        err.httpStatus = 403;
        err.code = 'BB_MFA_CODE_INCORRECT';
        return sendError(res, err);
      }

      await admin.firestore().collection('users').doc(uid).set(
        { mfaVerifiedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );

      try {
        await admin.auth().setCustomUserClaims(uid, { bb_mfa: true });
      } catch (_) {
        // best-effort
      }

      try { await ref.delete(); } catch (_) {}
      return res.json({ ok: true });
    } catch (e) {
      return sendError(res, e);
    }
  });
}

module.exports = { registerFirebaseMfaRoutes };
