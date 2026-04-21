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

function removeDirIfExists(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function getWebAppEntryJsFile(exportDir) {
  const webJsDir = path.join(exportDir, '_expo', 'static', 'js', 'web');
  if (!fs.existsSync(webJsDir)) return null;
  const candidates = fs
    .readdirSync(webJsDir)
    .filter((f) => /^AppEntry-.*\.js$/i.test(f))
    .map((f) => ({
      file: f,
      mtimeMs: fs.statSync(path.join(webJsDir, f)).mtimeMs,
    }))
    .sort((a, b) => a.mtimeMs - b.mtimeMs);
  return candidates.length ? candidates[candidates.length - 1].file : null;
}

function buildSpaIndexHtml({ title, appEntrySrc }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/png" href="/icon.png" sizes="any" />
    <link rel="apple-touch-icon" href="/icon.png" />
    <title>${title}</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
    <script src="${appEntrySrc}" defer></script>
  </body>
</html>
`;
}

function main() {
  removeDirIfExists('web-dist');

  // Expo's export step copies everything under public/ into the export directory.
  // If we leave prior build outputs (public/_expo, public/assets, etc.) in place,
  // the export can contain stale AppEntry bundles and assets.
  removeDirIfExists(path.join('public', '_expo'));
  removeDirIfExists(path.join('public', 'assets'));
  removeDirIfExists(path.join('public', 'home'));
  removeDirIfExists(path.join('public', 'dashboard'));

  run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'web-dist']);

  // Expo export currently generates the JS bundle, but may not generate a usable HTML shell
  // if the project has a marketing `public/index.html`. We generate an explicit shell that
  // mounts the exported AppEntry bundle.
  const appEntryFile = getWebAppEntryJsFile('web-dist');
  if (!appEntryFile) {
    throw new Error('Web export did not produce an AppEntry-*.js bundle under web-dist/_expo/static/js/web');
  }
  const spaIndexHtml = buildSpaIndexHtml({
    title: 'CommunityBridge',
    appEntrySrc: `/_expo/static/js/web/${appEntryFile}`,
  });

  // Ensure web-dist root works (for the app Hosting site).
  fs.writeFileSync(path.join('web-dist', 'index.html'), spaIndexHtml, 'utf8');

  // Firebase Hosting "app" site needs /app-login available on the same origin.
  copyDirIfExists(path.join('public', 'app-login'), path.join('web-dist', 'app-login'));
  copyIfExists(path.join('public', 'app-login.html'), path.join('web-dist', 'app-login.html'));

  // Also keep /login available as the primary login route.
  copyDirIfExists(path.join('public', 'login'), path.join('web-dist', 'login'));

  // Keep /sign-up available as a static page.
  copyDirIfExists(path.join('public', 'sign-up'), path.join('web-dist', 'sign-up'));

  // Publish the web app under /dashboard on the marketing site (public/).
  // - /dashboard serves public/dashboard/index.html
  // - Assets remain rooted at /_expo/** to keep Expo's absolute asset URLs working.
  const publicDashboardDir = path.join('public', 'dashboard');
  removeDirIfExists(publicDashboardDir);
  fs.mkdirSync(publicDashboardDir, { recursive: true });
  fs.writeFileSync(path.join(publicDashboardDir, 'index.html'), spaIndexHtml, 'utf8');
  copyIfExists(path.join('web-dist', 'metadata.json'), path.join(publicDashboardDir, 'metadata.json'));

  // Legacy: keep /home working by redirecting to /dashboard.
  const publicHomeDir = path.join('public', 'home');
  removeDirIfExists(publicHomeDir);
  fs.mkdirSync(publicHomeDir, { recursive: true });
  fs.writeFileSync(
    path.join(publicHomeDir, 'index.html'),
    `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <meta http-equiv="refresh" content="0; url=/dashboard" />\n    <title>CommunityBridge</title>\n  </head>\n  <body>\n    <noscript>Continue to <a href="/dashboard">Dashboard</a>.</noscript>\n  </body>\n</html>\n`,
    'utf8'
  );

  const publicExpoDir = path.join('public', '_expo');
  removeDirIfExists(publicExpoDir);
  copyDirIfExists(path.join('web-dist', '_expo'), publicExpoDir);

  // Expo export also emits assets (fonts/images) that are referenced as /assets/**.
  const publicAssetsDir = path.join('public', 'assets');
  removeDirIfExists(publicAssetsDir);
  copyDirIfExists(path.join('web-dist', 'assets'), publicAssetsDir);

  // Generate a favicon.ico from public/icon.png (preserves transparency if present).
  run('node', ['scripts/generate-favicon.js']);
}

main();
