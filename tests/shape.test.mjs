import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { chamfer, decodeLines, distanceField, linePoints, sketchEnds, sketchPoints, strokeEndDistance, strokeEnds } from '../src/shape.js';

const read = (file) => fs.readFileSync(new URL(`../public/data/${file}`, import.meta.url));
const fonts = JSON.parse(read('fonts.json'));
const topology = JSON.parse(read('t/110.json'));
function loadPoints(code) {
  const buf = read(`g/${code}.bin`), glyphs = [];
  for (let offset = 0; offset < buf.length;) {
    let end = offset + 2;
    for (let line = 0; line < buf.readUInt16LE(offset); line++) end += 2 + buf.readUInt16LE(end) * 2;
    glyphs.push(linePoints(decodeLines(buf.subarray(offset, end))));
    offset = end;
  }
  return glyphs;
}
const glyphs = loadPoints(110);

const arches = ['MuseoModerno', 'Gugi', 'Baloo Da 2'];
const stems = ['Candal', 'Cherry Cream Soda', 'Poller One', 'Roboto'];
const index = (family) => fonts.findIndex((f) => f.family === family);
// Approximation of the user's drawing; varied horizontally so the regression
// does not depend on one exact aspect ratio or a mathematically perfect arc.
const stroke = [[143,595],[143,560],[133,510],[132,475],[140,430],[160,390],[185,365],[215,347],[250,342],[280,343],[305,353],[322,385],[337,440],[340,500],[340,600]];

test('actual glyph topology preserves stems lost by medial-axis pruning', () => {
  for (const family of arches) assert.equal(topology[index(family)].length / 2, 2, family);
  for (const family of stems) assert.equal(topology[index(family)].length / 2, 3, family);
  // Candal's old curves are only an arch, although its rendered n has a stem.
  assert.equal(strokeEnds(glyphs[index('Candal')]).length / 2, 2);
});

for (const width of [1, 1.12, 1.25]) {
  test(`real arch-shaped n glyphs outrank extra-stem glyphs at drawing width ${width}`, () => {
    const points = sketchPoints([stroke.map(([x, y]) => ({ x: x * width, y }))]);
    const field = distanceField(points), ends = sketchEnds(points);
    const score = (family) => {
      const i = index(family), candidate = glyphs[i];
      return chamfer(points, field, candidate, distanceField(candidate)) + strokeEndDistance(ends, Uint8Array.from(topology[i]));
    };
    for (const arch of arches) {
      for (const stem of stems) assert.ok(score(arch) < score(stem), `${arch} should outrank ${stem}`);
    }
  });
}

test('the corresponding u arches also outrank glyphs with an extra stem', () => {
  const points = sketchPoints([stroke.map(([x, y]) => ({ x, y: 940 - y }))]);
  const ends = sketchEnds(points), field = distanceField(points);
  const candidates = loadPoints(117), endsByFont = JSON.parse(read('t/117.json'));
  const score = (family) => {
    const i = index(family), candidate = candidates[i];
    return chamfer(points, field, candidate, distanceField(candidate)) + strokeEndDistance(ends, Uint8Array.from(endsByFont[i]));
  };
  for (const arch of arches) {
    assert.equal(endsByFont[index(arch)].length / 2, 2, arch);
    for (const stem of stems) assert.ok(score(arch) < score(stem), `${arch} should outrank ${stem}`);
  }
});

test('stroke-end comparison handles loops, dots, and is symmetric', () => {
  const arch = Uint8Array.from([4,59,59,59]), withStem = Uint8Array.from([4,4,4,59,59,59]);
  assert.equal(strokeEndDistance(arch, arch), 0);
  assert.equal(strokeEndDistance(new Uint8Array(), new Uint8Array()), 0);
  assert.ok(Number.isFinite(strokeEndDistance(arch, new Uint8Array())));
  assert.ok(strokeEndDistance(arch, withStem) > 0);
  assert.equal(strokeEndDistance(arch, withStem), strokeEndDistance(withStem, arch));
  assert.deepEqual([...strokeEnds(Uint8Array.from([32,32]))], [32,32]);
});

test('a small gap where strokes should meet adds no stroke ends', () => {
  // A T: the stem stops just short of the bar, or touches it.
  const bar = [{ x: 100, y: 100 }, { x: 500, y: 100 }];
  const touching = sketchPoints([bar, [{ x: 300, y: 100 }, { x: 300, y: 600 }]]);
  const gap = sketchPoints([bar, [{ x: 300, y: 125 }, { x: 300, y: 600 }]]);
  assert.equal(sketchEnds(touching).length / 2, 3);
  assert.equal(strokeEnds(gap).length / 2, 4);
  assert.equal(sketchEnds(gap).length / 2, 3);
  // Free ends stay, also short ones: an L with a short foot.
  assert.equal(sketchEnds(sketchPoints([[{ x: 100, y: 100 }, { x: 100, y: 600 }, { x: 180, y: 600 }]])).length / 2, 2);
});
