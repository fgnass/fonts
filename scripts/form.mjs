// Measures letter-form properties of every font and writes them into
// public/data/metrics.json (run it after measure.mjs, which rewrites the file).
//
// Usage: node scripts/form.mjs [family ...]   (with families: only print their values)
//
//   ap: aperture, the angle (degrees) in which one sees out of the counter
//       of "c" and of the lower counter of "e" (mean of both)
//   ge: roundness of "o" and "O": coefficient of variation of the distance
//       of the outline from the center (0 = a circle)
//   ex: extenders, ascender above the x-height plus descender, in x-heights
//   sb: serif thickness divided by the stem width (thin hairlines to slabs,
//       at most 1.2); null without clear serifs (s < 0.04)
//   mo: coefficient of variation of the advance widths of a–z (0 = monospaced)
//   hf: hollow-stroke score, from cross-sections of normally solid stems
import fs from 'node:fs';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { loadGlyphs, pathData } from './glyph.mjs';
import { strokeFillOf } from './stroke-fill.mjs';

const K = 0.5; // pixels per font unit
const PAD = 4;

function raster(path, k = K) {
  const b = path.getBoundingBox();
  if (!isFinite(b.x1) || b.x2 <= b.x1 || b.y2 <= b.y1) return null;
  const w = Math.ceil((b.x2 - b.x1) * k) + 2 * PAD, h = Math.ceil((b.y2 - b.y1) * k) + 2 * PAD;
  const c = createCanvas(w, h), ctx = c.getContext('2d');
  ctx.setTransform(k, 0, 0, k, PAD - b.x1 * k, PAD - b.y1 * k);
  ctx.fill(new Path2D(pathData(path)), 'nonzero');
  const px = ctx.getImageData(0, 0, w, h).data;
  const img = new Uint8Array(w * h);
  for (let i = 0; i < img.length; i++) img[i] = px[i * 4 + 3] > 127 ? 1 : 0;
  return { img, w, h, top: PAD, bottom: h - PAD - 1, left: PAD, right: w - PAD - 1 };
}

const ink = (r, x, y) => {
  const xi = Math.round(x), yi = Math.round(y);
  return xi >= 0 && yi >= 0 && xi < r.w && yi < r.h && r.img[yi * r.w + xi] === 1;
};

/** Angle (degrees) of the rays from (cx, cy) that leave the glyph box without touching ink. */
function openAngle(r, cx, cy) {
  const N = 720;
  let open = 0;
  for (let k = 0; k < N; k++) {
    const a = (2 * Math.PI * k) / N, dx = Math.cos(a), dy = Math.sin(a);
    let x = cx, y = cy, hit = false;
    while (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      if (ink(r, x, y)) { hit = true; break; }
      x += dx * 0.5; y += dy * 0.5;
    }
    if (!hit) open++;
  }
  return (360 * open) / N;
}

/** Middle of the background run on the vertical line x that is nearest to row y0 (searching downwards first). */
function counterAt(r, x, y0, down = true) {
  const rows = [];
  for (let y = r.top; y <= r.bottom; y++) rows.push(ink(r, x, y));
  const start = Math.round(y0) - r.top;
  // Find the background runs that are enclosed by ink above and below.
  const runs = [];
  for (let i = 0; i < rows.length; ) {
    if (rows[i]) { i++; continue; }
    let j = i;
    while (j < rows.length && !rows[j]) j++;
    if (i > 0 && j < rows.length) runs.push([i, j - 1]);
    i = j;
  }
  if (!runs.length) return null;
  const pick = down ? runs.find(([, b]) => b >= start) ?? runs[runs.length - 1] : runs.find(([a, b]) => a <= start && b >= start) ?? runs[0];
  return r.top + (pick[0] + pick[1]) / 2;
}

function apertureOf(font) {
  const values = [];
  const c = font.path('c'), rc = c && raster(c);
  if (rc) {
    const cx = (rc.left + rc.right) / 2;
    const cy = counterAt(rc, cx, (rc.top + rc.bottom) / 2, false);
    if (cy != null) values.push(openAngle(rc, cx, cy));
  }
  const e = font.path('e'), re = e && raster(e);
  if (re) {
    const cx = (re.left + re.right) / 2;
    // The lower counter: the background run below the bar.
    const cy = counterAt(re, cx, re.top + 0.55 * (re.bottom - re.top), true);
    if (cy != null) values.push(openAngle(re, cx, cy));
  }
  return values.length ? values.reduce((a, b) => a + b) / values.length : null;
}

/** The glyph with its holes filled. */
function filled(r) {
  const out = new Uint8Array(r.w * r.h).fill(1);
  const stack = [0];
  out[0] = 0;
  while (stack.length) {
    const p = stack.pop(), x = p % r.w, y = (p / r.w) | 0;
    for (const q of [x > 0 && p - 1, x < r.w - 1 && p + 1, y > 0 && p - r.w, y < r.h - 1 && p + r.w])
      if (q !== false && out[q] && !r.img[q]) (out[q] = 0), stack.push(q);
  }
  return out;
}

