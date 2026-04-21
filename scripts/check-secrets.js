#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');

function run(cmd) {
  return execSync(cmd, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
}

function isProbablyTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const binaryExts = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.icns',
    '.zip', '.gz', '.tgz', '.7z', '.rar',
    '.pdf', '.mp4', '.mov', '.mp3', '.wav',
    '.sqlite', '.db', '.bin', '.jar',
  ]);
  if (binaryExts.has(ext)) return false;
  return true;
}

function lineNumberForIndex(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1; // '\n'
  }
  return line;
}

function redact(str) {
  const s = String(str || '');
  if (s.length <= 8) return '********';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function containsAny(haystack, needles) {
  const h = String(haystack || '').toLowerCase();
  return needles.some((n) => h.includes(String(n).toLowerCase()));
}

const rules = [
  {
    name: 'PRIVATE_KEY_BLOCK',
    severity: 'high',
    re: /-----BEGIN (?:RSA )?PRIVATE KEY-----/g,
  },
  {
    name: 'SERVICE_ACCOUNT_PRIVATE_KEY_FIELD',
    severity: 'high',
    re: /"private_key"\s*:\s*"-----BEGIN (?:RSA )?PRIVATE KEY-----/g,
  },
  {
    name: 'GOOGLE_OAUTH_CLIENT_SECRET',
    severity: 'high',
    // e.g. client_secret: "..." or client_secret=...
    re: /(client_secret\s*[:=]\s*["'])([^"'\r\n]{8,})(["'])/gi,
    redactGroup: 2,
  },
  {
    name: 'GITHUB_PAT',
    severity: 'high',
    re: /(gh[pousr]_[A-Za-z0-9_]{30,})/g,
    redactGroup: 1,
  },
  {
    name: 'SLACK_TOKEN',
    severity: 'high',
    re: /(xox[baprs]-[0-9A-Za-z-]{10,})/g,
    redactGroup: 1,
  },
  {
    name: 'AWS_ACCESS_KEY_ID',
    severity: 'high',
    re: /(AKIA[0-9A-Z]{16})/g,
    redactGroup: 1,
  },
  {
    name: 'SENTRY_AUTH_TOKEN_ASSIGNMENT',
    severity: 'high',
    re: /(SENTRY_AUTH_TOKEN\s*=\s*)([^\s"']{12,})/gi,
    redactGroup: 2,
  },
];

function main() {
  let files = [];
  try {
    const out = run('git ls-files -z');
    files = out.split('\0').filter(Boolean);
  } catch (e) {
    console.warn('[check-secrets] Not a git repo (skipping).');
    process.exit(0);
  }

  const findings = [];

  for (const rel of files) {
    const abs = path.resolve(repoRoot, rel);
    if (!isProbablyTextFile(abs)) continue;

    let st;
    try {
      st = fs.statSync(abs);
    } catch (_) {
      continue;
    }

    if (!st.isFile()) continue;
    if (st.size > 1_000_000) continue; // skip huge files

    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch (_) {
      continue;
    }

    // Avoid flagging obvious placeholders.
    if (containsAny(text, ['REDACTED', 'REPLACE_WITH', 'YOUR_TOKEN_HERE', 'EXAMPLE_ONLY'])) {
      continue;
    }

    for (const rule of rules) {
      rule.re.lastIndex = 0;
      let m;
      // eslint-disable-next-line no-cond-assign
      while ((m = rule.re.exec(text))) {
        const idx = m.index;
        const line = lineNumberForIndex(text, idx);
        const redacted = rule.redactGroup ? redact(m[rule.redactGroup]) : null;
        findings.push({ rule: rule.name, severity: rule.severity, file: rel, line, redacted });
        // prevent infinite loops for zero-length matches
        if (m.index === rule.re.lastIndex) rule.re.lastIndex += 1;
      }
    }
  }

  if (!findings.length) {
    console.log('[check-secrets] OK (no obvious secrets found)');
    process.exit(0);
  }

  console.error('[check-secrets] Potential secrets detected in tracked files:');
  for (const f of findings) {
    const extra = f.redacted ? ` value=${f.redacted}` : '';
    console.error(`- ${f.severity.toUpperCase()} ${f.rule} at ${f.file}:${f.line}${extra}`);
  }

  console.error('\nRemediation: remove the secret from the repo history, rotate it, and use env/secret manager instead.');
  process.exit(2);
}

main();
