import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "../src/astro.ts";
import { impact } from "../src/impact.ts";
import { fzero, polyfit, interp1, trapz, deg2rad, rad2deg } from "../src/numeric.ts";

const close = (a: number, b: number, rel = 1e-9) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test("Kepler's equation solver is exact for the inverse relation", () => {
  for (const e of [0, 0.1, 0.5, 0.9, 0.99]) {
    for (let M = 0; M < 2 * Math.PI; M += 0.37) {
      const E = A.keplerE(M, e);
      close(E - e * Math.sin(E), M % (2 * Math.PI), 1e-10);
    }
  }
});

test("kepler2cart/cart2kepler round-trip (Curtis example 4.3 / 4.7)", () => {
  const mu = 398600e9;
  // Curtis Example 4.7: h = 80000 km²/s, e = 1.4, i = 30°, Ω = 40°, ω = 60°, θ = 30°.
  const h = 80000e6, e = 1.4;
  const a = (h * h) / (mu * (1 - e * e));
  const el = { a, e, i: deg2rad(30), raan: deg2rad(40), argp: deg2rad(60), nu: deg2rad(30) };
  const sv = A.kepler2cart(el, mu);
  close(sv.r[0]! / 1e3, -4040, 1e-3);
  close(sv.r[1]! / 1e3, 4815, 1e-3);
  close(sv.r[2]! / 1e3, 3629, 1e-3);
  close(sv.v[0]! / 1e3, -10.39, 1e-3);
  close(sv.v[1]! / 1e3, -4.772, 1e-3);
  close(sv.v[2]! / 1e3, 1.744, 1e-3);
  const back = A.cart2kepler(sv, mu);
  close(back.e, e, 1e-9);
  close(back.i, el.i, 1e-9);
  close(back.raan, el.raan, 1e-9);
  close(back.argp, el.argp, 1e-9);
  close(back.nu, el.nu, 1e-9);
});

test("cart2kepler (Curtis example 4.3)", () => {
  const mu = 398600e9;
  const el = A.cart2kepler({ r: [-6045e3, -3490e3, 2500e3], v: [-3.457e3, 6.618e3, 2.533e3] }, mu);
  close(el.e, 0.1712, 1e-3);
  close(rad2deg(el.i), 153.2, 1e-3);
  close(rad2deg(el.raan), 255.3, 1e-3);
  close(rad2deg(el.argp), 20.07, 1e-3);
  close(rad2deg(el.nu), 28.45, 1e-3);
  close(el.a / 1e3, 8788, 1e-3);
});

test("Hohmann LEO→GEO delta-v is about 3.9 km/s", () => {
  const h = A.hohmann(A.RADIUS.earth + 300e3, 42164e3, A.MU.earth);
  close(h.dvTotal, 3893, 1e-3);
  close(h.tof / 3600, 5.275, 1e-3);
});

test("numerical propagation over one period returns to the start", () => {
  const mu = A.MU.earth;
  const sv = A.kepler2cart({ a: 7000e3, e: 0.05, i: 0.9, raan: 0.3, argp: 1.2, nu: 0 }, mu);
  const T = A.period(7000e3, mu);
  const sol = A.propagate(sv, mu, [0, T]);
  const last = sol.y[sol.y.length - 1]!;
  close(last[0]!, sv.r[0]!, 1e-6);
  close(last[1]!, sv.r[1]!, 1e-6);
  const analytic = A.propagateKepler(sv, mu, T / 3);
  const mid = A.propagate(sv, mu, [0, T / 3]).y.at(-1)!;
  close(mid[0]!, analytic.r[0]!, 1e-6);
  close(mid[4]!, analytic.v[1]!, 1e-6);
});

test("Lambert (Curtis example 5.2)", () => {
  const mu = 398600e9;
  const { v1, v2 } = A.lambert([5000e3, 10000e3, 2100e3], [-14600e3, 2500e3, 7000e3], 3600, mu, true);
  close(v1[0]! / 1e3, -5.9925, 1e-3);
  close(v1[1]! / 1e3, 1.9254, 1e-3);
  close(v1[2]! / 1e3, 3.2456, 1e-3);
  close(v2[0]! / 1e3, -3.3125, 1e-3);
  close(v2[1]! / 1e3, -4.1966, 1e-3);
  close(v2[2]! / 1e3, -0.38529, 1e-3);
});

test("Earth–Moon Lagrange points", () => {
  const mu = 0.01215;
  const L = A.lagrangePoints(mu);
  close(L.L1, 0.8369, 1e-3);
  close(L.L2, 1.1557, 1e-3);
  close(L.L3, -1.0051, 1e-3);
  // Jacobi constant is conserved along a CR3BP trajectory.
  const rhs = A.cr3bpRhs(mu);
  const y0 = [0.5, 0.2, 0, 0.1, 0.9, 0];
  const c0 = A.jacobiConstant(mu, y0);
  const { ode45 } = require_ode();
  const sol = ode45(rhs, [0, 3], y0, { RelTol: 1e-11, AbsTol: 1e-13 });
  close(A.jacobiConstant(mu, sol.y.at(-1)!), c0, 1e-7);
});

