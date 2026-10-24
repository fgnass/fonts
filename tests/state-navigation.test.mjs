import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const fonts = [{ index: 0, family: 'First' }, { index: 1, family: 'Second' }, { index: 2, family: 'Third' }];
const mocks = {
  '@preact/signals': import.meta.resolve('@preact/signals'),
  './chars.js': url('export const CHARS = "Abc";'),
  './data': url(`export const fonts = ${JSON.stringify(fonts)}, textFonts = fonts, metrics = []; export const hasStyles = false, hasSkeleton = () => true, ligaturesIn = () => [];`),
  './filter': url('export const activeRanges = () => new Map(), compromises = () => null, exclusionSuggestions = () => [], filterFonts = () => ({ list: [] });'),
  './groups': url('export const groupFonts = (list) => list, browseOrder = { value: { rank: [], groupRank: new Map() } };'),
  './similar': url('export const bySimilarity = (list) => list;'),
  './shape-search': url('export const createShapeSearch = () => ({ value: { items: [], status: "" } });'),
  './shape.js': url('export const sketchPoints = () => [];'),
  './sliders': url('export const SLIDERS = [], isAny = () => true;'),
};

test('Back leaves a new chain of opened fonts and still traverses the fonts within it', async () => {
  const entries = [null];
  let position = 0;
  let onPopState;
  const globals = ['history', 'window', 'addEventListener', 'requestAnimationFrame', 'matchMedia'];
  const previous = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, {
    history: {
      replaceState(state) { entries[position] = state; },
      pushState(state) { entries.splice(++position, Infinity, state); },
    },
    window: { scrollY: 0, scrollTo() {} },
    addEventListener(type, listener) { if (type === 'popstate') onPopState = listener; },
    requestAnimationFrame(callback) { callback(); },
    matchMedia: () => ({ matches: false }),
  });
  try {
    let source = stripTypeScriptTypes(fs.readFileSync(new URL('../src/state.ts', import.meta.url), 'utf8'));
    for (const [specifier, replacement] of Object.entries(mocks)) source = source.replace(`'${specifier}'`, JSON.stringify(replacement));
    const state = await import(url(source));
    const back = () => onPopState({ state: entries[--position] });

    state.openFont(fonts[0]);
    state.openWorkspace('explore');
    state.openFont(fonts[1]);
    assert.equal(state.chainDepth.value, 1);
    assert.equal(state.fontView.value, 'specimen');
    state.fontView.value = 'pairing';
    state.openFont(fonts[2]);
    assert.equal(state.chainDepth.value, 2);
    // Within the font view, the view stays.
    assert.equal(state.fontView.value, 'pairing');
    back();
    assert.equal(state.viewedFont.value.index, 1);
    assert.equal(state.chainDepth.value, 1);
    back();
    assert.equal(state.workspace.value, 'explore');
    assert.equal(state.chainDepth.value, 0);
    onPopState({ state: entries[++position] });
    assert.equal(state.workspace.value, 'shortlist');
    assert.equal(state.viewedFont.value.index, 1);
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
