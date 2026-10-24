// Puts the rows of the skeleton features (data/emb-skel/*.f32) into the order
// of data/manifest.json after families were removed from it. Rows follow the
// manifest order, so without this, every row after a removed family would
// belong to the wrong family. Families that are new in the manifest get zero
// rows: compute them with `node scripts/embed.mjs --skeleton --only=…`, which
// this script prints.
//
// Usage: node scripts/remap-embeddings.mjs <old-manifest.json>
import fs from 'node:fs';

const DIR = 'data/emb-skel';
const old = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).map((m) => m.family);
const now = JSON.parse(fs.readFileSync('data/manifest.json', 'utf8')).map((m) => m.family);
const at = new Map(old.map((family, i) => [family, i]));

for (const file of fs.readdirSync(DIR).filter((f) => /^\d+\.f32$/.test(f))) {
  const rows = new Float32Array(fs.readFileSync(`${DIR}/${file}`).buffer.slice(0));
  const row = (1 + 4 * 4) * 384; // as ROW in scripts/embed.mjs
  // Files of characters outside the default set of embed.mjs can be older than the manifest.
  if (rows.length !== old.length * row) {
    console.warn(`skipped ${file}: ${rows.length / row} rows, not ${old.length}`);
    continue;
  }
  const out = new Float32Array(now.length * row);
  now.forEach((family, i) => {
    if (at.has(family)) out.set(rows.subarray(at.get(family) * row, (at.get(family) + 1) * row), i * row);
  });
  fs.writeFileSync(`${DIR}/${file}`, out);
}
const added = now.filter((family) => !at.has(family));
const removed = old.length - (now.length - added.length);
console.log(`${removed} families removed, ${added.length} new`);
if (added.length) console.log(`node scripts/embed.mjs --skeleton '--only=${added.join(',')}'`);
