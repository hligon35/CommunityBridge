#!/usr/bin/env node

const path = require('path');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

function safeJsonParse(text, fallback) {
  try {
    if (!text) return fallback;
    return JSON.parse(text);
  } catch (_) {
    return fallback;
  }
}

function parseJsonMaybeDoubleEncoded(text, fallback) {
  const first = safeJsonParse(text, fallback);
  if (typeof first === 'string') {
    return safeJsonParse(first, fallback);
  }
  return first;
}

function parseJsonObject(text, fallback = null) {
  const v = parseJsonMaybeDoubleEncoded(text, fallback);
  return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback;
}

function parseJsonArray(text, fallback = []) {
  const v = parseJsonMaybeDoubleEncoded(text, fallback);
  return Array.isArray(v) ? v : fallback;
}

function jsonbParam(value) {
  if (value == null) return null;
  return JSON.stringify(value);
}

function toDate(value) {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

async function initDb(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT,
      phone TEXT,
      address TEXT,
      role TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      author_json JSONB,
      title TEXT,
      body TEXT,
      image TEXT,
      likes INTEGER NOT NULL DEFAULT 0,
      shares INTEGER NOT NULL DEFAULT 0,
      comments_json JSONB,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT,
      body TEXT NOT NULL,
      sender_json JSONB,
      to_json JSONB,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS urgent_memos (
      id TEXT PRIMARY KEY,
      type TEXT,
      status TEXT,
      proposer_id TEXT,
      actor_role TEXT,
      child_id TEXT,
      title TEXT,
      body TEXT,
      note TEXT,
      meta_json JSONB,
      memo_json JSONB,
      responded_at TIMESTAMPTZ,
      ack INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS time_change_proposals (
      id TEXT PRIMARY KEY,
      child_id TEXT,
      type TEXT,
      proposed_iso TEXT,
      note TEXT,
      proposer_id TEXT,
      action TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT,
      platform TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      preferences_json JSONB,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS arrival_pings (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      role TEXT,
      child_id TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      event_id TEXT,
      when_iso TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );
  `);
}

async function main() {
  const sqlitePath = process.env.BB_DB_PATH
    ? String(process.env.BB_DB_PATH)
    : path.join(process.cwd(), '.data', 'buddyboard.sqlite');
  const pgUrl = (process.env.BB_DATABASE_URL || process.env.DATABASE_URL || '').trim();

  if (!pgUrl) {
    console.error('Missing BB_DATABASE_URL (or DATABASE_URL)');
    process.exit(1);
  }

  console.log(`[migrate] SQLite: ${sqlitePath}`);

  const sqlite = new Database(sqlitePath, { readonly: true });
  const pool = new Pool({ connectionString: pgUrl });

  await initDb(pool);

  const migrateUsers = async () => {
    const rows = sqlite.prepare('SELECT * FROM users').all();
    console.log(`[migrate] users: ${rows.length}`);
    for (const r of rows) {
      await pool.query(
        `INSERT INTO users (id,email,password_hash,name,avatar,phone,address,role,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET
           email=excluded.email,
           password_hash=excluded.password_hash,
           name=excluded.name,
           avatar=excluded.avatar,
           phone=excluded.phone,
           address=excluded.address,
           role=excluded.role,
           created_at=excluded.created_at,
           updated_at=excluded.updated_at`,
        [
          String(r.id),
          String(r.email),
          String(r.password_hash),
          String(r.name),
          r.avatar != null ? String(r.avatar) : '',
          r.phone != null ? String(r.phone) : '',
          r.address != null ? String(r.address) : '',
          String(r.role),
          toDate(r.created_at),
          toDate(r.updated_at),
        ]
      );
    }
  };

  const migratePosts = async () => {
    const rows = sqlite.prepare('SELECT * FROM posts').all();
    console.log(`[migrate] posts: ${rows.length}`);
    for (const r of rows) {
      await pool.query(
        `INSERT INTO posts (id,author_json,title,body,image,likes,shares,comments_json,created_at,updated_at)
         VALUES ($1,$2::jsonb,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
         ON CONFLICT (id) DO UPDATE SET
           author_json=excluded.author_json,
           title=excluded.title,
           body=excluded.body,
           image=excluded.image,
           likes=excluded.likes,
           shares=excluded.shares,
           comments_json=excluded.comments_json,
           created_at=excluded.created_at,
           updated_at=excluded.updated_at`,
        [
          String(r.id),
          jsonbParam(parseJsonObject(r.author_json, null)),
          r.title != null ? String(r.title) : '',
          r.body != null ? String(r.body) : '',
          r.image != null ? String(r.image) : null,
          Number(r.likes) || 0,
          Number(r.shares) || 0,
          jsonbParam(parseJsonArray(r.comments_json, [])),
          toDate(r.created_at),
          toDate(r.updated_at),
        ]
      );
    }
  };

  const migrateMessages = async () => {
    const rows = sqlite.prepare('SELECT * FROM messages').all();
    console.log(`[migrate] messages: ${rows.length}`);
    for (const r of rows) {
      await pool.query(
        `INSERT INTO messages (id,thread_id,body,sender_json,to_json,created_at)
         VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6)
         ON CONFLICT (id) DO UPDATE SET
           thread_id=excluded.thread_id,
           body=excluded.body,
           sender_json=excluded.sender_json,
           to_json=excluded.to_json,
           created_at=excluded.created_at`,
        [
          String(r.id),
          r.thread_id != null ? String(r.thread_id) : null,
          String(r.body),
          jsonbParam(parseJsonObject(r.sender_json, null)),
          jsonbParam(parseJsonArray(r.to_json, [])),
          toDate(r.created_at),
        ]
      );
    }
  };

  const migrateUrgentMemos = async () => {
    const rows = sqlite.prepare('SELECT * FROM urgent_memos').all();
    console.log(`[migrate] urgent_memos: ${rows.length}`);
    for (const r of rows) {
      await pool.query(
        `INSERT INTO urgent_memos (
           id,type,status,proposer_id,actor_role,child_id,title,body,note,meta_json,memo_json,responded_at,ack,created_at,updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15)
         ON CONFLICT (id) DO UPDATE SET
           type=excluded.type,
           status=excluded.status,
           proposer_id=excluded.proposer_id,
           actor_role=excluded.actor_role,
           child_id=excluded.child_id,
           title=excluded.title,
           body=excluded.body,
           note=excluded.note,
           meta_json=excluded.meta_json,
           memo_json=excluded.memo_json,
           responded_at=excluded.responded_at,
           ack=excluded.ack,
           created_at=excluded.created_at,
           updated_at=excluded.updated_at`,
        [
          String(r.id),
          r.type != null ? String(r.type) : null,
          r.status != null ? String(r.status) : null,
          r.proposer_id != null ? String(r.proposer_id) : null,
          r.actor_role != null ? String(r.actor_role) : null,
          r.child_id != null ? String(r.child_id) : null,
          r.title != null ? String(r.title) : null,
          r.body != null ? String(r.body) : null,
          r.note != null ? String(r.note) : null,
          jsonbParam(parseJsonObject(r.meta_json, null)),
          jsonbParam(parseJsonObject(r.memo_json, null)),
          r.responded_at ? toDate(r.responded_at) : null,
          Number(r.ack) || 0,
          toDate(r.created_at),
          r.updated_at ? toDate(r.updated_at) : null,
        ]
      );
    }
  };

  const migrateTimeChangeProposals = async () => {
    const rows = sqlite.prepare('SELECT * FROM time_change_proposals').all();
    console.log(`[migrate] time_change_proposals: ${rows.length}`);
    for (const r of rows) {
      await pool.query(
        `INSERT INTO time_change_proposals (id,child_id,type,proposed_iso,note,proposer_id,action,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
           child_id=excluded.child_id,
           type=excluded.type,
           proposed_iso=excluded.proposed_iso,
           note=excluded.note,
           proposer_id=excluded.proposer_id,
           action=excluded.action,
           created_at=excluded.created_at`,
        [
          String(r.id),
          r.child_id != null ? String(r.child_id) : null,
          r.type != null ? String(r.type) : null,
          r.proposed_iso != null ? String(r.proposed_iso) : null,
          r.note != null ? String(r.note) : null,
          r.proposer_id != null ? String(r.proposer_id) : null,
          r.action != null ? String(r.action) : null,
          toDate(r.created_at),
        ]
      );
    }
  };

  const migratePushTokens = async () => {
    const rows = sqlite.prepare('SELECT * FROM push_tokens').all();
    console.log(`[migrate] push_tokens: ${rows.length}`);
    for (const r of rows) {
      await pool.query(
        `INSERT INTO push_tokens (token,user_id,platform,enabled,preferences_json,updated_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6)
         ON CONFLICT (token) DO UPDATE SET
           user_id=excluded.user_id,
           platform=excluded.platform,
           enabled=excluded.enabled,
           preferences_json=excluded.preferences_json,
           updated_at=excluded.updated_at`,
        [
          String(r.token),
          r.user_id != null ? String(r.user_id) : null,
          r.platform != null ? String(r.platform) : null,
          Number(r.enabled) || 0,
          jsonbParam(parseJsonObject(r.preferences_json, {})),
          toDate(r.updated_at),
        ]
      );
    }
  };

  const migrateArrivalPings = async () => {
    const rows = sqlite.prepare('SELECT * FROM arrival_pings').all();
    console.log(`[migrate] arrival_pings: ${rows.length}`);
    for (const r of rows) {
      await pool.query(
        `INSERT INTO arrival_pings (id,user_id,role,child_id,lat,lng,event_id,when_iso,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET
           user_id=excluded.user_id,
           role=excluded.role,
           child_id=excluded.child_id,
           lat=excluded.lat,
           lng=excluded.lng,
           event_id=excluded.event_id,
           when_iso=excluded.when_iso,
           created_at=excluded.created_at`,
        [
          String(r.id),
          r.user_id != null ? String(r.user_id) : null,
          r.role != null ? String(r.role) : null,
          r.child_id != null ? String(r.child_id) : null,
          Number.isFinite(Number(r.lat)) ? Number(r.lat) : null,
          Number.isFinite(Number(r.lng)) ? Number(r.lng) : null,
          r.event_id != null ? String(r.event_id) : null,
          r.when_iso != null ? String(r.when_iso) : null,
          toDate(r.created_at),
        ]
      );
    }
  };

  await migrateUsers();
  await migratePosts();
  await migrateMessages();
  await migrateUrgentMemos();
  await migrateTimeChangeProposals();
  await migratePushTokens();
  await migrateArrivalPings();

  // Try to add unique email index after migration (skip if duplicates exist).
  try {
    const dups = await pool.query(
      'SELECT lower(email) AS email_lc, COUNT(*) AS c FROM users GROUP BY lower(email) HAVING COUNT(*) > 1'
    );
    if (dups.rows && dups.rows.length) {
      console.warn(`[migrate] WARNING: duplicate emails detected (${dups.rows.length}); skipping unique index users_email_lower_idx`);
    } else {
      await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users ((lower(email)))');
    }
  } catch (e) {
    console.warn('[migrate] users_email_lower_idx skipped:', e?.message || String(e));
  }

  await pool.end();
  sqlite.close();
  console.log('[migrate] done');
}

main().catch((e) => {
  console.error('[migrate] failed:', e);
  process.exit(1);
});
