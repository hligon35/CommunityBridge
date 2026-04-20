/*
  CommunityBridge end-to-end smoke runner.

  Runs a minimal flow across the API and prints a color-coded PASS/FAIL summary.

  Usage:
    node scripts/smoke-e2e.js

  Env:
    CB_BASE_URL=http://127.0.0.1:3006   (preferred; defaults to mock)
    CB_EMAIL=test@example.com
    CB_NAME="Smoke Tester"
    CB_PASSWORD=Password123!
    CB_ROLE=parent

    (Legacy BB_* vars are still supported.)

  Notes:
    - For api-server.js, you may want:
        CB_ALLOW_SIGNUP=1
        CB_REQUIRE_2FA_ON_SIGNUP=1
        CB_DEBUG_2FA_RETURN_CODE=1
      so the signup response includes a devCode for automation.
*/

const DEFAULT_BASE = 'http://127.0.0.1:3006';

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function c(color, s) {
  return `${COLORS[color] || ''}${s}${COLORS.reset}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function mustFetch() {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch() is not available. Use Node 18+');
  }
}

function safeJson(x) {
  try {
    return JSON.parse(x);
  } catch {
    return null;
  }
}

async function http(baseUrl, method, path, { token, json, formData, query } = {}) {
  mustFetch();
  const u = new URL(path, baseUrl);
  if (query && typeof query === 'object') {
    for (const [k, v] of Object.entries(query)) {
      if (v != null) u.searchParams.set(k, String(v));
    }
  }

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  /** @type {RequestInit} */
  const init = { method, headers };

  if (json != null) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (formData != null) {
    init.body = formData;
  }

  const res = await fetch(u, init);
  const text = await res.text();
  const data = safeJson(text);
  return { ok: res.ok, status: res.status, data: data ?? text };
}

async function runStep(results, name, fn) {
  const started = Date.now();
  try {
    const value = await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    return value;
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - started, error: e?.message || String(e) });
    return null;
  }
}

function pickDevCode(signupResp) {
  // api-server and api-mock both provide devCode for testing.
  if (!signupResp) return null;
  if (typeof signupResp === 'object') {
    return signupResp.devCode || signupResp.code || signupResp?.twoFaCode || null;
  }
  return null;
}

async function main() {
  const baseUrl = (process.env.CB_BASE_URL || process.env.BB_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
  const email = process.env.CB_EMAIL || process.env.BB_EMAIL || `smoke+${Date.now()}@example.com`;
  const name = process.env.CB_NAME || process.env.BB_NAME || 'Smoke Tester';
  const password = process.env.CB_PASSWORD || process.env.BB_PASSWORD || 'Password123!';
  const role = process.env.CB_ROLE || process.env.BB_ROLE || 'parent';

  const results = [];

  console.log(c('cyan', `[smoke] Base URL: ${baseUrl}`));

  await runStep(results, 'health', async () => {
    const r = await http(baseUrl, 'GET', '/api/health');
    if (!r.ok) throw new Error(`health failed: ${r.status}`);
    return r.data;
  });

  // Auth: signup -> 2fa verify -> token
  const signup = await runStep(results, 'auth.signup', async () => {
    const r = await http(baseUrl, 'POST', '/api/auth/signup', {
      json: { email, name, role, password, twoFaMethod: 'email' },
    });
    if (!r.ok) throw new Error(`signup failed: ${r.status} ${JSON.stringify(r.data)}`);
    if (!r.data || typeof r.data !== 'object') throw new Error('signup returned non-object');
    return r.data;
  });

  const challengeId = signup?.challengeId;
  const devCode = pickDevCode(signup);

  const verify = await runStep(results, 'auth.2fa.verify', async () => {
    if (!challengeId) throw new Error('missing challengeId from signup');
    if (!devCode) throw new Error('missing devCode from signup; enable CB_DEBUG_2FA_RETURN_CODE/BB_DEBUG_2FA_RETURN_CODE on api-server');
    const r = await http(baseUrl, 'POST', '/api/auth/2fa/verify', { json: { challengeId, code: String(devCode) } });
    if (!r.ok) throw new Error(`2fa verify failed: ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  });

  const token = verify?.token || verify?.ok ? verify?.token : null;
  if (!token) {
    results.push({ name: 'auth.token.present', ok: false, ms: 0, error: 'Missing token after verify' });
  } else {
    results.push({ name: 'auth.token.present', ok: true, ms: 0 });
  }

  await runStep(results, 'auth.me', async () => {
    const r = await http(baseUrl, 'GET', '/api/auth/me', { token });
    if (!r.ok) throw new Error(`me failed: ${r.status}`);
    return r.data;
  });

  // Board: create post -> like -> share -> comment -> reply -> react
  const createdPost = await runStep(results, 'board.createPost', async () => {
    const r = await http(baseUrl, 'POST', '/api/board', {
      token,
      json: { title: 'Smoke Post', body: 'Smoke test body https://example.com', text: 'Smoke test body https://example.com' },
    });
    if (!r.ok) throw new Error(`create post failed: ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  });

  const postId = createdPost?.id ?? createdPost?.post?.id ?? createdPost?.item?.id;

  await runStep(results, 'board.listPosts', async () => {
    const r = await http(baseUrl, 'GET', '/api/board', { token });
    if (!r.ok) throw new Error(`get posts failed: ${r.status}`);
    if (!Array.isArray(r.data)) throw new Error('get posts did not return array');
    return r.data;
  });

  await runStep(results, 'board.like', async () => {
    if (!postId) throw new Error('missing postId');
    const r = await http(baseUrl, 'POST', '/api/board/like', { token, json: { postId } });
    if (!r.ok) throw new Error(`like failed: ${r.status}`);
    if (typeof r.data !== 'object') throw new Error('like returned non-object');
    return r.data;
  });

  await runStep(results, 'board.share', async () => {
    if (!postId) throw new Error('missing postId');
    const r = await http(baseUrl, 'POST', '/api/board/share', { token, json: { postId } });
    if (!r.ok) throw new Error(`share failed: ${r.status}`);
    if (typeof r.data !== 'object') throw new Error('share returned non-object');
    return r.data;
  });

  const createdComment = await runStep(results, 'board.comment', async () => {
    if (!postId) throw new Error('missing postId');
    const r = await http(baseUrl, 'POST', '/api/board/comments', {
      token,
      json: { postId, comment: { body: 'Smoke comment' } },
    });
    if (!r.ok) throw new Error(`comment failed: ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  });

  const commentId = createdComment?.id;

  const createdReply = await runStep(results, 'board.reply', async () => {
    if (!postId || !commentId) throw new Error('missing postId/commentId');
    const r = await http(baseUrl, 'POST', '/api/board/comments', {
      token,
      json: { postId, comment: { body: 'Smoke reply', parentId: commentId } },
    });
    if (!r.ok) throw new Error(`reply failed: ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  });

  const targetForReact = createdReply?.id || commentId;
  await runStep(results, 'board.reactComment', async () => {
    if (!postId || !targetForReact) throw new Error('missing postId/commentId');
    const r = await http(baseUrl, 'POST', '/api/board/comments/react', {
      token,
      json: { postId, commentId: targetForReact, emoji: '👍' },
    });
    if (!r.ok) throw new Error(`react failed: ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  });

  // Urgent memos: create -> respond -> ack
  const createdMemo = await runStep(results, 'memos.create', async () => {
    const r = await http(baseUrl, 'POST', '/api/urgent-memos', {
      token,
      json: { id: `urgent-${Date.now()}`, type: 'admin_memo', subject: 'Smoke memo', body: 'Hello', status: 'sent', createdAt: new Date().toISOString() },
    });
    if (!r.ok) throw new Error(`memo create failed: ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  });

  const memoId = createdMemo?.id;
  await runStep(results, 'memos.respond', async () => {
    if (!memoId) throw new Error('missing memoId');
    const r = await http(baseUrl, 'POST', '/api/urgent-memos/respond', { token, json: { memoId, action: 'opened' } });
    if (!r.ok) throw new Error(`memo respond failed: ${r.status}`);
    return r.data;
  });

  await runStep(results, 'memos.ack', async () => {
    if (!memoId) throw new Error('missing memoId');
    const r = await http(baseUrl, 'POST', '/api/urgent-memos/read', { token, json: { memoIds: [memoId] } });
    if (!r.ok) throw new Error(`memo read failed: ${r.status}`);
    return r.data;
  });

  await runStep(results, 'memos.list', async () => {
    const r = await http(baseUrl, 'GET', '/api/urgent-memos', { token });
    if (!r.ok) throw new Error(`memo list failed: ${r.status}`);
    return r.data;
  });

  // Time change: propose -> respond
  const proposal = await runStep(results, 'timeChange.propose', async () => {
    const r = await http(baseUrl, 'POST', '/api/children/propose-time-change', {
      token,
      json: { childId: '1', type: 'pickup', proposedISO: new Date(Date.now() + 3600_000).toISOString(), note: 'Smoke proposal' },
    });
    if (!r.ok) throw new Error(`propose failed: ${r.status}`);
    return r.data;
  });

  const proposalId = proposal?.id;
  await runStep(results, 'timeChange.respond', async () => {
    if (!proposalId) throw new Error('missing proposalId');
    const r = await http(baseUrl, 'POST', '/api/children/respond-time-change', { token, json: { proposalId, action: 'accept' } });
    if (!r.ok) throw new Error(`respond failed: ${r.status}`);
    return r.data;
  });

  await runStep(results, 'timeChange.list', async () => {
    const r = await http(baseUrl, 'GET', '/api/children/time-change-proposals', { token });
    if (!r.ok) throw new Error(`list failed: ${r.status}`);
    return r.data;
  });

  // Link preview
  await runStep(results, 'link.preview', async () => {
    const r = await http(baseUrl, 'GET', '/api/link/preview', { token, query: { url: 'https://example.com' } });
    if (!r.ok) throw new Error(`link preview failed: ${r.status}`);
    return r.data;
  });

  // Push
  await runStep(results, 'push.register', async () => {
    const r = await http(baseUrl, 'POST', '/api/push/register', {
      token,
      json: { token: `ExponentPushToken[smoke-${Date.now()}]`, userId: 'smoke', platform: 'expo', enabled: true, preferences: { urgent: true } },
    });
    if (!r.ok) throw new Error(`push register failed: ${r.status}`);
    return r.data;
  });

  await runStep(results, 'push.unregister', async () => {
    const r = await http(baseUrl, 'POST', '/api/push/unregister', { token, json: { token: `ExponentPushToken[smoke-${Date.now()}]` } });
    // unregister in api-server requires exact token; this is best-effort.
    if (!r.ok && r.status !== 400) throw new Error(`push unregister failed: ${r.status}`);
    return r.data;
  });

  // Arrival
  await runStep(results, 'arrival.ping', async () => {
    const r = await http(baseUrl, 'POST', '/api/arrival/ping', { token, json: { lat: 0, lng: 0, when: new Date().toISOString() } });
    if (!r.ok) throw new Error(`arrival ping failed: ${r.status}`);
    return r.data;
  });

  // Media upload (best-effort)
  await runStep(results, 'media.upload', async () => {
    if (typeof FormData !== 'function' || typeof Blob !== 'function') {
      throw new Error('FormData/Blob missing in this Node runtime');
    }
    const fd = new FormData();
    const blob = new Blob([Buffer.from('smoke')], { type: 'text/plain' });
    fd.append('file', blob, 'smoke.txt');
    const r = await http(baseUrl, 'POST', '/api/media/upload', { token, formData: fd });
    if (!r.ok) throw new Error(`media upload failed: ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  });

  // Summary
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  console.log('');
  console.log(c('magenta', '--- Smoke Summary ---'));
  for (const r of results) {
    const left = r.ok ? c('green', 'PASS') : c('red', 'FAIL');
    const ms = c('dim', `${r.ms}ms`);
    const line = `${left} ${r.name} ${ms}`;
    if (r.ok) console.log(line);
    else console.log(`${line} ${c('yellow', r.error || '')}`);
  }
  console.log('');
  console.log(`${c(failed.length ? 'red' : 'green', `${passed}/${results.length} passed`)} (${failed.length} failed)`);

  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(c('red', `[smoke] fatal: ${e?.message || e}`));
  process.exitCode = 1;
});
