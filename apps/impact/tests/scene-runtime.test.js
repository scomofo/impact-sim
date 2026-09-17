import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneLoop } from '../js/scene-runtime.js';

function harness({ frame = () => {}, hidden = false } = {}) {
  const canvas = new EventTarget(), page = new EventTarget();
  page.hidden = hidden;
  const queued = new Map(), deltas = [], failures = [];
  let id = 0;
  const loop = createSceneLoop({ canvas, page,
    frame: (dt) => { deltas.push(dt); frame(dt); },
    onFailure: (error) => failures.push(error),
    requestFrame: (callback) => { queued.set(++id, callback); return id; },
    cancelFrame: (key) => queued.delete(key),
  });
  return { canvas, page, queued, deltas, failures, loop,
    step(now) {
      assert.equal(queued.size, 1, 'exactly one animation frame is scheduled');
      const [key, callback] = [...queued][0]; queued.delete(key); callback(now);
    },
    visibility(hidden) { page.hidden = hidden; page.dispatchEvent(new Event('visibilitychange')); },
  };
}

test('hidden tabs stop frames and resume without advancing through background time', () => {
  const h = harness();
  h.step(1000); h.step(1016);
  assert.deepEqual(h.deltas, [0, 0.016]);
  h.visibility(true);
  assert.equal(h.queued.size, 0);
  h.visibility(false); h.step(61016); h.step(61032);
  assert.deepEqual(h.deltas, [0, 0.016, 0, 0.016]);
  h.loop.stop();
});

test('an initially hidden page waits; long foreground frames are bounded', () => {
  const h = harness({ hidden: true });
  assert.equal(h.queued.size, 0);
  h.visibility(false); h.step(1000); h.step(9000);
  assert.deepEqual(h.deltas, [0, 0.05]);
  h.loop.stop();
});

test('a rendering exception stops the loop and reports failure once', () => {
  const failure = new Error('render failed');
  const h = harness({ frame: () => { throw failure; } });
  h.step(0);
  h.canvas.dispatchEvent(new Event('webglcontextlost'));
  h.visibility(true); h.visibility(false);
  assert.equal(h.queued.size, 0);
  assert.deepEqual(h.failures, [failure]);
});

test('context loss stops pending frames; restoring visibility cannot restart a failed scene', () => {
  const h = harness();
  h.step(0);
  h.canvas.dispatchEvent(new Event('webglcontextlost'));
  h.canvas.dispatchEvent(new Event('webglcontextrestored'));
  h.visibility(true); h.visibility(false);
  assert.equal(h.queued.size, 0);
  assert.equal(h.failures.length, 1);
  assert.match(h.failures[0].message, /context lost/);
  h.loop.stop();
});

test('disposing is idempotent and removes failure and visibility listeners', () => {
  const h = harness();
  h.loop.stop(); h.loop.stop();
  h.canvas.dispatchEvent(new Event('webglcontextlost'));
  h.visibility(true); h.visibility(false);
  assert.equal(h.queued.size, 0);
  assert.deepEqual(h.failures, []);
});
