// Generates a 1200x630 social share image at public/og-image.png by compositing
// the title logo onto a brand-coloured background. Run with `node ./scripts/generate-og-image.js`.
// Re-runnable: overwrites the existing file.
//
// Brand palette mirrors public/index.html: --accent #16a34a, --accent2 #2563eb,
// dark surface #0b1220.

const fs = require('fs');
const path = require('path');
const { Jimp, intToRGBA, rgbaToInt } = require('jimp');

const W = 1200;
const H = 630;

const OUT = path.join(__dirname, '..', 'public', 'og-image.png');
const LOGO = path.join(__dirname, '..', 'public', 'titlelogo.png');

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

(async () => {
  // Base canvas, dark surface
  const base = new Jimp({ width: W, height: H, color: rgbaToInt(11, 18, 32, 255) });

  // Diagonal gradient overlay: green (top-left) -> blue (bottom-right) -> dark
  const top = { r: 22, g: 163, b: 74 };
  const mid = { r: 37, g: 99, b: 235 };
  const bot = { r: 11, g: 18, b: 32 };

  base.scan(0, 0, W, H, (x, y, idx) => {
    const t = (x / W) * 0.5 + (y / H) * 0.5; // 0..1 diagonal
    let r;
    let g;
    let b;
    if (t < 0.5) {
      const k = t / 0.5;
      r = lerp(top.r, mid.r, k);
      g = lerp(top.g, mid.g, k);
      b = lerp(top.b, mid.b, k);
    } else {
      const k = (t - 0.5) / 0.5;
      r = lerp(mid.r, bot.r, k);
      g = lerp(mid.g, bot.g, k);
      b = lerp(mid.b, bot.b, k);
    }
    // Blend with existing dark base (preserve some depth)
    const existing = intToRGBA(base.bitmap.data.readUInt32BE(idx));
    const a = 0.78;
    base.bitmap.data[idx + 0] = Math.round(r * a + existing.r * (1 - a));
    base.bitmap.data[idx + 1] = Math.round(g * a + existing.g * (1 - a));
    base.bitmap.data[idx + 2] = Math.round(b * a + existing.b * (1 - a));
    base.bitmap.data[idx + 3] = 255;
  });

  // Composite title logo, centered, scaled to 80% width
  if (fs.existsSync(LOGO)) {
    const logo = await Jimp.read(LOGO);
    const targetW = Math.round(W * 0.6);
    const ratio = targetW / logo.bitmap.width;
    logo.resize({ w: targetW, h: Math.round(logo.bitmap.height * ratio) });
    const x = Math.round((W - logo.bitmap.width) / 2);
    const y = Math.round((H - logo.bitmap.height) / 2);
    base.composite(logo, x, y);
  } else {
    console.warn('[og-image] Logo not found at', LOGO, '- writing background only.');
  }

  await base.write(OUT);
  console.log('[og-image] wrote', OUT, `${W}x${H}`);
})().catch((err) => {
  console.error('[og-image] failed:', err);
  process.exit(1);
});
