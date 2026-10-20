// Measures hollow strokes, including broken outlines, from cross-sections of normally solid stems.
// Usage: node scripts/stroke-fill.mjs [family ...]
// No arguments: write hf into the metric part data/metrics/stroke-fill.json. Named families: print measurements only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { loadGlyphs, pathData } from './glyph.mjs';
import { entry, writePart } from './metrics.mjs';

const LETTERS = 'IlEFLT';
const HEIGHT = 240, PAD = 3;
const quantile = (values, p) => values[Math.floor((values.length - 1) * p)];

function stemGap(font, ch) {
  const glyph = font.path(ch);
  if (!glyph) return null;
  const b = glyph.getBoundingBox(), height = b.y2 - b.y1;
  if (!Number.isFinite(height) || height <= 0 || b.x2 <= b.x1) return null;
  const scale = HEIGHT / height;
  const width = Math.ceil((b.x2 - b.x1) * scale) + PAD * 2;
  if (width > HEIGHT * 16) return null;
  const canvas = createCanvas(width, HEIGHT + PAD * 2), ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, PAD - b.x1 * scale, PAD - b.y1 * scale);
  ctx.fill(new Path2D(pathData(glyph)), 'nonzero');
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const rows = [];
  // Skip the top/bottom: serifs and crossbars should not dominate a stem measurement.
  for (let y = PAD + Math.ceil(HEIGHT * 0.2); y < PAD + HEIGHT * 0.8; y++) {
    let first = -1, last = -1, ink = 0;
    const runs = [];
    let run = 0;
    for (let x = PAD; x < width - PAD; x++) {
      if (pixels[(y * width + x) * 4 + 3] <= 127) {
        if (run) runs.push(run);
        run = 0;
        continue;
      }
      if (first < 0) first = x;
      last = x;
      ink++;
      run++;
    }
    if (run) runs.push(run);
    if (last > first) {
      const span = last - first + 1;
      // A gap across a whole swash or between separate arms is not a hollow stem.
      const balance = runs.length > 1 ? Math.min(runs[0], runs.at(-1)) / Math.max(runs[0], runs.at(-1)) : 0;
      rows.push(span > HEIGHT * 0.75 ? 0 : (1 - ink / span) * Math.sqrt(balance));
    }
  }
  rows.sort((a, b) => a - b);
  return rows.length >= 16 ? quantile(rows, 0.5) : null;
}

/** 0 = solid strokes, high values = consistently hollow/outlined strokes; null = insufficient glyphs. */
export function strokeFillOf(font) {
  const gaps = [...LETTERS].map((ch) => stemGap(font, ch)).filter((v) => v != null).sort((a, b) => a - b);
  if (gaps.length < 4) return null;
  const lower = quantile(gaps, 0.5), upper = quantile(gaps, 0.75);
  // Looped scripts can have a hollow I or l. Require agreement across several different stems.
  return upper > 0 ? Math.min(1, lower * lower / upper) : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(fs.readFileSync('data/manifest.json', 'utf8'));
  const names = process.argv.slice(2);
  if (names.length) {
    for (const name of names) {
      const item = manifest.find((f) => f.family === name);
      if (!item) throw new Error(`Unknown family: ${name}`);
      const font = loadGlyphs(`data/fonts/${item.file}`);
      console.log(name, font ? strokeFillOf(font) : null);
    }
  } else {
    const values = manifest.map((item, i) => {
      const font = loadGlyphs(`data/fonts/${item.file}`);
      const value = font ? strokeFillOf(font) : null;
      if ((i + 1) % 100 === 0) console.log(`${i + 1}/${manifest.length}`);
      return value;
    });
    writePart('stroke-fill', values.map((v) => entry('hf', v == null ? null : +v.toFixed(3))));
    console.log(`${manifest.length} families measured.`);
  }
}
