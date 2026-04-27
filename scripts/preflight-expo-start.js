#!/usr/bin/env node
/**
 * Preflight for `expo start` (the `start:expo` npm script).
 *
 * Why this exists:
 *   `npm run build:web` exports a hashed production bundle into `public/_expo`
 *   and `public/assets`. If those are left behind and the user then runs
 *   `expo start --web`, Metro's dev server will serve the production bundle
 *   from `public/`, which references hashed asset filenames that the dev
 *   asset server does not recognize. The result is hundreds of
 *   "Asset not found" errors and a broken app shell on web.
 *
 *   Additionally, `public/index.html` is the marketing site and has no
 *   `<div id="root">`, so without the dev shell swap, the React app cannot
 *   mount on web.
 *
 *   This preflight removes the export-only artifacts so dev mode is clean.
 *   It does NOT touch the marketing HTML files, the marketing index, or
 *   anything else under `public/` that is hand-authored.
 *
 *   The dedicated web dev script (`scripts/start-web-dev.js`, run via
 *   `npm run web`) does its own cleanup and shell swap; this preflight
 *   exists to make the bare `npm run start:expo` path safe too.
 *
 * Idempotent: missing directories are silently ignored.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

// Only directories that are produced by `expo export` go here. Hand-authored
// folders under public/ (login/, sign-up/, downloads/, etc.) are preserved.
const EXPORT_DIRS = ['_expo', 'assets', 'dashboard', 'home'];

function rmIfExists(rel) {
  const full = path.join(root, 'public', rel);
  try {
    if (fs.existsSync(full)) {
      fs.rmSync(full, { recursive: true, force: true });
      return true;
    }
  } catch (_) {
    // Don't block dev startup on cleanup errors.
  }
  return false;
}

function main() {
  const removed = EXPORT_DIRS.filter(rmIfExists);
  if (removed.length) {
    console.log(
      `[preflight] Cleared stale web export artifacts under public/: ${removed.join(', ')}`
    );
  }
}

main();
