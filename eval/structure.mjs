// Does the shape search find the structural variant that a sketch shows (a
// single- or double-story g, an asterisk with four or six arms, …)?
//
// No human drawings: the queries are synthetic sketches, the medial-axis
// skeleton of a font's glyph, simplified and distorted at three noise levels
// (see eval/results/sketches.png). The ground truth comes from the filled glyph, not from
// anything the search uses: the number of enclosed holes. A second label, the
// number of stroke ends, is partly circular, because the search adds a
// stroke-end penalty; "chamfer only" ranks without it.
//
// For every character and structural class (holes, ends) with enough fonts,
// up to QUERIES fonts of the class are queries. Per query: the share of the
// top K results (without the query font) in the same class, against the base
// rate of the class among all candidates. Also the rank of the query font
// itself (known-item retrieval under noise).
//
//   node eval/structure.mjs           everything
//   node eval/structure.mjs --sheet   only the contact sheet of synthetic sketches
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { createServer } from 'vite';
import { chamfer, decodeLines, distanceField, GRID, linePoints, sketchPoints, strokeEndDistance, strokeEnds } from '../src/shape.js';
import { loadGlyphs, pathData } from '../scripts/glyph.mjs';

const ROOT = new URL('..', import.meta.url);
const CHARS = 'aegknyAGMQR$*&';
const K = 10;
const QUERIES = 20; // per class
const MIN_CLASS = 10; // fonts
const BOOTSTRAP = 2000;
// Distortions in grid cells (the glyph spans about 55 of 64): a smooth warp of
// the whole sketch (wrong proportions), a smooth wobble along each stroke,
// strokes that end too early or too late, rotation (degrees) and scale.
// "low + gaps" also leaves a gap of `gap` cells at every junction.
const NOISE = {
  none: { warp: 0, wobble: 0, ends: 0, gap: 0, rotate: 0, scale: 0, simplify: 0 },
  low: { warp: 1.5, wobble: 0.3, ends: 1, gap: 0, rotate: 3, scale: 0.05, simplify: 0.5 },
  high: { warp: 3.5, wobble: 0.7, ends: 2.5, gap: 0, rotate: 7, scale: 0.12, simplify: 1 },
  'low + gaps': { warp: 1.5, wobble: 0.3, ends: 1, gap: 1.5, rotate: 3, scale: 0.05, simplify: 0.5 },
};

/** Seeded random numbers (mulberry32) and normal deviates. */
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}
const gauss = (rand) => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());

