import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import * as shape from '../src/shape.js';

const source = stripTypeScriptTypes(readFileSync(new URL('../src/search-worker.ts', import.meta.url), 'utf8'))
  .replace(/^import .*;$/gm, '');
const queryGlyph = shape.encodeLines([[16, 16, 16, 48]]);
const otherGlyph = shape.encodeLines([[16, 32, 48, 32]]);

/** Exercise the worker message handler with a glyph index newer than its embeddings. */
async function search({ allowed = [0, 1], trailing = otherGlyph, fontIndex = 0 } = {}) {
  const glyphData = Uint8Array.from([...queryGlyph, ...trailing]);
  const embeddings = new Int8Array(256);
  embeddings[0] = 100; // Only the first font has an embedding row.
  let response;
  const context = vm.createContext({
    ...shape,
    ALL: 'A',
    onmessage: null,
    fetch: async (url) => ({
      ok: true,
      headers: { get: () => null },
      arrayBuffer: async () => url.includes('/e/') ? embeddings.buffer : glyphData.buffer,
      json: async () => null,
    }),
    postMessage: (data) => { response = data; },
  });
  vm.runInContext(source, context);
  await context.onmessage({ data: { id: 1, parts: [{ ch: 'A', fontIndex }], allowed, limit: 120 } });
  return response;
}

test('fonts beyond the embedding file receive their skeleton rank', async () => {
  const result = await search();
  assert.equal(result.total, 2);
  assert.equal(result.results[0].index, 0);
  assert.equal(result.results[1].index, 1);
  assert.ok(result.results[1].score > result.results[0].score);
});

test('fonts beyond the embedding file still obey eligibility filters', async () => {
  const result = await search({ allowed: [0] });
  assert.equal(result.total, 1);
  assert.equal(result.results[0].index, 0);
});

test('fonts beyond the embedding file still need the query glyph', async () => {
  const result = await search({ trailing: shape.encodeLines([]) });
  assert.equal(result.total, 1);
  assert.equal(result.results[0].index, 0);
});

test('a query beyond the embedding file uses skeleton search', async () => {
  const result = await search({ fontIndex: 1 });
  assert.equal(result.total, 2);
  assert.equal(result.results[0].index, 1);
  assert.equal(result.usedChamfer[0], 'A');
});
