#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const admin = require('firebase-admin');

const {
  signApprovalAccessToken,
} = require('./managed-access-auth');

function parseNodeMajor(version) {
  const match = String(version || '').match(/^(\d+)/);
  return match ? Number(match[1]) : 0;
}

function getNodeMajorAtPath(nodeExe) {
  try {
    const result = spawnSync(nodeExe, ['-p', 'process.versions.node'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    if (result.status !== 0) return 0;
    return parseNodeMajor(String(result.stdout || '').trim());
  } catch (_) {
    return 0;
  }
}

function reexecWithNvmNode20IfNeeded() {
  if (process.platform !== 'win32') return;
  if (process.env.BB_NODE_REEXEC === '1') return;
  if (parseNodeMajor(process.versions?.node) === 20) return;

  const candidates = [];
  if (process.env.NVM_SYMLINK) candidates.push(path.join(process.env.NVM_SYMLINK, 'node.exe'));
  candidates.push('C:\\nvm4w\\nodejs\\node.exe');
  if (process.env.NVM_HOME) {
    candidates.push(path.join(process.env.NVM_HOME, 'v20.20.0', 'node.exe'));
    candidates.push(path.join(process.env.NVM_HOME, '20.20.0', 'node.exe'));
  }
  candidates.push('C:\\nvm4w\\v20.20.0\\node.exe');
  candidates.push('C:\\nvm\\v20.20.0\\node.exe');

  const node20Exe = candidates.find((candidate) => {
    try {
      return candidate && fs.existsSync(candidate) && getNodeMajorAtPath(candidate) === 20;
    } catch (_) {
      return false;
    }
  });

  if (!node20Exe) {
    throw new Error(`Unsupported Node.js v${process.versions.node} for smoke-approval-link.js. Install/use Node 20.x.`);
  }

  const result = spawnSync(node20Exe, [process.argv[1], ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, BB_NODE_REEXEC: '1' },
    windowsHide: true,
  });
  process.exit(typeof result.status === 'number' ? result.status : 1);
}

reexecWithNvmNode20IfNeeded();

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = String(line || '').trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const cleaned = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const eq = cleaned.indexOf('=');
    if (eq <= 0) continue;
    const key = cleaned.slice(0, eq).trim();
    if (!key || process.env[key]) continue;
    let value = cleaned.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function safeString(value) {
  return String(value || '').trim();
}

async function main() {
  loadDotEnvFile(path.join(process.cwd(), 'env', 'cloudrun.env'));
  loadDotEnvFile(path.join(process.cwd(), '.env'));

  const jwtSecret = safeString(process.env.CB_JWT_SECRET || process.env.BB_JWT_SECRET);
  if (!jwtSecret) throw new Error('Missing CB_JWT_SECRET/BB_JWT_SECRET for approval smoke test.');

  const projectId = safeString(
    process.env.CB_FIREBASE_PROJECT_ID ||
    process.env.BB_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    'communitybridge-26apr'
  );

  if (!admin.apps.length) {
    admin.initializeApp(projectId ? { projectId } : undefined);
  }

  const dbPath = process.env.CB_DB_PATH || process.env.BB_DB_PATH || path.join(process.cwd(), '.communitybridge', 'communitybridge.sqlite');
  const db = new Database(dbPath);

  const stamp = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const userId = `smoke-approval-${stamp}`;
  const email = `smoke.approval.${stamp}@example.com`;
  const inviteId = `invite-${stamp}`;
  const organizationId = `org-${stamp}`;
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresIso = new Date(now.getTime() + (30 * 60 * 1000)).toISOString();
  const loginPassword = 'SmokeTest!1';
  const apiBase = process.env.BB_BASE_URL || 'http://127.0.0.1:3005';

  const auth = admin.auth();
  const firestore = admin.firestore();
  const firestoreUserRef = firestore.collection('users').doc(userId);

  let createdAuthUser = false;
  let insertedSqlUser = false;
  let insertedInvite = false;

  try {
    try {
      await auth.getUser(userId);
    } catch (error) {
      const code = safeString(error?.code).toLowerCase();
      if (!code.includes('user-not-found')) throw error;
      await auth.createUser({ uid: userId, email, password: 'Bootstrap!1', displayName: 'Approval Smoke' });
      createdAuthUser = true;
    }

    db.prepare('INSERT INTO users (id,email,password_hash,name,phone,address,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(
      userId,
      email,
      bcrypt.hashSync('Bootstrap!1', 10),
      'Approval Smoke',
      '',
      '',
      'superAdmin',
      nowIso,
      nowIso
    );
    insertedSqlUser = true;

    db.prepare('INSERT INTO access_invites (id,user_id,email,role,invite_type,code_hash,organization_id,source_submission_id,sent_at,expires_at,created_at,updated_at,last_email_status,last_email_error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      inviteId,
      userId,
      email,
      'superAdmin',
      'onboarding_primary_contact',
      'smoke-code-hash',
      organizationId,
      'smoke-approval-script',
      nowIso,
      expiresIso,
      nowIso,
      nowIso,
      'shared-via-approval',
      ''
    );
    insertedInvite = true;

    const approvalToken = signApprovalAccessToken({
      jwtSecret,
      payload: {
        inviteId,
        userId,
        email,
        organizationId,
        exp: Date.now() + (10 * 60 * 1000),
      },
    });

    const firstResponse = await fetch(`${apiBase}/api/auth/approval-link-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: approvalToken }),
    });
    const firstJson = await firstResponse.json();
    if (firstResponse.status !== 200 || !firstJson?.ok) {
      throw new Error(`approval-link-login failed: ${firstResponse.status} ${JSON.stringify(firstJson)}`);
    }

    const secondResponse = await fetch(`${apiBase}/api/auth/approval-link-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: approvalToken }),
    });
    const secondJson = await secondResponse.json();
    if (secondResponse.status !== 401 || !/no longer active/i.test(safeString(secondJson?.error))) {
      throw new Error(`approval-link-login reuse check failed: ${secondResponse.status} ${JSON.stringify(secondJson)}`);
    }

    const bearer = safeString(firstJson?.apiToken) || jwt.sign({ sub: userId }, jwtSecret, { expiresIn: '10m' });
    const completionResponse = await fetch(`${apiBase}/api/auth/complete-invite-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({ newPassword: loginPassword }),
    });
    const completionJson = await completionResponse.json();
    if (completionResponse.status !== 200 || !completionJson?.ok) {
      throw new Error(`complete-invite-password failed: ${completionResponse.status} ${JSON.stringify(completionJson)}`);
    }

    const inviteRow = db.prepare('SELECT first_login_at, used_at FROM access_invites WHERE id = ?').get(inviteId);
    if (!inviteRow?.first_login_at || !inviteRow?.used_at) {
      throw new Error(`sqlite invite row not completed as expected: ${JSON.stringify(inviteRow)}`);
    }

    const userSnapshot = await firestoreUserRef.get();
    const userData = userSnapshot.data() || {};
    if (userData.passwordSetupRequired !== false || userData.accountStatus !== 'active' || userData.onboardingStatus !== 'active') {
      throw new Error(`firestore user doc not upgraded as expected: ${JSON.stringify(userData)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      firstLoginStatus: firstResponse.status,
      reuseStatus: secondResponse.status,
      completionStatus: completionResponse.status,
      firestore: {
        passwordSetupRequired: userData.passwordSetupRequired,
        accountStatus: userData.accountStatus,
        onboardingStatus: userData.onboardingStatus,
      },
    }, null, 2));
  } finally {
    try {
      await firestoreUserRef.delete();
    } catch (_) {}
    if (insertedInvite) {
      try {
        db.prepare('DELETE FROM access_invites WHERE id = ?').run(inviteId);
      } catch (_) {}
    }
    if (insertedSqlUser) {
      try {
        db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      } catch (_) {}
    }
    if (createdAuthUser) {
      try {
        await auth.deleteUser(userId);
      } catch (_) {}
    }
    try {
      db.close();
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});