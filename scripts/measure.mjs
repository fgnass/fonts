// Measures visual properties of every font and writes public/data/metrics.json.
//
// Usage: node scripts/measure.mjs
//
// Per variant (from the small subsets in data/fonts-v/):
//   weight: mean stroke width (ink area / skeleton length) divided by the cap height
//   slant:  angle in degrees (positive leans right), found by shearing "HIlnd"
//           until its vertical strokes are sharpest in a column histogram
// Per family (from the default variant in data/fonts/):
//   xHeight:  height of "x" divided by the height of "H" (null for fonts with capitals only)
//   serif:    how far the feet and heads of I, H, n reach beyond the stems, relative to the cap height (median)
//   straight: share of the outline length of a-z and A-Z that is straight
//   width:    mean aspect ratio of letters (lowercase to x-height, capitals to cap height)
//   capHeight: height of "H" in em (to show all fonts with the same cap height)
//   contrast: thick strokes divided by thin strokes (85th / 15th percentile of the stroke width)
//   ends:     share of stroke ends in a-z that are sharp (0 = all round, 1 = all square or pointed)
//
// With --keep-variants, the per-variant values are taken from the existing
// metrics.json (only the family values are measured again).
//
// Output: [{ x, h, s, r, w, c, e, v: { "<variant>": [weight, slant] } }, ...] in manifest order.
import fs from 'node:fs';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { thin } from '../src/shape.js';
import { loadGlyphs, pathData } from './glyph.mjs';

const K = 0.25; // pixels per font unit (the em is 1000 units)
const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Fills a path into a 0/1 raster. `baseline` is the row of y = 0. */
function raster(path, k = K) {
  const b = path.getBoundingBox();
  if (!isFinite(b.x1) || b.x2 <= b.x1 || b.y2 <= b.y1) return null;
  const pad = 4;
  const w = Math.ceil((b.x2 - b.x1) * k) + 2 * pad, h = Math.ceil((b.y2 - b.y1) * k) + 2 * pad;
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(k, 0, 0, k, pad - b.x1 * k, pad - b.y1 * k);
  ctx.fillStyle = '#000';
  ctx.fill(new Path2D(pathData(path)), 'nonzero');
  const px = ctx.getImageData(0, 0, w, h).data;
  const img = new Uint8Array(w * h);
  for (let i = 0; i < img.length; i++) img[i] = px[i * 4] < 128 ? 1 : 0;
  return { img, w, h, top: pad, bottom: h - pad - 1, baseline: pad - b.y1 * k };
}

const height = (path) => {
  const b = path?.getBoundingBox();
  return b && isFinite(b.y1) ? b.y2 - b.y1 : 0;
};

function weightOf(font) {
  const H = height(font.path('H'));
  const path = font.path('Hnod');
  const r = path && H && raster(path);
  if (!r) return null;
  let area = 0;
  for (const v of r.img) area += v;
  thin(r.img, r.w, r.h);
  let skeleton = 0;
  for (const v of r.img) skeleton += v;
  return skeleton ? area / skeleton / (H * K) : null;
}

function slantOf(font) {
  const path = font.path('HIlnd');
  const r = path && raster(path);
  if (!r) return null;
  const xs = [], ys = [];
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (r.img[y * r.w + x]) xs.push(x), ys.push(y - r.baseline);
  let best = 0, bestScore = -1;
  const hist = new Float64Array(r.w + 2 * r.h + 2);
  for (let a = -15; a <= 40; a += 0.5) {
    const t = Math.tan((a * Math.PI) / 180);
    hist.fill(0);
    for (let i = 0; i < xs.length; i++) hist[Math.round(xs[i] + ys[i] * t + r.h)]++;
    let score = 0;
    for (const v of hist) score += v * v;
    if (score > bestScore) (bestScore = score), (best = a);
  }
  return best;
}

const inkWidth = (r, y) => {
  let n = 0;
  for (let x = 0; x < r.w; x++) n += r.img[y * r.w + x];
  return n;
};

/** Widest ink row in the given range of rows. */
function widest(r, from, to) {
  let max = 0;
  for (let y = Math.round(from); y <= Math.round(to); y++) max = Math.max(max, inkWidth(r, y));
  return max;
}

