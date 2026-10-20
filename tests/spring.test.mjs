import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const source = stripTypeScriptTypes(await readFile(new URL('../src/spring.ts', import.meta.url), 'utf8'));
const { stepSpring } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('motion is independent of render/update frequency', () => {
  const expected = stepSpring(400, -300, 0.3);
  let actual = [400, -300];
  for (let frame = 0; frame < 36; frame++) actual = stepSpring(...actual, 1 / 120);
  assert.ok(Math.abs(actual[0] - expected[0]) < 1e-8);
  assert.ok(Math.abs(actual[1] - expected[1]) < 1e-8);
});

test('a new destination preserves movement instead of restarting from rest', () => {
  const [position, velocity] = stepSpring(400, 0, 0.08);
  const shifted = position + 30;
  const [next, nextVelocity] = stepSpring(shifted, velocity, 1 / 120);
  const [restarted] = stepSpring(shifted, 0, 1 / 120);
  assert.ok(next < restarted - 5);
  assert.ok(nextVelocity < 0);
  assert.deepEqual(stepSpring(shifted, velocity, 0), [shifted, velocity]);
});

test('motion settles without overshoot from rest', () => {
  let state = [600, 0];
  for (let frame = 0; frame < 120; frame++) {
    const next = stepSpring(...state, 1 / 60);
    assert.ok(next[0] >= 0 && next[0] <= state[0]);
    state = next;
  }
  assert.ok(state[0] < 0.1 && Math.abs(state[1]) < 1);
});
