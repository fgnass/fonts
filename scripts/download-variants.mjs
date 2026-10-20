// Downloads a small subset of every variant (weight and italic) of every
// family in data/manifest.json into data/fonts-v/<slug>-<variant>.ttf, and
// for fonts with a wdth axis the default style at the axis ends into
// data/fonts-v/<slug>-wdth<value>.ttf. The subsets are used to measure the
// visual weight, slant and width (scripts/measure.mjs).
import fs from 'node:fs/promises';
import { progress, progressDone } from './progress.mjs';

export const VARIANT_CHARS = 'HIOabdehlnopqux';
const OUT = 'data/fonts-v';
const CONCURRENCY = 16;

await fs.mkdir(OUT, { recursive: true });
const manifest = JSON.parse(await fs.readFile('data/manifest.json', 'utf8'));
const queue = [
  ...manifest.flatMap((m) => m.variants.map((v) => ({ m, v }))),
  ...manifest.filter((m) => m.axes?.wdth).flatMap((m) => [m.axes.wdth[0], m.axes.wdth[1]].map((wdth) => ({ m, wdth }))),
];
const total = queue.length;
let done = 0, failed = 0;

async function download({ m, v, wdth }) {
  const file = `${OUT}/${m.file.replace('.ttf', '')}-${wdth != null ? `wdth${wdth}` : v}.ttf`;
  try {
    await fs.access(file);
    return;
  } catch {}
  const spec =
    wdth != null
      ? `${m.family}:ital,wdth,wght@${m.italic ? 1 : 0},${wdth},${m.weight}`
      : `${m.family}:ital,wght@${v.endsWith('i') ? 1 : 0},${parseInt(v)}`;
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(spec)}&text=${VARIANT_CHARS}`)).text();
  const src = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
  if (!src) throw new Error('no src in css');
  const res = await fetch(src);
  if (!res.ok) throw new Error('font ' + res.status);
  await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
}

await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        await download(item);
      } catch (e) {
        failed++;
        console.warn(`\n${item.m.family} ${item.v ?? `wdth ${item.wdth}`}: ${e.message}`);
      }
      progress(`${++done}/${total}`);
    }
  })
);
console.log(`\n${total - failed} variants, ${failed} failed`);
