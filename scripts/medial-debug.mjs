// Renders glyphs with their vector skeletons to a PNG, to check scripts/medial.mjs by eye.
//
// Usage: node scripts/medial-debug.mjs <out.png> "<chars>" <family> [family ...]
import fs from 'node:fs';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { loadGlyphs, pathData } from './glyph.mjs';
import { medialAxis } from './medial.mjs';

const [out, chars, ...families] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync('data/manifest.json', 'utf8'));
const CELL = 220, PAD = 20;
const canvas = createCanvas(CELL * chars.length, CELL * families.length), ctx = canvas.getContext('2d');
ctx.fillStyle = '#fff';
ctx.fillRect(0, 0, canvas.width, canvas.height);

families.forEach((name, row) => {
  const m = manifest.find((m) => m.family === name);
  if (!m) return console.log(name, 'not found');
  const font = loadGlyphs(`data/fonts/${m.file}`);
  [...chars].forEach((ch, col) => {
    const path = font?.path(ch);
    if (!path) return;
    const t0 = performance.now();
    const lines = medialAxis(path);
    const ms = performance.now() - t0;
    const b = path.getBoundingBox();
    const s = (CELL - 2 * PAD) / Math.max(b.x2 - b.x1, b.y2 - b.y1);
    ctx.setTransform(s, 0, 0, s, col * CELL + PAD - b.x1 * s, row * CELL + PAD - b.y1 * s);
    ctx.fillStyle = '#ddd';
    ctx.fill(new Path2D(pathData(path)), 'nonzero');
    ctx.strokeStyle = '#d00';
    ctx.lineWidth = 2.5 / s;
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const line of lines ?? []) {
      ctx.beginPath();
      for (let i = 0; i < line.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, line[i], line[i + 1]);
      ctx.stroke();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#666';
    ctx.font = '11px sans-serif';
    ctx.fillText(`${name} ${ch} · ${lines?.length ?? 0} lines · ${ms.toFixed(0)} ms`, col * CELL + 4, row * CELL + CELL - 6);
  });
});
fs.writeFileSync(out, canvas.toBuffer('image/png'));
console.log('wrote', out);
