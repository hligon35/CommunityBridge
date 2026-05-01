const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const reportDir = path.join(repoRoot, 'tmp', 'validation-report');

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(baseUrl, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL('/api/health', baseUrl));
      if (response.ok) return true;
    } catch (_) {
      // server still starting
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${baseUrl}/api/health`);
}

function runCommand(label, command, args, options = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...(options.env || {}) },
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      stderr += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      resolve({
        label,
        ok: code === 0,
        code,
        ms: Date.now() - startedAt,
        stdout,
        stderr,
      });
    });
  });
}

function summarizeBuildOutput() {
  const webDistPath = path.join(repoRoot, 'web-dist');
  if (!fs.existsSync(webDistPath)) return null;
  const summary = { files: 0, bytes: 0 };
  const stack = [webDistPath];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      const stat = fs.statSync(fullPath);
      summary.files += 1;
      summary.bytes += stat.size;
    }
  }
  return summary;
}

function trimOutput(value, max = 12000) {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n...<truncated>...`;
}

async function main() {
  fs.mkdirSync(reportDir, { recursive: true });

  const baseUrl = (process.env.CB_BASE_URL || process.env.BB_BASE_URL || 'http://127.0.0.1:3006').replace(/\/+$/, '');
  const spawnMock = !process.env.CB_BASE_URL && !process.env.BB_BASE_URL;
  const startedAt = new Date().toISOString();
  const overallStart = Date.now();
  let mockServer = null;
  let mockLog = '';

  try {
    if (spawnMock) {
      mockServer = spawn(process.execPath, [path.join(repoRoot, 'scripts', 'api-mock.js')], {
        cwd: repoRoot,
        env: { ...process.env, PORT: '3006' },
        windowsHide: true,
      });
      mockServer.stdout.on('data', (chunk) => {
        const text = String(chunk);
        mockLog += text;
        process.stdout.write(text);
      });
      mockServer.stderr.on('data', (chunk) => {
        const text = String(chunk);
        mockLog += text;
        process.stderr.write(text);
      });
      await waitForHealth(baseUrl);
    }

    const steps = [];

    steps.push(await runCommand('unit-tests', process.execPath, ['--test', 'tests/*.test.js']));
    if (!steps[steps.length - 1].ok) throw new Error('unit-tests failed');

    steps.push(await runCommand('synthetic-validation', process.execPath, ['tmp/synthetic-validation/run.js', '--check']));
    if (!steps[steps.length - 1].ok) throw new Error('synthetic-validation failed');

    steps.push(await runCommand('smoke-core', process.execPath, ['scripts/smoke-e2e.js'], { env: { BB_BASE_URL: baseUrl } }));
    if (!steps[steps.length - 1].ok) throw new Error('smoke-core failed');

    steps.push(await runCommand('smoke-therapy', process.execPath, ['scripts/smoke-therapy-session.js'], { env: { BB_BASE_URL: baseUrl } }));
    if (!steps[steps.length - 1].ok) throw new Error('smoke-therapy failed');

    steps.push(await runCommand('web-build', process.execPath, ['scripts/build-web.js']));
    if (!steps[steps.length - 1].ok) throw new Error('web-build failed');

    const buildSummary = summarizeBuildOutput();
    const report = {
      startedAt,
      finishedAt: new Date().toISOString(),
      ok: true,
      baseUrl,
      mode: spawnMock ? 'spawned-mock' : 'external-base-url',
      totalMs: Date.now() - overallStart,
      buildSummary,
      steps: steps.map((step) => ({
        label: step.label,
        ok: step.ok,
        code: step.code,
        ms: step.ms,
        stdout: trimOutput(step.stdout),
        stderr: trimOutput(step.stderr),
      })),
      mockLog: trimOutput(mockLog),
    };
    fs.writeFileSync(path.join(reportDir, 'last-run.json'), JSON.stringify(report, null, 2));

    console.log('');
    console.log(`[validate] PASS in ${report.totalMs}ms`);
    for (const step of report.steps) {
      console.log(`  PASS ${step.label} (${step.ms}ms)`);
    }
    if (buildSummary) {
      console.log(`  build-output files=${buildSummary.files} bytes=${buildSummary.bytes}`);
    }
  } catch (error) {
    const report = {
      startedAt,
      finishedAt: new Date().toISOString(),
      ok: false,
      baseUrl,
      mode: spawnMock ? 'spawned-mock' : 'external-base-url',
      totalMs: Date.now() - overallStart,
      error: error?.message || String(error),
      mockLog: trimOutput(mockLog),
    };
    fs.writeFileSync(path.join(reportDir, 'last-run.json'), JSON.stringify(report, null, 2));
    console.error(`[validate] FAIL: ${report.error}`);
    process.exitCode = 1;
  } finally {
    if (mockServer && !mockServer.killed) {
      try {
        mockServer.kill();
      } catch (_) {
        // ignore cleanup errors
      }
    }
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});