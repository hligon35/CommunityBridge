const functions = require('firebase-functions');
const admin = require('firebase-admin');

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
        'User-Agent': 'BuddyBoardLinkPreview/1.0',
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
