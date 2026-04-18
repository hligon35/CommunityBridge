const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(command, args) {
  const isWindows = process.platform === 'win32';

  // On Windows, CreateProcess does not execute .cmd/.bat files reliably without a shell.
  // Run a single command string via the shell to keep resolution consistent.
  const result = isWindows
    ? spawnSync([command, ...args].join(' '), {
        stdio: 'inherit',
        shell: true,
      })
    : spawnSync(command, args, {
        stdio: 'inherit',
        shell: false,
      });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirIfExists(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  fs.cpSync(srcDir, destDir, { recursive: true });
}

function main() {
  run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'web-dist']);

  // Firebase Hosting "app" site needs /app-login available on the same origin.
  copyDirIfExists(path.join('public', 'app-login'), path.join('web-dist', 'app-login'));
  copyIfExists(path.join('public', 'app-login.html'), path.join('web-dist', 'app-login.html'));
}

main();
