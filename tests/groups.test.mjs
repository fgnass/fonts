import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const ts = (file) => stripTypeScriptTypes(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'));
const fonts = Array.from({ length: 9 }, (_, index) => ({ index, family: `Font ${index}` }));
const data = url(`export const fonts = ${JSON.stringify(fonts)}, textFonts = fonts; export const hasStyle = []; export const STYLE_DIMS = 1; export const vectors = []; export const styleDistance = () => 0;`);
const signals = url('export const signal = (value) => ({ value }); export const computed = (fn) => ({ get value() { return fn(); } });');
const source = ts('groups.ts')
  .replace("'@preact/signals'", JSON.stringify(signals))
  .replace("'./data'", JSON.stringify(data))
  .replace("'./random'", JSON.stringify(url(ts('random.ts'))))
  .replace(/const worker = new Worker\([\s\S]*?worker\.postMessage\([^;]+;/, '');
const { browseOrder, groupFonts, groupLevels, shuffleSeed } = await import(url(source));
// Groups 0, 1 and 2 with three fonts each.
const assign = Int32Array.from([0, 1, 0, 2, 2, 1, 0, 1, 2]);
groupLevels.value.set(80, { k: 80, assign, sim: new Float32Array(9).fill(1) });
const groupsOf = (list) => list.map((f) => assign[f.index]);

test('the groups take turns: the first fonts are one of each group', () => {
  for (const seed of [1, 2, 3]) {
    shuffleSeed.value = seed;
    const { rank } = browseOrder.value;
    const order = [...fonts].sort((a, b) => rank[a.index] - rank[b.index]);
    for (let round = 0; round < 3; round++) {
      assert.deepEqual(new Set(groupsOf(order.slice(round * 3, round * 3 + 3))), new Set([0, 1, 2]));
    }
  }
});

test('the same seed gives the same order', () => {
  shuffleSeed.value = 7;
  const a = [...browseOrder.value.rank];
  shuffleSeed.value = 8;
  shuffleSeed.value = 7;
  assert.deepEqual([...browseOrder.value.rank], a);
});

test('a group keeps its position when filtering replaces its representative', () => {
  shuffleSeed.value = 1;
  const all = groupFonts(fonts, 80);
  assert.equal(all.length, 3);
  const rep = all[0];
  const filtered = groupFonts(fonts.filter((f) => f.index !== rep.index), 80);
  assert.deepEqual(groupsOf(filtered), groupsOf(all));
  assert.notEqual(filtered[0].index, rep.index);
  assert.equal(filtered[0].group[0].index, filtered[0].index);
});

test('empty groups disappear without reordering the surviving groups', () => {
  shuffleSeed.value = 1;
  const all = groupsOf(groupFonts(fonts, 80));
  const gone = all[1];
  assert.deepEqual(groupsOf(groupFonts(fonts.filter((f) => assign[f.index] !== gone), 80)), all.filter((g) => g !== gone));
});

test('filtering does not select another partition to fill the grid', () => {
  groupLevels.value.set(160, { k: 160, assign: Int32Array.from(fonts.map((f) => f.index)), sim: new Float32Array(9).fill(1) });
  assert.equal(groupFonts(fonts, 80).length, 3);
  assert.equal(groupFonts([fonts[0], fonts[2]], 80).length, 1);
});
