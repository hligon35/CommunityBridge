import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { InteractionManager, NativeModules, Platform, Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Api from './Api';
import { useAuth } from './AuthContext';
import { additionalChildren, additionalParents } from './seed/directoryAdditions';

const DataContext = createContext(null);

export function useData() {
  return useContext(DataContext);
}

const POSTS_KEY = 'bbs_posts_v1';
const MESSAGES_KEY = 'bbs_messages_v1';
const MEMOS_KEY = 'bbs_memos_v1';
const ARCHIVED_KEY = 'bbs_archived_threads_v1';
const CHILDREN_KEY = 'bbs_children_v1';
const BLOCKED_KEY = 'bbs_blocked_v1';


// Helper: attach therapist objects (ABA/BCBA) to children based on assigned ABA ids
function attachTherapistsToChildren(childrenArr, therapistsArr, abaRel) {
  const byId = (therapistsArr || []).reduce((acc, t) => {
    if (t && t.id != null) acc[String(t.id)] = t;
    return acc;
  }, {});

  const rel = (abaRel && typeof abaRel === 'object') ? abaRel : null;
  const relAssignments = rel && Array.isArray(rel.assignments) ? rel.assignments : null;
  const relSupervision = rel && Array.isArray(rel.supervision) ? rel.supervision : null;

  const assignmentByChildSession = {};
  if (relAssignments) {
    relAssignments.forEach((a) => {
      const childId = a && a.childId != null ? String(a.childId).trim() : '';
      const session = a && a.session != null ? String(a.session).trim().toUpperCase() : '';
      const abaId = a && a.abaId != null ? String(a.abaId).trim() : '';
      if (!childId || (session !== 'AM' && session !== 'PM') || !abaId) return;
      assignmentByChildSession[`${childId}|${session}`] = abaId;
    });
  }

  const supervisionByAbaId = {};
  if (relSupervision) {
    relSupervision.forEach((s) => {
      const abaId = s && s.abaId != null ? String(s.abaId).trim() : '';
      const bcbaId = s && s.bcbaId != null ? String(s.bcbaId).trim() : '';
      if (abaId && bcbaId) supervisionByAbaId[abaId] = bcbaId;
    });
  }

  return (childrenArr || []).map((c) => {
    const childId = c && c.id != null ? String(c.id) : '';

    // Preferred path: use server-normalized session assignments when present.
    const amAbaId = childId ? assignmentByChildSession[`${childId}|AM`] : null;
    const pmAbaId = childId ? assignmentByChildSession[`${childId}|PM`] : null;
    if (amAbaId || pmAbaId) {
      const amTherapist = amAbaId ? (byId[amAbaId] || null) : null;
      const pmTherapist = pmAbaId ? (byId[pmAbaId] || null) : null;
      const bcbaId = (amAbaId && supervisionByAbaId[amAbaId]) || (pmAbaId && supervisionByAbaId[pmAbaId]) || null;
      const bcaTherapist = bcbaId ? (byId[bcbaId] || null) : null;
      return { ...c, bcaTherapist, amTherapist, pmTherapist };
    }

    // Fallback path: infer from child's assignedABA and session.
    const assigned = c.assignedABA || c.assigned_ABA || c.assigned || [];
    const primaryId = Array.isArray(assigned) && assigned.length ? String(assigned[0]) : null;
    const aba = primaryId ? (byId[primaryId] || null) : null;

    let amTherapist = null;
    let pmTherapist = null;
    if (c.session === 'AM') amTherapist = aba;
    else if (c.session === 'PM') pmTherapist = aba;
    else { amTherapist = aba; pmTherapist = aba; }

    let bcaTherapist = null;
    if (aba && aba.supervisedBy) bcaTherapist = byId[aba.supervisedBy] || null;
    return { ...c, bcaTherapist, amTherapist, pmTherapist };
  });
}

function mergeById(existing, additions) {
  const out = Array.isArray(existing) ? [...existing] : [];
  const byId = new Set(out.map((x) => String(x && x.id ? x.id : '')).filter(Boolean));
  (Array.isArray(additions) ? additions : []).forEach((item) => {
    const id = item && item.id ? String(item.id) : '';
    if (!id) return;
    if (byId.has(id)) return;
    byId.add(id);
    out.push(item);
  });
  return out;
}

function deriveTherapistsFromChildren(childrenArr) {
  try {
    const ids = new Set();
    (childrenArr || []).forEach((c) => {
      const assigned = c?.assignedABA || c?.assigned_ABA || c?.assigned || [];
      if (Array.isArray(assigned)) {
        assigned.forEach((id) => {
          const s = id != null ? String(id).trim() : '';
          if (s) ids.add(s);
        });
      }
    });

    return Array.from(ids).map((id) => {
      const pretty = id.startsWith('aba-') ? `ABA ${id.replace(/^aba-/, '')}` : `Staff ${id}`;
      return {
        id,
        name: pretty,
        role: 'therapist',
        avatar: '',
        phone: '',
        email: '',
      };
    });
  } catch (e) {
    return [];
  }
}

function stripComputedChildFields(child) {
  if (!child || typeof child !== 'object') return child;
  const { amTherapist, pmTherapist, bcaTherapist, ...rest } = child;
  return rest;
}

// Note: removed legacy demo children and therapist pools so the
// directory is driven only by the dev seed toggle (seeded data)
// or persisted AsyncStorage values. When the dev seed is off and
// no persisted data exists, children/therapists will be empty arrays.

// Seeded directory: 16 students (3-5yo), with 4 siblings (same family), parents and therapists
const PARENTS_KEY = 'bbs_parents_v1';
const THERAPISTS_KEY = 'bbs_therapists_v1';

// Directory seed data is provided from `src/seed/directorySeed.js` (imported above)

export function DataProvider({ children: reactChildren }) {
  const { user, loading, needsMfa, refreshMfaState, markMfaRequired } = useAuth();
  const needsMfaRef = useRef(Boolean(needsMfa));
  const mfaRefreshInFlightRef = useRef(false);
  const fetchInFlightRef = useRef(null);
  const lastFetchAtRef = useRef(0);
  const initialSyncDoneForUserRef = useRef(null);
  useEffect(() => {
    needsMfaRef.current = Boolean(needsMfa);
  }, [needsMfa]);
  const [posts, setPosts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [urgentMemos, setUrgentMemos] = useState([]);
  const [timeChangeProposals, setTimeChangeProposals] = useState([]);
  const [archivedThreads, setArchivedThreads] = useState([]);
  const [children, setChildren] = useState([]);
  const [parents, setParents] = useState([]);
  const [therapists, setTherapists] = useState([]);
  const [blockedUserIds, setBlockedUserIds] = useState([]);

  // Hydrate from storage then attempt remote sync
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [postsRaw, mRaw, uRaw, cRaw, pRaw, tRaw, aRaw] = await Promise.all([
          AsyncStorage.getItem(POSTS_KEY),
          AsyncStorage.getItem(MESSAGES_KEY),
          AsyncStorage.getItem(MEMOS_KEY),
          AsyncStorage.getItem(CHILDREN_KEY),
          AsyncStorage.getItem(PARENTS_KEY),
          AsyncStorage.getItem(THERAPISTS_KEY),
          AsyncStorage.getItem(ARCHIVED_KEY),
        ]);
        const blockedRaw = await AsyncStorage.getItem(BLOCKED_KEY);
        if (!mounted) return;

        // Posts
        if (postsRaw) {
          try {
            const parsed = JSON.parse(postsRaw);
            if (Array.isArray(parsed)) setPosts(parsed);
            else setPosts([]);
          } catch (e) {
            setPosts([]);
          }
        } else {
          setPosts([]);
        }

        // Messages and memos
        if (mRaw) setMessages(JSON.parse(mRaw));
        else setMessages([]);
        if (uRaw) setUrgentMemos(uRaw ? JSON.parse(uRaw) : []);

        // Parents & Therapists (set first so children can attach references)
        let parsedParents = [];
        if (pRaw) {
          try { const parsed = JSON.parse(pRaw); if (Array.isArray(parsed)) parsedParents = parsed; } catch (e) { parsedParents = []; }
        }
        let parsedTherapists = [];
        if (tRaw) {
          try { const parsed = JSON.parse(tRaw); if (Array.isArray(parsed)) parsedTherapists = parsed; } catch (e) { parsedTherapists = []; }
        }
        const mergedParents = mergeById(parsedParents, additionalParents);
        setParents(mergedParents);

        // Children
        let parsedChildren = [];
        if (cRaw) {
          try { const parsed = JSON.parse(cRaw); if (Array.isArray(parsed)) parsedChildren = parsed; } catch (e) { parsedChildren = []; }
        }
        const mergedChildren = mergeById(parsedChildren, additionalChildren);

        // Therapists: use persisted therapists, but if empty derive placeholders from children assignments.
        const derivedTherapists = deriveTherapistsFromChildren(mergedChildren);
        const mergedTherapists = mergeById(parsedTherapists, derivedTherapists);
        setTherapists(mergedTherapists);

        // Attach therapist objects where possible
        const mapped = attachTherapistsToChildren(mergedChildren, mergedTherapists);
        setChildren(mapped);

        // Archived threads
        if (aRaw) {
          try { const parsed = JSON.parse(aRaw); if (Array.isArray(parsed)) setArchivedThreads(parsed); else setArchivedThreads([]); }
          catch (e) { setArchivedThreads([]); }
        } else {
          setArchivedThreads([]);
        }
        // Blocked users
        if (blockedRaw) {
          try { const parsed = JSON.parse(blockedRaw); if (Array.isArray(parsed)) setBlockedUserIds(parsed); else setBlockedUserIds([]); }
          catch (e) { setBlockedUserIds([]); }
        } else {
          setBlockedUserIds([]);
        }
      } catch (e) {
        console.warn('hydrate failed', e.message);
      }
      // NOTE: network sync will be triggered by a separate effect
      // after auth finishes loading to ensure requests include auth token.
    })();
    return () => { mounted = false; };
  }, [user]);

  useEffect(() => {
    AsyncStorage.setItem(POSTS_KEY, JSON.stringify(posts)).catch(() => {});
  }, [posts]);
  useEffect(() => {
    AsyncStorage.setItem(PARENTS_KEY, JSON.stringify(parents)).catch(() => {});
  }, [parents]);
  useEffect(() => {
    AsyncStorage.setItem(THERAPISTS_KEY, JSON.stringify(therapists)).catch(() => {});
  }, [therapists]);
  useEffect(() => {
    AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(messages)).catch(() => {});
  }, [messages]);
  useEffect(() => {
    AsyncStorage.setItem(ARCHIVED_KEY, JSON.stringify(archivedThreads)).catch(() => {});
  }, [archivedThreads]);
  useEffect(() => {
    AsyncStorage.setItem(CHILDREN_KEY, JSON.stringify(children)).catch(() => {});
  }, [children]);
  useEffect(() => {
    AsyncStorage.setItem(MEMOS_KEY, JSON.stringify(urgentMemos)).catch(() => {});
  }, [urgentMemos]);

  // Persist blocked user ids
  useEffect(() => {
    AsyncStorage.setItem(BLOCKED_KEY, JSON.stringify(blockedUserIds)).catch(() => {});
  }, [blockedUserIds]);

  // (Removed) dev-only directory seeding and demo data.

  // Dev: poll a dev-clear server running on the packager host to trigger clearing persisted data
  useEffect(() => {
    if (!__DEV__) return undefined;
    if (Platform.OS === 'web') return undefined;
    let mounted = true;
    const port = process.env.DEV_CLEAR_PORT || 4001;
    // derive packager host from scriptURL
    let host = 'localhost';
    try {
      const scriptURL = NativeModules?.SourceCode?.scriptURL || '';
      const m = scriptURL.match(/https?:\/\/([^:\/]+)/);
      if (m && m[1]) host = m[1];
    } catch (e) {}

    const base = `http://${host}:${port}`;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`${base}/clear-status`);
        if (!res.ok) return;
        const json = await res.json();
        if (json && json.clear) {
          await clearAllData();
          await fetch(`${base}/ack`, { method: 'POST' }).catch(() => {});
        }
      } catch (e) {
        // ignore
      }
    }, 3000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  const maybeRefreshMfaOnPermissionDenied = async (e) => {
    try {
      const msg = String(e?.message || e || '').toLowerCase();
      if (!msg.includes('missing or insufficient permissions')) return;

      // Based on firestore.rules, this error on core collections is a strong signal
      // that MFA is enabled and the session is not verified.
      if (typeof markMfaRequired === 'function') {
        try { markMfaRequired(); } catch (_) {}
      }

      if (needsMfaRef.current) return;
      if (mfaRefreshInFlightRef.current) return;
      if (typeof refreshMfaState !== 'function') return;

      mfaRefreshInFlightRef.current = true;
      await refreshMfaState();
    } catch (_) {
      // ignore
    } finally {
      mfaRefreshInFlightRef.current = false;
    }
  };

  async function fetchAndSync(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const force = Boolean(opts.force);

    // Avoid Firestore reads while MFA is required but not verified.
    if (!user || needsMfaRef.current) return;

    // Dedupe rapid calls (navigation remounts, multiple screens, overlays)
    if (!force) {
      if (fetchInFlightRef.current) return fetchInFlightRef.current;
      const now = Date.now();
      if (now - lastFetchAtRef.current < 1200) return;
    }

    const run = (async () => {
      try {
        const remotePosts = await Api.getPosts();
        if (Array.isArray(remotePosts)) {
          const norm = remotePosts.map((p) => {
            const out = { ...(p || {}) };
            if (out.text && !out.body) out.body = out.text;
            if (out.author && typeof out.author === 'string') out.author = { id: null, name: out.author, avatar: null };
            if (!Array.isArray(out.comments)) out.comments = [];
            if (typeof out.likes !== 'number') out.likes = Number(out.likes) || 0;
            if (!out.createdAt) out.createdAt = new Date().toISOString();
            return out;
          });
          setPosts(norm);
        }
      } catch (e) {
        console.warn('getPosts failed', e.message);
        await maybeRefreshMfaOnPermissionDenied(e);
      }
      try {
        const remoteMessages = await Api.getMessages();
        if (Array.isArray(remoteMessages)) setMessages(remoteMessages);
      } catch (e) { console.warn('getMessages failed', e.message); }
      try {
        const memos = await Api.getUrgentMemos();
        setUrgentMemos(Array.isArray(memos) ? memos : (memos?.memos || []));
      } catch (e) {
        console.warn('getUrgentMemos failed', e.message);
        await maybeRefreshMfaOnPermissionDenied(e);
      }
      try {
        const proposals = await Api.getTimeChangeProposals();
        setTimeChangeProposals(Array.isArray(proposals) ? proposals : (proposals?.proposals || []));
      } catch (e) {
        console.warn('getTimeChangeProposals failed', e.message);
        await maybeRefreshMfaOnPermissionDenied(e);
      }

      // Directory sync. Admins can read/seed the full directory; non-admins use /api/directory/me.
      try {
        const isAdmin = (user && user.role) ? ['admin', 'administrator'].includes(String(user.role).toLowerCase()) : false;
        let dir = isAdmin ? await Api.getDirectory() : await Api.getDirectoryMe();
        if (dir && dir.ok) {
          let remoteChildren = Array.isArray(dir.children) ? dir.children : [];
          let remoteParents = Array.isArray(dir.parents) ? dir.parents : [];
          let remoteTherapists = Array.isArray(dir.therapists) ? dir.therapists : [];

          // If server directory is empty and this is an admin session, seed it from local (persisted + additions).
          if (isAdmin && !remoteChildren.length && !remoteParents.length && !remoteTherapists.length) {
            const localParents = mergeById(parents || [], additionalParents);
            const localChildren = mergeById((children || []).map(stripComputedChildFields), additionalChildren);
            const derivedTherapists = deriveTherapistsFromChildren(localChildren);
            const localTherapists = mergeById(therapists || [], derivedTherapists);

            await Api.mergeDirectory({
              parents: localParents,
              children: localChildren,
              therapists: localTherapists,
            });

            dir = await Api.getDirectory();
            if (dir && dir.ok) {
              remoteChildren = Array.isArray(dir.children) ? dir.children : remoteChildren;
              remoteParents = Array.isArray(dir.parents) ? dir.parents : remoteParents;
              remoteTherapists = Array.isArray(dir.therapists) ? dir.therapists : remoteTherapists;
            }
          }

          setParents(remoteParents);
          setTherapists(remoteTherapists);
          setChildren(attachTherapistsToChildren(remoteChildren, remoteTherapists, dir.aba));
        }
      } catch (e) {
        console.warn('getDirectory failed', e?.message || e);
      }
    })();

    fetchInFlightRef.current = run;
    try {
      await run;
    } finally {
      lastFetchAtRef.current = Date.now();
      if (fetchInFlightRef.current === run) fetchInFlightRef.current = null;
    }
  }

  // Trigger network fetch once auth has finished loading and a user is signed in.
  useEffect(() => {
    let mounted = true;
    if (loading || !user || needsMfa) return () => { mounted = false; };

    const userKey = user?.id || user?.uid || user?.email || null;
    if (userKey && initialSyncDoneForUserRef.current === userKey) {
      return () => { mounted = false; };
    }
    if (userKey) initialSyncDoneForUserRef.current = userKey;

    try {
      InteractionManager.runAfterInteractions(() => {
        if (!mounted) return;
        console.log('DataProvider: running fetchAndSync after auth ready', new Date().toISOString());
        fetchAndSync().catch((e) => console.warn('fetchAndSync after auth failed', e?.message || e));
      });
    } catch (_) {
      // fallback
      fetchAndSync().catch(() => {});
    }

    return () => { mounted = false; };
  }, [loading, user, needsMfa]);

  async function createPost(payload) {
    const temp = { ...payload, id: `temp-${Date.now()}`, createdAt: new Date().toISOString(), pending: true };
    setPosts((s) => [temp, ...s]);
    try {
      const created = await Api.createPost(payload);
      // normalize backend field names (mock may return `text`)
      if (created && created.text && !created.body) created.body = created.text;
      // normalize author shape: mock may return a string
      if (created && created.author && typeof created.author === 'string') {
        created.author = { id: null, name: created.author, avatar: null };
      }
      // ensure arrays and fields exist
      if (created && !Array.isArray(created.comments)) created.comments = [];
      if (created && typeof created.likes !== 'number') created.likes = Number(created.likes) || 0;
      if (created && !created.createdAt) created.createdAt = new Date().toISOString();
      console.log('DataProvider: created post from API', created && created.id, created && (created.body || created.text || created.title));
      setPosts((s) => [created, ...s.filter((p) => p.id !== temp.id)]);
      return created;
    } catch (e) {
      console.warn('createPost failed', e.message);
      return temp;
    }
  }

  async function like(postId) {
    try {
      const updated = await Api.likePost(postId);
      setPosts((s) => s.map((p) => (p.id === postId ? { ...p, ...updated } : p)));
      return updated;
    } catch (e) {
      console.warn('like failed', e.message);
    }
  }

  async function comment(postId, commentBody) {
    try {
      const created = await Api.commentPost(postId, commentBody);
      setPosts((s) => s.map((p) => (p.id === postId ? { ...p, comments: [...(p.comments || []), created] } : p)));
      return created;
    } catch (e) {
      console.warn('comment failed', e.message);
    }
  }

  async function replyToComment(postId, parentCommentId, replyBody) {
    // optimistic reply
    const temp = { ...replyBody, id: `temp-reply-${Date.now()}`, createdAt: new Date().toISOString() };
    setPosts((s) => s.map((p) => {
      if (p.id !== postId) return p;
      const comments = (p.comments || []).map((c) => {
        if (c.id !== parentCommentId) return c;
        return { ...c, replies: [...(c.replies || []), temp] };
      });
      return { ...p, comments };
    }));

    try {
      const created = await Api.commentPost(postId, { ...replyBody, parentId: parentCommentId });
      setPosts((s) => s.map((p) => {
        if (p.id !== postId) return p;
        const comments = (p.comments || []).map((c) => {
          if (c.id !== parentCommentId) return c;
          return { ...c, replies: (c.replies || []).map((r) => (r.id === temp.id ? created : r)) };
        });
        return { ...p, comments };
      }));
      return created;
    } catch (e) {
      console.warn('replyToComment failed', e.message || e);
      return temp;
    }
  }

  async function reactToComment(postId, commentId, emoji) {
    const uid = user?.id || 'anonymous';
    setPosts((s) => s.map((p) => {
      if (p.id !== postId) return p;
      const comments = (p.comments || []).map((c) => {
        if (c.id !== commentId) return c;
        const reactions = { ...(c.reactions || {}) };
        const userReactions = { ...(c.userReactions || {}) };
        const prev = userReactions[uid];
        if (prev === emoji) {
          // toggle off
          reactions[emoji] = Math.max(0, (reactions[emoji] || 1) - 1);
          delete userReactions[uid];
        } else {
          if (prev) {
            reactions[prev] = Math.max(0, (reactions[prev] || 1) - 1);
          }
          reactions[emoji] = (reactions[emoji] || 0) + 1;
          userReactions[uid] = emoji;
        }
        return { ...c, reactions, userReactions };
      });
      return { ...p, comments };
    }));

    // Best-effort notify server if API supports it
    try {
      if (Api.reactComment) await Api.reactComment(postId, commentId, { emoji });
    } catch (e) {
      // ignore
      console.warn('reactToComment API failed', e?.message || e);
    }
  }

  async function share(postId) {
    // Find the post
    const p = posts.find((x) => x.id === postId);
    if (!p) return;

    // Compose share content
    const message = p.title ? `${p.title}\n\n${p.body || ''}` : (p.body || '');
    try {
      await Share.share({ message, url: p.image, title: p.title || 'Post' });
    } catch (e) {
      console.warn('native share failed', e.message || e);
    }

    // Optimistically increment local share count
    setPosts((s) => s.map((x) => (x.id === postId ? { ...x, shares: (x.shares || 0) + 1 } : x)));

    // Attempt to notify backend (best-effort)
    try {
      if (Api.sharePost) await Api.sharePost(postId);
    } catch (e) {
      // ignore server errors; local increment keeps UX responsive
      console.warn('sharePost API failed', e.message || e);
    }
  }

  function deletePost(postId) {
    try {
      setPosts((s) => (s || []).filter((p) => p.id !== postId));
      // persist immediately
      AsyncStorage.setItem(POSTS_KEY, JSON.stringify((posts || []).filter((p) => p.id !== postId))).catch(() => {});
    } catch (e) {
      console.warn('deletePost failed', e?.message || e);
    }
  }

  function deleteComment(postId, commentId, parentCommentId = null) {
    try {
      setPosts((s) => (s || []).map((p) => {
        if (p.id !== postId) return p;
        if (!parentCommentId) {
          return { ...p, comments: (p.comments || []).filter((c) => c.id !== commentId) };
        }
        return {
          ...p,
          comments: (p.comments || []).map((c) => {
            if (c.id !== parentCommentId) return c;
            return { ...c, replies: (c.replies || []).filter((r) => r.id !== commentId) };
          }),
        };
      }));
      // best-effort persist
      AsyncStorage.setItem(POSTS_KEY, JSON.stringify((posts || []).map((p) => p))).catch(() => {});
    } catch (e) {
      console.warn('deleteComment failed', e?.message || e);
    }
  }

  async function recordShare(postId, { notifyServer = true } = {}) {
    // Only increment and optionally notify the server without invoking native share UI
    setPosts((s) => s.map((x) => (x.id === postId ? { ...x, shares: (x.shares || 0) + 1 } : x)));
    if (!notifyServer) return;
    try {
      if (Api.sharePost) await Api.sharePost(postId);
    } catch (e) {
      console.warn('recordShare API failed', e.message || e);
    }
  }

  async function proposeTimeChange(childId, type, proposedISO, note) {
    try {
      const payload = { childId, type, proposedISO, note, proposerId: user?.id };
      const created = await Api.proposeTimeChange ? await Api.proposeTimeChange(payload) : { id: `proposal-${Date.now()}`, childId, type, proposedISO, note, proposerId: user?.id, scope: 'temporary', createdAt: new Date().toISOString() };
      // server should return the created proposal; append locally
      setTimeChangeProposals((s) => [created, ...s]);
      return created;
    } catch (e) {
      console.warn('proposeTimeChange failed', e?.message || e);
      return null;
    }
  }

  async function respondToProposal(proposalId, action) {
    try {
      // Find local proposal so we can apply local changes immediately
      const local = (timeChangeProposals || []).find((p) => p.id === proposalId);
      // Attempt server call if available
      let res = null;
      try {
        if (Api.respondTimeChange) res = await Api.respondTimeChange(proposalId, action);
      } catch (e) {
        console.warn('respondTimeChange API failed', e?.message || e);
      }

      // Remove the proposal locally
      setTimeChangeProposals((s) => (s || []).filter((p) => p.id !== proposalId));

      // If accepted and we have proposal details, update the child's schedule locally
      if (action === 'accept' && local) {
        try {
          const childId = local.childId;
          const field = local.type === 'pickup' ? 'pickupTimeISO' : 'dropoffTimeISO';
          setChildren((prev) => (prev || []).map((c) => (c.id === childId ? { ...c, [field]: local.proposedISO } : c)));
        } catch (e) {
          console.warn('apply accepted proposal locally failed', e?.message || e);
        }
      }

      // If server returned updated child, merge it as authoritative
      if (res && res.updatedChild && res.updatedChild.id) {
        setChildren((prev) => (prev || []).map((c) => (c.id === res.updatedChild.id ? { ...c, ...res.updatedChild } : c)));
      }

      return res;
    } catch (e) {
      console.warn('respondToProposal failed', e?.message || e);
      return null;
    }
  }

  async function sendMessage(payload) {
    // Attach sender info from auth (if available) so UI shows names immediately
    const sender = user ? { id: user.id, name: user.name, email: user.email } : undefined;
    const payloadWithSender = { ...payload, sender };
    const temp = { ...payloadWithSender, id: `temp-${Date.now()}`, createdAt: new Date().toISOString(), outgoing: true };
    setMessages((s) => [temp, ...s]);
    try {
      const sent = await Api.sendMessage(payloadWithSender);
      setMessages((s) => [sent, ...s.filter((m) => m.id !== temp.id)]);
      return sent;
    } catch (e) {
      console.warn('sendMessage failed', e.message);
      return temp;
    }
  }

  function archiveThread(threadId) {
    try {
      setArchivedThreads((s) => {
        const next = Array.from(new Set([...(s || []), threadId]));
        AsyncStorage.setItem(ARCHIVED_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    } catch (e) {
      console.warn('archiveThread failed', e?.message || e);
    }
  }

  function unarchiveThread(threadId) {
    try {
      setArchivedThreads((s) => {
        const next = (s || []).filter((t) => t !== threadId);
        AsyncStorage.setItem(ARCHIVED_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    } catch (e) {
      console.warn('unarchiveThread failed', e?.message || e);
    }
  }

  function deleteThread(threadId) {
    try {
      setMessages((s) => (s || []).filter((m) => (m.threadId || m.id) !== threadId));
      setArchivedThreads((s) => (s || []).filter((t) => t !== threadId));
      AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify((messages || []).filter((m) => (m.threadId || m.id) !== threadId))).catch(() => {});
      AsyncStorage.setItem(ARCHIVED_KEY, JSON.stringify((archivedThreads || []).filter((t) => t !== threadId))).catch(() => {});
    } catch (e) {
      console.warn('deleteThread failed', e?.message || e);
    }
  }

  async function markUrgentRead(memoIds) {
    try {
      await Api.ackUrgentMemo(memoIds);
    } catch (e) {
      console.warn('ackUrgentMemo failed', e.message);
    }
  }

  // Send a time-update urgent alert to admin (dropoff/pickup)
  async function sendTimeUpdateAlert(childId, updateType, proposedISO, note) {
    try {
      const temp = {
        id: `urgent-${Date.now()}`,
        type: 'time_update',
        updateType, // 'pickup' or 'dropoff'
        childId,
        proposerId: user?.id,
        proposedISO,
        note: note || '',
        status: 'pending', // pending -> waiting for admin
        createdAt: new Date().toISOString(),
      };
      setUrgentMemos((s) => [temp, ...(s || [])]);
      // Attempt server send; if server returns canonical memo, replace temp
      if (Api.sendUrgentMemo) {
        try {
          const created = await Api.sendUrgentMemo(temp);
          if (created && created.id) {
            setUrgentMemos((s) => (s || []).map((m) => (m.id === temp.id ? created : m)));
            return created;
          }
        } catch (e) {
          console.warn('sendUrgentMemo API failed', e?.message || e);
        }
      }
      return temp;
    } catch (e) {
      console.warn('sendTimeUpdateAlert failed', e?.message || e);
      return null;
    }
  }

  // Send a general admin memo to multiple recipients
  async function sendAdminMemo({ recipients = [], subject = '', body = '', childId = null } = {}) {
    try {
      const temp = {
        id: `urgent-${Date.now()}`,
        type: 'admin_memo',
        subject: subject || '',
        body: body || '',
        childId: childId || null,
        recipients: Array.isArray(recipients) ? recipients : [],
        proposerId: user?.id,
        status: 'sent',
        createdAt: new Date().toISOString(),
      };
      // Optimistically add to local urgent memos so admins can see it immediately
      setUrgentMemos((s) => [temp, ...(s || [])]);

      // Attempt server send if API supports it
      if (Api.sendUrgentMemo) {
        try {
          const created = await Api.sendUrgentMemo(temp);
          if (created && created.id) {
            setUrgentMemos((s) => (s || []).map((m) => (m.id === temp.id ? created : m)));
            return created;
          }
        } catch (e) {
          console.warn('sendAdminMemo API failed', e?.message || e);
        }
      }
      return temp;
    } catch (e) {
      console.warn('sendAdminMemo failed', e?.message || e);
      return null;
    }
  }

  // Update urgent memo status locally and attempt server notify
  async function respondToUrgentMemo(memoId, action) {
    try {
      // action: 'accepted' | 'denied' | 'opened'
      // Find memo locally
      const localMemo = (urgentMemos || []).find((m) => m.id === memoId);
      setUrgentMemos((s) => (s || []).map((m) => (m.id === memoId ? { ...m, status: action, respondedAt: new Date().toISOString() } : m)));
      if (Api.respondUrgentMemo) {
        try {
          await Api.respondUrgentMemo(memoId, action);
        } catch (e) {
          console.warn('respondUrgentMemo API failed', e?.message || e);
        }
      }
      // If this was a time_update and accepted, apply the time change to the child locally
      if (action === 'accepted' && localMemo && localMemo.type === 'time_update') {
        try {
          const childId = localMemo.childId;
          const field = localMemo.updateType === 'pickup' ? 'pickupTimeISO' : 'dropoffTimeISO';
          setChildren((prev) => (prev || []).map((c) => (c.id === childId ? { ...c, [field]: localMemo.proposedISO } : c)));
        } catch (e) {
          console.warn('apply urgent memo accepted to child failed', e?.message || e);
        }
      }

      return true;
    } catch (e) {
      console.warn('respondToUrgentMemo failed', e?.message || e);
      return false;
    }
  }

  function clearMessages() {
    try {
      setMessages([]);
      setArchivedThreads([]);
      AsyncStorage.removeItem(MESSAGES_KEY).catch(() => {});
      AsyncStorage.removeItem(ARCHIVED_KEY).catch(() => {});
    } catch (e) {
      console.warn('clearMessages failed', e?.message || e);
    }
  }

  async function clearAllData() {
    try {
      const keys = [POSTS_KEY, MESSAGES_KEY, MEMOS_KEY, ARCHIVED_KEY, CHILDREN_KEY, PARENTS_KEY, THERAPISTS_KEY, BLOCKED_KEY];
      await AsyncStorage.multiRemove(keys);
      setPosts([]);
      setMessages([]);
      setArchivedThreads([]);
      setUrgentMemos([]);
      setChildren([]);
      setParents([]);
      setTherapists([]);
      setBlockedUserIds([]);
    } catch (e) {
      console.warn('clearAllData failed', e?.message || e);
    }
  }

  function blockUser(userId) {
    try {
      if (!userId) return;
      setBlockedUserIds((s) => Array.from(new Set([...(s || []), userId])));
      // remove posts authored by this user locally
      setPosts((s) => (s || []).filter((p) => {
        const authorId = p?.author?.id || p?.author?.name;
        if (!authorId) return true;
        return `${authorId}` !== `${userId}`;
      }));
      // remove messages where this user is sender or recipient
      setMessages((s) => (s || []).filter((m) => {
        const senderId = m?.sender?.id || m?.sender?.name;
        if (senderId && `${senderId}` === `${userId}`) return false;
        const toIds = (m.to || []).map(t => t.id || t.name).filter(Boolean);
        if (toIds.find(t => `${t}` === `${userId}`)) return false;
        return true;
      }));
      AsyncStorage.setItem(BLOCKED_KEY, JSON.stringify(Array.from(new Set([...(blockedUserIds || []), userId])))).catch(() => {});
    } catch (e) {
      console.warn('blockUser failed', e?.message || e);
    }
  }

  function unblockUser(userId) {
    try {
      setBlockedUserIds((s) => (s || []).filter((id) => `${id}` !== `${userId}`));
      AsyncStorage.setItem(BLOCKED_KEY, JSON.stringify((blockedUserIds || []).filter((id) => `${id}` !== `${userId}`))).catch(() => {});
    } catch (e) {
      console.warn('unblockUser failed', e?.message || e);
    }
  }

  return (
    <DataContext.Provider value={{
      posts,
      messages,
      urgentMemos,
      sendTimeUpdateAlert,
      respondToUrgentMemo,
      children,
      parents,
      therapists,
      setChildren,
      setParents,
      setTherapists,
      // legacy therapist pools removed; use `therapists` only
      clearMessages,
      archiveThread,
      unarchiveThread,
      deleteThread,
      archivedThreads,
      createPost,
      like,
      comment,
      replyToComment,
      reactToComment,
      deleteComment,
      share,
      recordShare,
      sendMessage,
      fetchAndSync,
      markUrgentRead,
      sendAdminMemo,
      blockedUserIds,
      blockUser,
      unblockUser,
      clearAllData,
      // time change proposals
      timeChangeProposals,
      proposeTimeChange,
      respondToProposal,
      deletePost,
    }}>
      {reactChildren}
    </DataContext.Provider>
  );
}

export default DataContext;
