import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const source = stripTypeScriptTypes(await readFile(new URL('../src/svg-text.ts', import.meta.url), 'utf8'));
const { svgFromLines } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

// A square from the baseline up to 500 units, 500 wide.
const square = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [500, 0] },
  { type: 'L', values: [500, 500] },
  { type: 'L', values: [0, 500] },
  { type: 'Z', values: [] },
];
const options = { upem: 1000, size: 100, lineHeight: 1.2, ascender: 800 };

test('places a glyph below the ascender, with y pointing down, and fits the viewBox', () => {
  const svg = svgFromLines([[{ path: square, x: 0, y: 0 }]], options);
  // The baseline is at 80; the square reaches up to 30.
  assert.equal(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 30 50 50"><path d="M0 80L50 80L50 30L0 30Z"/></svg>');
});

test('advances along the line and down to the next line', () => {
  const svg = svgFromLines([[{ path: square, x: 0, y: 0 }, { path: square, x: 600, y: 0 }], [{ path: square, x: 0, y: -100 }]], options);
  assert.match(svg, /viewBox="0 30 110 180"/);
  // The second line has its baseline 120 lower; the glyph sits 10 below it.
  assert.match(svg, /M0 210L50 210L50 160L0 160Z"/);
});

test('returns null without outlines', () => {
  assert.equal(svgFromLines([[]], options), null);
  assert.equal(svgFromLines([[{ path: [], x: 0, y: 0 }]], options), null);
});
