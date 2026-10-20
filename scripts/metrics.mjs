// The metrics of the fonts come in parts: every measuring script writes its
// own file data/metrics/<part>.json, an array in manifest order with one
// object per font that holds only the keys of that script. merge-metrics.mjs
// joins the parts into public/data/metrics.json for the app. So a script can
// run again without losing the values of the others.
import fs from 'node:fs';

const DIR = 'data/metrics';

/** The part names in merge order, with the script that writes each one. */
export const PARTS = {
  base: 'measure.mjs',
  width: 'measure-width.py',
  caps: 'caps.mjs',
  ornate: 'ornate.mjs',
  form: 'form.mjs',
  'stroke-fill': 'stroke-fill.mjs',
  connected: 'connected.mjs',
  distinct: 'distinct.mjs',
  recognize: 'recognize.py',
};

export function readPart(name) {
  return JSON.parse(fs.readFileSync(`${DIR}/${name}.json`, 'utf8'));
}

export function writePart(name, rows) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(`${DIR}/${name}.json`, JSON.stringify(rows));
}

/** `{ [key]: value }`, or `{}` for a missing value. */
export const entry = (key, value) => (value == null ? {} : { [key]: value });
