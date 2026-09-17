import { test } from "node:test";
import assert from "node:assert/strict";
import { ode45, ode4 } from "../src/ode.ts";

const close = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);

test("ode45 integrates the harmonic oscillator to within tolerance", () => {
  const sol = ode45((_t, y) => [y[1]!, -y[0]!], [0, 2 * Math.PI], [1, 0], { RelTol: 1e-8, AbsTol: 1e-10 });
  const last = sol.y[sol.y.length - 1]!;
  close(last[0]!, 1, 1e-6);
  close(last[1]!, 0, 1e-6);
  assert.equal(sol.t[sol.t.length - 1], 2 * Math.PI);
});

test("ode45 returns exactly the requested output times with dense output", () => {
  const ts = [0, 0.5, 1, 1.5, 2];
  const sol = ode45((_t, y) => [y[0]!], ts, [1], { RelTol: 1e-9, AbsTol: 1e-12 });
  assert.deepEqual(sol.t, ts);
  sol.t.forEach((t, i) => close(sol.y[i]![0]!, Math.exp(t), 1e-6));
});

test("ode45 default tolerances match MATLAB's 1e-3 relative accuracy class", () => {
  const sol = ode45((_t, y) => [y[1]!, -y[0]!], [0, 2 * Math.PI], [1, 0]);
  const last = sol.y[sol.y.length - 1]!;
  close(last[0]!, 1, 2e-3);
});

test("ode45 locates terminal events like MATLAB's Events option", () => {
  // Free fall from 10 m; event when height crosses zero going down.
  const sol = ode45((_t, y) => [y[1]!, -9.81], [0, 10], [10, 0], {
    RelTol: 1e-8,
    AbsTol: 1e-10,
    Events: (_t, y) => ({ value: [y[0]!], isterminal: [true], direction: [-1] }),
  });
  assert.equal(sol.te.length, 1);
  close(sol.te[0]!, Math.sqrt(2 * 10 / 9.81), 1e-6);
  close(sol.t[sol.t.length - 1]!, sol.te[0]!, 1e-12);
  close(sol.ye[0]![0]!, 0, 1e-6);
});

test("ode45 integrates backwards in time", () => {
  const sol = ode45((_t, y) => [y[0]!], [1, 0], [Math.E], { RelTol: 1e-9, AbsTol: 1e-12 });
  close(sol.y[sol.y.length - 1]![0]!, 1, 1e-6);
});

test("ode4 fixed-step RK4 is fourth order", () => {
  const f = (_t: number, y: Float64Array) => [y[0]!];
  const err = (h: number) => {
    const n = Math.round(1 / h);
    const ts = Array.from({ length: n + 1 }, (_, i) => i * h);
    const sol = ode4(f, ts, [1]);
    return Math.abs(sol.y[n]![0]! - Math.E);
  };
  const ratio = err(0.1) / err(0.05);
  assert.ok(ratio > 14 && ratio < 18, `order ratio ${ratio}`);
});
