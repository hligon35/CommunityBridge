#!/usr/bin/env node

/*
  Find duplicate user accounts by email (case-insensitive).

  Usage:
    node ./scripts/find-duplicate-users.js
    node ./scripts/find-duplicate-users.js --db /path/to/buddyboard.sqlite
    BB_DB_PATH=/path/to/buddyboard.sqlite node ./scripts/find-duplicate-users.js
    node ./scripts/find-duplicate-users.js --json

  Notes:
  - Read-only: this script does NOT delete or modify data.
  - The API server uses the same default DB path: ./.data/buddyboard.sqlite
*/

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function defaultDbPath() {
  return process.env.BB_DB_PATH || path.join(process.cwd(), '.data', 'buddyboard.sqlite');
}

function safeString(v) {
  try {
    if (v == null) return '';
    return String(v);
  } catch (e) {
    return '';
  }
}

function tableExists(db, name) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  return !!row;
}

function columnExists(db, table, column) {
  try {
    const cols = db.prepare(`PRAGMA table_info('${table.replace(/'/g, "''")}')`).all();
    return (cols || []).some((c) => String(c.name) === column);
  } catch (e) {
    return false;
  }
}

function countRefs(db, table, column, userId) {
  if (!tableExists(db, table)) return null;
  if (!columnExists(db, table, column)) return null;
  try {
    const row = db.prepare(`SELECT COUNT(1) AS c FROM ${table} WHERE ${column} = ?`).get(String(userId));
    return Number(row?.c || 0);
  } catch (e) {
    return null;
  }
}

function printUsageAndExit(code) {
  // eslint-disable-next-line no-console
  console.log(
    [
      'BuddyBoard - Find duplicate users by email',
      '',
      'Usage:',
      '  node ./scripts/find-duplicate-users.js [--db <path>] [--json]',
      '',
      'Env:',
      '  BB_DB_PATH   Path to SQLite db (same as api-server)',
    ].join('\n')
  );
  process.exit(code);
}

if (hasFlag('--help') || hasFlag('-h')) {
  printUsageAndExit(0);
}

const dbPath = argValue('--db') || defaultDbPath();
const asJson = hasFlag('--json');

if (!dbPath) {
  // eslint-disable-next-line no-console
  console.error('Missing DB path');
  printUsageAndExit(2);
}

if (!fs.existsSync(dbPath)) {
  if (asJson) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: false, error: 'db not found', dbPath }, null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.error(`DB not found: ${dbPath}`);
    // eslint-disable-next-line no-console
    console.error('Tip: set BB_DB_PATH or pass --db');
  }
  process.exit(2);
}

const db = new Database(dbPath, { readonly: true });

if (!tableExists(db, 'users')) {
  if (asJson) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: false, error: 'users table missing', dbPath }, null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.error(`No users table in DB: ${dbPath}`);
  }
  process.exit(2);
}

const duplicates = db
  .prepare('SELECT lower(email) AS email_lc, COUNT(*) AS c FROM users GROUP BY lower(email) HAVING c > 1 ORDER BY c DESC, email_lc ASC')
  .all();

const groups = (duplicates || []).map((d) => {
  const emailLc = safeString(d.email_lc);
  const rows = db
    .prepare('SELECT id, email, name, role, created_at, updated_at FROM users WHERE lower(email) = ? ORDER BY datetime(created_at) ASC, id ASC')
    .all(emailLc);

  const enriched = (rows || []).map((u) => {
    const id = safeString(u.id);
    const refs = {
      push_tokens: countRefs(db, 'push_tokens', 'user_id', id),
      urgent_memos: countRefs(db, 'urgent_memos', 'proposer_id', id),
      time_change_proposals: countRefs(db, 'time_change_proposals', 'proposer_id', id),
      arrival_pings: countRefs(db, 'arrival_pings', 'user_id', id),
    };

    return {
      id,
      email: safeString(u.email),
      name: safeString(u.name),
      role: safeString(u.role),
      createdAt: safeString(u.created_at),
      updatedAt: safeString(u.updated_at),
      refs,
    };
  });

  const keepId = enriched.length ? enriched[0].id : null; // oldest created_at
  const deleteIds = enriched.slice(1).map((u) => u.id);

  return {
    email: emailLc,
    count: Number(d.c || enriched.length || 0),
    keepSuggestedUserId: keepId,
    deleteSuggestedUserIds: deleteIds,
    users: enriched,
  };
});

const payload = {
  ok: true,
  dbPath,
  duplicateEmailGroups: groups,
  duplicateEmailGroupCount: groups.length,
  duplicateUserRowCount: groups.reduce((acc, g) => acc + (g.count || 0), 0),
};

if (asJson) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload, null, 2));
  process.exit(groups.length ? 1 : 0);
}

// Human-readable output
// eslint-disable-next-line no-console
console.log(`DB: ${dbPath}`);
if (!groups.length) {
  // eslint-disable-next-line no-console
  console.log('No duplicate emails found (case-insensitive).');
  process.exit(0);
}

// eslint-disable-next-line no-console
console.log(`Duplicate email groups: ${groups.length}`);

for (const g of groups) {
  // eslint-disable-next-line no-console
  console.log('\n----------------------------------------');
  // eslint-disable-next-line no-console
  console.log(`Email: ${g.email}  (rows: ${g.count})`);

  for (const u of g.users) {
    const refs = u.refs || {};
    const refsSummary = [
      refs.push_tokens != null ? `push_tokens:${refs.push_tokens}` : null,
      refs.urgent_memos != null ? `urgent_memos:${refs.urgent_memos}` : null,
      refs.time_change_proposals != null ? `time_change_proposals:${refs.time_change_proposals}` : null,
      refs.arrival_pings != null ? `arrival_pings:${refs.arrival_pings}` : null,
    ].filter(Boolean).join('  ');

    // eslint-disable-next-line no-console
    console.log(
      `- id=${u.id}  role=${u.role || 'n/a'}  name="${u.name}"  email="${u.email}"  createdAt=${u.createdAt || 'n/a'}${refsSummary ? `  [${refsSummary}]` : ''}`
    );
  }

  if (g.keepSuggestedUserId) {
    // eslint-disable-next-line no-console
    console.log(`Suggested keep: ${g.keepSuggestedUserId}`);
  }

  if (g.deleteSuggestedUserIds && g.deleteSuggestedUserIds.length) {
    // eslint-disable-next-line no-console
    console.log('Suggested deletes (review first):');
    for (const id of g.deleteSuggestedUserIds) {
      // eslint-disable-next-line no-console
      console.log(`  -- DELETE FROM users WHERE id = '${id.replace(/'/g, "''")}';`);
    }
    // eslint-disable-next-line no-console
    console.log('Note: if you delete users, consider also migrating related rows in push_tokens / urgent_memos / time_change_proposals / arrival_pings to the kept user id.');
  }
}

process.exit(1);
