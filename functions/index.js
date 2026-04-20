const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();

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
  if (!preferences || typeof preferences !== 'object') return true;
  const keys = Object.keys(preferences);
  if (!keys.length) return true;
  if (kind === 'updates') return Boolean(preferences.updates ?? preferences.other ?? true);
  if (kind === 'other') return Boolean(preferences.other ?? preferences.updates ?? true);
  return true;
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

async function sendExpoPush(tokens, { title, body, data, kind } = {}) {
  if (!Array.isArray(tokens) || !tokens.length) return { ok: true, skipped: true, reason: 'no-tokens' };
  const unique = Array.from(new Set(tokens.map((t) => safeString(t).trim()))).filter(hasExpoPushToken);
  if (!unique.length) return { ok: true, skipped: true, reason: 'no-valid-tokens' };

  const messages = unique.map((to) => ({
    to,
    title: safeString(title || 'CommunityBridge'),
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
  const tickets = json && Array.isArray(json.data) ? json.data : null;
  const tokensToDelete = [];

  if (resp.ok && tickets && tickets.length === messages.length) {
    for (let i = 0; i < tickets.length; i += 1) {
      if (shouldDeleteTokenForExpoError(tickets[i])) tokensToDelete.push(messages[i].to);
    }
  }

  if (tokensToDelete.length) {
    try {
      const batch = admin.firestore().batch();
      tokensToDelete.forEach((t) => {
        const ref = admin.firestore().collection('pushTokens').doc(String(t));
        batch.delete(ref);
      });
      await batch.commit();
    } catch (_) {
      // ignore cleanup failures
    }
  }

  return { ok: resp.ok, status: resp.status, expo: json, deleted: tokensToDelete.length, kind: kind || undefined };
}

function isPrivateHostname(hostname) {
  const h = safeString(hostname).trim().toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.local')) return true;
  if (/^(127\.|10\.|192\.168\.|0\.|169\.254\.)/.test(h)) return true;
  // 172.16.0.0 – 172.31.255.255
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  return false;
}

async function fetchTextWithLimits(url, { timeoutMs = 5000, maxBytes = 1024 * 1024 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'CommunityBridgeLinkPreview/1.0',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const contentType = safeString(resp.headers.get('content-type'));
    if (!contentType.toLowerCase().includes('text/html')) {
      throw new Error(`Unsupported content-type: ${contentType || 'unknown'}`);
    }

    const arrayBuffer = await resp.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) throw new Error('Response too large');
    return Buffer.from(arrayBuffer).toString('utf8');
  } finally {
    clearTimeout(timeout);
  }
}

function extractMeta(html, nameOrProp) {
  const key = safeString(nameOrProp).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  const m = html.match(re);
  return m && m[1] ? String(m[1]).trim() : '';
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
  return m && m[1] ? String(m[1]).trim() : '';
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
  // Use an env var (preferred). Fallback keeps dev/test usable but should be set in prod.
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
  // Minimal normalization. Prefer storing E.164 in user profile.
  const p = safeString(phone).trim();
  return p;
}

function getDisplayEmail(email) {
  const e = safeString(email).trim();
  return e;
}

async function sendEmailOtp({ to, code }) {
  const smtpUrl = safeString(process.env.CB_SMTP_URL || process.env.BB_SMTP_URL).trim();
  if (!smtpUrl) {
    const err = new Error('Email 2FA is not configured (missing CB_SMTP_URL/BB_SMTP_URL).');
    err.code = 'BB_MFA_EMAIL_NOT_CONFIGURED';
    throw err;
  }

  let nodemailer;
  try {
    // Lazy-load to keep deploy analysis fast.
    // eslint-disable-next-line global-require
    nodemailer = require('nodemailer');
  } catch (_) {
    const err = new Error('Email 2FA dependency missing (nodemailer).');
    err.code = 'BB_MFA_EMAIL_DEP_MISSING';
    throw err;
  }

  const from = safeString(process.env.CB_EMAIL_FROM || process.env.BB_EMAIL_FROM || process.env.CB_SMTP_FROM || process.env.BB_SMTP_FROM || 'info@communitybridge.app').trim();
  const transporter = nodemailer.createTransport(smtpUrl);
  const subject = 'CommunityBridge verification code';
  const text = `Your CommunityBridge verification code is: ${code}\n\nThis code expires in 10 minutes.`;

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
  });
}

