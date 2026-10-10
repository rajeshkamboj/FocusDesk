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
 *   icon-maskable-192.png    192x192   maskable: art kept inside the 80% safe
 *   icon-maskable-512.png    512x512   zone, on an opaque tile (OS masks these
 *                                       into circles/squircles)
 *   apple-touch-icon.png     180x180   opaque — iOS applies its own rounded
 *                                       mask, so the icon must not be
 *                                       transparent at the edges
 *
 * Two master styles are handled automatically:
 *
 *   - Tiled master — artwork on an opaque rounded-rect tile, transparent
 *     only in/around the corners. The tile colour is sampled from the
 *     master itself and the opaque variants are built on that colour, so
 *     there is never a foreign ring around the icon. The maskable scale is
 *     computed from how far the *art* (not the tile) reaches from the
 *     centre, so the motif is always inside the 80% safe zone; the Apple
 *     scale uses the iOS superellipse's 45° edge (its worst clip for this
 *     art).
 *   - Bare artwork on transparency. A contrast tile is picked from the
 *     art's luminance (bright art → dark brand tile, dark art → white)
 *     and the art is kept at a conservative 78%/90% scale.
 *
 * `--bg '#RRGGBB'` always wins over the sampling.
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

const toHex = ({ r, g, b }) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

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
 * Analyse the master at 256x256. Returns:
 *   tiled      — is this an opaque-tile master?
 *   tileColor  — the tile colour ({r,g,b}) when tiled, else null
 *   luminance  — alpha-weighted mean luminance of all art, 0..1
 *   artRadius  — farthest distance from centre of *art* pixels (tile
 *                background excluded when tiled), in 256-units
 *   opaqueRadius — farthest opaque pixel, any colour
 *
 * Tile detection: the frame (pixels within 16% of an edge) must be mostly
 * covered, and one colour bucket must dominate it — the tile's background
 * always does, while bare artwork spreads across buckets or stays clear.
 */
async function analyse(artBuffer) {
  const W = 256;
  const { data } = await sharp(artBuffer).resize(W, W).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const c = W / 2;
  const px = (x, y) => {
    const i = (y * W + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };

  let lumSum = 0;
  let lumW = 0;
  let opaqueRadius = 0;
  const inFrame = (x, y) => Math.min(x, y, W - 1 - x, W - 1 - y) <= Math.round(0.16 * W);
  const buckets = new Map(); // "q,q,q" -> { count, r, g, b }
  let frameOpaque = 0;

  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b, a] = px(x, y);
      if (a < 32) continue;
      const d = Math.hypot(x - c, y - c);
      if (d > opaqueRadius) opaqueRadius = d;
      lumSum += ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) * (a / 255);
      lumW += a / 255;
      if (!inFrame(x, y)) continue;
      frameOpaque++;
      const key = `${r >> 5},${g >> 5},${b >> 5}`; // 32-level buckets
      const bkt = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      bkt.count++;
      bkt.r += r;
      bkt.g += g;
      bkt.b += b;
      buckets.set(key, bkt);
    }
  }

  if (lumW === 0) return null; // nothing visible at all

  const top = [...buckets.values()].sort((a, b) => b.count - a.count)[0] ?? null;
  const frameTotal = W * W - (W - 2 * Math.round(0.16 * W)) ** 2;
  const tiled = frameOpaque / frameTotal > 0.35 && top && top.count / frameOpaque > 0.4;
  const tileColor = tiled ? { r: Math.round(top.r / top.count), g: Math.round(top.g / top.count), b: Math.round(top.b / top.count) } : null;

  // Art radius: farthest pixel that is NOT the tile background.
  const isTileBg = (p) => tileColor && p[3] >= 32 && Math.abs(p[0] - tileColor.r) < 32 && Math.abs(p[1] - tileColor.g) < 32 && Math.abs(p[2] - tileColor.b) < 32;
  let artRadius = 0;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const p = px(x, y);
      if (p[3] < 32 || isTileBg(p)) continue;
      const d = Math.hypot(x - c, y - c);
      if (d > artRadius) artRadius = d;
    }
  }
  if (artRadius === 0) artRadius = opaqueRadius; // solid tile, no distinct art

  return {
    tiled,
    tileColor,
    luminance: lumSum / lumW,
    artRadius,
    opaqueRadius,
  };
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

const info = await analyse(art);
if (!info) {
  console.error('Master icon has no visible (non-transparent) pixels.');
  process.exit(1);
}

//
// Tile colour for the opaque variants.
//  1. --bg wins (explicit override);
//  2. a tiled master keeps its own sampled tile colour, so the opaque
//     variants are seamless with the master;
//  3. bare artwork gets a contrast tile — bright art needs a dark tile
//     to stay visible, dark art wants white.
const DARK_TILE = { r: 0x1e, g: 0x6b, b: 0x52, hex: '#1E6B52' }; // brand accent
const LIGHT_TILE = { r: 0xff, g: 0xff, b: 0xff, hex: '#FFFFFF' };
const tileRgb = args.bg ? hexToRgb(args.bg) : info.tileColor ?? (info.luminance > 0.55 ? DARK_TILE : LIGHT_TILE);
const tileName = toHex(tileRgb);
const tileSource = args.bg ? 'forced via --bg' : info.tileColor ? 'sampled from the master tile' : info.luminance > 0.55 ? 'auto: bright art on brand tile' : 'auto: dark art on white';

//
// Scales for the opaque variants (analysis units: 256 canvas, centre 128).
//   - maskable: the 80% safe zone is a circle of radius 0.8·128 = 102.4.
//     A tiled master is scaled so its *art* fits that circle exactly;
//     the ring is the sampled tile colour, so the result is seamless.
//     Bare artwork uses a conservative 78%.
//   - apple: iOS rounds the full square with a superellipse whose corner
//     radius ≈ 22.4% of the width; its worst clip for corner-reaching art
//     is the 45° diagonal, where the mask edge sits at
//     (W/2 − r)·√2 + r = 157 units. A tiled master is scaled so its art
//     fits that line; bare artwork uses 90%.
const C = 128;
const IOS_EDGE_45 = (C - 0.224 * 256) * Math.SQRT2 + 0.224 * 256;
const MASKABLE_SCALE = info.tileColor ? Math.min(1, (0.8 * C) / info.artRadius) : 0.78;
const APPLE_SCALE = info.tileColor ? Math.min(1, IOS_EDGE_45 / info.artRadius) : 0.9;

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
console.log(`Master style: ${info.tiled ? 'tiled (opaque rounded tile)' : 'bare artwork on transparency'}`);
console.log(`Opaque tile: ${tileName} (${tileSource})`);
console.log(`Maskable scale: ${(MASKABLE_SCALE * 100).toFixed(1)}% · Apple scale: ${(APPLE_SCALE * 100).toFixed(1)}%`);
for (const { file, bytes } of written) {
  console.log(`  ${path.relative(root, path.join(outFile, file))}  ${(bytes / 1024).toFixed(1)} kB`);
}