function roundnessOf(font) {
  const values = [];
  for (const ch of 'oO') {
    const p = font.path(ch), r = p && raster(p);
    if (!r) continue;
    const f = filled(r);
    let n = 0, sx = 0, sy = 0;
    for (let i = 0; i < f.length; i++) if (f[i]) (n++, (sx += i % r.w), (sy += (i / r.w) | 0));
    if (!n) continue;
    const cx = sx / n, cy = sy / n;
    const d = [];
    for (let y = 1; y < r.h - 1; y++)
      for (let x = 1; x < r.w - 1; x++) {
        const i = y * r.w + x;
        if (f[i] && (!f[i - 1] || !f[i + 1] || !f[i - r.w] || !f[i + r.w])) d.push(Math.hypot(x - cx, y - cy));
      }
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    values.push(Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / d.length) / mean);
  }
  return values.length ? values.reduce((a, b) => a + b) / values.length : null;
}

const box = (font, ch) => {
  const b = font.path(ch)?.getBoundingBox();
  return b && isFinite(b.y1) ? b : null;
};

function extendersOf(font) {
  const x = box(font, 'x'), H = box(font, 'H');
  if (!x || !H) return null;
  const xh = x.y2 - x.y1;
  if (xh >= 0.95 * (H.y2 - H.y1)) return null; // capitals only
  const asc = Math.max(...[...'bdhkl'].map((c) => box(font, c)).filter(Boolean).map((b) => -b.y1));
  const desc = Math.max(...[...'pqgy'].map((c) => box(font, c)).filter(Boolean).map((b) => b.y2));
  if (!isFinite(asc) || !isFinite(desc)) return null;
  return (asc - xh + desc) / xh;
}

function serifTypeOf(font) {
  const values = [];
  for (const [ch, ends] of [['I', ['bottom', 'top']], ['H', ['bottom', 'top']], ['n', ['bottom']]]) {
    const p = font.path(ch), r = p && raster(p, 1);
    if (!r) continue;
    const gh = r.bottom - r.top;
    const row = (y) => {
      let s = 0;
      for (let x = 0; x < r.w; x++) s += r.img[y * r.w + x];
      return s;
    };
    for (const end of ends) {
      const stemY = Math.round(end === 'bottom' ? r.bottom - 0.3 * gh : r.top + 0.3 * gh);
      const stem = row(stemY);
      let foot = 0;
      for (let k = 0; k <= 0.06 * gh; k++) foot = Math.max(foot, row(Math.round(end === 'bottom' ? r.bottom - k : r.top + k)));
      if (!stem || foot < stem * 1.3) continue; // no serif here
      const half = stem + 0.5 * (foot - stem);
      let thick = 0;
      for (let k = 0; k < 0.3 * gh; k++) {
        if (row(Math.round(end === 'bottom' ? r.bottom - k : r.top + k)) >= half) thick++;
        else if (thick) break;
      }
      const stems = ch === 'I' ? 1 : 2;
      values.push(thick / (stem / stems));
    }
  }
  values.sort((a, b) => a - b);
  return values.length ? values[Math.floor(values.length / 2)] : null;
}

function monoOf(font) {
  const adv = [...'abcdefghijklmnopqrstuvwxyz'].filter((c) => font.path(c)).map((c) => font.advance(c));
  if (adv.length < 20) return null;
  const mean = adv.reduce((a, b) => a + b) / adv.length;
  return Math.sqrt(adv.reduce((a, b) => a + (b - mean) ** 2, 0) / adv.length) / mean;
}

const round = (v, d = 3) => (v == null || !isFinite(v) ? null : +v.toFixed(d));
const measure = (font) => ({
  ap: round(apertureOf(font), 1),
  ge: round(roundnessOf(font)),
  ex: round(extendersOf(font)),
  sb: round(serifTypeOf(font)),
  mo: round(monoOf(font)),
  hf: round(strokeFillOf(font)),
});

const manifest = JSON.parse(fs.readFileSync('data/manifest.json', 'utf8'));
const names = process.argv.slice(2);
if (names.length) {
  for (const name of names) {
    const m = manifest.find((m) => m.family === name);
    if (!m) { console.log(name, 'not found'); continue; }
    const font = loadGlyphs(`data/fonts/${m.file}`);
    console.log(name.padEnd(22), JSON.stringify(font && measure(font)));
  }
} else {
  const metrics = JSON.parse(fs.readFileSync('public/data/metrics.json', 'utf8'));
  manifest.forEach((m, i) => {
    const font = loadGlyphs(`data/fonts/${m.file}`);
    if (!font || !metrics[i]) return;
    const v = measure(font);
    // The serif type needs clear serifs: below 0.04, small spurs of handwriting fonts count as serifs.
    if (!(metrics[i].s >= 0.04)) v.sb = null;
    else v.sb = Math.min(v.sb, 1.2);
    for (const [k, x] of Object.entries(v)) x == null ? delete metrics[i][k] : (metrics[i][k] = x);
    process.stdout.write(`\r${i + 1}/${manifest.length}`);
  });
  process.stdout.write('\n');
  fs.writeFileSync('public/data/metrics.json', JSON.stringify(metrics));
}
