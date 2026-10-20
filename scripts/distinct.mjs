// Measures how distinct the letters of each font are from one another and
// writes `dx` into the metric part data/metrics/distinct.json (run it after
// build-index.mjs).
//
// In a placeholder font (Flow, Redacted), a knitting-pattern font or a
// keyboard font, every letter has the same shape; in a barcode, texture or
// multi-line font the skeletons are grids of bars or lines that look alike
// whatever the letter. The mean chamfer distance between the skeletons of
// LETTERS, divided by the median over all fonts, tells: about 1 for a text
// face, 0 when all letters are the same. The app drops fonts below 0.2
// everywhere and keeps fonts below 0.5 out of the shape search.
//
// Usage: node scripts/distinct.mjs [family ...]   (with families: only print their values)
import fs from 'node:fs';
import { chamfer, decodeLines, distanceField, GRID, linePoints } from '../src/shape.js';
import { entry, writePart } from './metrics.mjs';

const LETTERS = 'aenosbdgMRwk';
const MIN_LETTERS = 6;

/** The skeletons of one character for all fonts, as grid points (see build-index.mjs for the file layout). */
function load(ch) {
  const buf = new Uint8Array(fs.readFileSync(`public/data/g/${ch.charCodeAt(0)}.bin`));
  const list = [];
  for (let o = 0; o < buf.length; ) {
    const lines = buf[o] | (buf[o + 1] << 8);
    let end = o + 2;
    for (let k = 0; k < lines; k++) end += 2 + (buf[end] | (buf[end + 1] << 8)) * 2;
    list.push(linePoints(decodeLines(buf.subarray(o, end))));
    o = end;
  }
  return list;
}

const fonts = JSON.parse(fs.readFileSync('public/data/fonts.json', 'utf8'));
const glyphs = [...LETTERS].map(load);

/** Mean chamfer distance between the font's skeletons of LETTERS, or null with too few letters. */
function distinctness(f) {
  const pts = glyphs.map((g) => g[f]).filter((p) => p.length);
  if (pts.length < MIN_LETTERS) return null;
  const fields = pts.map((p) => distanceField(p, new Uint16Array(GRID * GRID)));
  let sum = 0, n = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      sum += chamfer(pts[i], fields[i], pts[j], fields[j]);
      n++;
    }
  }
  return sum / n;
}

const raw = fonts.map((_, f) => distinctness(f));
const sorted = raw.filter((d) => d != null).sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
const dx = raw.map((d) => (d == null ? null : Math.round((d / median) * 100) / 100));

const names = process.argv.slice(2);
if (names.length) {
  for (const name of names) {
    const i = fonts.findIndex((f) => f.family === name);
    console.log(name.padEnd(28), i < 0 ? 'not found' : dx[i]);
  }
} else {
  writePart('distinct', dx.map((d) => entry('dx', d)));
  const below = (t) => dx.filter((d) => d != null && d < t).length;
  console.log(`median ${median.toFixed(2)} · ${below(0.2)} fonts below 0.2 (no letterforms) · ${below(0.5)} below 0.5 (kept out of the shape search)`);
}
