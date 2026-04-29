#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { Pool } = require('pg');

const ALLOWED_ROLES = new Set(['admin', 'campusAdmin', 'orgAdmin', 'superAdmin']);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key]) continue;
    process.env[key] = match[2];
  }
}

loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(process.cwd(), 'env', 'cloudrun.env'));

function parseArgs(argv) {
  const args = {
    email: '',
    uid: '',
    role: 'superAdmin',
    dry: false,
    firebaseOnly: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = String(argv[index] || '');
    if (arg === '--dry' || arg === '-n') {
      args.dry = true;
      continue;
    }
    if (arg === '--firebase-only') {
      args.firebaseOnly = true;
      continue;
    }
    if (arg === '--email') {
      args.email = String(argv[index + 1] || '').trim().toLowerCase();
      index += 1;
      continue;
    }
    if (arg === '--uid') {
      args.uid = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }
    if (arg === '--role') {
      args.role = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log([
    'Grant an elevated CommunityBridge role outside the app.',
    '',
    'Usage:',
    '  node ./scripts/grant-admin-role.js --email user@example.com --role superAdmin',
    '  node ./scripts/grant-admin-role.js --uid FIREBASE_UID --role orgAdmin',
    '',
    'Flags:',
    '  --email <email>         Lookup the Firebase Auth user by email.',
    '  --uid <uid>             Lookup the Firebase Auth user by UID.',
    '  --role <role>           One of: admin, campusAdmin, orgAdmin, superAdmin.',
    '  --firebase-only         Skip Postgres profile synchronization.',
    '  --dry, -n               Print what would change without writing.',
  ].join('\n'));
}

function safeString(value) {
  try {
    if (value == null) return '';
    return String(value).trim();
  } catch (_) {
    return '';
  }
}

function getProjectId() {
  return (
    process.env.CB_FIREBASE_PROJECT_ID ||
    process.env.BB_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    'communitybridge-26apr'
  ).trim();
}

function initFirebaseAdmin() {
  if (admin.apps && admin.apps.length) return admin.app();
  const projectId = getProjectId();
  return admin.initializeApp(projectId ? { projectId } : undefined);
}

function buildPgPoolConfig(connectionString) {
  const cfg = { connectionString };
  const force = String(process.env.CB_PG_SSL || process.env.BB_PG_SSL || '').toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(force)) {
    cfg.ssl = { rejectUnauthorized: false };
    return cfg;
  }
  try {
    const u = new URL(connectionString);
    const host = String(u.hostname || '').toLowerCase();
    const sslParam = String(u.searchParams.get('ssl') || '').toLowerCase();
    const sslMode = String(u.searchParams.get('sslmode') || '').toLowerCase();
    if (host.endsWith('.supabase.co') || host.includes('.pooler.supabase.com') || sslParam === '1' || sslParam === 'true' || sslMode === 'require') {
      cfg.ssl = { rejectUnauthorized: false };
    }
  } catch (_) {}
  return cfg;
}

async function lookupFirebaseUser(auth, input) {
  if (input.uid) return auth.getUser(input.uid);
  return auth.getUserByEmail(input.email);
}

async function upsertFirestoreProfile(firestore, userRecord, role, dry) {
  const ref = firestore.collection('users').doc(userRecord.uid);
  const currentSnap = await ref.get();
  const current = currentSnap.exists ? (currentSnap.data() || {}) : {};
  const payload = {
    id: userRecord.uid,
    email: userRecord.email || current.email || '',
    name: userRecord.displayName || current.name || '',
    role,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (!currentSnap.exists) {
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
  }

  if (dry) {
    console.log(`[grant-role][dry] would upsert Firestore users/${userRecord.uid} role=${role}`);
    return;
  }

  await ref.set(payload, { merge: true });
  console.log(`[grant-role][fs] users/${userRecord.uid} role=${role}`);
}

async function getUsersColumns(pool) {
  const result = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
  return new Set((result.rows || []).map((row) => String(row.column_name)));
}

async function upsertPostgresRole(pool, columns, userRecord, role, dry) {
  const email = safeString(userRecord.email).toLowerCase();
  const name = safeString(userRecord.displayName);
  const now = new Date();
  const existingById = await pool.query('SELECT id FROM users WHERE id = $1', [userRecord.uid]);
  const existingByEmail = email ? await pool.query('SELECT id FROM users WHERE lower(email) = $1', [email]) : { rows: [] };
  const rowId = existingById.rows[0]?.id || existingByEmail.rows[0]?.id || userRecord.uid;

  const fields = {
    email,
    name,
    role,
    updated_at: now,
  };
  if (!existingById.rows[0] && !existingByEmail.rows[0]) {
    fields.created_at = now;
  }
  if (columns.has('email_verified_at')) fields.email_verified_at = now;
  if (columns.has('mfa_verified_at')) fields.mfa_verified_at = now;

  if (dry) {
    console.log(`[grant-role][dry] would upsert Postgres users/${rowId} email=${email} role=${role}`);
    return;
  }

  if (existingById.rows[0] || existingByEmail.rows[0]) {
    const setEntries = Object.entries(fields);
    const sql = setEntries.map(([column], index) => `${column} = $${index + 2}`).join(', ');
    const params = [rowId, ...setEntries.map(([, value]) => value)];
    await pool.query(`UPDATE users SET ${sql} WHERE id = $1`, params);
    console.log(`[grant-role][pg] updated users/${rowId} role=${role}`);
    return;
  }

  const insertFields = { id: rowId, ...fields };
  const columnsList = Object.keys(insertFields);
  const placeholders = columnsList.map((_, index) => `$${index + 1}`).join(', ');
  const values = columnsList.map((column) => insertFields[column]);
  await pool.query(`INSERT INTO users (${columnsList.join(',')}) VALUES (${placeholders})`, values);
  console.log(`[grant-role][pg] inserted users/${rowId} role=${role}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const role = safeString(args.role);
  const databaseUrl = safeString(process.env.CB_DATABASE_URL || process.env.BB_DATABASE_URL || process.env.DATABASE_URL);

  if (!args.email && !args.uid) {
    throw new Error('Provide --email or --uid.');
  }
  if (!ALLOWED_ROLES.has(role)) {
    throw new Error(`Role must be one of: ${Array.from(ALLOWED_ROLES).join(', ')}`);
  }

  console.log(`[grant-role] mode=${args.dry ? 'DRY RUN' : 'WRITE'} role=${role}`);
  initFirebaseAdmin();
  const auth = admin.auth();
  const firestore = admin.firestore();
  const userRecord = await lookupFirebaseUser(auth, args);
  const existingClaims = (await auth.getUser(userRecord.uid)).customClaims || {};
  const nextClaims = { ...existingClaims, role };

  console.log(`[grant-role] target uid=${userRecord.uid} email=${userRecord.email || '(none)'}`);

  if (args.dry) {
    console.log(`[grant-role][dry] would set Firebase custom claims role=${role}`);
  } else {
    await auth.setCustomUserClaims(userRecord.uid, nextClaims);
    console.log(`[grant-role][fb] custom claims updated role=${role}`);
  }

  await upsertFirestoreProfile(firestore, userRecord, role, args.dry);

  if (args.firebaseOnly) {
    console.log('[grant-role] skipped Postgres sync (--firebase-only)');
    return;
  }

  if (!databaseUrl) {
    console.log('[grant-role] no CB_DATABASE_URL/BB_DATABASE_URL/DATABASE_URL set; Firebase updated only');
    return;
  }

  const pool = new Pool(buildPgPoolConfig(databaseUrl));
  try {
    const columns = await getUsersColumns(pool);
    if (!columns.size) throw new Error('users table not found in target database');
    await upsertPostgresRole(pool, columns, userRecord, role, args.dry);
  } finally {
    await pool.end().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[grant-role] FAILED:', error?.message || error);
    process.exit(1);
  });
}