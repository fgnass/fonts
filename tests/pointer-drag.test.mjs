import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const url = (s) => `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const hooks = url('export const cleanups = []; export const useRef = (current) => ({ current }); export const useEffect = (effect) => cleanups.push(effect());');
const source = stripTypeScriptTypes(fs.readFileSync(new URL('../src/components/usePointerDrag.ts', import.meta.url), 'utf8'));
const { usePointerDrag } = await import(url(source.replace("'preact/hooks'", JSON.stringify(hooks))));
const { cleanups } = await import(hooks);
const emit = (target, type, buttons = 1) => target.dispatchEvent(Object.assign(new Event(type), { buttons }));

for (const reason of ['pointerup', 'pointercancel', 'blur', 'lostpointercapture', 'released buttons', 'unmount']) {
  test(`drag stops updating after ${reason}`, () => {
    const originalWindow = globalThis.window;
    globalThis.window = new EventTarget();
    try {
      const node = Object.assign(new EventTarget(), { dataset: {}, setPointerCapture() {} });
      const start = usePointerDrag({ current: node }, true);
      let moves = 0;
      start({ pointerId: 1 }, () => moves++);
      assert.equal(node.dataset.dragging, '');
      emit(window, 'pointermove');
      assert.equal(moves, 1);
      if (reason === 'unmount') cleanups.at(-1)();
      else if (reason === 'released buttons') emit(window, 'pointermove', 0);
      else emit(reason === 'lostpointercapture' ? node : window, reason);
      emit(window, 'pointermove');
      assert.equal(moves, 1);
      assert.equal(node.dataset.dragging, undefined);
    } finally {
      globalThis.window = originalWindow;
    }
  });
}

test('a replacement drag removes the previous callback even when pointer capture fails', () => {
  const originalWindow = globalThis.window;
  globalThis.window = new EventTarget();
  try {
    const node = Object.assign(new EventTarget(), { dataset: {}, setPointerCapture() { throw new Error('capture unavailable'); } });
    const start = usePointerDrag({ current: node });
    let first = 0, second = 0;
    start({ pointerId: 1 }, () => first++);
    start({ pointerId: 2 }, () => second++);
    emit(window, 'pointermove');
    assert.equal(first, 0);
    assert.equal(second, 1);
    cleanups.at(-1)();
    emit(window, 'pointermove');
    assert.equal(second, 1);
  } finally {
    globalThis.window = originalWindow;
  }
});
