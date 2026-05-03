#!/usr/bin/env node

const fs = require('fs');
const crypto = require('crypto');
const { Pool } = require('pg');

function parseEnvFile(filePath) {
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const match = line.match(/^\s*([^=]+?)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    env[match[1].trim()] = match[2];
  }
  return env;
}

function signApprovalToken({ payload, jwtSecret }) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', `${String(jwtSecret || '').trim()}:approval-link`)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

async function main() {
  const submissionId = String(process.argv[2] || '').trim();
  const serviceUrl = String(process.argv[3] || 'https://communitybridge-6wblcrirlq-uc.a.run.app').trim().replace(/\/$/, '');
  if (!submissionId) throw new Error('usage: node scripts/validate-approval-link-login.js <submissionId> [serviceUrl]');

  const env = parseEnvFile('./env/cloudrun.env');
  const connectionString = String(env.CB_DATABASE_URL || '').trim();
  const jwtSecret = String(env.CB_JWT_SECRET || '').trim();
  if (!connectionString || !jwtSecret) throw new Error('CB_DATABASE_URL and CB_JWT_SECRET are required in env/cloudrun.env');

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const invite = (
      await pool.query(
        'SELECT id, user_id, email, organization_id, expires_at FROM access_invites WHERE source_submission_id = $1 ORDER BY created_at DESC LIMIT 1',
        [submissionId]
      )
    ).rows[0];
    if (!invite) throw new Error(`invite not found for submission ${submissionId}`);

    const token = signApprovalToken({
      jwtSecret,
      payload: {
        inviteId: String(invite.id),
        userId: String(invite.user_id),
        email: String(invite.email),
        organizationId: String(invite.organization_id || ''),
        exp: new Date(invite.expires_at).getTime(),
      },
    });

    const response = await fetch(`${serviceUrl}/api/auth/approval-link-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    const text = await response.text();
    let body = text;
    try {
      body = JSON.parse(text);
    } catch (_) {
      // Leave raw text for diagnostics.
    }

    console.log(JSON.stringify({
      submissionId,
      serviceUrl,
      status: response.status,
      ok: Boolean(body && body.ok),
      authMode: body && body.authMode ? body.authMode : '',
      hasCustomToken: Boolean(body && body.customToken),
      error: body && body.error ? body.error : '',
      inviteStatus: body && body.invite && body.invite.status ? body.invite.status : '',
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});