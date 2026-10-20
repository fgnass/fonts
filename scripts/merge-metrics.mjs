// Joins the metric parts in data/metrics/ (see metrics.mjs) into
// public/data/metrics.json. A missing part is skipped with a warning.
//
// Usage: node scripts/merge-metrics.mjs
import fs from 'node:fs';
import { PARTS, readPart } from './metrics.mjs';

const base = readPart('base');
const rows = base.map((row) => ({ ...row }));
for (const [name, script] of Object.entries(PARTS)) {
  if (name === 'base') continue;
  if (!fs.existsSync(`data/metrics/${name}.json`)) {
    console.warn(`${name}: missing, run scripts/${script}`);
    continue;
  }
  const part = readPart(name);
  if (part.length !== rows.length) throw new Error(`${name}: ${part.length} rows, base has ${rows.length}; run scripts/${script} again`);
  part.forEach((values, i) => Object.assign(rows[i], values));
}
fs.writeFileSync('public/data/metrics.json', JSON.stringify(rows));
console.log(`${rows.length} fonts, ${Object.keys(PARTS).length} parts`);
