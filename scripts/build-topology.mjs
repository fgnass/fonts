import fs from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { CHARS } from '../src/chars.js';
import { loadGlyphs } from './glyph.mjs';
import { glyphStrokeEnds } from './glyph-topology.mjs';

if (isMainThread) {
  const fonts = JSON.parse(fs.readFileSync('data/manifest.json'));
  const chars = process.argv[2] || CHARS;
  const concurrency = 4;
  const chunks = await Promise.all(Array.from({ length: concurrency }, (_, k) => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { fonts: fonts.filter((_, i) => i % concurrency === k), chars } });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => { if (code) reject(new Error(`Topology worker exited with ${code}`)); });
  })));
  fs.mkdirSync('public/data/t', { recursive: true });
  for (const ch of chars) {
    const ends = fonts.map((_, i) => chunks[i % concurrency][Math.floor(i / concurrency)][ch]);
    fs.writeFileSync(`public/data/t/${ch.charCodeAt(0)}.json`, JSON.stringify(ends));
  }
  console.log(`Stroke ends: ${fonts.length} fonts × ${chars.length} characters`);
} else {
  const { fonts, chars } = workerData;
  const results = fonts.map((f) => {
    const font = loadGlyphs(`data/fonts/${f.file}`);
    return Object.fromEntries([...chars].map((ch) => {
      const ends = font && glyphStrokeEnds(font.path(ch));
      return [ch, ends ? [...ends] : null];
    }));
  });
  parentPort.postMessage(results);
}