function serifOf(font) {
  const cap = height(font.path('H'));
  if (!cap) return null;
  const values = [];
  for (const [ch, heads] of [['I', true], ['H', true], ['n', false]]) {
    const path = font.path(ch);
    const r = path && raster(path, 1); // serifs are thin, so use a finer raster
    if (!r) continue;
    const gh = r.bottom - r.top;
    const stem = inkWidth(r, Math.round(r.bottom - 0.3 * gh));
    if (!stem) continue;
    // Serif length beyond the stems, relative to the cap height (one stem in I, two in H and n).
    const stems = ch === 'I' ? 2 : 4;
    values.push((widest(r, r.bottom - 0.06 * gh, r.bottom) - stem) / stems / cap);
    if (heads) values.push((widest(r, r.top, r.top + 0.06 * gh) - stem) / stems / cap);
  }
  values.sort((a, b) => a - b);
  return values.length ? Math.max(0, values[Math.floor(values.length / 2)]) : null;
}

/** Distance of point p from the line through a and b. */
function deviation(ax, ay, bx, by, px, py) {
  const len = Math.hypot(bx - ax, by - ay);
  if (!len) return Math.hypot(px - ax, py - ay);
  return Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
}

function straightOf(font) {
  let straight = 0, total = 0;
  for (const ch of LETTERS) {
    const path = font.path(ch);
    if (!path) continue;
    let x = 0, y = 0, sx = 0, sy = 0;
    for (const c of path.commands) {
      if (c.type === 'M') {
        x = sx = c.x;
        y = sy = c.y;
        continue;
      }
      const tx = c.type === 'Z' ? sx : c.x, ty = c.type === 'Z' ? sy : c.y;
      const chord = Math.hypot(tx - x, ty - y);
      let dev = 0, length = chord;
      if (c.type === 'Q') {
        dev = deviation(x, y, tx, ty, c.x1, c.y1);
        length = (chord + Math.hypot(c.x1 - x, c.y1 - y) + Math.hypot(tx - c.x1, ty - c.y1)) / 2;
      } else if (c.type === 'C') {
        dev = Math.max(deviation(x, y, tx, ty, c.x1, c.y1), deviation(x, y, tx, ty, c.x2, c.y2));
        length = (chord + Math.hypot(c.x1 - x, c.y1 - y) + Math.hypot(c.x2 - c.x1, c.y2 - c.y1) + Math.hypot(tx - c.x2, ty - c.y2)) / 2;
      }
      total += length;
      if (dev < Math.max(2, 0.02 * chord)) straight += length;
      x = tx;
      y = ty;
    }
  }
  return total ? straight / total : null;
}

/**
 * Mean aspect ratio of the letters: lowercase widths divided by the x-height,
 * capital widths divided by the cap height. So a small x-height does not make
 * a font look narrow.
 */
function widthOf(font) {
  const cap = height(font.path('H'));
  const x = height(font.path('x'));
  const ratios = [];
  const add = (letters, h) => {
    for (const ch of letters) {
      const b = font.path(ch)?.getBoundingBox();
      if (b && isFinite(b.x1)) ratios.push((b.x2 - b.x1) / h);
    }
  };
  if (cap) add('HONDRBE', cap);
  // Fonts with capitals only (x as tall as H) have no lowercase proportions of their own.
  if (x && cap && x < 0.95 * cap) add('nohaduebpq', x);
  return ratios.length ? ratios.reduce((a, b) => a + b) / ratios.length : null;
}

/** Two-pass 3-4 chamfer distance (in pixels) from every ink pixel to the background. */
function inkDistance(img, w, h) {
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = img[i] ? 1e9 : 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (d[i]) d[i] = Math.min(d[i], d[i - 1] + 1, d[i - w] + 1, d[i - w - 1] + 1.4142, d[i - w + 1] + 1.4142);
    }
  for (let y = h - 2; y > 0; y--)
    for (let x = w - 2; x > 0; x--) {
      const i = y * w + x;
      if (d[i]) d[i] = Math.min(d[i], d[i + 1] + 1, d[i + w] + 1, d[i + w + 1] + 1.4142, d[i + w - 1] + 1.4142);
    }
  return d;
}

function contrastOf(font) {
  const path = font.path('nHoeO');
  const r = path && raster(path, 0.5);
  if (!r) return null;
  const d = inkDistance(r.img, r.w, r.h);
  thin(r.img, r.w, r.h);
  const widths = [];
  for (let i = 0; i < r.img.length; i++) if (r.img[i]) widths.push(d[i]);
  if (widths.length < 20) return null;
  widths.sort((a, b) => a - b);
  const thinStroke = widths[Math.floor(widths.length * 0.15)];
  return thinStroke ? widths[Math.floor(widths.length * 0.85)] / thinStroke : null;
}

