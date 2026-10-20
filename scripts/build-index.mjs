// Computes the skeleton (medial axis, as curves) of every glyph of every
// downloaded font and writes one binary file per character to
// public/data/g/<charCode>.bin.
//
// Binary layout: for each font (in fonts.json order) a block from
// shape.js encodeLines: a uint16 LE line count, then per line a uint16 LE
// point count and the points as uint8 pairs (SCALE steps per grid cell).
// A font without the glyph has a line count of 0.
//
// Where the medial axis fails, the glyph falls back to raster thinning
// (Zhang-Suen at RASTER px), each skeleton pixel becoming a one-point line.
import fs from 'node:fs';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { thin, normalizePoints, encodeLines } from '../src/shape.js';
import { loadGlyphs, pathData } from './glyph.mjs';
import { medialAxis } from './medial.mjs';
import { CHARS as ALL } from '../src/chars.js';

const CHARS = process.argv[2] || ALL;
const RASTER = 128;
const MARGIN = 4;
const OUT = 'public/data';

const BATCH = 8; // characters per round of workers (all at once runs out of memory)

if (isMainThread) {
  const manifest = JSON.parse(fs.readFileSync('data/manifest.json', 'utf8'));
  const n = os.cpus().length;
  const t0 = Date.now();
  fs.mkdirSync(`${OUT}/g`, { recursive: true });
  for (let at = 0; at < CHARS.length; at += BATCH) {
    const chars = CHARS.slice(at, at + BATCH);
    const chunks = await Promise.all(
      Array.from({ length: n }, (_, k) => {
        const fonts = manifest.filter((_, i) => i % n === k);
        return new Promise((resolve, reject) => {
          const w = new Worker(new URL(import.meta.url), { workerData: { fonts, chars } });
          w.on('message', resolve);
          w.on('error', reject);
        });
      })
    );
    // Re-interleave results into manifest order.
    const results = manifest.map((_, i) => chunks[i % n][Math.floor(i / n)]);
    for (const ch of chars) {
      const parts = [];
      for (const r of results) parts.push(Buffer.from(r[ch] || new Uint8Array([0, 0])));
      fs.writeFileSync(`${OUT}/g/${ch.charCodeAt(0)}.bin`, Buffer.concat(parts));
    }
    console.log(`${chars} done, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  fs.writeFileSync(
    `${OUT}/fonts.json`,
    JSON.stringify(manifest.map(({ family, category, weight, italic, variants, axes }) => ({ family, category, weight, italic, variants, ...(axes && { axes }) })))
  );
  console.log(`${manifest.length} fonts x ${CHARS.length} chars in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
} else {
  const { fonts, chars } = workerData;
  const canvas = createCanvas(RASTER, RASTER);
  const ctx = canvas.getContext('2d');
  const img = new Uint8Array(RASTER * RASTER);

  /** Raster thinning, the fallback: one-point lines on the grid. */
  const thinned = (path) => {
    const { x1, y1, x2, y2 } = path.getBoundingBox();
    if (!isFinite(x1) || x2 - x1 <= 0 || y2 - y1 <= 0) return null;
    const s = (RASTER - 2 * MARGIN) / Math.max(x2 - x1, y2 - y1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, RASTER, RASTER);
    ctx.setTransform(s, 0, 0, s, MARGIN - x1 * s + (RASTER - 2 * MARGIN - (x2 - x1) * s) / 2, MARGIN - y1 * s + (RASTER - 2 * MARGIN - (y2 - y1) * s) / 2);
    ctx.fill(new Path2D(pathData(path)), 'nonzero');
    const data = ctx.getImageData(0, 0, RASTER, RASTER).data;
    for (let i = 0; i < img.length; i++) img[i] = data[i * 4 + 3] >= 100 ? 1 : 0;
    thin(img, RASTER, RASTER);
    const xy = [];
    for (let i = 0; i < img.length; i++) if (img[i]) xy.push(i % RASTER, Math.floor(i / RASTER));
    if (!xy.length) return null;
    const pts = normalizePoints(xy);
    const lines = [];
    for (let i = 0; i < pts.length; i += 2) lines.push([pts[i], pts[i + 1]]);
    return lines;
  };

  let fallbacks = 0;
  const skeleton = (path) => {
    let lines = null;
    try {
      lines = medialAxis(path);
    } catch {}
    if (!lines?.length) {
      lines = thinned(path);
      if (lines) fallbacks++;
    }
    return lines && encodeLines(lines);
  };

  const out = fonts.map((f) => {
    const r = {};
    const font = loadGlyphs(`data/fonts/${f.file}`);
    if (!font) {
      console.warn(`${f.family}: cannot load`);
      return r;
    }
    for (const ch of chars) {
      const path = font.path(ch);
      const pts = path && skeleton(path);
      if (pts) r[ch] = pts;
    }
    return r;
  });
  if (fallbacks) console.warn(`${fallbacks} glyphs fell back to raster thinning`);
  parentPort.postMessage(out);
}
