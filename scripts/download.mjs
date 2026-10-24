// Downloads a subset (a-z, A-Z, 0-9 and some symbols, see src/chars.js) of
// every Latin Google Fonts family at weight 400 (or the closest upright
// weight) into data/fonts/, and writes data/manifest.json. The libre families
// of data/libre.json (from scripts/libre.py, which also writes their subsets)
// follow the Google families.
//
// --refresh: downloads the files of the families in data/manifest.json again
// (for example after new characters in src/chars.js) and keeps the manifest.
import fs from 'node:fs/promises';
import path from 'node:path';
import { CHARS } from '../src/chars.js';
import { progress, progressDone } from './progress.mjs';

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

// The variable axes of a family: { tag: [min, max, default] }. The filters use wght,
// wdth and slnt; opsz lets the browser pick the optical size for the font size; the
// specimen has a slider for each axis.
function axes(f) {
  const list = f.axes || [];
  return list.length ? Object.fromEntries(list.map((a) => [a.tag, [a.min, a.max, a.defaultValue]])) : null;
}

// Custom axes that Google pins to another value than the designers' default in the
// font file: they load and are measured at the designers' default. Checked against the
// fvar tables of all Google families with custom axes (2026-10); the others that differ
// (Honk, Bitcount Ink) are color fonts, which the app leaves out.
const PINNED = { Fraunces: { WONK: 1 } };
/** The pinned axes of a family as extra CSS2 tags and values (custom tags come after the registered ones). */
const pinnedSpec = (pinned = {}) => Object.keys(pinned).sort().map((t) => [t, pinned[t]]);

// The optical size the subsets are made at (and so measured at): a display size,
// within the opsz range of the family. The same value is in scripts/download-variants.mjs
// and scripts/measure-width.py.
const DISPLAY_OPSZ = 72;
const opszOf = (a) => (a?.opsz ? Math.min(a.opsz[1], Math.max(a.opsz[0], DISPLAY_OPSZ)) : null);

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
  const opsz = opszOf(axes(f));
  const pins = pinnedSpec(PINNED[f.family]);
  const spec = (tags, values) => `${f.family}:${[...tags, ...pins.map(([t]) => t)].join(',')}@${[...values, ...pins.map(([, v]) => v)].join(',')}`;
  const plain = spec(['ital', 'wght'], [italic ? 1 : 0, weight]);
  // Some families (Inter, DM Sans) refuse a single opsz value: they keep their default optical size.
  const specs = opsz != null ? [spec(['ital', 'opsz', 'wght'], [italic ? 1 : 0, opsz, weight]), plain] : [plain];
  let src;
  for (const spec of specs) {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(spec)}&text=${encodeURIComponent(CHARS)}`;
    src = (await (await fetch(url)).text()).match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (src) break;
  }
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
          ...(PINNED[f.family] && { pinned: PINNED[f.family] }),
          popularity: f.popularity,
          file: slug(f.family) + '.ttf',
        });
      } catch (e) {
        failed.push(f.family);
        console.warn(`\n${f.family}: ${e.message}`);
      }
      progress(`${++done}/${families.length}`);
    }
  })
);
if (refresh) {
  console.log(`\n${families.length - failed.length} files downloaded again, manifest kept`);
  process.exit();
}
// Keep the order of an existing manifest: the index and the embeddings are
// stored in this order. New families go to the end: Google families sorted by
// popularity, then the libre families.
let previous = [];
try {
  previous = JSON.parse(await fs.readFile('data/manifest.json', 'utf8')).map((m) => m.family);
} catch {}
let libre = [];
try {
  libre = JSON.parse(await fs.readFile('data/libre.json', 'utf8'));
} catch {}
const google = new Set(manifest.map((m) => m.family));
for (const m of libre) {
  if (google.has(m.family)) throw new Error(`${m.family} is also a Google family`);
  await fs.access(path.join(OUT, m.file));
  manifest.push(m);
}
const rank = new Map(previous.map((f, i) => [f, i]));
const order = (m) => rank.get(m.family) ?? (m.libre ? 2e9 : 1e9 + m.popularity);
manifest.sort((a, b) => order(a) - order(b));
await fs.writeFile('data/manifest.json', JSON.stringify(manifest, null, 1));
console.log(`\n${manifest.length} fonts`);
