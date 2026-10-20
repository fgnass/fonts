import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadGlyphs } from '../scripts/glyph.mjs';
import { strokeFillOf } from '../scripts/stroke-fill.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../data/manifest.json', import.meta.url)));
const score = (name) => {
  const entry = manifest.find((f) => f.family === name);
  return strokeFillOf(loadGlyphs(new URL(`../data/fonts/${entry.file}`, import.meta.url)));
};

test('outline measurement distinguishes hollow stems from solid and hairline fonts', () => {
  for (const name of ['Roboto', 'Playfair Display', 'Poiret One']) assert.ok(score(name) < 0.05, name);
  for (const name of ['Bungee Outline', 'Londrina Outline']) assert.ok(score(name) > 0.7, name);
});

test('broken outlines are detected without requiring closed counters', () => {
  assert.ok(score('Rubik Burned') > 0.5);
  assert.ok(score('Rubik Doodle Shadow') > 0.5);
});

test('script loops and swashes do not provide strong outline evidence', () => {
  for (const name of ['Great Vibes', 'Ballet', 'Pacifico', 'Sassy Frass', 'Gwendolyn', 'Monsieur La Doulaise']) {
    assert.ok(score(name) < 0.4, name);
  }
});

test('missing glyphs remain unknown', () => {
  assert.equal(strokeFillOf({ path: () => null }), null);
});
