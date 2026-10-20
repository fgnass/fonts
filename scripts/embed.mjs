// Computes a DINOv2 embedding for each glyph of each font.
//
// Usage: node scripts/embed.mjs [chars] [--skeleton] [--weights] [--only=Family,Family]
//
// With --skeleton, each glyph is first reduced to its 1px skeleton, which is
// then drawn with a fixed stroke width, so that the stroke weight of the font
// does not reach the model. Output then goes to data/emb-skel/.
//
// Writes data/emb/<charCode>.f32 (one row per font in manifest order) and
// with --weights also data/emb/<charCode>-<weight>.f32 (one row per family in
// data/weights.json, used for evaluation).
// With --only, only these families are computed and their rows are written
// into the existing files (for example after a rendering fix).
// A row is [CLS token, 4x4 grid of mean patch tokens] (17 x 384 floats, raw,
// row-major cells); missing glyphs are zero rows.
import fs from 'node:fs';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { AutoModel, Tensor } from '@huggingface/transformers';
import { thin } from '../src/shape.js';
import { loadGlyphs, pathData } from './glyph.mjs';
import { progress, progressDone } from './progress.mjs';

const args = process.argv.slice(2);
const SKELETON = args.includes('--skeleton');
const WEIGHTS = args.includes('--weights');
const ONLY = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const CHARS = args.find((a) => !a.startsWith('--')) || 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SIZE = 224;
const MARGIN = 24;
const BATCH = 32;
const DIM = 384;
const CELLS = 4; // grid cells per side
const ROW = (1 + CELLS * CELLS) * DIM;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const OUT = SKELETON ? 'data/emb-skel' : 'data/emb';
const THIN_SIZE = 320; // raster size for thinning (larger than SIZE, so that scaling down closes gaps)
const STROKE = 3; // radius of the fixed-width skeleton stroke

fs.mkdirSync(OUT, { recursive: true });
const model = await AutoModel.from_pretrained('onnx-community/dinov2-small', { dtype: 'fp32' });
const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext('2d');
const thinCanvas = createCanvas(THIN_SIZE, THIN_SIZE);
const thinCtx = thinCanvas.getContext('2d');
const thinImg = new Uint8Array(THIN_SIZE * THIN_SIZE);

/** Fills `path` into `c` (size x size), fitted into the square with the given margin. */
function fill(c, size, margin, path, box) {
  const { x1, y1, x2, y2 } = box;
  const inner = size - 2 * margin;
  const s = inner / Math.max(x2 - x1, y2 - y1);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#fff';
  c.fillRect(0, 0, size, size);
  c.setTransform(s, 0, 0, s, margin - x1 * s + (inner - (x2 - x1) * s) / 2, margin - y1 * s + (inner - (y2 - y1) * s) / 2);
  c.fillStyle = '#000';
  c.fill(new Path2D(pathData(path)), 'nonzero');
  c.setTransform(1, 0, 0, 1, 0, 0);
}

// Pixel offsets of a disk with radius STROKE, used to draw the skeleton with a fixed stroke width.
const DISK = [];
for (let dy = -STROKE; dy <= STROKE; dy++)
  for (let dx = -STROKE; dx <= STROKE; dx++) if (dx * dx + dy * dy <= STROKE * STROKE + STROKE) DISK.push(dy * SIZE + dx);
const ink = new Uint8Array(SIZE * SIZE);