// The app's font pool (src/data.ts) through Vite; it fetches /data/… from public/.
globalThis.fetch = async (url) => {
  try {
    return new Response(readFileSync(new URL(`public${url}`, ROOT)), { headers: { 'content-type': 'application/octet-stream' } });
  } catch {
    return new Response('', { status: 404 });
  }
};
const vite = await createServer({ root: ROOT.pathname, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const { fonts, metrics, textFonts, hasSkeleton } = await vite.ssrLoadModule('/src/data.ts');
let reply;
globalThis.postMessage = (data) => reply(data);
globalThis.onmessage = null;
await vite.ssrLoadModule('/src/search-worker.ts');
const workerHandler = globalThis.onmessage;
const workerSearch = (data) => new Promise((resolve) => ((reply = resolve), workerHandler({ data })));
await vite.close();
const pool = textFonts.filter((f) => hasSkeleton(f.index)).map((f) => f.index);

// Holes of the filled glyph: background regions that do not touch the border
// (4-connected background, so that diagonal ink closes a region), ignoring
// specks below MIN_HOLE of the glyph box.
const SIZE = 128, PAD = 4, MIN_HOLE = 0.002;
const canvas = createCanvas(SIZE, SIZE), ctx = canvas.getContext('2d');
function holes(path) {
  const b = path?.getBoundingBox();
  if (!b) return null;
  const width = b.x2 - b.x1, height = b.y2 - b.y1;
  if (!Number.isFinite(width + height) || width <= 0 || height <= 0) return null;
  const scale = (SIZE - 2 * PAD) / Math.max(width, height);
  ctx.resetTransform();
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.setTransform(scale, 0, 0, scale, PAD - b.x1 * scale + (SIZE - 2 * PAD - width * scale) / 2, PAD - b.y1 * scale + (SIZE - 2 * PAD - height * scale) / 2);
  ctx.fill(new Path2D(pathData(path)), 'nonzero');
  const rgba = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const seen = Uint8Array.from({ length: SIZE * SIZE }, (_, i) => (rgba[i * 4 + 3] >= 128 ? 1 : 0));
  const minArea = MIN_HOLE * width * height * scale * scale;
  let count = 0;
  for (let start = 0; start < seen.length; start++) {
    if (seen[start]) continue;
    let area = 0, border = false;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop(), x = i % SIZE, y = (i / SIZE) | 0;
      area++;
      if (x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1) border = true;
      for (const j of [x > 0 && i - 1, x < SIZE - 1 && i + 1, y > 0 && i - SIZE, y < SIZE - 1 && i + SIZE]) {
        if (j !== false && !seen[j]) (seen[j] = 1), stack.push(j);
      }
    }
    if (!border && area >= minArea) count++;
  }
  return count;
}

/** Hole counts per character and font, cached in data/eval/holes.json. */
function holeLabels() {
  const file = new URL('data/eval/holes.json', ROOT);
  const cached = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const missing = [...CHARS].filter((ch) => !cached[ch]);
  if (missing.length) {
    const manifest = JSON.parse(readFileSync(new URL('data/manifest.json', ROOT), 'utf8'));
    for (const ch of missing) cached[ch] = [];
    manifest.forEach((f, i) => {
      if (i % 100 === 0) process.stdout.write(`\rholes ${i}/${manifest.length}`);
      const font = loadGlyphs(new URL(`data/fonts/${f.file}`, ROOT).pathname);
      for (const ch of missing) cached[ch][i] = font ? holes(font.path(ch)) : null;
    });
    process.stdout.write('\n');
    mkdirSync(new URL('data/eval', ROOT), { recursive: true });
    writeFileSync(file, JSON.stringify(cached));
  }
  return cached;
}

/** Skeletons per character, as the search worker loads them, with cached distance fields. */
function glyphs(ch) {
  const code = ch.charCodeAt(0);
  const buf = readFileSync(new URL(`public/data/g/${code}.bin`, ROOT));
  const topology = JSON.parse(readFileSync(new URL(`public/data/t/${code}.json`, ROOT), 'utf8'));
  const list = [];
  for (let o = 0; o < buf.length; ) {
    const count = buf[o] | (buf[o + 1] << 8);
    let end = o + 2;
    for (let k = 0; k < count; k++) end += 2 + (buf[end] | (buf[end + 1] << 8)) * 2;
    const lines = decodeLines(buf.subarray(o, end));
    const pts = linePoints(lines);
    const t = topology[list.length];
    list.push({ lines, pts, ends: t ? Uint8Array.from(t) : strokeEnds(pts), dt: pts.length ? distanceField(pts) : null });
    o = end;
  }
  return list;
}

/** Douglas-Peucker simplification of a polyline of [x, y] points. */
function simplify(points, tolerance) {
  if (points.length < 3 || !tolerance) return points;
  const [a, b] = [points[0], points.at(-1)];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let worst = 0, at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    // A closed line (both ends at one point): the distance from that point.
    const d = len < 1e-6 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len;
    if (d > worst) (worst = d), (at = i);
  }
  if (worst <= tolerance) return [a, b];
  return [...simplify(points.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(points.slice(at), tolerance)];
}

/** Values along a line of n points that change smoothly: normal deviates, averaged over a window of 2w + 1 points and scaled back to unit spread. */
function smooth(n, w, rand) {
  const raw = Array.from({ length: n + 2 * w }, () => gauss(rand));
  return Array.from({ length: n }, (_, i) => raw.slice(i, i + 2 * w + 1).reduce((a, b) => a + b, 0) / Math.sqrt(2 * w + 1));
}

/** Resamples a polyline of [x, y] points every cell. */
function resample(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

/** Moves the end of a dense polyline by d cells: extends it straight (d > 0) or cuts it back (d < 0). */
function moveEnd(pts, d) {
  if (pts.length < 2) return pts;
  if (d < 0) return pts.slice(0, Math.max(2, pts.length - Math.round(-d)));
  const [ax, ay] = pts.at(-2), [bx, by] = pts.at(-1);
  const len = Math.hypot(bx - ax, by - ay) || 1;
  return [...pts, [bx + ((bx - ax) / len) * d, by + ((by - ay) / len) * d]];
}

/**
 * A synthetic sketch of a skeleton (lines in grid cells): each line
 * simplified, resampled, its free ends (not the junctions) moved, a smooth wobble added across
 * it; then the whole sketch warped by a smooth displacement field (two
 * sine waves per axis, about one glyph long), rotated and scaled.
 */
function sketch(lines, noise, rand) {
  const angle = (gauss(rand) * noise.rotate * Math.PI) / 180;
  const sx = 1 + gauss(rand) * noise.scale, sy = 1 + gauss(rand) * noise.scale;
  const cos = Math.cos(angle), sin = Math.sin(angle), c = GRID / 2;
  const waves = Array.from({ length: 4 }, () => ({ fx: (rand() * 2 - 1) * 0.1, fy: (rand() * 2 - 1) * 0.1, phase: rand() * 2 * Math.PI, a: (gauss(rand) * noise.warp) / Math.SQRT2 }));
  const warp = (x, y, k) => waves.slice(k * 2, k * 2 + 2).reduce((d, w) => d + w.a * Math.sin(w.fx * x + w.fy * y + w.phase), 0);
  const polylines = lines.map((l) => {
    const pts = [];
    for (let i = 0; i < l.length; i += 2) pts.push([l[i], l[i + 1]]);
    return pts;
  });
  // An end that touches another line (or its own other part) is a junction and stays.
  const free = (pts, k, end) => {
    const [x, y] = end ? pts.at(-1) : pts[0];
    return !polylines.some((other, j) => other.some(([ox, oy], i) => (j !== k || (end ? i < pts.length - 3 : i > 2)) && Math.hypot(ox - x, oy - y) < 1.5));
  };
  return polylines.map((line, k) => {
    let pts = resample(simplify(line, noise.simplify));
    const [head, tail] = [free(line, k, false), free(line, k, true)];
    if (noise.ends || noise.gap) {
      pts = moveEnd(pts, tail ? gauss(rand) * noise.ends : -noise.gap);
      pts = moveEnd(pts.reverse(), head ? gauss(rand) * noise.ends : -noise.gap).reverse();
    }
    // No wobble at a junction, so that only `gap` opens it.
    const wobble = smooth(pts.length, 6, rand).map((w, i) => w * Math.min(1, head ? 1 : i / 4, tail ? 1 : (pts.length - 1 - i) / 4));
    return pts.map(([x, y], i) => {
      // Wobble across the stroke direction.
      const [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      x += (-(by - ay) / len) * wobble[i] * noise.wobble;
      y += ((bx - ax) / len) * wobble[i] * noise.wobble;
      [x, y] = [x + warp(x, y, 0), y + warp(x, y, 1)];
      const dx = (x - c) * sx, dy = (y - c) * sy;
      return { x: c + dx * cos - dy * sin, y: c + dx * sin + dy * cos };
    });
  });
}

/** A contact sheet of synthetic sketches (rows: characters, columns: noise levels), for eval/results/sketches.png. */
function sheet(list, file) {
  const cell = 96, per = 4, rand = random(4);
  const chars = Object.keys(list);
  const canvas = createCanvas(cell * per * Object.keys(NOISE).length, cell * chars.length);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 2.5;
  ctx.lineCap = ctx.lineJoin = 'round';
  chars.forEach((ch, row) => {
    const sources = list[ch].filter((g) => g.lines.length).slice(0, per);
    Object.values(NOISE).forEach((noise, level) => {
      sources.forEach((g, k) => {
        const ox = (level * per + k) * cell, oy = row * cell;
        for (const s of sketch(g.lines, noise, rand)) {
          ctx.beginPath();
          s.forEach((p, i) => (i ? ctx.lineTo(ox + (p.x * cell) / GRID, oy + (p.y * cell) / GRID) : ctx.moveTo(ox + (p.x * cell) / GRID, oy + (p.y * cell) / GRID)));
          ctx.stroke();
        }
      });
    });
  });
  writeFileSync(file, canvas.toBuffer('image/png'));
}

const sheetFile = new URL('eval/results/sketches.png', ROOT);
const sheetChars = Object.fromEntries([...'gR$*&'].map((ch) => [ch, glyphs(ch).slice(0, 40).filter((_, i) => i % 9 === 0)]));
mkdirSync(new URL('eval/results', ROOT), { recursive: true });
sheet(sheetChars, sheetFile);
if (process.argv.includes('--sheet')) process.exit();

const holeLabel = holeLabels();
const results = { k: K, noise: NOISE, chars: CHARS, classes: [], summary: {} };
const rows = []; // one per query and noise level
const rand = random(1);

for (const ch of CHARS) {
  const list = glyphs(ch);
  const lower = ch >= 'a' && ch <= 'z';
  const candidates = pool.filter((i) => list[i]?.pts.length && !(lower && metrics[i].lc === 0) && holeLabel[ch][i] != null);
  const label = {
    holes: (i) => holeLabel[ch][i],
    ends: (i) => list[i].ends.length / 2,
  };
  for (const [kind, of] of Object.entries(label)) {
    const byClass = Object.groupBy(candidates, of);
    for (const [value, members] of Object.entries(byClass)) {
      if (members.length < MIN_CLASS) continue;
      const base = members.length / candidates.length;
      results.classes.push({ ch, kind, value: +value, fonts: members.length, base });
      // Fixed queries per class: a seeded sample.
      const queries = [...members].sort(() => rand() - 0.5).slice(0, QUERIES);
      for (const q of queries) {
        for (const [level, noise] of Object.entries(NOISE)) {
          const pts = sketchPoints(sketch(list[q].lines, noise, rand).map((s) => s.map(({ x, y }) => ({ x: x * 10, y: y * 10 }))));
          const sdt = distanceField(pts), ends = strokeEnds(pts);
          const methods = {
            app: (i) => chamfer(pts, sdt, list[i].pts, list[i].dt) + strokeEndDistance(ends, list[i].ends),
            'chamfer only': (i) => chamfer(pts, sdt, list[i].pts, list[i].dt),
          };
          const row = { ch, kind, value: +value, base, query: fonts[q].family, level };
          for (const [name, distance] of Object.entries(methods)) {
            const order = candidates.map((i) => ({ i, d: distance(i) })).sort((a, b) => a.d - b.d).map((x) => x.i);
            const top = order.filter((i) => i !== q).slice(0, K);
            row[name] = { precision: top.filter((i) => of(i) === +value).length / K, rank: order.indexOf(q) + 1 };
          }
          rows.push(row);
        }
      }
      process.stdout.write(`\r${ch} ${kind}=${value}: ${members.length} fonts, ${queries.length} queries          `);
    }
  }
}
process.stdout.write('\n');

// The app's own search must rank like the "app" method here.
{
  const ch = 'g', list = glyphs(ch);
  const q = pool.find((i) => list[i]?.pts.length);
  const pts = sketchPoints(sketch(list[q].lines, NOISE.low, random(2)).map((s) => s.map(({ x, y }) => ({ x: x * 10, y: y * 10 }))));
  const { results: hits } = await workerSearch({ id: 1, parts: [{ ch, pts }], allowed: pool, noLower: pool.filter((i) => metrics[i].lc === 0), limit: pool.length });
  const sdt = distanceField(pts), ends = strokeEnds(pts);
  const mine = pool.filter((i) => list[i]?.pts.length && metrics[i].lc !== 0)
    .map((i) => ({ i, d: chamfer(pts, sdt, list[i].pts, list[i].dt) + strokeEndDistance(ends, list[i].ends) }))
    .sort((a, b) => a.d - b.d).slice(0, 20).map((x) => x.i);
  const same = hits.slice(0, 20).map((h) => h.index).join() === mine.join();
  console.log(same ? 'check: same top 20 as the app’s search worker' : 'check FAILED: the ranking differs from the app’s search worker');
}

/** Mean over the classes (each class weighs the same) with a 95% bootstrap interval over queries within classes. */
function macro(select, value) {
  const groups = Object.values(Object.groupBy(rows.filter(select), (r) => `${r.ch}|${r.kind}|${r.value}`));
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const stat = (gs) => mean(gs.map((g) => mean(g.map(value))));
  const r = random(3), samples = [];
  for (let b = 0; b < BOOTSTRAP; b++) samples.push(stat(groups.map((g) => Array.from(g, () => g[Math.floor(r() * g.length)]))));
  samples.sort((a, b) => a - b);
  return [stat(groups), samples[Math.floor(BOOTSTRAP * 0.025)], samples[Math.floor(BOOTSTRAP * 0.975)]];
}
const f2 = ([v, lo, hi]) => `${v.toFixed(2)} [${lo.toFixed(2)}–${hi.toFixed(2)}]`;

for (const kind of ['holes', 'ends']) {
  console.log(`\n${kind}: precision@${K} of the class, mean over classes (each class weighs the same)`);
  console.log(['noise', 'base rate', 'app', 'chamfer only'].join('\t'));
  for (const level of Object.keys(NOISE)) {
    const select = (r) => r.kind === kind && r.level === level;
    const s = {
      'base rate': macro(select, (r) => r.base),
      app: macro(select, (r) => r.app.precision),
      'chamfer only': macro(select, (r) => r['chamfer only'].precision),
    };
    results.summary[`${kind} ${level}`] = s;
    console.log([level, ...Object.values(s).map(f2)].join('\t'));
  }
}

console.log('\nQuery font itself (known item), all queries');
console.log(['noise', 'method', 'R@1', 'R@10', 'median rank'].join('\t'));
for (const level of Object.keys(NOISE)) {
  for (const method of ['app', 'chamfer only']) {
    const ranks = rows.filter((r) => r.level === level && r.kind === 'holes').map((r) => r[method].rank).sort((a, b) => a - b);
    const s = { 'R@1': ranks.filter((x) => x <= 1).length / ranks.length, 'R@10': ranks.filter((x) => x <= 10).length / ranks.length, median: ranks[ranks.length >> 1] };
    results.summary[`known item ${level} ${method}`] = s;
    console.log([level, method, s['R@1'].toFixed(2), s['R@10'].toFixed(2), s.median].join('\t'));
  }
}

console.log(`\nPer class at noise "low": precision@${K}`);
console.log(['char', 'label', 'fonts', 'base', 'app', 'chamfer only'].join('\t'));
for (const c of results.classes) {
  const rs = rows.filter((r) => r.ch === c.ch && r.kind === c.kind && r.value === c.value && r.level === 'low');
  const mean = (f) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
  c.low = { app: mean((r) => r.app.precision), 'chamfer only': mean((r) => r['chamfer only'].precision) };
  console.log([c.ch, `${c.kind}=${c.value}`, c.fonts, c.base.toFixed(2), c.low.app.toFixed(2), c.low['chamfer only'].toFixed(2)].join('\t'));
}

writeFileSync(new URL('eval/results/structure.json', ROOT), JSON.stringify(results, null, 1));
// The rows (one per query and noise level) are large: they stay out of git.
writeFileSync(new URL('data/eval/structure-rows.json', ROOT), JSON.stringify(rows));
