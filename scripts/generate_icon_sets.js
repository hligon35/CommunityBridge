const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

async function importJimp() {
  const jimpMod = await import('jimp');
  const Jimp = jimpMod.Jimp || jimpMod.default || jimpMod;
  return { jimpMod, Jimp };
}

async function createBlank(Jimp, width, height, hex) {
  try {
    return new Jimp({ width, height, color: hex });
  } catch {
    return new Jimp(width, height, hex);
  }
}

function resizeTo(image, width, height) {
  const cloned = image.clone();
  try {
    cloned.resize(width, height);
  } catch {
    cloned.resize({ w: width, h: height });
  }
  return cloned;
}

function containToSquare(image, size, backgroundHex) {
  const cloned = image.clone();
  try {
    cloned.contain(size, size);
  } catch {
    cloned.contain({ w: size, h: size });
  }
  if (backgroundHex == null) return cloned;

  // Jimp contain may leave existing background; enforce by compositing over a solid canvas.
  return { cloned, backgroundHex };
}

async function writeImage(Jimp, image, outPath) {
  ensureDir(path.dirname(outPath));
  if (typeof image.writeAsync === 'function') {
    await image.writeAsync(outPath);
    return;
  }
  await image.write(outPath);
}

async function writeContained(Jimp, source, outPath, size, backgroundHex) {
  // Maintain aspect ratio, center, and letterbox.
  const canvas = await createBlank(Jimp, size, size, backgroundHex);
  const fitted = source.clone();
  try {
    fitted.contain(size, size);
  } catch {
    fitted.contain({ w: size, h: size });
  }
  const x = Math.round((size - fitted.bitmap.width) / 2);
  const y = Math.round((size - fitted.bitmap.height) / 2);
  canvas.composite(fitted, x, y);
  await writeImage(Jimp, canvas, outPath);
  console.log('Wrote', outPath);
}

async function writeAdaptiveForeground(Jimp, source, outPath) {
  // Foreground should be transparent with padding for safe zone.
  const size = 1024;
  const safe = 768;
  const canvas = await createBlank(Jimp, size, size, 0x00000000);
  const fitted = source.clone();
  try {
    fitted.contain(safe, safe);
  } catch {
    fitted.contain({ w: safe, h: safe });
  }
  const x = Math.round((size - fitted.bitmap.width) / 2);
  const y = Math.round((size - fitted.bitmap.height) / 2);
  canvas.composite(fitted, x, y);
  await writeImage(Jimp, canvas, outPath);
  console.log('Wrote', outPath);
}

async function generate() {
  const { Jimp } = await importJimp();

  const root = path.join(__dirname, '..');
  const srcPath = fs.existsSync(path.join(root, 'cbicon.png'))
    ? path.join(root, 'cbicon.png')
    : path.join(root, 'assets', 'icon.png');
  if (!fs.existsSync(srcPath)) {
    console.error('Source icon not found at', srcPath);
    process.exit(1);
  }

  const src = await Jimp.read(srcPath);

  // Canonical web/native source assets consumed by Expo config and static pages.
  await writeImage(Jimp, src, path.join(root, 'public', 'icon.png'));
  console.log('Wrote', path.join(root, 'public', 'icon.png'));
  await writeImage(Jimp, src, path.join(root, 'assets', 'icon.png'));
  console.log('Wrote', path.join(root, 'assets', 'icon.png'));

  // Expo-managed assets referenced in app.json
  await writeContained(Jimp, src, path.join(root, 'assets', 'favicon.png'), 1024, 0xffffffff);
  await writeContained(Jimp, src, path.join(root, 'assets', 'logo.png'), 512, 0xffffffff);
  await writeAdaptiveForeground(Jimp, src, path.join(root, 'assets', 'adaptive-icon.png'));

  // Android bare launcher icons (ic_launcher.png) + play store
  const androidRes = path.join(root, 'android', 'app', 'src', 'main', 'res');
  const mipmaps = [
    { dir: 'mipmap-mdpi', size: 48, name: 'ic_launcher.png' },
    { dir: 'mipmap-hdpi', size: 72, name: 'ic_launcher.png' },
    { dir: 'mipmap-xhdpi', size: 96, name: 'ic_launcher.png' },
    { dir: 'mipmap-xxhdpi', size: 144, name: 'ic_launcher.png' },
    { dir: 'mipmap-xxxhdpi', size: 192, name: 'ic_launcher.png' },
    { dir: 'mipmap-playstore', size: 512, name: 'ic_launcher_playstore.png' }
  ];
  for (const m of mipmaps) {
    await writeContained(
      Jimp,
      src,
      path.join(androidRes, m.dir, m.name),
      m.size,
      0xffffffff
    );
  }

  console.log('Icon generation complete.');
}

generate().catch((e) => {
  console.error(e);
  process.exit(1);
});
