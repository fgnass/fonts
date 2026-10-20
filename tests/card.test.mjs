import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { transformWithOxc } from 'vite';

// Inspect the actual card's preview props without mounting its browser effects.
const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const mocks = {
  'preact/hooks': 'export const useEffect = () => {}; export const useLayoutEffect = () => {}; export const useRef = () => ({current: null}); export const useState = () => [];',
  '../data': 'export const fonts = [], hasStyle = [], metrics = []; export const displayedStyle = (f) => f.pick ?? { weight: f.weight, italic: f.italic };',
  '../fontload': 'export const fontAlias = () => "", isLoaded = () => false, loadFont = () => {}, retain = () => () => {}, styleName = () => "", textChars = (t) => t, variationSettings = () => "";',
  '../shape.js': 'export const GRID = 64;',
  '../skeleton': 'export const drawSkeleton = () => {};',
  './GoogleFontsLink': 'export const GoogleFontsLink = () => null;',
  '../state': 'export const activeShapeQuery = {value: false}, inspectedFont = {}, likeFont = {}, shortlist = {value: new Set()}, showShortlist = {value: false}; export const dislikeFont = () => {}, showSimilar = () => {}, toggleShortlist = () => {};',
};
let { code } = await transformWithOxc(fs.readFileSync(new URL('../src/components/Card.tsx', import.meta.url), 'utf8'), 'Card.tsx', { jsx: { runtime: 'automatic', importSource: 'preact' } });
for (const [specifier, source] of Object.entries(mocks)) code = code.replace(JSON.stringify(specifier), JSON.stringify(url(source)));
code = code.replace('"preact/jsx-runtime"', JSON.stringify(import.meta.resolve('preact/jsx-runtime')));
const originalObserver = globalThis.IntersectionObserver;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} };
const { Card } = await import(url(code));
if (originalObserver === undefined) delete globalThis.IntersectionObserver;
else globalThis.IntersectionObserver = originalObserver;

const font = { index: 0, family: 'Test', weight: 400, italic: false };
const preview = (item, lines) => Card({ item, lines }).props.children[0].props.lines;

test('any-character results preview their matched glyph with default or custom text', () => {
  assert.deepEqual(preview({ ...font, ch: 'n' }, ['Abc']), ['n']);
  assert.deepEqual(preview({ ...font, ch: 'G' }, ['Custom', 'text']), ['G']);
});

test('regular results keep the supplied preview text', () => {
  assert.deepEqual(preview(font, ['Custom', 'text']), ['Custom', 'text']);
});
