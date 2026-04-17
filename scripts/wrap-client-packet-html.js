/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

function listHtmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.html'))
    .map((name) => path.join(dir, name));
}

function stripTags(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferTitle(originalHtml, filename) {
  const firstParagraphMatch = originalHtml.match(/<p>(.*?)<\/p>/i);
  if (firstParagraphMatch && firstParagraphMatch[1]) {
    const candidate = stripTags(firstParagraphMatch[1]);
    if (candidate) return candidate;
  }

  return filename.replace(/_/g, ' ').replace(/\.html$/i, '').trim();
}

function wrapHtml({ title, originalHtml, docxHref }) {
  // Reuse the same base palette as /for-providers to stay consistent.
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} — BuddyBoard Client Packet</title>
    <meta name="robots" content="noindex" />
    <style>
      :root {
        --bg: #f8fafc;
        --card: #ffffff;
        --text: #0f172a;
        --muted: #475569;
        --line: rgba(15, 23, 42, 0.12);

        --darkBg: #0b1220;
        --darkText: #e5e7eb;
        --darkMuted: #94a3b8;
        --darkLine: rgba(255, 255, 255, 0.12);

        --warnBg: #fffbeb;
        --warnLine: #fde68a;
        --warnText: #78350f;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        min-height: 100vh;
        background:
          radial-gradient(900px 520px at 18% -10%, rgba(37, 99, 235, 0.12) 0%, rgba(37, 99, 235, 0.0) 62%),
          radial-gradient(900px 520px at 86% 6%, rgba(15, 23, 42, 0.08) 0%, rgba(15, 23, 42, 0.0) 60%),
          linear-gradient(180deg, #ffffff 0%, var(--bg) 100%);
        color: var(--text);
      }

      a { color: inherit; }

      .top {
        background: #ffffff;
        border-bottom: 1px solid var(--line);
      }

      .wrap { max-width: 920px; margin: 0 auto; padding: 26px 18px; }
      .titleRow { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
      .kicker { font-size: 12px; font-weight: 800; color: var(--muted); letter-spacing: 0.2px; }
      h1 { margin: 8px 0 0; font-size: 28px; letter-spacing: -0.3px; }

      .btnRow { display: flex; flex-wrap: wrap; gap: 10px; }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 14px;
        border-radius: 14px;
        border: 1px solid var(--line);
        text-decoration: none;
        background: rgba(255, 255, 255, 0.85);
        color: var(--text);
        font-weight: 800;
        font-size: 13px;
      }
      .btnPrimary {
        background: var(--text);
        border-color: rgba(15, 23, 42, 0.35);
        color: #ffffff;
      }

      .warn {
        margin-top: 14px;
        border-radius: 18px;
        border: 1px solid var(--warnLine);
        background: var(--warnBg);
        padding: 12px 14px;
        color: var(--warnText);
        font-size: 13px;
        line-height: 1.6;
        font-weight: 700;
      }

      .content { max-width: 920px; margin: 0 auto; padding: 24px 18px 56px; }
      .card {
        border-radius: 18px;
        border: 1px solid var(--line);
        background: var(--card);
        padding: 16px;
        box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
      }

      /* Mammoth output defaults */
      .doc p { margin: 10px 0; line-height: 1.7; color: var(--muted); }
      .doc em { color: rgba(71, 85, 105, 0.95); }
      .doc h1 { font-size: 20px; margin: 18px 0 10px; }
      .doc h2 { font-size: 18px; margin: 16px 0 10px; }
      .doc ul { margin: 10px 0; padding-left: 18px; color: rgba(15, 23, 42, 0.78); line-height: 1.7; }
      .doc li { margin: 6px 0; }
      .doc table { width: 100%; border-collapse: collapse; margin: 12px 0; }
      .doc td, .doc th { border: 1px solid var(--line); padding: 10px; vertical-align: top; }
      .doc strong { color: var(--text); }

      @media (max-width: 560px) {
        .titleRow { flex-direction: column; align-items: flex-start; }
      }
    </style>
  </head>
  <body>
    <div class="top">
      <div class="wrap">
        <div class="titleRow">
          <div>
            <div class="kicker">BuddyBoard — Client Packet</div>
            <h1>${escapeHtml(title)}</h1>
          </div>
          <div class="btnRow">
            <a class="btn" href="../../../for-providers.html#documents">Back to For Providers</a>
            <a class="btn btnPrimary" href="${docxHref}" download>Download DOCX</a>
          </div>
        </div>

        <div class="warn">
          Note: These materials are provided for evaluation and due diligence. Do not represent BuddyBoard as “HIPAA compliant” without a deployment-specific legal/technical review and signed agreements.
        </div>
      </div>
    </div>

    <div class="content">
      <div class="card doc">
${indentLines(originalHtml.trim(), 8)}
      </div>
    </div>
  </body>
</html>
`;
}

function indentLines(text, spaces) {
  const pad = ' '.repeat(spaces);
  return text
    .split(/\r?\n/)
    .map((line) => (line.length ? pad + line : line))
    .join('\n');
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function wrapDir(dir) {
  const files = listHtmlFiles(dir);
  const updated = [];
  const skipped = [];

  for (const filePath of files) {
    const original = fs.readFileSync(filePath, 'utf8');
    if (/<!doctype html>/i.test(original)) {
      const baseName = path.basename(filePath);
      const patched = original
        .replaceAll('href="/for-providers#documents"', 'href="../../../for-providers.html#documents"')
        .replaceAll('href="/for-providers.html#documents"', 'href="../../../for-providers.html#documents"')
        .replaceAll('href="/downloads/client-packet/docx/', 'href="../docx/');

      if (patched !== original) {
        fs.writeFileSync(filePath, patched, 'utf8');
        updated.push(baseName);
      } else {
        skipped.push(baseName);
      }
      continue;
    }

    const baseName = path.basename(filePath);
    const title = inferTitle(original, baseName);
    const docxName = baseName.replace(/\.html$/i, '.docx');
    const docxHref = `../docx/${encodeURIComponent(docxName)}`;

    const wrapped = wrapHtml({ title, originalHtml: original, docxHref });
    fs.writeFileSync(filePath, wrapped, 'utf8');
    updated.push(baseName);
  }

  return { dir, updated, skipped };
}

function main() {
  const projectRoot = path.join(__dirname, '..');

  const dirs = [
    path.join(projectRoot, 'public', 'downloads', 'client-packet', 'html'),
    path.join(projectRoot, 'BuddyBoard', 'public', 'downloads', 'client-packet', 'html'),
  ];

  const results = dirs.map(wrapDir);

  for (const r of results) {
    console.log(`\n${r.dir}`);
    console.log(`Updated: ${r.updated.length}`);
    console.log(`Skipped: ${r.skipped.length}`);
  }
}

main();