/** Points along a contour, about every `step` units (curves and lines are subdivided). */
function polyline(commands, step = 6) {
  const contours = [];
  let pts = [], x = 0, y = 0, sx = 0, sy = 0;
  const push = (px, py) => {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(px - last[0], py - last[1]) > 0.5) pts.push([px, py]);
  };
  for (const c of commands) {
    if (c.type === 'M') {
      if (pts.length > 2) contours.push(pts);
      pts = [];
      x = sx = c.x;
      y = sy = c.y;
      push(x, y);
      continue;
    }
    if (c.type === 'Q' || c.type === 'C') {
      const len = Math.hypot(c.x1 - x, c.y1 - y) + Math.hypot(c.x - c.x1, c.y - c.y1);
      const n = Math.max(2, Math.ceil(len / step));
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        if (c.type === 'Q') push(u * u * x + 2 * u * t * c.x1 + t * t * c.x, u * u * y + 2 * u * t * c.y1 + t * t * c.y);
        else
          push(
            u * u * u * x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
            u * u * u * y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y
          );
      }
    } else if (c.type === 'L' || c.type === 'Z') {
      // Lines too, so that both corners of a square stroke end are within a window along the outline.
      const tx = c.type === 'L' ? c.x : sx, ty = c.type === 'L' ? c.y : sy;
      const n = Math.max(1, Math.ceil(Math.hypot(tx - x, ty - y) / step));
      for (let k = 1; k <= n; k++) push(x + ((tx - x) * k) / n, y + ((ty - y) * k) / n);
    }
    if (c.type !== 'Z') (x = c.x), (y = c.y);
    else (x = sx), (y = sy);
  }
  if (pts.length > 2) contours.push(pts);
  for (const p of contours) {
    const a = p[0], b = p[p.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5) p.pop();
  }
  return contours;
}

/** Width of the stem of "l" (or "I") at half its height, in font units. */
function stemOf(font) {
  for (const ch of 'lI') {
    const path = font.path(ch);
    const r = path && raster(path, 1);
    if (!r) continue;
    const w = inkWidth(r, Math.round((r.top + r.bottom) / 2));
    if (w) return w;
  }
  return null;
}

/**
 * Share of stroke ends that are sharp (0 = all round, 1 = all square or
 * pointed). A stroke end is a part of the outline that turns by about 180
 * degrees (convex) within 1.6 stem widths and is not hidden inside another
 * contour (overlapping contours). It is sharp when a turn of more than 70
 * degrees happens within 0.24 stem widths (at most 24 units) somewhere in or
 * near the end, so tiny roundings (as in Barlow) still count as sharp, but
 * softly rounded corners (as in Rubik) do not.
 */
