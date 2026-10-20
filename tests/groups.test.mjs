import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const fonts = Array.from({ length: 6 }, (_, index) => ({ index, family: `Font ${index}` }));
const data = url(`export const textFonts = ${JSON.stringify(fonts)}; export const hasStyle = []; export const STYLE_DIMS = 1; export const vectors = []; export const styleDistance = () => 0;`);
const signals = url('export const signal = (value) => ({value});');
const source = stripTypeScriptTypes(readFileSync(new URL('../src/groups.ts', import.meta.url), 'utf8'))
  .replace("'@preact/signals'", JSON.stringify(signals))
  .replace("'./data'", JSON.stringify(data))
  .replace(/const worker = new Worker\([\s\S]*?worker\.postMessage\([^;]+;/, '');
const { groupFonts, groupLevels } = await import(url(source));
// Font 2 represents group A; font 0 replaces it after filtering. Font 1
// represents group B, so sorting by the replacement would reverse A and B.
const level = { k: 80, assign: Int32Array.from([0, 1, 0, 2, 2, 1]), sim: Float32Array.from([0.5, 1, 1, 1, 0.5, 0.5]) };
groupLevels.value.set(80, level);
const ids = (list) => list.map((f) => f.index);

test('replacement inherits group position despite different popularity', () => {
  assert.deepEqual(ids(groupFonts(fonts, 80)), [1, 2, 3]);
  assert.deepEqual(ids(groupFonts(fonts.filter((f) => f.index !== 2), 80)), [1, 0, 3]);
});

test('empty groups disappear without reordering the surviving groups', () => {
  assert.deepEqual(ids(groupFonts(fonts.filter((f) => ![1, 5].includes(f.index)), 80)), [2, 3]);
  assert.deepEqual(ids(groupFonts(fonts.filter((f) => [0, 4].includes(f.index)), 80)), [0, 4]);
  assert.deepEqual(ids(groupFonts(fonts, 80)), [1, 2, 3]);
});

test('filtering does not select another partition to fill the grid', () => {
  groupLevels.value.set(160, { k: 160, assign: Int32Array.from([0, 1, 2, 3, 4, 5]), sim: new Float32Array(6).fill(1) });
  assert.deepEqual(ids(groupFonts(fonts, 80)), [1, 2, 3]);
  assert.deepEqual(ids(groupFonts([fonts[0], fonts[2]], 80)), [2]);
});
