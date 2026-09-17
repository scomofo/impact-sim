import test from 'node:test';
import assert from 'node:assert/strict';
import { waveBandGLSL } from '../js/wave-front.js';

// Execute the same scalar source that effects.js inserts into its GLSL shader.
// Only the function signature and float declarations need syntax translation;
// the envelope expression is not reimplemented in a parallel JS approximation.
// This checks the mask math, not browser shader compilation or GPU rendering.
const scalarSource = waveBandGLSL
  .replace(/float waveBand\(float distanceFromFront, float width, float tailLength\)/,
    'function waveBand(distanceFromFront, width, tailLength)')
  .replace(/\bfloat\s+(\w+)\s*=/g, 'const $1 =');
const waveBand = new Function('max', 'exp', 'pow', `${scalarSource}; return waveBand;`)(
  Math.max, Math.exp, Math.pow,
);

test('a young front leaves distant regions and the antipode unlit', () => {
  const frontArc = 0.04;
  for (const distance of [0.5, Math.PI / 2, Math.PI]) {
    assert.ok(waveBand(distance - frontArc, 0.015, 1.5) < 0.000001,
      `angular distance ${distance} must remain outside the local wave`);
  }
  assert.equal(waveBand(0, 0.015, 1.5), 1, 'the visible ring peaks at its own front');
});

test('passed terrain fades instead of staying uniformly bright behind the front', () => {
  const frontArc = 1;
  assert.ok(waveBand(-frontArc, 0.03, 3) < 0.000001,
    'ground zero does not remain painted by a distant passing wave');
  assert.ok(waveBand(0.1 - frontArc, 0.03, 3) < 0.000001);
  assert.equal(waveBand(0, 0.03, 3), 1);
});

test('a wave has one bounded peak and tapers on both sides of its front', () => {
  for (const [width, tailLength] of [[0.015, 1.5], [0.03, 3], [0.2, 2.5]]) {
    for (const side of [-1, 1]) {
      let previous = waveBand(0, width, tailLength);
      for (const offset of [0.1, 0.5, 1, 3, 10, 30]) {
        const value = waveBand(side * width * offset, width, tailLength);
        assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
        assert.ok(value <= previous, 'brightness falls with distance from the front');
        previous = value;
      }
      assert.ok(previous < 0.000001, 'the remote side has no constant brightness floor');
    }
    assert.ok(waveBand(-1e-10, width, tailLength) > 0.999999,
      'the trailing envelope meets the leading edge without a brightness jump');
    assert.ok(waveBand(1e-10, width, tailLength) > 0.999999);
  }
});

test('the scalar mask remains finite for a zero-width inactive front', () => {
  for (const distance of [-Math.PI, -0.01, 0, 0.01, Math.PI]) {
    const value = waveBand(distance, 0, 0);
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
  }
});
