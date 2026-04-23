#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

function parseNodeMajor(version) {
  const match = String(version || '').match(/^(\d+)/);
  return match ? Number(match[1]) : 0;
}

function reexecWithNvmNode20IfNeeded() {
  if (process.platform !== 'win32') return false;
  if (process.env.BB_NODE_REEXEC === '1') return false;

  const major = parseNodeMajor(process.versions && process.versions.node);
  // Expo CLI has known runtime issues on very new Node majors (e.g. Node 24).
  // Prefer Node 20 in this repo.
  if (major > 0 && major < 23) return false;

  const candidates = [];
  if (process.env.NVM_HOME) {
    candidates.push(path.join(process.env.NVM_HOME, 'v20.20.0', 'node.exe'));
  }
  candidates.push('C:\\nvm4w\\v20.20.0\\node.exe');
  candidates.push('C:\\nvm\\v20.20.0\\node.exe');

  const node20Exe = candidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch (_) {
      return false;
    }
  });

  if (!node20Exe) {
    console.error(
      `\nUnsupported Node.js v${process.versions.node} for Expo web dev in this repo.\n` +
        `Install/use Node 20.20.0 (nvm4w) and re-run: npm run web\n`
    );
    process.exit(1);
  }

  const child = spawn(node20Exe, [process.argv[1], ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, BB_NODE_REEXEC: '1' },
  });

  child.on('exit', (code) => {
    process.exit(typeof code === 'number' ? code : 1);
  });

  return true;
}

function canListenOn(port, host) {
  return new Promise((resolve) => {
    const server = net
      .createServer()
      .once('error', (err) => {
        // Port is taken or we don't have permission.
        if (err && (err.code === 'EADDRINUSE' || err.code === 'EACCES')) {
          resolve(false);
          return;
        }

        // IPv6 might not be available on some systems.
        if (err && err.code === 'EADDRNOTAVAIL') {
          resolve(true);
          return;
        }

        resolve(false);
      })
      .once('listening', () => {
        server.close(() => resolve(true));
      });

    if (host) server.listen(port, host);
    else server.listen(port);
  });
}

async function isPortAvailable(port) {
  // Expo binds broadly, so ensure the port is free on wildcard listeners.
  const v4Ok = await canListenOn(port, '0.0.0.0');
  if (!v4Ok) return false;
  const v6Ok = await canListenOn(port, '::');
  return v6Ok;
}

async function findAvailablePort(startPort, maxTries = 25) {
  for (let i = 0; i < maxTries; i += 1) {
    const port = startPort + i;
    // eslint-disable-next-line no-await-in-loop
    const ok = await isPortAvailable(port);
    if (ok) return port;
  }
  return startPort;
}

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

async function main() {
  if (reexecWithNvmNode20IfNeeded()) return;
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

  const port = await findAvailablePort(8081);
  const expoCommand = `npx expo start --web --host localhost --port ${port}`;

  const child = isWindows
    ? spawn('cmd.exe', ['/d', '/s', '/c', expoCommand], {
        stdio: 'inherit',
        env: process.env,
      })
    : spawn('npx', ['expo', 'start', '--web', '--host', 'localhost', '--port', String(port)], {
        stdio: 'inherit',
        env: process.env,
      });

  child.on('exit', (code) => {
    cleanupOnce();
    process.exit(typeof code === 'number' ? code : 1);
  });
}

main();
