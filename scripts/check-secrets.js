#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');

const suspiciousPathRules = [
  { name: 'APPLE_API_KEY_FILE', severity: 'high', re: /(^|[\\/])AuthKey_[A-Z0-9]+\.p8$/i },
  { name: 'GOOGLE_OAUTH_CLIENT_FILE', severity: 'high', re: /(^|[\\/])client_secret_.*\.json$/i },
  { name: 'TEMP_LOGIN_EXPORT', severity: 'high', re: /(^|[\\/])tmp-login\.json$/i },
  { name: 'GITHUB_ENV_WITH_PRIVATE_KEY', severity: 'high', re: /(^|[\\/])env[\\/]github\.env$/i },
];

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

function listGitPaths(args) {
  try {
    const out = run(`git ls-files ${args} -z`);
    return out.split('\0').filter(Boolean);
  } catch (_) {
    return [];
  }
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
    files = listGitPaths('');
  } catch (e) {
    console.warn('[check-secrets] Not a git repo (skipping).');
    process.exit(0);
  }

  const findings = [];
  const warnings = [];

  for (const rel of files) {
    for (const rule of suspiciousPathRules) {
      if (rule.re.test(rel)) {
        findings.push({ rule: rule.name, severity: rule.severity, file: rel, line: 1, redacted: null });
      }
    }
  }

  const untrackedFiles = listGitPaths('--others --exclude-standard');
  for (const rel of untrackedFiles) {
    for (const rule of suspiciousPathRules) {
      if (rule.re.test(rel)) {
        warnings.push({ rule: rule.name, file: rel });
      }
    }
  }

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
    if (warnings.length) {
      console.warn('[check-secrets] Warning: sensitive-looking local files detected (currently untracked):');
      for (const w of warnings) {
        console.warn(`- WARN ${w.rule} at ${w.file}`);
      }
      console.warn('Move them out of the workspace or keep them untracked and in a secure local-only location.');
    }
    console.log('[check-secrets] OK (no obvious secrets found)');
    process.exit(0);
  }

  console.error('[check-secrets] Potential secrets detected in tracked files:');
  for (const f of findings) {
    const extra = f.redacted ? ` value=${f.redacted}` : '';
    console.error(`- ${f.severity.toUpperCase()} ${f.rule} at ${f.file}:${f.line}${extra}`);
  }

  if (warnings.length) {
    console.error('\n[check-secrets] Sensitive-looking local files detected (currently untracked):');
    for (const w of warnings) {
      console.error(`- WARN ${w.rule} at ${w.file}`);
    }
  }

  console.error('\nRemediation: remove the secret from the repo history, rotate it, and use env/secret manager instead.');
  process.exit(2);
}

main();
