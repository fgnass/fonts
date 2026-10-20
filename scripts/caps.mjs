// Finds fonts without real lowercase letters (caps-only fonts and fonts
// whose lowercase letters are small capitals): for letters whose lowercase
// form differs from the capital in normal fonts, compares the skeletons of
// both forms (public/data/g) with the chamfer distance. Writes `lc: 0` into
// the entries of public/data/metrics.json when most of them match.
import fs from 'node:fs';
import { chamfer, decodeLines, distanceField, linePoints } from '../src/shape.js';

const LETTERS = 'abdeghnqr';

/** The skeletons of one character for all fonts, as grid points (see build-index.mjs for the file layout). */
function load(ch) {
  const buf = new Uint8Array(fs.readFileSync(`public/data/g/${ch.charCodeAt(0)}.bin`));
  const list = [];
  for (let o = 0; o < buf.length; ) {
    const lines = buf[o] | (buf[o + 1] << 8);
    let end = o + 2;
    for (let k = 0; k < lines; k++) end += 2 + (buf[end] | (buf[end + 1] << 8)) * 2;
    list.push(linePoints(decodeLines(buf.subarray(o, end))));
    o = end;
  }
  return list;
}

const fonts = JSON.parse(fs.readFileSync('public/data/fonts.json', 'utf8'));
const metrics = JSON.parse(fs.readFileSync('public/data/metrics.json', 'utf8'));
// Even in caps-only fonts, the two forms seldom differ more than this (noisy and textured fonts).
const OWN_MAX = 2.5;
const pairs = [...LETTERS].map((ch) => [load(ch), load(ch.toUpperCase())]);
const field = (p) => distanceField(p);
// Reference lowercase forms: popular fonts with clearly different lowercase and capital forms.
const REFS = ['Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald', 'Poppins', 'Merriweather', 'Playfair Display', 'Roboto Condensed', 'Barlow Condensed', 'Lora', 'Raleway', 'Archivo Narrow', 'Pathway Gothic One', 'Abril Fatface', 'Lobster', 'Bitter', 'Fira Sans Extra Condensed']
  .map((name) => fonts.findIndex((f) => f.family === name)).filter((i) => i >= 0);
const refs = (list) => REFS.map((r) => [list[r], field(list[r])]).filter(([p]) => p?.length);
const refFields = pairs.map(([lower, upper]) => [refs(lower), refs(upper)]);
// Per letter: does the lowercase form look more like a capital (its own or a reference one) than like any reference lowercase form?
const votes = fonts.map((_, i) => {
  let caps = 0, n = 0;
  pairs.forEach(([lower, upper], k) => {
    const a = lower[i], b = upper[i];
    if (!a?.length || !b?.length) return;
    const fa = field(a);
    const own = chamfer(a, fa, b, field(b));
    const near = (list) => Math.min(...list.filter(([p]) => p !== a).map(([p, fp]) => chamfer(a, fa, p, fp)));
    // The lowercase form can also be another capital form than the font's own (decorative capitals in Cinzel Decorative).
    const capital = Math.min(own, near(refFields[k][1]));
    n++;
    caps += capital < near(refFields[k][0]) && capital < OWN_MAX;
  });
  return n ? caps / n : 0;
});

let n = 0;
votes.forEach((v, i) => {
  const flag = v > 0.5;
  if (metrics[i]) {
    if (flag) metrics[i].lc = 0;
    else delete metrics[i].lc;
  }
  n += flag;
});
if (!process.argv.includes('--dry')) fs.writeFileSync('public/data/metrics.json', JSON.stringify(metrics));
console.log(`${n} of ${fonts.length} fonts without real lowercase`);
for (const name of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const i = fonts.findIndex((f) => f.family === name);
  if (i >= 0) console.log(name, votes[i].toFixed(2));
}
if (process.argv.includes('--border')) {
  votes.forEach((v, i) => {
    if (v >= 0.3 && v <= 0.7) console.log(v.toFixed(2), fonts[i].family);
  });
}
