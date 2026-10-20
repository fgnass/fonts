// Stroke ends from raster thinning, independent of the pruned medial-axis curves.
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { normalizePoints, strokeEnds, thin } from '../src/shape.js';
import { pathData } from './glyph.mjs';

const SIZE = 128, PAD = 9;
const canvas = createCanvas(SIZE, SIZE), ctx = canvas.getContext('2d');

export function glyphStrokeEnds(path) {
  if (!path) return null;
  const b = path.getBoundingBox();
  const width = b.x2 - b.x1, height = b.y2 - b.y1;
  if (!Number.isFinite(width + height) || width <= 0 || height <= 0) return null;
  const scale = (SIZE - 2 * PAD) / Math.max(width, height);
  ctx.resetTransform();
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.setTransform(scale, 0, 0, scale, PAD - b.x1 * scale + (SIZE - 2 * PAD - width * scale) / 2, PAD - b.y1 * scale + (SIZE - 2 * PAD - height * scale) / 2);
  ctx.fill(new Path2D(pathData(path)), 'nonzero');
  const rgba = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const img = Uint8Array.from({ length: SIZE * SIZE }, (_, i) => rgba[i * 4 + 3] >= 128 ? 1 : 0);
  thin(img, SIZE, SIZE);
  const xy = [];
  for (let i = 0; i < img.length; i++) if (img[i]) xy.push(i % SIZE, Math.floor(i / SIZE));
  return xy.length ? strokeEnds(normalizePoints(xy)) : null;
}
