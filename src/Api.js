import { Platform } from 'react-native';
import { logger } from './utils/logger';
import { getAuthInstance, getAuthInitError, db, storage, functions } from './firebase';

import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  getIdToken,
  deleteUser,
} from 'firebase/auth';

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { httpsCallable } from 'firebase/functions';

import { getDownloadURL, ref, uploadString } from 'firebase/storage';

function normalizeEmailInput(email) {
  try {
    if (email == null) return '';
    return String(email).trim().toLowerCase();
  } catch (_) {
    return '';
  }
}

function isoFromMaybeTimestamp(v) {
  try {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (v instanceof Date) return v.toISOString();
    if (typeof v.toDate === 'function') return v.toDate().toISOString(); // Firestore Timestamp
  } catch (_) {
    // ignore
  }
  return null;
}

function requireUser() {
  const a = getAuthInstance();
  const u = a?.currentUser;
  if (!u) {
    const err = new Error('Not authenticated');
    err.code = 'BB_NOT_AUTHENTICATED';
    throw err;
  }
  return u;
}

function requireAuth() {
  const a = getAuthInstance();
  if (a) return a;

  const initErr = getAuthInitError();
  const msg = initErr?.message
    ? `Firebase Auth is not initialized: ${initErr.message}`
    : 'Firebase Auth is not initialized.';

  const err = new Error(msg);
  err.code = 'BB_AUTH_INIT_FAILED';
  err.cause = initErr || null;
  throw err;
}

export const API_BASE_URL = '';

let unauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = typeof fn === 'function' ? fn : null;
}

export function setAuthToken(_) {
  // Compatibility no-op: Firebase Auth manages tokens internally.
}

async function getUserProfile(uid) {
  if (!db) {
    const err = new Error('Firebase is not initialized (missing Firestore instance).');
    err.code = 'BB_FIREBASE_INIT_FAILED';
    throw err;
  }
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  const mfaIsTimestamp = Boolean(data.mfaVerifiedAt && typeof data.mfaVerifiedAt.toDate === 'function');
  return {
    id: uid,
    ...data,
    createdAt: isoFromMaybeTimestamp(data.createdAt) || data.createdAt || null,
    updatedAt: isoFromMaybeTimestamp(data.updatedAt) || data.updatedAt || null,
    mfaVerifiedAt: isoFromMaybeTimestamp(data.mfaVerifiedAt) || data.mfaVerifiedAt || null,
    mfaVerifiedAtIsTimestamp: mfaIsTimestamp,
  };
}

async function upsertUserProfile(uid, fields) {
  if (!db) {
    const err = new Error('Firebase is not initialized (missing Firestore instance).');
    err.code = 'BB_FIREBASE_INIT_FAILED';
    throw err;
  }
  const now = serverTimestamp();
  await setDoc(
    doc(db, 'users', uid),
    {
      ...fields,
      id: uid,
      updatedAt: now,
      ...(fields?.createdAt ? {} : { createdAt: now }),
    },
    { merge: true }
  );
  return getUserProfile(uid);
}

export async function login(email, password) {
  const e = normalizeEmailInput(email);
  const a = requireAuth();
  const cred = await signInWithEmailAndPassword(a, e, String(password || ''));
  const token = await getIdToken(cred.user, true);
  const profile = (await getUserProfile(cred.user.uid)) || (await upsertUserProfile(cred.user.uid, {
    name: cred.user.displayName || '',
    email: e,
    role: 'parent',
  }));
  return { token, user: profile };
}

export async function loginWithGoogle(idToken) {
  const a = requireAuth();
  const credential = GoogleAuthProvider.credential(String(idToken || ''));
  const cred = await signInWithCredential(a, credential);
  const token = await getIdToken(cred.user, true);
  const email = normalizeEmailInput(cred.user.email);
  const profile = (await getUserProfile(cred.user.uid)) || (await upsertUserProfile(cred.user.uid, {
    name: cred.user.displayName || '',
    email,
    role: 'parent',
  }));
  return { token, user: profile };
}