async function sendSmsOtp({ to, code }) {
  const sid = safeString(process.env.CB_TWILIO_ACCOUNT_SID || process.env.BB_TWILIO_ACCOUNT_SID).trim();
  const token = safeString(process.env.CB_TWILIO_AUTH_TOKEN || process.env.BB_TWILIO_AUTH_TOKEN).trim();
  if (!sid || !token) {
    const err = new Error('SMS 2FA is not configured (missing CB_TWILIO_ACCOUNT_SID/CB_TWILIO_AUTH_TOKEN or BB_TWILIO_ACCOUNT_SID/BB_TWILIO_AUTH_TOKEN).');
    err.code = 'BB_MFA_SMS_NOT_CONFIGURED';
    throw err;
  }

  let twilioFactory;
  try {
    // Lazy-load to keep deploy analysis fast.
    // eslint-disable-next-line global-require
    twilioFactory = require('twilio');
  } catch (_) {
    const err = new Error('SMS 2FA dependency missing (twilio).');
    err.code = 'BB_MFA_SMS_DEP_MISSING';
    throw err;
  }

  const from = safeString(process.env.CB_TWILIO_FROM || process.env.BB_TWILIO_FROM).trim();
  const messagingServiceSid = safeString(process.env.CB_TWILIO_MESSAGING_SERVICE_SID || process.env.BB_TWILIO_MESSAGING_SERVICE_SID).trim();
  if (!from && !messagingServiceSid) {
    const err = new Error('SMS 2FA missing CB_TWILIO_FROM/CB_TWILIO_MESSAGING_SERVICE_SID or BB_TWILIO_FROM/BB_TWILIO_MESSAGING_SERVICE_SID.');
    err.code = 'BB_MFA_SMS_FROM_MISSING';
    throw err;
  }

  const client = twilioFactory(sid, token);
  const body = `CommunityBridge verification code: ${code} (expires in 10 minutes)`;
  const msg = { to, body };
  if (messagingServiceSid) msg.messagingServiceSid = messagingServiceSid;
  else msg.from = from;
  await client.messages.create(msg);
}

function sanitizeChallengeForClient(ch) {
  if (!ch || typeof ch !== 'object') return null;
  return {
    method: ch.method || null,
    to: ch.to || null,
    expiresAt: ch.expiresAt || null,
    sentAt: ch.sentAt || null,
  };
}

// Optional callable used by the mobile app. Safe no-op stub.
exports.linkPreview = functions.https.onCall(async (data, context) => {
  // Signed-in only (mirrors old authMiddleware behavior).
  if (!context.auth) return null;
  const rawUrl = data && data.url ? String(data.url).trim() : '';
  if (!rawUrl) return null;

  let u;
  try {
    u = new URL(rawUrl);
  } catch (_) {
    return null;
  }

  if (!['http:', 'https:'].includes(u.protocol)) return null;
  if (isPrivateHostname(u.hostname)) return null;

  try {
    const html = await fetchTextWithLimits(u.toString(), { timeoutMs: 5000, maxBytes: 1024 * 1024 });
    const ogTitle = extractMeta(html, 'og:title');
    const ogDesc = extractMeta(html, 'og:description');
    const ogImage = extractMeta(html, 'og:image');
    const title = ogTitle || extractTitle(html);
    const description = ogDesc || extractMeta(html, 'description');
    const image = ogImage;

    return {
      url: u.toString(),
      title: title || null,
      description: description || null,
      image: image || null,
    };
  } catch (_) {
    return null;
  }
});

