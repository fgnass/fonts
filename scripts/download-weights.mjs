// Downloads light (300) and bold (700) subsets of every family that has both
// upright weights. They are used to estimate the "weight direction" in the
// embedding space, so that it can be projected out.
import fs from 'node:fs/promises';
import path from 'node:path';
import { progress, progressDone } from './progress.mjs';

const CHARS = process.argv[2] || 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const WEIGHTS = [300, 700];
const OUT = 'data/fonts-w';
const CONCURRENCY = 16;

await fs.mkdir(OUT, { recursive: true });

const manifest = JSON.parse(await fs.readFile('data/manifest.json', 'utf8'));
const meta = await (await fetch('https://fonts.google.com/metadata/fonts')).json();
const byFamily = new Map(meta.familyMetadataList.map((f) => [f.family, f]));
const families = manifest.filter((m) => WEIGHTS.every((w) => byFamily.get(m.family)?.fonts[w]));

const jobs = families.flatMap((f) => WEIGHTS.map((w) => ({ f, w })));
let done = 0;
const ok = [];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (jobs.length) {
      const { f, w } = jobs.shift();
      const file = path.join(OUT, f.file.replace('.ttf', `-${w}.ttf`));
      try {
        await fs.access(file).catch(async () => {
          const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(`${f.family}:wght@${w}`)}&text=${CHARS}`;
          const src = (await (await fetch(url)).text()).match(/src:\s*url\(([^)]+)\)/)?.[1];
          if (!src) throw new Error('no src in css');
          await fs.writeFile(file, Buffer.from(await (await fetch(src)).arrayBuffer()));
        });
        if (w === WEIGHTS[0]) ok.push(f.family);
      } catch (e) {
        console.warn(`\n${f.family} ${w}: ${e.message}`);
      }
      progress(`${++done}/${families.length * WEIGHTS.length}`);
    }
  })
);
await fs.writeFile('data/weights.json', JSON.stringify({ weights: WEIGHTS, families: ok.sort() }));
console.log(`\n${ok.length} families`);
