// Measures how connected the lowercase letters of every font are (script
// fonts join their letters) and writes `cn` into the metric part
// data/metrics/connected.json (needs `lc` of caps.mjs).
//
// Usage: node scripts/connected.mjs [family ...]   (with families: only print their values)
//
// Each of PAIRS is shaped with HarfBuzz (so contextual alternates and
// ligatures apply, as in the browser) and both glyphs are rasterized at
// their positions. The pair counts as joined when the ink of the two glyphs
// touches or overlaps along at least CONTACT pixels (a stroke running into
// the next letter, not a corner that grazes the neighbour in a tightly
// spaced sans). `cn` is the share of joined pairs:
// 0 = all letters separate, 1 = every pair joined.
import fs from 'node:fs';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { loadGlyphs, pathData } from './glyph.mjs';
import { entry, readPart, writePart } from './metrics.mjs';
import { progress, progressDone } from './progress.mjs';

const PAIRS = ['an', 'no', 'ou', 'ne', 'in', 'ad', 'er', 'on', 'un', 'ma', 'es', 'li'];
const K = 0.12; // pixels per font unit: 120 px per em
const PAD = 4;
const REACH = 2; // pixels: ink closer than this counts as touching (a hairline gap at 120 px per em)
const CONTACT = 4; // pixels of b within REACH of a for a joined pair

/** Rasterizes several paths into one image per path, all in the same frame. */
function rasterAll(paths) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of paths) {
    const b = p.getBoundingBox();
    if (!isFinite(b.x1) || b.x2 <= b.x1 || b.y2 <= b.y1) return null;
    x1 = Math.min(x1, b.x1); y1 = Math.min(y1, b.y1); x2 = Math.max(x2, b.x2); y2 = Math.max(y2, b.y2);
  }
  const w = Math.ceil((x2 - x1) * K) + 2 * PAD, h = Math.ceil((y2 - y1) * K) + 2 * PAD;
  if (w * h > 4e6) return null;
  const c = createCanvas(w, h), ctx = c.getContext('2d');
  const images = paths.map((p) => {
    ctx.resetTransform();
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(K, 0, 0, K, PAD - x1 * K, PAD - y1 * K);
    ctx.fill(new Path2D(pathData(p)), 'nonzero');
    const px = ctx.getImageData(0, 0, w, h).data;
    const img = new Uint8Array(w * h);
    for (let i = 0; i < img.length; i++) img[i] = px[i * 4 + 3] > 127 ? 1 : 0;
    return img;
  });
  return { images, w, h };
}

/** Pixels of b that overlap a or lie within REACH pixels of it. */
function contact(a, b, w, h) {
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!b[y * w + x]) continue;
      let touches = false;
      for (let dy = -REACH; dy <= REACH && !touches; dy++) {
        for (let dx = -REACH; dx <= REACH; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && a[ny * w + nx]) { touches = true; break; }
        }
      }
      if (touches) n++;
    }
  }
  return n;
}

/** Share of the pairs whose two letters are joined, or null if too few pairs can be shaped. */
export function connectedOf(font) {
  let joined = 0, total = 0;
  for (const pair of PAIRS) {
    const paths = font.paths(pair);
    // A ligature glyph for the pair is a joined pair by definition.
    if (!paths) continue;
    if (paths.length === 1) { joined++; total++; continue; }
    const r = rasterAll(paths);
    if (!r) continue;
    total++;
    const [a, b] = r.images;
    const c = contact(a, b, r.w, r.h);
    if (process.env.DEBUG) console.log(`  ${pair}: contact ${c}`);
    if (c >= CONTACT) joined++;
  }
  return total >= 6 ? Math.round((joined / total) * 100) / 100 : null;
}

const manifest = JSON.parse(fs.readFileSync('data/manifest.json', 'utf8'));
const names = process.argv.slice(2);
if (names.length) {
  for (const name of names) {
    const m = manifest.find((m) => m.family === name);
    if (!m) { console.log(name, 'not found'); continue; }
    const font = loadGlyphs(`data/fonts/${m.file}`);
    console.log(name.padEnd(22), font && connectedOf(font));
  }
} else {
  const caps = readPart('caps');
  const rows = manifest.map((m, i) => {
    // Fonts without real lowercase letters would show capitals, which never join.
    const font = caps[i].lc === 0 ? null : loadGlyphs(`data/fonts/${m.file}`);
    progress(`${i + 1}/${manifest.length}`);
    return entry('cn', font && connectedOf(font));
  });
  progressDone();
  writePart('connected', rows);
}
