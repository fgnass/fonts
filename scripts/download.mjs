// Downloads a subset (a-z, A-Z, 0-9 and some symbols, see src/chars.js) of
// every Latin Google Fonts family at weight 400 (or the closest upright
// weight) into data/fonts/.
//
// --refresh: downloads the files of the families in data/manifest.json again
// (for example after new characters in src/chars.js) and keeps the manifest.
import fs from 'node:fs/promises';
import path from 'node:path';
import { CHARS } from '../src/chars.js';

const OUT = 'data/fonts';
const CONCURRENCY = 16;

await fs.mkdir(OUT, { recursive: true });

const refresh = process.argv.includes('--refresh');
const meta = await (await fetch('https://fonts.google.com/metadata/fonts')).json();
let families = meta.familyMetadataList.filter((f) => f.subsets.includes('latin'));
if (refresh) {
  const known = new Set(JSON.parse(await fs.readFile('data/manifest.json', 'utf8')).map((m) => m.family));
  families = families.filter((f) => known.has(f.family));
}

function pickVariant(fonts) {
  const upright = Object.keys(fonts).filter((v) => !v.endsWith('i')).map(Number);
  if (upright.length) {
    return { weight: upright.sort((a, b) => Math.abs(a - 400) - Math.abs(b - 400))[0], italic: false };
  }
  return { weight: parseInt(Object.keys(fonts)[0]), italic: true };
}

// The variable axes the browser search uses: { tag: [min, max, default] }.
const AXES = ['wght', 'wdth', 'slnt'];
function axes(f) {
  const list = (f.axes || []).filter((a) => AXES.includes(a.tag));
  return list.length ? Object.fromEntries(list.map((a) => [a.tag, [a.min, a.max, a.defaultValue]])) : null;
}

export function slug(family) {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

async function download(f) {
  const file = path.join(OUT, slug(f.family) + '.ttf');
  if (!refresh) {
    try {
      await fs.access(file);
      return 'cached';
    } catch {}
  }
  const { weight, italic } = pickVariant(f.fonts);
  const spec = `${f.family}:ital,wght@${italic ? 1 : 0},${weight}`;
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(spec)}&text=${encodeURIComponent(CHARS)}`;
  const css = await (await fetch(url)).text();
  const src = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
  if (!src) throw new Error('no src in css');
  const res = await fetch(src);
  if (!res.ok) throw new Error('font ' + res.status);
  await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
  return 'ok';
}

const manifest = [];
const failed = [];
let done = 0;
const queue = [...families];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const f = queue.shift();
      try {
        await download(f);
        const { weight, italic } = pickVariant(f.fonts);
        manifest.push({
          family: f.family,
          category: f.category,
          weight,
          italic,
          variants: Object.keys(f.fonts),
          ...(axes(f) && { axes: axes(f) }),
          popularity: f.popularity,
          file: slug(f.family) + '.ttf',
        });
      } catch (e) {
        failed.push(f.family);
        console.warn(`\n${f.family}: ${e.message}`);
      }
      process.stdout.write(`\r${++done}/${families.length}`);
    }
  })
);
if (refresh) {
  console.log(`\n${families.length - failed.length} files downloaded again, manifest kept`);
  process.exit();
}
// Keep the order of an existing manifest: the index and the embeddings are
// stored in this order. New families go to the end, sorted by popularity.
let previous = [];
try {
  previous = JSON.parse(await fs.readFile('data/manifest.json', 'utf8')).map((m) => m.family);
} catch {}
const rank = new Map(previous.map((f, i) => [f, i]));
manifest.sort((a, b) => (rank.get(a.family) ?? Infinity) - (rank.get(b.family) ?? Infinity) || a.popularity - b.popularity);
await fs.writeFile('data/manifest.json', JSON.stringify(manifest, null, 1));
console.log(`\n${manifest.length} fonts`);