/** Draws the skeleton of the glyph with a fixed stroke width, fitted into the square, into `ink`. */
function drawSkeleton(path, box) {
  fill(thinCtx, THIN_SIZE, 8, path, box);
  const px = thinCtx.getImageData(0, 0, THIN_SIZE, THIN_SIZE).data;
  for (let i = 0; i < thinImg.length; i++) thinImg[i] = px[i * 4] < 128 ? 1 : 0;
  thin(thinImg, THIN_SIZE, THIN_SIZE);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const pts = [];
  for (let i = 0; i < thinImg.length; i++) {
    if (!thinImg[i]) continue;
    const x = i % THIN_SIZE, y = Math.floor(i / THIN_SIZE);
    pts.push(x, y);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (!pts.length) return false;
  const inner = SIZE - 2 * MARGIN;
  const s = inner / Math.max(maxX - minX, maxY - minY, 1);
  const ox = MARGIN + (inner - (maxX - minX) * s) / 2, oy = MARGIN + (inner - (maxY - minY) * s) / 2;
  ink.fill(0);
  for (let i = 0; i < pts.length; i += 2) {
    const c = Math.round(oy + (pts[i + 1] - minY) * s) * SIZE + Math.round(ox + (pts[i] - minX) * s);
    for (const d of DISK) ink[c + d] = 1;
  }
  return true;
}

/** Renders the glyph (or its skeleton) black on white, fitted into the square, into `out` as normalized CHW floats. */
function render(font, ch, out, offset) {
  const path = font.path(ch);
  if (!path) return false;
  const { x1, y1, x2, y2 } = path.getBoundingBox();
  if (!isFinite(x1) || x2 - x1 <= 0 || y2 - y1 <= 0) return false;
  const n = SIZE * SIZE;
  if (SKELETON) {
    if (!drawSkeleton(path, { x1, y1, x2, y2 })) return false;
    for (let c = 0; c < 3; c++) {
      const black = -MEAN[c] / STD[c], white = (1 - MEAN[c]) / STD[c];
      for (let i = 0; i < n; i++) out[offset + c * n + i] = ink[i] ? black : white;
    }
    return true;
  }
  fill(ctx, SIZE, MARGIN, path, { x1, y1, x2, y2 });
  const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) out[offset + c * n + i] = (px[i * 4 + c] / 255 - MEAN[c]) / STD[c];
  }
  return true;
}

/** Embeds `ch` for every font in the list; returns a Float32Array of rows. */
async function embedAll(fonts, ch, label) {
  const rows = new Float32Array(fonts.length * ROW);
  const img = SIZE * SIZE * 3;
  const prepare = (start) => {
    const batch = fonts.slice(start, start + BATCH);
    const input = new Float32Array(batch.length * img);
    const valid = batch.map((f, k) => (f ? render(f, ch, input, k * img) : false));
    return { batch, input, valid };
  };
  let next = prepare(0);
  for (let start = 0; start < fonts.length; start += BATCH) {
    const { batch, input, valid } = next;
    const run = model({ pixel_values: new Tensor('float32', input, [batch.length, 3, SIZE, SIZE]) });
    // Render the next batch while the model runs.
    next = start + BATCH < fonts.length ? prepare(start + BATCH) : null;
    const { last_hidden_state: h } = await run;
    const [, T] = h.dims;
    const data = h.data;
    batch.forEach((_, k) => {
      if (!valid[k]) return;
      const row = (start + k) * ROW;
      const base = k * T * DIM;
      const side = Math.sqrt(T - 1); // patches per side
      const per = side / CELLS;
      rows.set(data.subarray(base, base + DIM), row);
      for (let t = 1; t < T; t++) {
        const px = (t - 1) % side, py = Math.floor((t - 1) / side);
        const cell = Math.floor(py / per) * CELLS + Math.floor(px / per);
        const o = row + (1 + cell) * DIM, src = base + t * DIM;
        for (let d = 0; d < DIM; d++) rows[o + d] += data[src + d] / (per * per);
      }
    });
    progress(`${label} ${ch}: ${Math.min(start + BATCH, fonts.length)}/${fonts.length}`);
  }
  progressDone();
  return rows;
}

const parse = loadGlyphs;

const manifest = JSON.parse(fs.readFileSync('data/manifest.json', 'utf8'));
const fonts = manifest.map((m) => parse(`data/fonts/${m.file}`));
const { weights, families } = WEIGHTS ? JSON.parse(fs.readFileSync('data/weights.json', 'utf8')) : { weights: [], families: [] };
const fileOf = new Map(manifest.map((m) => [m.family, m.file]));
const weighted = Object.fromEntries(
  weights.map((w) => [w, families.map((f) => parse(`data/fonts-w/${fileOf.get(f).replace('.ttf', `-${w}.ttf`)}`))])
);

const only = ONLY && ONLY.map((family) => manifest.findIndex((m) => m.family === family));
if (only?.includes(-1)) throw new Error('unknown family in --only');

for (const ch of CHARS) {
  const code = ch.charCodeAt(0);
  if (only) {
    const rows = await embedAll(only.map((i) => fonts[i]), ch, 'regular');
    const file = `${OUT}/${code}.f32`;
    const all = new Float32Array(fs.readFileSync(file).buffer.slice(0));
    only.forEach((i, k) => all.set(rows.subarray(k * ROW, (k + 1) * ROW), i * ROW));
    fs.writeFileSync(file, all);
    continue;
  }
  fs.writeFileSync(`${OUT}/${code}.f32`, await embedAll(fonts, ch, 'regular'));
  for (const w of weights) fs.writeFileSync(`${OUT}/${code}-${w}.f32`, await embedAll(weighted[w], ch, w));
}
