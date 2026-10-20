// Measures how ornate (flourished) each font is and writes `o` (0 = plain,
// 1 = very ornate) into the metric part data/metrics/ornate.json.
//
// Usage: node scripts/ornate.mjs [family ...]   (prints the values of these families)
//
// Flourishes reach beyond the space of a letter: into the neighbouring
// letters and below the baseline. For each letter, the overhang is the ink
// left of the origin plus the ink right of the advance width plus the ink
// below the baseline, in x-heights (from the outline bounding boxes). The
// font value is the mean over the letters, on a log scale from 0.05 (plain
// fonts: about 0.05, from descenders) to 2 (the largest flourishes).
import fs from 'node:fs';
import { loadGlyphs } from './glyph.mjs';
import { entry, writePart } from './metrics.mjs';

const LETTERS = 'AEFHKMNRTadeghknrty';
const PLAIN = 0.05, MAX = 2;

const manifest = JSON.parse(fs.readFileSync('data/manifest.json', 'utf8'));

function overhang(font) {
  const x = font.path('x')?.getBoundingBox();
  if (!x || !isFinite(x.y1) || x.y2 <= x.y1) return null;
  const xHeight = x.y2 - x.y1; // y grows downwards, the baseline is at 0
  const values = [];
  for (const ch of LETTERS) {
    const b = font.path(ch)?.getBoundingBox();
    if (!b || !isFinite(b.x1)) continue;
    values.push((Math.max(0, -b.x1) + Math.max(0, b.x2 - font.advance(ch)) + Math.max(0, b.y2)) / xHeight);
  }
  return values.length >= LETTERS.length / 2 ? values.reduce((a, b) => a + b) / values.length : null;
}

const ornate = manifest.map((m) => {
  const font = loadGlyphs(`data/fonts/${m.file}`);
  const v = font && overhang(font);
  return v == null ? null : +Math.min(1, Math.max(0, Math.log(Math.max(v, PLAIN) / PLAIN) / Math.log(MAX / PLAIN))).toFixed(3);
});
writePart('ornate', ornate.map((o) => entry('o', o)));

const order = manifest.map((m, i) => [m.family, ornate[i]]).filter((r) => r[1] != null).sort((a, b) => b[1] - a[1]);
console.log('most ornate:', order.slice(0, 20).map((r) => r[0]).join(', '));
for (const name of process.argv.slice(2)) console.log(name, order.find((r) => r[0] === name)?.[1]);