import * as ODE from "../src/ode.ts";
function require_ode() { return ODE; }

test("impact scaling reproduces the Collins et al. worked example", () => {
  // Barringer-class: 50 m iron, 20 km/s, 45°, crystalline target.
  const r = impact({ diameter: 50, density: 7860, speed: 20e3, angle: Math.PI / 4, targetDensity: 2750 });
  const expectedTransient = 1.161 * Math.cbrt(7860 / 2750) * 50 ** 0.78 * 20e3 ** 0.44 * 9.80665 ** -0.22 * Math.cbrt(Math.sin(Math.PI / 4));
  close(r.transientDiameter, expectedTransient, 1e-12);
  close(r.finalDiameter, 1.25 * expectedTransient, 1e-12);
  assert.ok(!r.complex);
  close(r.energyMt, 24.59, 1e-3);
  // A 1 km stony body makes a complex crater tens of km across.
  const big = impact({ diameter: 1000, density: 2700, speed: 20e3, angle: Math.PI / 4 });
  assert.ok(big.complex && big.finalDiameter > 10e3 && big.finalDiameter < 25e3, `D=${big.finalDiameter}`);
});

test("numeric helpers", () => {
  close(fzero((x) => Math.cos(x) - x, 0.5), 0.7390851332151607, 1e-10);
  close(fzero((x) => x * x - 2, [0, 2]), Math.SQRT2, 1e-10);
  const p = polyfit([0, 1, 2, 3], [1, 3, 5, 7], 1);
  close(p[0]!, 2, 1e-10); close(p[1]!, 1, 1e-10);
  assert.deepEqual(interp1([0, 1, 2], [0, 10, 20], [0.5, 1.5, 3]), [5, 15, NaN]);
  close(trapz([0, 1, 2], [0, 1, 4]), 3, 1e-12);
});

test("planet ephemerides and Julian dates", () => {
  assert.equal(A.juliandate(2000, 1, 1, 12), 2451545);
  assert.deepEqual(A.jd2date(2451545).year, 2000);
  const e = A.planetState("earth", A.juliandate(2020, 7, 30));
  close(A.v3.norm(e.r) / A.AU, 1.015, 2e-3);
  close(A.v3.norm(e.v) / 1e3, 29.3, 5e-3);
  const m = A.planetState("mars", A.juliandate(2021, 2, 18));
  assert.ok(Math.abs(A.v3.norm(m.r) / A.AU - 1.57) < 0.03);
});

test("Earth–Mars 2020 porkchop minimum matches the real launch window", () => {
  const dep = Array.from({ length: 60 }, (_, k) => A.juliandate(2020, 6, 1) + 2 * k);
  const arr = Array.from({ length: 80 }, (_, k) => A.juliandate(2020, 11, 1) + 3 * k);
  const p = A.porkchop("earth", "mars", dep, arr);
  assert.ok(p.best.c3 > 11 && p.best.c3 < 16, `C3=${p.best.c3}`);
  const d = A.jd2date(p.best.jdDep), a = A.jd2date(p.best.jdArr);
  assert.ok(d.year === 2020 && d.month >= 7 && d.month <= 8, `dep ${d.month}/${d.year}`);
  assert.ok(a.year === 2021 && a.month >= 1 && a.month <= 3, `arr ${a.month}/${a.year}`);
  assert.equal(p.c3.length, arr.length);
  assert.equal(p.c3[0]!.length, dep.length);
  // Arrival before departure is not a transfer.
  assert.ok(Number.isNaN(p.c3[0]![dep.length - 1]!) || p.tof[0]![dep.length - 1]! > 1);
});

test("patched-conic departure and capture burns", () => {
  // Earth departure at C3 = 12 km²/s² from a 300 km parking orbit ≈ 3.74 km/s.
  const dv = A.escapeDeltaV(Math.sqrt(12) * 1e3, A.RADIUS.earth + 300e3, A.MU.earth);
  assert.ok(dv > 3700 && dv < 3780, `dv=${dv}`);
  // Zero excess speed reduces to circular-to-escape: (sqrt(2) - 1) v_circ.
  const r = 7000e3;
  close(A.escapeDeltaV(0, r, A.MU.earth), (Math.SQRT2 - 1) * A.circularSpeed(r, A.MU.earth), 1e-12);
  // Capture into a circular orbit costs more than into an eccentric one at the same periapsis.
  const circ = A.captureDeltaV(2.6e3, A.RADIUS.mars + 400e3, A.MU.mars, 0);
  const ell = A.captureDeltaV(2.6e3, A.RADIUS.mars + 400e3, A.MU.mars, 0.9);
  assert.ok(circ > 1900 && circ < 2200 && ell < circ, `circ=${circ} ell=${ell}`);
  close(A.propellantFraction(9.80665 * 320 * Math.LN2, 320), 0.5, 1e-12);
});