export async function signup(payload) {
  const a = requireAuth();
  const name = String(payload?.name || '').trim();
  const email = normalizeEmailInput(payload?.email);
  const password = String(payload?.password || '');
  const role = String(payload?.role || 'parent');

  const cred = await createUserWithEmailAndPassword(a, email, password);
  try {
    if (name) await updateProfile(cred.user, { displayName: name });
  } catch (_) {
    // ignore
  }

  const profile = await upsertUserProfile(cred.user.uid, {
    name,
    email,
    role,
  });
  const token = await getIdToken(cred.user, true);

  // Secure-by-default directory access: create a self-owned parent directory record + link on signup.
  // Admins can later re-link accounts to seeded directory records if desired.
  try {
    const roleLower = String(role || '').toLowerCase();
    if (roleLower.includes('parent')) {
      const parentId = cred.user.uid;

      await setDoc(
        doc(db, 'parents', parentId),
        indexDirectoryRecord({
          uid: cred.user.uid,
          name: name || profile?.name || '',
          email: email || profile?.email || '',
          familyId: cred.user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );

      await setDoc(
        doc(db, 'directoryLinks', cred.user.uid),
        {
          role: 'parent',
          parentId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (_) {
    // ignore (rules or offline); core signup should still succeed
  }

  return { token, user: profile };
}

export async function verify2fa(_) {
  requireUser();
  if (!functions) {
    const err = new Error('Firebase Functions is not initialized.');
    err.code = 'BB_FUNCTIONS_INIT_FAILED';
    throw err;
  }

  const code = (typeof _ === 'string') ? _ : String(_?.code || '').trim();
  if (!code) {
    const err = new Error('Missing verification code.');
    err.code = 'BB_MFA_CODE_REQUIRED';
    throw err;
  }

  const fn = httpsCallable(functions, 'mfaVerifyCode');
  try {
    await fn({ code });
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/\b403\b|forbidden|does not have permission/i.test(msg)) {
      const err = new Error(
        'Two-step verification is blocked on web dev because the Cloud Function is not publicly invokable (HTTP 403).\n\n' +
        'Fix: grant roles/cloudfunctions.invoker to allUsers for mfaSendCode + mfaVerifyCode in project communitybridge-26apr (region us-central1).'
      );
      err.code = 'BB_MFA_FUNCTION_FORBIDDEN';
      throw err;
    }
    throw e;
  }

  // Refresh the Firebase ID token (claims may change) and then reload user profile.
  try {
    const a = getAuthInstance();
    await a?.currentUser?.getIdToken(true);
  } catch (_) {}

  const profile = await me().catch(() => null);
  return { ok: true, user: profile || null };
}

export async function resend2fa(_) {
  requireUser();
  if (!functions) {
    const err = new Error('Firebase Functions is not initialized.');
    err.code = 'BB_FUNCTIONS_INIT_FAILED';
    throw err;
  }

  const method = String(_?.method || _?.channel || _?.type || 'email').trim().toLowerCase();
  const phone = _?.phone != null ? String(_?.phone).trim() : '';
  const fn = httpsCallable(functions, 'mfaSendCode');
  let resp;
  try {
    resp = await fn({ method: method === 'sms' ? 'sms' : 'email', ...(phone ? { phone } : {}) });
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/\b403\b|forbidden|does not have permission/i.test(msg)) {
      const err = new Error(
        'Could not send verification code because the Cloud Function is not publicly invokable from the browser (HTTP 403).\n\n' +
        'Fix: grant roles/cloudfunctions.invoker to allUsers for mfaSendCode in project communitybridge-26apr (region us-central1).'
      );
      err.code = 'BB_MFA_FUNCTION_FORBIDDEN';
      throw err;
    }
    throw e;
  }
  return { ok: true, ...(resp?.data || {}) };
}

export async function requestPasswordReset(email) {
  const a = requireAuth();
  const e = normalizeEmailInput(email);
  await sendPasswordResetEmail(a, e);
  return { ok: true };
}

export async function resetPassword(_) {
  // Firebase uses the email reset link flow; this legacy "resetCode" flow isn't supported.
  const err = new Error('Password reset must be completed via the email link.');
  err.code = 'BB_PASSWORD_RESET_LINK_REQUIRED';
  throw err;
}

export async function me() {
  const u = requireUser();
  const profile = await getUserProfile(u.uid);
  return profile;
}

export async function updateMe(payload) {
  const u = requireUser();
  const next = { ...(payload || {}) };

  // Keep Firebase Auth profile loosely in sync for displayName/photoURL.
  try {
    const update = {};
    if (next.name != null) update.displayName = String(next.name);
    if (next.avatar != null) update.photoURL = String(next.avatar);
    if (Object.keys(update).length) await updateProfile(u, update);
  } catch (_) {
    // ignore
  }

  const profile = await upsertUserProfile(u.uid, next);
  return { ok: true, user: profile };
}

async function getPostComments(postId, max = 50) {
  const commentsRef = collection(db, 'posts', String(postId), 'comments');
  const q = query(commentsRef, orderBy('createdAt', 'desc'), limit(max));
  const snap = await getDocs(q);

  const all = snap.docs.map((d) => {
    const data = d.data() || {};
    return {
      id: d.id,
      ...data,
      createdAt: isoFromMaybeTimestamp(data.createdAt) || new Date().toISOString(),
    };
  });

  // Build a reply tree using parentId.
  const byId = new Map(all.map((c) => [String(c.id), { ...c, replies: [] }]));
  const roots = [];
  all.forEach((c) => {
    const id = String(c.id);
    const node = byId.get(id);
    const parentId = c.parentId ? String(c.parentId) : '';
    if (parentId && byId.has(parentId)) {
      byId.get(parentId).replies.push(node);
    } else {
      roots.push(node);
    }
  });

  // Return oldest-first for UI.
  roots.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  roots.forEach((r) => (r.replies || []).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));

  return roots;
}

export async function getPosts() {
  const postsRef = collection(db, 'posts');
  const q = query(postsRef, orderBy('createdAt', 'desc'), limit(50));
  const snap = await getDocs(q);

  const items = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data() || {};
      const comments = await getPostComments(d.id, 75).catch(() => []);
      return {
        id: d.id,
        ...data,
        createdAt: isoFromMaybeTimestamp(data.createdAt) || new Date().toISOString(),
        likes: typeof data.likes === 'number' ? data.likes : (Number(data.likes) || 0),
        shares: typeof data.shares === 'number' ? data.shares : (Number(data.shares) || 0),
        comments,
      };
    })
  );

  return items;
}