// Send a one-time verification code (email by default; sms optional).
exports.mfaSendCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }

  const uid = safeString(context.auth.uid).trim();
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }

  const method = normalizeMethod(data?.method);
  const email = getDisplayEmail(context.auth.token?.email);

  // Destination: for email use auth email; for sms use user profile phone (or explicit override).
  let destination = null;
  if (method === 'email') {
    destination = email;
    if (!destination) {
      throw new functions.https.HttpsError('failed-precondition', 'No email address on account.');
    }
  } else {
    const phoneOverride = normalizePhone(data?.phone);
    if (phoneOverride) destination = phoneOverride;
    if (!destination) {
      const userSnap = await admin.firestore().collection('users').doc(uid).get();
      const userData = userSnap.exists ? (userSnap.data() || {}) : {};
      destination = normalizePhone(userData.phone || userData.phoneNumber || userData.mobile || '');
    }
    if (!destination) {
      throw new functions.https.HttpsError('failed-precondition', 'No phone number on profile.');
    }
  }

  const ref = admin.firestore().collection('mfaChallenges').doc(uid);
  const now = admin.firestore.Timestamp.now();
  const cooldownMs = 60 * 1000;
  const ttlMs = 10 * 60 * 1000;

  // Basic rate-limit: one send per minute per user.
  const existing = await ref.get();
  if (existing.exists) {
    const prev = existing.data() || {};
    const prevSentAt = prev.sentAt && typeof prev.sentAt.toMillis === 'function' ? prev.sentAt.toMillis() : 0;
    if (prevSentAt && (nowMs() - prevSentAt) < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - (nowMs() - prevSentAt)) / 1000);
      throw new functions.https.HttpsError('resource-exhausted', `Please wait ${waitSec}s before resending.`);
    }
  }

  const code = randomDigits(6);
  const secret = getMfaSecret();
  const codeHash = sha256Hex(`${uid}:${code}:${secret}`);
  const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + ttlMs);

  // Persist challenge before sending (so verify works even if send is slow).
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
    if (method === 'sms') {
      await sendSmsOtp({ to: destination, code });
    } else {
      await sendEmailOtp({ to: destination, code });
    }
  } catch (e) {
    // Best-effort cleanup: if delivery failed, remove challenge so user can retry.
    try { await ref.delete(); } catch (_) {}
    const msg = safeString(e?.message || e) || 'Failed to send verification code.';
    throw new functions.https.HttpsError('internal', msg);
  }

  return { ok: true, challenge: sanitizeChallengeForClient({ method, to: destination, sentAt: now, expiresAt }) };
});

// Verify a submitted code; on success, mark the user as MFA-verified.
exports.mfaVerifyCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }

  const uid = safeString(context.auth.uid).trim();
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }

  const code = safeString(data?.code).trim();
  if (!/^[0-9]{4,8}$/.test(code)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid code.');
  }

  const ref = admin.firestore().collection('mfaChallenges').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('failed-precondition', 'No active verification challenge.');
  }

  const ch = snap.data() || {};
  const expiresAtMs = ch.expiresAt && typeof ch.expiresAt.toMillis === 'function' ? ch.expiresAt.toMillis() : 0;
  if (!expiresAtMs || nowMs() > expiresAtMs) {
    try { await ref.delete(); } catch (_) {}
    throw new functions.https.HttpsError('deadline-exceeded', 'Verification code expired.');
  }

  const attempts = Number.isFinite(Number(ch.attempts)) ? Number(ch.attempts) : 0;
  const maxAttempts = Number.isFinite(Number(ch.maxAttempts)) ? Number(ch.maxAttempts) : 5;
  if (attempts >= maxAttempts) {
    try { await ref.delete(); } catch (_) {}
    throw new functions.https.HttpsError('resource-exhausted', 'Too many attempts. Request a new code.');
  }

  const secret = getMfaSecret();
  const expected = safeString(ch.codeHash).trim();
  const actual = sha256Hex(`${uid}:${code}:${secret}`);
  if (!expected || expected !== actual) {
    await ref.set(
      { attempts: attempts + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    throw new functions.https.HttpsError('permission-denied', 'Incorrect code.');
  }

  // Mark user verified (timestamp in profile). Keep claims optional for future use.
  const now = admin.firestore.FieldValue.serverTimestamp();
  await admin.firestore().collection('users').doc(uid).set(
    { mfaVerifiedAt: now },
    { merge: true }
  );

  try {
    await admin.auth().setCustomUserClaims(uid, { bb_mfa: true });
  } catch (_) {
    // Claims are best-effort; Firestore rules primarily rely on mfaVerifiedAt.
  }

  try { await ref.delete(); } catch (_) {}
  return { ok: true };
});

