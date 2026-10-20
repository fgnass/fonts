// Computes one DINOv2 "style" embedding per font: the overall look (weight,
// contrast, width, texture, decoration), not the skeleton of one glyph.
//
// Usage: node scripts/embed-style.mjs
//
// Each font renders a two-line specimen with filled glyphs at one common
// scale, so proportions (x-height, width, weight) stay visible. Writes
// data/emb-style.f32: one row per font in manifest order of
// [CLS token, mean patch token] (2 x 384 floats); fonts that cannot render the
// specimen are zero rows.
import fs from 'node:fs';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { AutoModel, Tensor } from '@huggingface/transformers';
import { loadGlyphs, pathData } from './glyph.mjs';
import { progress, progressDone } from './progress.mjs';

const LINES = ['RAGE', 'hang'];
const SIZE = 224;
const MARGIN = 12;
const GAP = 0.15; // gap between the lines, in em
const BATCH = 32;
const DIM = 384;
const ROW = 2 * DIM;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

const model = await AutoModel.from_pretrained('onnx-community/dinov2-small', { dtype: 'fp32' });
const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext('2d');

/** Renders the specimen into `out` as normalized CHW floats. Returns false if the font cannot render it. */
function render(font, out, offset) {
  const lines = [];
  for (const text of LINES) {
    const path = font?.path(text);
    if (!path) continue;
    const box = path.getBoundingBox();
    if (isFinite(box.x1) && box.x2 > box.x1 && box.y2 > box.y1) lines.push({ path, box });
  }
  if (!lines.length) return false;
  // Stack the lines (each one left-aligned to its own ink) and fit the result into the square.
  let y = 0;
  const placed = lines.map(({ path, box }) => {
    const p = { path, dx: -box.x1, dy: y - box.y1 };
    y += box.y2 - box.y1 + GAP * 1000;
    return p;
  });
  const w = Math.max(...lines.map(({ box }) => box.x2 - box.x1));
  const h = y - GAP * 1000;
  const inner = SIZE - 2 * MARGIN;
  const s = inner / Math.max(w, h);
  const ox = MARGIN + (inner - w * s) / 2, oy = MARGIN + (inner - h * s) / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#000';
  for (const { path, dx, dy } of placed) {
    ctx.setTransform(s, 0, 0, s, ox + dx * s, oy + dy * s);
    ctx.fill(new Path2D(pathData(path)), 'nonzero');
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const n = SIZE * SIZE;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) out[offset + c * n + i] = (px[i * 4 + c] / 255 - MEAN[c]) / STD[c];
  }
  return true;
}

if (process.argv.includes('--dump')) {
  // Writes some specimens as PNG files to check the rendering.
  const manifest = JSON.parse(fs.readFileSync('data/manifest.json', 'utf8'));
  fs.mkdirSync('data/eval/style', { recursive: true });
  for (const family of process.argv.slice(3)) {
    const m = manifest.find((m) => m.family === family);
    render(loadGlyphs(`data/fonts/${m.file}`), new Float32Array(SIZE * SIZE * 3), 0);
    fs.writeFileSync(`data/eval/style/${m.file.replace('.ttf', '.png')}`, canvas.toBuffer('image/png'));
  }
  process.exit();
}

const manifest = JSON.parse(fs.readFileSync('data/manifest.json', 'utf8'));
const fonts = manifest.map((m) => loadGlyphs(`data/fonts/${m.file}`));
const rows = new Float32Array(fonts.length * ROW);
const img = SIZE * SIZE * 3;
const prepare = (start) => {
  const batch = fonts.slice(start, start + BATCH);
  const input = new Float32Array(batch.length * img);
  const valid = batch.map((f, k) => render(f, input, k * img));
  return { batch, input, valid };
};
let next = prepare(0);
for (let start = 0; start < fonts.length; start += BATCH) {
  const { batch, input, valid } = next;
  const run = model({ pixel_values: new Tensor('float32', input, [batch.length, 3, SIZE, SIZE]) });
  next = start + BATCH < fonts.length ? prepare(start + BATCH) : null;
  const { last_hidden_state: h } = await run;
  const [, T] = h.dims;
  batch.forEach((_, k) => {
    if (!valid[k]) return;
    const row = (start + k) * ROW;
    const base = k * T * DIM;
    rows.set(h.data.subarray(base, base + DIM), row);
    for (let t = 1; t < T; t++) {
      for (let d = 0; d < DIM; d++) rows[row + DIM + d] += h.data[base + t * DIM + d] / (T - 1);
    }
  });
  progress(`${Math.min(start + BATCH, fonts.length)}/${fonts.length}`);
}
progressDone();
fs.writeFileSync('data/emb-style.f32', rows);