export async function createPost(payload) {
  const u = requireUser();
  const profile = await getUserProfile(u.uid);

  const body = String(payload?.body || payload?.text || '').trim();
  const title = payload?.title != null ? String(payload.title) : '';
  const image = payload?.image != null ? String(payload.image) : null;

  const author = {
    id: u.uid,
    name: profile?.name || u.displayName || 'User',
    avatar: profile?.avatar || u.photoURL || null,
  };

  const docRef = await addDoc(collection(db, 'posts'), {
    title,
    body,
    text: body,
    image,
    author,
    likes: 0,
    shares: 0,
    createdAt: serverTimestamp(),
  });

  return {
    id: docRef.id,
    title,
    body,
    text: body,
    image,
    author,
    likes: 0,
    shares: 0,
    comments: [],
    createdAt: new Date().toISOString(),
  };
}

export async function likePost(postId) {
  const u = requireUser();
  try {
    await updateDoc(doc(db, 'posts', String(postId)), { likes: increment(1) });
    const snap = await getDoc(doc(db, 'posts', String(postId)));
    const data = snap.exists() ? snap.data() : {};
    return { id: String(postId), likes: typeof data?.likes === 'number' ? data.likes : (Number(data?.likes) || 0) };
  } catch (e) {
    // Treat permission errors as unauthorized, for parity with the old 401 flow.
    if (unauthorizedHandler && String(e?.code || '').includes('permission-denied')) {
      unauthorizedHandler({ method: 'FIRESTORE', url: `posts/${postId}`, status: 401 });
    }
    throw e;
  }
}

