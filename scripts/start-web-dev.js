#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function removeDirIfExists(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function readFileIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return null;
  }
}

function writeFileSafe(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function ensureExpoDevIndex(publicRoot) {
  const devMarker = '<!-- expo-dev-index -->';
  const indexPath = path.join(publicRoot, 'index.html');
  const backupPath = path.join(publicRoot, '.index.marketing.backup.html');

  // Self-heal from a previous crash: if a backup exists and the current index
  // is the dev index, restore the marketing index.
  const currentIndex = readFileIfExists(indexPath);
  const backupIndex = readFileIfExists(backupPath);
  if (backupIndex && currentIndex && currentIndex.includes(devMarker)) {
    writeFileSafe(indexPath, backupIndex);
    try {
      fs.unlinkSync(backupPath);
    } catch (_) {
      // ignore
    }
  }

  const refreshedIndex = readFileIfExists(indexPath) || '';
  if (/id=["']root["']/.test(refreshedIndex)) {
    return { cleanup: () => {} };
  }

  // Backup the marketing index so Expo can use a minimal HTML shell in dev.
  if (refreshedIndex.length > 0 && !fs.existsSync(backupPath)) {
    writeFileSafe(backupPath, refreshedIndex);
  }

  const webIndexPath = path.join(__dirname, '..', 'web', 'index.html');
  const webIndex = readFileIfExists(webIndexPath);
  const devIndex = (webIndex && /id=["']root["']/.test(webIndex)
    ? webIndex
    : `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>CommunityBridge</title>\n  </head>\n  <body>\n    <noscript>You need to enable JavaScript to run this app.</noscript>\n    <div id="root"></div>\n  </body>\n</html>\n`);

  writeFileSafe(indexPath, `${devMarker}\n${devIndex}`);

  const cleanup = () => {
    const backup = readFileIfExists(backupPath);
    if (!backup) return;
    try {
      writeFileSafe(indexPath, backup);
      fs.unlinkSync(backupPath);
    } catch (_) {
      // ignore
    }
  };

  return { cleanup };
}

function main() {
  // Expo dev server mounts /_expo and /assets itself.
  // If we leave exported build artifacts under public/, they can conflict with
  // dev routing and cause "Asset not found" errors for hashed export assets.
  const publicRoot = path.join(__dirname, '..', 'public');

  // Expo's web dev server uses public/index.html as its HTML shell.
  // This repo uses public/index.html for the marketing site, which doesn't
  // include a #root mount point. Temporarily swap in a minimal dev index.
  const { cleanup: cleanupIndex } = ensureExpoDevIndex(publicRoot);

  removeDirIfExists(path.join(publicRoot, '_expo'));
  removeDirIfExists(path.join(publicRoot, 'assets'));
  removeDirIfExists(path.join(publicRoot, 'dashboard'));
  removeDirIfExists(path.join(publicRoot, 'home'));

  const isWindows = process.platform === 'win32';

  let cleanedUp = false;
  const cleanupOnce = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    cleanupIndex();
  };

  process.on('exit', cleanupOnce);
  process.on('SIGINT', () => {
    cleanupOnce();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanupOnce();
    process.exit(143);
  });

  const child = isWindows
    ? spawn('cmd.exe', ['/d', '/s', '/c', 'npx expo start --web --host localhost'], {
        stdio: 'inherit',
        env: process.env,
      })
    : spawn('npx', ['expo', 'start', '--web', '--host', 'localhost'], {
        stdio: 'inherit',
        env: process.env,
      });

  child.on('exit', (code) => {
    cleanupOnce();
    process.exit(typeof code === 'number' ? code : 1);
  });
}

main();
