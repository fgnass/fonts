// Downloads a small subset of every variant (weight and italic) of every
// family in data/manifest.json into data/fonts-v/<slug>-<variant>.ttf, and
// for fonts with a wdth axis the default style at the axis ends into
// data/fonts-v/<slug>-wdth<value>.ttf. The subsets are used to measure the
// visual weight, slant and width (scripts/measure.mjs).
import fs from 'node:fs/promises';
import { progress, progressDone } from './progress.mjs';

export const VARIANT_CHARS = 'HIOabdehlnopqux';
const OUT = 'data/fonts-v';
// The optical size of the subsets, as in scripts/download.mjs.
const DISPLAY_OPSZ = 72;
const opszOf = (m) => (m.axes?.opsz ? Math.min(m.axes.opsz[1], Math.max(m.axes.opsz[0], DISPLAY_OPSZ)) : null);
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
  if (m.libre) throw new Error('missing, run scripts/libre.py download');
  const specOf = (opsz) => {
    // Pinned custom axes (see scripts/download.mjs) come after the registered ones.
    const pins = Object.keys(m.pinned ?? {}).sort();
    const tags = ['ital', ...(opsz != null ? ['opsz'] : []), ...(wdth != null ? ['wdth'] : []), 'wght', ...pins];
    const values = [wdth != null ? (m.italic ? 1 : 0) : v.endsWith('i') ? 1 : 0, ...(opsz != null ? [opsz] : []), ...(wdth != null ? [wdth] : []), wdth != null ? m.weight : parseInt(v), ...pins.map((t) => m.pinned[t])];
    return `${m.family}:${tags.join(',')}@${values.join(',')}`;
  };
  // Some families refuse a single opsz value: they keep their default optical size (see scripts/download.mjs).
  let src;
  for (const spec of opszOf(m) != null ? [specOf(opszOf(m)), specOf(null)] : [specOf(null)]) {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(spec)}&text=${VARIANT_CHARS}`)).text();
    src = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (src) break;
  }
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