export async function commentPost(postId, comment) {
  const u = requireUser();
  const profile = await getUserProfile(u.uid);

  const author = {
    id: u.uid,
    name: profile?.name || u.displayName || 'User',
    avatar: profile?.avatar || u.photoURL || null,
    email: profile?.email || u.email || null,
  };

  const body = (typeof comment === 'string') ? comment : (comment?.body || comment?.text || comment?.comment || '');
  const parentId = comment?.parentId != null ? String(comment.parentId) : null;

  const createdAtIso = new Date().toISOString();
  const refDoc = await addDoc(collection(db, 'posts', String(postId), 'comments'), {
    body: String(body || '').trim(),
    author,
    parentId,
    reactions: {},
    userReactions: {},
    createdAt: serverTimestamp(),
  });

  return {
    id: refDoc.id,
    body: String(body || '').trim(),
    author,
    parentId,
    reactions: {},
    userReactions: {},
    createdAt: createdAtIso,
  };
}

export async function reactComment(postId, commentId, emoji) {
  const u = requireUser();
  const normalizedEmoji = (emoji && typeof emoji === 'object') ? (emoji.emoji || emoji.reaction || emoji.value) : emoji;
  const value = String(normalizedEmoji || '').trim();
  if (!value) return { ok: false };

  const cRef = doc(db, 'posts', String(postId), 'comments', String(commentId));
  const snap = await getDoc(cRef);
  if (!snap.exists()) return { ok: false };
  const data = snap.data() || {};
  const reactions = { ...(data.reactions || {}) };
  const userReactions = { ...(data.userReactions || {}) };
  const prev = userReactions[u.uid];

  if (prev === value) {
    reactions[value] = Math.max(0, (reactions[value] || 1) - 1);
    delete userReactions[u.uid];
  } else {
    if (prev) reactions[prev] = Math.max(0, (reactions[prev] || 1) - 1);
    reactions[value] = (reactions[value] || 0) + 1;
    userReactions[u.uid] = value;
  }

  await updateDoc(cRef, { reactions, userReactions });
  return { ok: true };
}

function extractFirstFileFromFormData(formData) {
  try {
    const parts = formData?._parts;
    if (!Array.isArray(parts)) return null;
    for (const p of parts) {
      if (!Array.isArray(p) || p.length < 2) continue;
      const [key, value] = p;
      if (key === 'file' && value && typeof value === 'object' && value.uri) return value;
    }
  } catch (_) {
    // ignore
  }
  return null;
}