import { entry, ATMOSPHERES, density } from "../src/entry.ts";

test("atmospheric entry reproduces capsule-class loads", () => {
  const d2r = Math.PI / 180;
  close(density(ATMOSPHERES.earth!, 0), 1.225, 1e-12);
  // Ballistic Soyuz-class from LEO: 8–10 g, lands ~2000–2500 km downrange.
  const soyuz = entry("earth", 7600, -1.5 * d2r, 120e3, { mass: 2900, area: 3.8, cd: 1.3, noseRadius: 2.2, stopSpeed: 200 });
  assert.equal(soyuz.outcome, "slowed");
  assert.ok(soyuz.peakDecel / 9.81 > 7 && soyuz.peakDecel / 9.81 < 11, `g=${soyuz.peakDecel / 9.81}`);
  assert.ok(soyuz.range.at(-1)! > 1500e3 && soyuz.range.at(-1)! < 3000e3);
  // MSL-class Mars entry: ~9–13 g, laminar peak heating a few tens of W/cm².
  const msl = entry("mars", 5800, -15.5 * d2r, 125e3, { mass: 3300, area: 15.9, cd: 1.45, ld: 0.24, noseRadius: 2.25, stopSpeed: 400 });
  assert.equal(msl.outcome, "slowed");
  assert.ok(msl.peakDecel / 9.81 > 7 && msl.peakDecel / 9.81 < 14, `g=${msl.peakDecel / 9.81}`);
  assert.ok(msl.peakQdot / 1e4 > 25 && msl.peakQdot / 1e4 < 80, `q=${msl.peakQdot / 1e4}`);
  // Shallow lifting lunar return skips out; steep one does not.
  const shallow = entry("earth", 11000, -5 * d2r, 122e3, { mass: 5500, area: 12, cd: 1.3, ld: 0.3, noseRadius: 4.7 });
  assert.equal(shallow.outcome, "skipped-out");
  const steep = entry("earth", 11000, -7.5 * d2r, 122e3, { mass: 5500, area: 12, cd: 1.3, ld: 0.3, noseRadius: 4.7, stopSpeed: 150 });
  assert.equal(steep.outcome, "slowed");
  assert.ok(steep.peakDecel > shallow.peakDecel);
  assert.throws(() => entry("pluto", 1, -1, 1, { mass: 1, area: 1, cd: 1 }), /no atmosphere model/);
});

test("entry is exposed to the console with a struct of options", () => {
  const { createConsole } = require_index();
  let out = "";
  const c = createConsole({ print: (s: string) => (out += s) });
  c.run("e = entry('earth', 7600, deg2rad(-1.5), 120e3, struct('m', 2900, 'A', 3.8, 'CD', 1.3, 'v_stop', 200)); fprintf('%s %.1f\\n', e.outcome, e.peak_decel / g0);");
  assert.match(out, /^slowed (8|9|10)\.\d\n$/);
});
import * as IDX from "../src/index.ts";
function require_index() { return IDX; }

test("gravity assist turn angle and energy change", () => {
  // Turn angle → 180° as rp → 0 and → 0 as rp → ∞; e = 1 + rp v²/μ.
  close(A.turnAngle(1e3, 1e30, A.MU.jupiter), 0, 1e-9);
  assert.ok(A.turnAngle(5.6e3, A.RADIUS.jupiter, A.MU.jupiter) > 2.7);
  // Trailing-side pass adds heliocentric speed; leading-side removes the same amount (planar, symmetric).
  const vPlanet: A.Vec3 = [0, 13.07e3, 0];
  const vinfIn: A.Vec3 = [5.6e3 * Math.sin(2.1), 5.6e3 * Math.cos(2.1), 0];
  const axis = A.v3.cross(vinfIn, vPlanet);
  // A wide pass keeps the turn modest so the leading side clearly slows the spacecraft.
  const rp = A.RADIUS.jupiter * 40;
  const trailing = A.gravityAssist(vinfIn, rp, A.MU.jupiter, axis);
  const leading = A.gravityAssist(vinfIn, rp, A.MU.jupiter, A.v3.scale(axis, -1));
  close(A.v3.norm(trailing.vinfOut), A.v3.norm(vinfIn), 1e-9);
  const vIn = A.v3.norm(A.v3.add(vPlanet, vinfIn));
  const vTrail = A.v3.norm(A.v3.add(vPlanet, trailing.vinfOut));
  const vLead = A.v3.norm(A.v3.add(vPlanet, leading.vinfOut));
  assert.ok(vTrail > vIn && vLead < vIn, `in=${vIn} trail=${vTrail} lead=${vLead}`);
  close(A.v3.norm(trailing.deltaV), 2 * A.v3.norm(vinfIn) * Math.sin(trailing.delta / 2), 1e-9);
});