exports.onArrivalPingCreate = functions.firestore
  .document('arrivalPings/{pingId}')
  .onCreate(async (snap) => {
    const payload = snap.data() || {};
    const role = safeString(payload.role).trim().toLowerCase();
    if (role !== 'parent' && role !== 'therapist') return null;

    const actorId = safeString(payload.userId).trim();
    if (!actorId) return null;

    const childId = payload.childId != null ? safeString(payload.childId).trim() : '';
    const shiftId = payload.shiftId != null ? safeString(payload.shiftId).trim() : '';

    const bucketMs = 10 * 60 * 1000;
    const bucket = Math.floor(Date.now() / bucketMs);
    const dedupeId = `arrival_${actorId}_${childId || 'none'}_${shiftId || 'none'}_${bucket}`.slice(0, 1500);
    const dedupeRef = admin.firestore().collection('arrivalAlertDedupe').doc(dedupeId);

    const now = admin.firestore.FieldValue.serverTimestamp();
    const title = role === 'therapist' ? 'Therapist Arrival' : 'Parent Arrival';

    // Dedupe using a transaction: only one memo per actor/child/shift per 10-minute bucket.
    let createdMemoId = null;
    await admin.firestore().runTransaction(async (tx) => {
      const existing = await tx.get(dedupeRef);
      if (existing.exists) return;

      tx.create(dedupeRef, {
        actorId,
        role,
        childId: childId || null,
        shiftId: shiftId || null,
        pingId: snap.id,
        createdAt: now,
      });

      const memoRef = admin.firestore().collection('urgentMemos').doc();
      createdMemoId = memoRef.id;

      const meta = {
        lat: Number.isFinite(Number(payload.lat)) ? Number(payload.lat) : null,
        lng: Number.isFinite(Number(payload.lng)) ? Number(payload.lng) : null,
        distanceMiles: payload.distanceMiles != null ? Number(payload.distanceMiles) : null,
        dropZoneMiles: payload.dropZoneMiles != null ? Number(payload.dropZoneMiles) : null,
        eventId: payload.eventId != null ? safeString(payload.eventId) : null,
        shiftId: shiftId || null,
        when: payload.when != null ? safeString(payload.when) : null,
      };

      tx.set(memoRef, {
        type: 'arrival_alert',
        status: 'pending',
        proposerUid: actorId,
        actorRole: role,
        childId: childId || null,
        title,
        body: '',
        note: '',
        meta,
        createdAt: now,
        updatedAt: now,
      });
    });

    if (!createdMemoId) return null;

    // Push notify admins (best-effort).
    try {
      const usersSnap = await admin
        .firestore()
        .collection('users')
        .where('role', 'in', ['admin', 'administrator'])
        .get();

      const adminUids = usersSnap.docs.map((d) => d.id).filter(Boolean);
      if (!adminUids.length) return null;

      const tokens = [];
      for (const uid of adminUids) {
        const tSnap = await admin
          .firestore()
          .collection('pushTokens')
          .where('enabled', '==', true)
          .where('userUid', '==', uid)
          .limit(50)
          .get();

        tSnap.docs.forEach((d) => {
          const rec = d.data() || {};
          const token = safeString(rec.token || d.id).trim();
          if (!token) return;
          if (!pushPrefAllows(rec.preferences || {}, 'updates')) return;
          tokens.push(token);
        });
      }

      await sendExpoPush(tokens, {
        title,
        body: 'Arrival detected. Open Alerts.',
        data: { kind: 'arrival_alert', memoId: createdMemoId, actorId, actorRole: role, childId: childId || null },
        kind: 'updates',
      });
    } catch (_) {
      // ignore push failures
    }

    return null;
  });