export async function uploadMedia(formData) {
  const u = requireUser();
  const file = extractFirstFileFromFormData(formData);
  if (!file?.uri) throw new Error('Missing file');

  // Read file as base64 to avoid blob issues on native.
  let base64;
  try {
    // eslint-disable-next-line global-require
    const FileSystem = require('expo-file-system');
    base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
  } catch (e) {
    throw new Error(`Unable to read file: ${e?.message || e}`);
  }

  const name = String(file.name || '').trim() || `upload-${Date.now()}`;
  const contentType = String(file.type || 'application/octet-stream');
  const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, '_');

  const path = `uploads/${u.uid}/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, path);
  await uploadString(storageRef, base64, 'base64', { contentType });
  const url = await getDownloadURL(storageRef);
  return { ok: true, url, path };
}

export async function signS3(_) {
  return { ok: false, skipped: true };
}

export async function getLinkPreview(url) {
  // Optional enhancement via Cloud Function; fall back to null if not deployed.
  try {
    const fn = httpsCallable(functions, 'linkPreview');
    const res = await fn({ url: String(url || '') });
    return res?.data || null;
  } catch (_) {
    return null;
  }
}

export async function deleteMyAccount(payload) {
  const user = requireUser();
  const uid = String(user.uid || '').trim();
  if (!uid) {
    const err = new Error('Not authenticated');
    err.code = 'BB_NOT_AUTHENTICATED';
    throw err;
  }

  if (payload?.confirm !== true) {
    const err = new Error('Confirmation required');
    err.code = 'BB_CONFIRM_REQUIRED';
    throw err;
  }

  if (!db) {
    const err = new Error('Firebase is not initialized (missing Firestore instance).');
    err.code = 'BB_FIREBASE_INIT_FAILED';
    throw err;
  }

  // Best-effort cleanup of Firestore docs owned by this user.
  // These deletes rely on Firestore rules allowing self-deletion.
  try {
    const tokensQ = query(collection(db, 'pushTokens'), where('userUid', '==', uid), limit(200));
    const tokensSnap = await getDocs(tokensQ);
    const batch = writeBatch(db);
    tokensSnap.docs.forEach((d) => batch.delete(d.ref));

    batch.delete(doc(db, 'directoryLinks', uid));
    batch.delete(doc(db, 'parents', uid));
    batch.delete(doc(db, 'users', uid));
    await batch.commit();
  } catch (e) {
    logger.warn('[deleteMyAccount] Firestore cleanup failed', { message: e?.message || String(e) });
  }

  // Finally delete the Firebase Auth user.
  await deleteUser(user);
  return { ok: true };
}

export async function getUrgentMemos() {
  const u = requireUser();
  const role = (await getUserProfile(u.uid))?.role || 'parent';

  const memosRef = collection(db, 'urgentMemos');
  // Note: This assumes memos are tagged by audienceRole. If you want per-user targeting,
  // add recipient IDs and query by array-contains.
  const q = query(memosRef, orderBy('createdAt', 'desc'), limit(100));
  const snap = await getDocs(q);

  return snap.docs
    .map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        ...data,
        createdAt: isoFromMaybeTimestamp(data.createdAt) || new Date().toISOString(),
      };
    })
    .filter((m) => {
      const audience = (m.audienceRole || '').toString().toLowerCase();
      if (!audience) return true;
      return audience === String(role || '').toLowerCase() || audience === 'all';
    });
}

export async function health() {
  return { ok: true, backend: 'firebase', platform: Platform.OS };
}

export async function ackUrgentMemo(memoIds) {
  const u = requireUser();
  const ids = Array.isArray(memoIds) ? memoIds : [memoIds];
  const batch = writeBatch(db);
  ids.filter(Boolean).forEach((id) => {
    batch.set(doc(db, 'urgentMemos', String(id), 'reads', u.uid), { readAt: serverTimestamp() }, { merge: true });
  });
  await batch.commit();
  return { ok: true };
}

export async function sendUrgentMemo(memo) {
  requireUser();
  const clean = { ...(memo || {}) };
  const id = clean.id ? String(clean.id) : null;
  delete clean.id;

  if (id) {
    await setDoc(doc(db, 'urgentMemos', id), { ...clean, updatedAt: serverTimestamp(), createdAt: clean.createdAt ? clean.createdAt : serverTimestamp() }, { merge: true });
    const snap = await getDoc(doc(db, 'urgentMemos', id));
    const data = snap.data() || {};
    return { id, ...data, createdAt: isoFromMaybeTimestamp(data.createdAt) || new Date().toISOString() };
  }

  const refDoc = await addDoc(collection(db, 'urgentMemos'), { ...clean, createdAt: serverTimestamp() });
  return { id: refDoc.id, ...clean, createdAt: new Date().toISOString() };
}

export async function respondUrgentMemo(memoId, action) {
  requireUser();
  await updateDoc(doc(db, 'urgentMemos', String(memoId)), { status: String(action || ''), respondedAt: serverTimestamp() });
  return { ok: true };
}

async function findUserUidByEmail(email) {
  const e = normalizeEmailInput(email);
  if (!e) return null;
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('email', '==', e), limit(1));
  const snap = await getDocs(q);
  if (!snap.docs.length) return null;
  return snap.docs[0].id;
}

async function resolveRecipientUid(recipient) {
  const id = recipient?.id != null ? String(recipient.id) : '';
  const email = normalizeEmailInput(recipient?.email);

  // If id matches a user doc, treat it as uid.
  if (id) {
    const maybe = await getDoc(doc(db, 'users', id)).catch(() => null);
    if (maybe?.exists?.()) return id;
  }

  if (email) {
    const uid = await findUserUidByEmail(email);
    if (uid) return uid;
  }

  // Try resolving directory record to an email.
  if (id) {
    const p = await getDoc(doc(db, 'parents', id)).catch(() => null);
    const t = await getDoc(doc(db, 'therapists', id)).catch(() => null);

    const pEmail = p?.exists?.() ? p.data()?.email : '';
    const tEmail = t?.exists?.() ? t.data()?.email : '';
    const dirEmail = normalizeEmailInput(pEmail || tEmail);

    if (dirEmail) {
      const uid = await findUserUidByEmail(dirEmail);
      if (uid) return uid;
    }
  }

  return null;
}

export async function getMessages() {
  const u = requireUser();
  const profile = await getUserProfile(u.uid);
  const role = String(profile?.role || '').toLowerCase();

  const messagesRef = collection(db, 'messages');

  const queries = [];
  queries.push(query(messagesRef, where('participantUids', 'array-contains', u.uid), orderBy('createdAt', 'desc'), limit(300)));

  // Admin inbox: messages addressed to the admin role (for legacy "admin-1" recipients)
  if (role === 'admin' || role === 'administrator') {
    queries.push(query(messagesRef, where('toRoles', 'array-contains', 'admin'), orderBy('createdAt', 'desc'), limit(300)));
  }

  const snaps = await Promise.all(queries.map((qq) => getDocs(qq).catch(() => null)));
  const seen = new Set();
  const out = [];

  snaps.forEach((snap) => {
    if (!snap) return;
    snap.docs.forEach((d) => {
      if (seen.has(d.id)) return;
      seen.add(d.id);
      const data = d.data() || {};
      out.push({
        id: d.id,
        ...data,
        createdAt: isoFromMaybeTimestamp(data.createdAt) || new Date().toISOString(),
      });
    });
  });

  out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return out;
}

export async function sendMessage(payload) {
  const u = requireUser();
  const profile = await getUserProfile(u.uid);

  const threadId = payload?.threadId != null ? String(payload.threadId) : `t-${Date.now()}`;
  const body = String(payload?.body || '').trim();

  const to = Array.isArray(payload?.to) ? payload.to : [];

  const toRoles = [];
  const participantUids = new Set([u.uid]);

  for (const r of to) {
    const rid = r?.id != null ? String(r.id) : '';
    if (rid.startsWith('admin-')) {
      toRoles.push('admin');
      continue;
    }
    const uid = await resolveRecipientUid(r);
    if (uid) participantUids.add(uid);
  }

  const msg = {
    threadId,
    body,
    sender: {
      id: u.uid,
      name: profile?.name || u.displayName || 'User',
      avatar: profile?.avatar || u.photoURL || null,
    },
    to,
    toRoles: Array.from(new Set(toRoles)),
    participantUids: Array.from(participantUids),
    createdAt: serverTimestamp(),
  };

  const refDoc = await addDoc(collection(db, 'messages'), msg);

  return {
    id: refDoc.id,
    ...msg,
    createdAt: new Date().toISOString(),
  };
}

export async function pingArrival(payload) {
  requireUser();
  const clean = { ...(payload || {}) };
  await addDoc(collection(db, 'arrivalPings'), {
    ...clean,
    createdAt: serverTimestamp(),
  });
  return { ok: true };
}

export async function proposeTimeChange(payload) {
  const u = requireUser();
  const clean = { ...(payload || {}) };

  const toWrite = {
    ...clean,
    proposerUid: u.uid,
    status: clean.status || 'pending',
    createdAt: serverTimestamp(),
  };

  const refDoc = await addDoc(collection(db, 'timeChangeProposals'), toWrite);
  return { id: refDoc.id, ...toWrite, createdAt: new Date().toISOString() };
}

export async function getTimeChangeProposals() {
  const u = requireUser();
  const role = String((await getUserProfile(u.uid))?.role || 'parent').toLowerCase();

  const col = collection(db, 'timeChangeProposals');
  const q = (role === 'admin' || role === 'administrator')
    ? query(col, orderBy('createdAt', 'desc'), limit(200))
    : query(col, where('proposerUid', '==', u.uid), orderBy('createdAt', 'desc'), limit(200));

  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() || {};
    return { id: d.id, ...data, createdAt: isoFromMaybeTimestamp(data.createdAt) || new Date().toISOString() };
  });
}

function indexDirectoryRecord(rec) {
  const out = { ...(rec || {}) };
  if (out.email) out.emailNormalized = normalizeEmailInput(out.email);
  return out;
}

function indexChildRecord(child) {
  const out = { ...(child || {}) };
  // parentIds for query filtering
  const parents = Array.isArray(out.parents) ? out.parents : [];
  out.parentIds = parents.map((p) => (p && typeof p === 'object' ? p.id : p)).filter(Boolean).map(String);

  out.amTherapistId = out.amTherapist?.id || out.amTherapistId || null;
  out.pmTherapistId = out.pmTherapist?.id || out.pmTherapistId || null;
  out.bcaTherapistId = out.bcaTherapist?.id || out.bcaTherapistId || null;

  const assigned = out.assignedABA || out.assigned_ABA || out.assigned || [];
  out.assignedABA = Array.isArray(assigned) ? assigned.filter(Boolean).map(String) : [];

  return out;
}

export async function getDirectory() {
  requireUser();
  const [childrenSnap, parentsSnap, therapistsSnap] = await Promise.all([
    getDocs(collection(db, 'children')),
    getDocs(collection(db, 'parents')),
    getDocs(collection(db, 'therapists')),
  ]);

  const children = childrenSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const parents = parentsSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const therapists = therapistsSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

  return { ok: true, children, parents, therapists, aba: {} };
}

export async function getDirectoryMe() {
  const u = requireUser();
  const profile = await getUserProfile(u.uid);

  const linkSnap = await getDoc(doc(db, 'directoryLinks', u.uid)).catch(() => null);
  if (!linkSnap?.exists?.()) return null;
  const link = linkSnap.data() || {};

  const role = String(link?.role || profile?.role || '').toLowerCase();

  // Parent / Therapist scoped directory (secure-by-default): requires an explicit directory link.
  if (role.includes('parent')) {
    const parentId = link?.parentId != null ? String(link.parentId) : '';
    if (!parentId) return null;

    const pDoc = await getDoc(doc(db, 'parents', parentId)).catch(() => null);
    const meParent = pDoc?.exists?.() ? ({ id: pDoc.id, ...(pDoc.data() || {}) }) : null;
    if (!meParent?.id) return null;

    const familyId = meParent.familyId || null;
    const parentsSnap = familyId
      ? await getDocs(query(collection(db, 'parents'), where('familyId', '==', familyId), limit(50))).catch(() => null)
      : null;

    const childrenSnap = await getDocs(query(collection(db, 'children'), where('parentIds', 'array-contains', String(meParent.id)), limit(100))).catch(() => null);

    const parents = parentsSnap ? parentsSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })) : [meParent];
    const children = childrenSnap ? childrenSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })) : [];

    // Resolve therapists referenced by children.
    const therapistIds = new Set();
    children.forEach((c) => {
      if (c.amTherapistId) therapistIds.add(String(c.amTherapistId));
      if (c.pmTherapistId) therapistIds.add(String(c.pmTherapistId));
      if (c.bcaTherapistId) therapistIds.add(String(c.bcaTherapistId));
      (Array.isArray(c.assignedABA) ? c.assignedABA : []).forEach((id) => therapistIds.add(String(id)));
    });

    const therapists = await Promise.all(
      Array.from(therapistIds).map(async (id) => {
        const s = await getDoc(doc(db, 'therapists', id)).catch(() => null);
        return s?.exists?.() ? ({ id: s.id, ...(s.data() || {}) }) : null;
      })
    );

    return { ok: true, children, parents, therapists: therapists.filter(Boolean), aba: {} };
  }

  if (role.includes('therapist')) {
    const therapistId = link?.therapistId != null ? String(link.therapistId) : '';
    if (!therapistId) return null;

    const tDoc = await getDoc(doc(db, 'therapists', therapistId)).catch(() => null);
    const meTherapist = tDoc?.exists?.() ? ({ id: tDoc.id, ...(tDoc.data() || {}) }) : null;
    if (!meTherapist?.id) return null;

    // Children assigned to therapist.
    const childrenSnap = await getDocs(query(collection(db, 'children'), where('assignedABA', 'array-contains', String(meTherapist.id)), limit(150))).catch(() => null);
    const children = childrenSnap ? childrenSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })) : [];

    const parentIds = new Set();
    children.forEach((c) => (Array.isArray(c.parentIds) ? c.parentIds : []).forEach((pid) => parentIds.add(String(pid))));

    const parents = await Promise.all(
      Array.from(parentIds).map(async (id) => {
        const s = await getDoc(doc(db, 'parents', id)).catch(() => null);
        return s?.exists?.() ? ({ id: s.id, ...(s.data() || {}) }) : null;
      })
    );

    return { ok: true, children, parents: parents.filter(Boolean), therapists: [meTherapist], aba: {} };
  }

  // Admins should call getDirectory()
  return null;
}

export async function mergeDirectory(payload) {
  requireUser();
  const batch = writeBatch(db);

  const parents = Array.isArray(payload?.parents) ? payload.parents : [];
  const therapists = Array.isArray(payload?.therapists) ? payload.therapists : [];
  const children = Array.isArray(payload?.children) ? payload.children : [];

  parents.forEach((p) => {
    if (!p?.id) return;
    const id = String(p.id);
    const rec = indexDirectoryRecord(p);
    batch.set(doc(db, 'parents', id), rec, { merge: true });
  });

  therapists.forEach((t) => {
    if (!t?.id) return;
    const id = String(t.id);
    const rec = indexDirectoryRecord(t);
    batch.set(doc(db, 'therapists', id), rec, { merge: true });
  });

  children.forEach((c) => {
    if (!c?.id) return;
    const id = String(c.id);
    const rec = indexChildRecord(c);
    batch.set(doc(db, 'children', id), rec, { merge: true });
  });

  // Mark directory as seeded.
  batch.set(doc(db, 'meta', 'directory'), { seededAt: serverTimestamp() }, { merge: true });

  await batch.commit();
  return { ok: true };
}

export async function getOrgSettings() {
  requireUser();
  const snap = await getDoc(doc(db, 'orgSettings', 'main'));
  if (!snap.exists()) return null;
  return { ok: true, item: { id: snap.id, ...(snap.data() || {}) } };
}

export async function updateOrgSettings(payload) {
  requireUser();
  await setDoc(doc(db, 'orgSettings', 'main'), { ...(payload || {}), updatedAt: serverTimestamp() }, { merge: true });
  return { ok: true };
}

export async function respondTimeChange(proposalId, action) {
  requireUser();
  await updateDoc(doc(db, 'timeChangeProposals', String(proposalId)), { status: String(action || ''), respondedAt: serverTimestamp() });
  return { ok: true };
}

export async function sharePost(postId) {
  requireUser();
  await updateDoc(doc(db, 'posts', String(postId)), { shares: increment(1) });
  return { ok: true };
}

export async function registerPushToken(payload) {
  const u = requireUser();
  const token = String(payload?.token || '').trim();
  if (!token) return { ok: false };
  await setDoc(
    doc(db, 'pushTokens', token),
    {
      token,
      userUid: u.uid,
      platform: payload?.platform || Platform.OS,
      enabled: payload?.enabled !== false,
      preferences: payload?.preferences || {},
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true };
}

export async function unregisterPushToken(payload) {
  const u = requireUser();
  const token = String(payload?.token || '').trim();
  if (!token) return { ok: false };
  await setDoc(
    doc(db, 'pushTokens', token),
    {
      token,
      userUid: u.uid,
      enabled: false,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true };
}

// Backwards-compatible wrappers used by some components
export async function sendMessageApi(payload) {
  return sendMessage(payload);
}

export async function createUrgentMemoApi(payload) {
  return sendUrgentMemo(payload);
}

export async function ackUrgentMemoApi(id) {
  return ackUrgentMemo(Array.isArray(id) ? id : [id]);
}

export default {
  setAuthToken,
  login,
  loginWithGoogle,
  signup,
  verify2fa,
  resend2fa,
  requestPasswordReset,
  resetPassword,
  me,
  updateMe,
  getPosts,
  createPost,
  likePost,
  commentPost,
  reactComment,
  uploadMedia,
  signS3,
  getLinkPreview,
  deleteMyAccount,
  getUrgentMemos,
  health,
  ackUrgentMemo,
  sendUrgentMemo,
  respondUrgentMemo,
  getMessages,
  sendMessage,
  pingArrival,
  proposeTimeChange,
  getTimeChangeProposals,
  getDirectory,
  getDirectoryMe,
  mergeDirectory,
  getOrgSettings,
  updateOrgSettings,
  respondTimeChange,
  sharePost,
  registerPushToken,
  unregisterPushToken,
  // legacy
  sendMessageApi,
  createUrgentMemoApi,
  ackUrgentMemoApi,
};
