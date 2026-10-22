import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { signal } from '@preact/signals';

const url = (s) => `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const dataURL = url(`
  export const fonts = [{ index: 0, family: 'First' }, { index: 1, family: 'Second' }];
  export const textFonts = fonts;
  export const metrics = [{ lc: 1 }, { lc: 0 }];
  export const hasSkeleton = () => true;
  export const ligaturesIn = () => [];
`);
let source = stripTypeScriptTypes(fs.readFileSync(new URL('../src/shape-search.ts', import.meta.url), 'utf8'));
source = source.replace("'@preact/signals'", JSON.stringify(import.meta.resolve('@preact/signals')))
  .replace("'./chars.js'", JSON.stringify(new URL('../src/chars.js', import.meta.url).href))
  .replace("'./data'", JSON.stringify(dataURL))
  .replace("'./groups'", JSON.stringify(url("export const groupFonts = (list) => list; export const groupOf = () => null; export const bestOfGroups = (hits) => hits;")))
  .replace("new URL('./search-worker.ts', import.meta.url)", JSON.stringify(new URL('../src/search-worker.ts', import.meta.url).href));
const { createShapeSearch } = await import(url(source));

function setup() {
  const originalWorker = globalThis.Worker;
  let worker;
  globalThis.Worker = class {
    requests = [];
    constructor() { worker = this; }
    postMessage(request) { this.requests.push(request); }
    reply(id, index = 0) { this.onmessage({ data: { id, total: 1, usedChamfer: [], results: [{ index, score: 0.1 }] } }); }
  };
  const open = signal(true);
  const query = signal([{ ch: 'a', pts: new Uint8Array([1, 2]) }]);
  const pick = (weight) => ({ weight, italic: false });
  const filtered = signal({ list: [{ index: 0, pick: pick(400) }] });
  try {
    const view = createShapeSearch({
      open: () => open.value, query: () => query.value, extra: () => '',
      filtered: () => filtered.value, font: () => null, groupCount: () => 0, text: () => 'a',
    });
    return { view, worker, open, query, filtered, pick };
  } finally {
    globalThis.Worker = originalWorker;
  }
}

test('old hits retain their original style until the matching successor response arrives', () => {
  const { view, worker, filtered, pick } = setup();
  assert.equal(view.value.status, 'Searching…');
  const first = worker.requests.at(-1).id;
  worker.reply(first);
  assert.equal(view.value.items[0].pick.weight, 400);
  filtered.value = { list: [{ index: 0, pick: pick(700) }] };
  const second = worker.requests.at(-1).id;
  assert.notEqual(first, second);
  assert.equal(view.value.status, 'Searching…');
  assert.equal(view.value.items[0].pick.weight, 400);
  worker.reply(first, 1);
  assert.equal(view.value.items[0].index, 0, 'stale response must be ignored');
  worker.reply(second);
  assert.equal(view.value.items[0].pick.weight, 700);
  assert.match(view.value.status, /^Top 1 of 1 fonts/);
});

test('pausing retains results without sending requests; an empty query clears them on resume', () => {
  const { view, worker, open, query } = setup();
  worker.reply(worker.requests.at(-1).id);
  open.value = false;
  const count = worker.requests.length;
  query.value = [];
  assert.equal(worker.requests.length, count);
  assert.equal(view.value.items.length, 1);
  open.value = true;
  assert.deepEqual(view.value, { items: [], status: '' });
});