function endsOf(font) {
  const stem = stemOf(font);
  if (!stem) return null;
  const SMALL = Math.min(12, 0.12 * stem), BIG = 0.8 * stem;
  const END = (150 * Math.PI) / 180, SHARP = (70 * Math.PI) / 180;
  let ends = 0, sharp = 0;
  for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
    const path = font.path(ch);
    if (!path) continue;
    const contours = polyline(path.commands);
    // The orientation of the largest contour (the outside of the ink).
    let sign = 0, largest = 0;
    for (const p of contours) {
      let area = 0;
      p.forEach(([x0, y0], i) => {
        const [x1, y1] = p[(i + 1) % p.length];
        area += x0 * y1 - x1 * y0;
      });
      if (Math.abs(area) > largest) (largest = Math.abs(area)), (sign = Math.sign(area));
    }
    // Nonzero winding at a point: overlapping contours (common in fonts made from variable fonts) hide
    // parts of each other, and ends there are not visible.
    const inside = (x, y) => {
      let wn = 0;
      for (const q of contours)
        q.forEach(([x0, y0], k) => {
          const [x1, y1] = q[(k + 1) % q.length];
          if ((y0 <= y) !== (y1 <= y)) {
            const cross = (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0);
            wn += y1 > y0 ? (cross > 0 ? 1 : 0) : cross < 0 ? -1 : 0;
          }
        });
      return wn !== 0;
    };
    /** True if point i of contour p has ink on both sides, so it lies inside another contour. */
    const hidden = (p, i) => {
      const n = p.length;
      const [ax, ay] = p[(i - 1 + n) % n], [bx, by] = p[i], [cx, cy] = p[(i + 1) % n];
      const tx = cx - ax, ty = cy - ay, len = Math.hypot(tx, ty) || 1;
      const nx = (-ty / len) * 3, ny = (tx / len) * 3;
      return inside(bx + nx, by + ny) && inside(bx - nx, by - ny);
    };
    for (const p of contours) {
      const n = p.length;
      // Signed turn and outline position at each point.
      const turn = new Float64Array(n), at = new Float64Array(n);
      let total = 0;
      for (let i = 0; i < n; i++) {
        const [ax, ay] = p[(i - 1 + n) % n], [bx, by] = p[i], [cx, cy] = p[(i + 1) % n];
        const ux = bx - ax, uy = by - ay, vx = cx - bx, vy = cy - by;
        turn[i] = sign * Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); // positive = convex
        at[i] = total;
        total += Math.hypot(vx, vy);
      }
      if (total < 4 * BIG) continue;
      /** Sum of the turns of the points within `w` units of point i (along the outline). */
      const windowTurn = (i, w) => {
        let sum = turn[i];
        for (let k = 1; k < n && (at[(i + k) % n] - at[i] + total) % total <= w; k++) sum += turn[(i + k) % n];
        for (let k = 1; k < n && (at[i] - at[(i - k + n) % n] + total) % total <= w; k++) sum += turn[(i - k + n) % n];
        return sum;
      };
      const isEnd = Array.from({ length: n }, (_, i) => windowTurn(i, BIG) > END);
      // The corners of a square end lie up to BIG beyond the points that count as the end, so look that far.
      const small = Array.from({ length: n }, (_, i) => windowTurn(i, SMALL));
      const sharpNear = (i) => {
        let max = small[i];
        for (let k = 1; k < n && (at[(i + k) % n] - at[i] + total) % total <= BIG; k++) max = Math.max(max, small[(i + k) % n]);
        for (let k = 1; k < n && (at[i] - at[(i - k + n) % n] + total) % total <= BIG; k++) max = Math.max(max, small[(i - k + n) % n]);
        return max > SHARP;
      };
      // Start at a point that is not part of an end, so that no end wraps around.
      const start = isEnd.indexOf(false);
      if (start < 0) continue;
      let inEnd = false, endSharp = false, endHidden = false;
      for (let k = 1; k <= n; k++) {
        const i = (start + k) % n;
        if (isEnd[i]) {
          if (!inEnd) (inEnd = true), (endSharp = false), (endHidden = hidden(p, i));
          if (!endSharp && sharpNear(i)) endSharp = true;
        } else if (inEnd) {
          inEnd = false;
          if (endHidden) continue;
          ends++;
          if (endSharp) sharp++;
        }
      }
    }
  }
  return ends ? sharp / ends : null;
}

const round = (v, d = 3) => (v == null ? null : +v.toFixed(d));
const manifest = JSON.parse(fs.readFileSync('data/manifest.json', 'utf8'));
const previous = process.argv.includes('--keep-variants') ? JSON.parse(fs.readFileSync('public/data/metrics.json', 'utf8')) : null;
const out = manifest.map((m, i) => {
  const font = loadGlyphs(`data/fonts/${m.file}`);
  const entry = { v: {} };
  if (font) {
    const H = height(font.path('H'));
    // Fonts with capitals only have no real x-height.
    const x = H ? height(font.path('x')) / H : 0;
    entry.x = x && x < 0.95 ? round(x) : null;
    entry.h = H ? round(H / 1000) : null;
    entry.s = round(serifOf(font));
    entry.r = round(straightOf(font));
    entry.w = round(widthOf(font));
    entry.c = round(contrastOf(font));
    entry.e = round(endsOf(font));
  }
  if (previous) {
    entry.v = previous[i].v;
    process.stdout.write(`\r${i + 1}/${manifest.length}`);
    return entry;
  }
  for (const v of m.variants) {
    const vf = loadGlyphs(`data/fonts-v/${m.file.replace('.ttf', '')}-${v}.ttf`);
    if (vf) entry.v[v] = [round(weightOf(vf)), slantOf(vf)];
  }
  process.stdout.write(`\r${i + 1}/${manifest.length}`);
  return entry;
});
process.stdout.write('\n');
fs.writeFileSync('public/data/metrics.json', JSON.stringify(out));
