#!/usr/bin/env node
/**
 * Generate every FocusDesk app icon from one transparent master.
 *
 * The master is the single source of identity: the favicon, the PWA install
 * icons (desktop/taskbar/dock), the maskable variants and the iOS
 * apple-touch icon are all rendered from it, so the brand can never drift
 * between surfaces.
 *
 * Usage:
 *   npm run icons                        # assets/icon-master.png -> public/icons/
 *   node scripts/generate-icons.mjs --src path/to/master.png
 *   node scripts/generate-icons.mjs --out /tmp/preview-icons
 *   node scripts/generate-icons.mjs --bg '#1E6B52'   # force the opaque tile
 *
 * Outputs (in the --out directory, default public/icons/):
 *   icon.png                 512x512   favicon (transparency kept)
 *   icon-192.png             192x192   PWA install icon (transparency kept)
 *   icon-512.png             512x512   PWA install icon (transparency kept)
 *   icon-maskable-192.png    192x192   maskable: art inside the 80% safe zone,
 *   icon-maskable-512.png    512x512   on an opaque tile (Chrome circles/crops
 *                                      these; the tile keeps the art intact)
 *   apple-touch-icon.png     180x180   opaque tile — iOS applies its own
 *                                      rounded mask, so the icon must not be
 *                                      transparent
 *
 * The tile colour is chosen from the art itself unless --bg is given:
 * bright art lands on the dark brand tile, dark art on white.
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = { src: 'assets/icon-master.png', out: 'public/icons', bg: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--src') args.src = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--bg') args.bg = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/generate-icons.mjs [--src file] [--out dir] [--bg #hex]');
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) throw new Error(`Invalid --bg colour "${hex}" — use #RRGGBB`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

async function checkMaster(file) {
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');
  } catch {
    console.error(`Master icon not found: ${path.relative(root, file)}`);
    console.error('');
    console.error('Put the transparent master at assets/icon-master.png (or pass --src),');
    console.error('then run: npm run icons');
    process.exit(1);
  }
}

/**
 * Mean luminance of the art (alpha-weighted), 0..1.
 * `null` when there is no visible art at all.
 */
async function artLuminance(artBuffer) {
  const { data } = await sharp(artBuffer).resize(64, 64).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    if (a < 0.06) continue;
    sum += ((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255) * a;
    weight += a;
  }
  return weight > 0 ? sum / weight : null;
}

function tile(size, { r, g, b }) {
  return sharp({ create: { width: size, height: size, channels: 4, background: { r, g, b, alpha: 1 } } });
}

/** Art composited on a tile at `scale` (0..1 of the tile), centered. */
async function onTile(artBuffer, size, scale, rgb) {
  const art = await sharp(artBuffer)
    .resize(Math.round(size * scale), Math.round(size * scale), {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  return tile(size, rgb).composite([{ input: art, gravity: 'center' }]);
}

const args = parseArgs(process.argv);
const masterFile = path.resolve(root, args.src);
const outFile = path.resolve(root, args.out);
await checkMaster(masterFile);

const master = await readFile(masterFile);
const meta = await sharp(master).metadata();
if (!meta.width || !meta.height || meta.width < 32 || meta.height < 32) {
  console.error('Master icon is smaller than 32px — it will not survive resizing to 512.');
  process.exit(1);
}

// Center-crop to a square so every output is square, whatever the master is.
const side = Math.min(meta.width, meta.height);
const art =
  meta.width === meta.height
    ? master
    : await sharp(master)
        .extract({
          left: Math.floor((meta.width - side) / 2),
          top: Math.floor((meta.height - side) / 2),
          width: side,
          height: side,
        })
        .png()
        .toBuffer();

const luminance = await artLuminance(art);
if (luminance === null) {
  console.error('Master icon has no visible (non-transparent) pixels.');
  process.exit(1);
}

// Bright art needs a dark tile to stay visible; dark art wants white.
const DARK_TILE = { r: 0x1e, g: 0x6b, b: 0x52, hex: '#1E6B52' }; // brand accent
const LIGHT_TILE = { r: 0xff, g: 0xff, b: 0xff, hex: '#FFFFFF' };
const tileRgb = args.bg ? hexToRgb(args.bg) : luminance > 0.55 ? DARK_TILE : LIGHT_TILE;
const tileName = args.bg ? args.bg.toUpperCase() : luminance > 0.55 ? DARK_TILE.hex : LIGHT_TILE.hex;

// Maskable safe zone is an 80% circle; 78% keeps a hair of clearance.
const MASKABLE_SCALE = 0.78;
// Apple touch icons are full-bleed; ~90% leaves room for the iOS corner mask.
const APPLE_SCALE = 0.9;

const outputs = [
  { file: 'icon.png', size: 512, build: () => sharp(art).resize(512, 512) },
  { file: 'icon-192.png', size: 192, build: () => sharp(art).resize(192, 192) },
  { file: 'icon-512.png', size: 512, build: () => sharp(art).resize(512, 512) },
  { file: 'icon-maskable-192.png', size: 192, build: () => onTile(art, 192, MASKABLE_SCALE, tileRgb) },
  { file: 'icon-maskable-512.png', size: 512, build: () => onTile(art, 512, MASKABLE_SCALE, tileRgb) },
  { file: 'apple-touch-icon.png', size: 180, build: () => onTile(art, 180, APPLE_SCALE, tileRgb) },
];

await mkdir(outFile, { recursive: true });
const written = [];
for (const { file, build } of outputs) {
  const target = path.join(outFile, file);
  const pipeline = await build(); // onTile() is async — resolve before piping
  const buf = await pipeline.png().toBuffer();
  await writeFile(target, buf);
  written.push({ file, bytes: buf.length });
}

console.log(`Generated ${written.length} icons from ${path.relative(root, masterFile)} (${meta.width}x${meta.height} master)`);
console.log(`Opaque tile: ${tileName}${args.bg ? ' (forced via --bg)' : luminance > 0.55 ? ' (auto: art is bright)' : ' (auto: art is dark)'}`);
for (const { file, bytes } of written) {
  console.log(`  ${path.relative(root, path.join(outFile, file))}  ${(bytes / 1024).toFixed(1)} kB`);
}
