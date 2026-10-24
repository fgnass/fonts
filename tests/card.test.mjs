import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { transformWithOxc } from 'vite';

// Inspect the actual card's preview props without mounting its browser effects.
const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const mocks = {
  '../../data': 'export const displayedStyle = (f) => f.pick ?? { weight: f.weight, italic: f.italic }; export const fonts = [], hasStyle = [];',
  '../../fontload': 'export const styleName = () => "";',
  '../../state': 'export const activeShapeQuery = {value: false}, likeFont = {}, pendingExclusion = {}, showShortlist = {value: false}, similarTo = {value: null}; export const openFont = () => {};',
  './CardActions': 'export const CardActions = () => null;',
  './Glyph': 'export const Glyph = () => null;',
  './ShortlistStar': 'export const ShortlistStar = () => null;',
  './Skeletons': 'export const Skeletons = () => null;',
  './styles': 'export const showOnHover = "";',
  './useInspection': 'export const useInspection = () => ({});',
};
let { code } = await transformWithOxc(fs.readFileSync(new URL('../src/components/card/Card.tsx', import.meta.url), 'utf8'), 'Card.tsx', { jsx: { runtime: 'automatic', importSource: 'preact' } });
for (const [specifier, source] of Object.entries(mocks)) code = code.replace(JSON.stringify(specifier), JSON.stringify(url(source)));
for (const specifier of ['preact/jsx-runtime', 'classname-variants', 'classname-variants/preact']) code = code.replace(JSON.stringify(specifier), JSON.stringify(import.meta.resolve(specifier)));
const { Card } = await import(url(code));

const font = { index: 0, family: 'Test', weight: 400, italic: false };
const preview = (item, lines) => Card({ item, lines }).props.children[0].props.lines;

test('any-character results preview their matched glyph with default or custom text', () => {
  assert.deepEqual(preview({ ...font, ch: 'n' }, ['Abc']), ['n']);
  assert.deepEqual(preview({ ...font, ch: 'G' }, ['Custom', 'text']), ['G']);
});

test('regular results keep the supplied preview text', () => {
  assert.deepEqual(preview(font, ['Custom', 'text']), ['Custom', 'text']);
});
