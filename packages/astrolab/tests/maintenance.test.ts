import { test } from "node:test";
import assert from "node:assert/strict";
import * as K from "../src/maintenance.ts";
import { DAY, MU, RADIUS, YEAR, juliandate } from "../src/astro.ts";
import { createConsole } from "../src/index.ts";

const d2r = Math.PI / 180, r2d = 180 / Math.PI;
/** Genuinely relative comparison: |a - b| <= rel * |b|, with an absolute floor only when b is 0. */
const close = (a: number, b: number, rel = 1e-9, what = "") =>
  assert.ok(Math.abs(a - b) <= (b === 0 ? rel : rel * Math.abs(b)), `${what} ${a} != ${b} (rel ${Math.abs(a - b) / (b === 0 ? 1 : Math.abs(b))})`);

test("exponential atmosphere reproduces Vallado Table 8-4 and its band structure", () => {
  close(K.atmosphericDensity(400e3), 3.725e-12, 1e-9);
  close(K.atmosphericDensity(200e3), 2.789e-10, 1e-9);
  close(K.atmosphericDensity(800e3), 1.170e-14, 1e-9);
  close(K.atmosphericDensity(25e3), 0.03899, 1e-9); // band closed at the bottom
  close(K.atmosphericDensity(410e3), 3.1398e-12, 1e-4);
  close(K.atmosphericDensity(550e3), 3.1828e-13, 1e-4);
  close(K.atmosphericDensity(1200e3), 1.4314e-15, 1e-4);
  // Adjacent bands are continuous to better than 0.2 %.
  for (let i = 1; i < K.DENSITY_TABLE.length; i++) {
    const below = K.atmosphericDensity(K.DENSITY_TABLE[i]![0] * 1e3 - 1e-3);
    const at = K.DENSITY_TABLE[i]![1];
    assert.ok(Math.abs(below / at - 1) < 2e-3, `band ${i}`);
  }
  assert.ok(K.atmosphericDensity(400e3, "low") < K.atmosphericDensity(400e3) && K.atmosphericDensity(400e3, "high") > K.atmosphericDensity(400e3));
  close(K.solarActivityFactor(400e3, "high"), 2.78, 1e-9);
});

test("ISS-class drag decay, reboost cycle and cubesat lifetimes", () => {
  const a = RADIUS.earth + 410e3;
  const d = K.dragDecay(a, 100, K.atmosphericDensity(410e3));
  close(d.dadt * DAY, -141.11, 5e-3, "da/dt m/day");
  close(d.daPerRev, -9.0905, 5e-3);
  close(d.dvPerRev, 5.131e-3, 5e-3);
  close(d.dvPerYear, 29.09, 5e-3);
  close(d.dPPerRev, -0.011181, 5e-3);
  const rb = K.reboostCycle(420e3, 20e3, 100);
  close(rb.interval / DAY, 142.4, 5e-3, "reboost interval");
  close(rb.dvPerReboost, 11.2887, 1e-4);
  close(rb.dvPerYear, 28.95, 5e-3);
  // The annualised deadband dv equals continuous make-up at the band's mid altitude (within 1 %),
  // whatever the deadband width; the reboost count scales with the width.
  close(rb.dvPerYear, K.dragDecay(RADIUS.earth + 410e3, 100, K.atmosphericDensity(410e3)).dvPerYear, 1e-2, "20 km band");
  const rb5 = K.reboostCycle(420e3, 5e3, 100);
  close(rb5.dvPerYear, K.dragDecay(RADIUS.earth + 417.5e3, 100, K.atmosphericDensity(417.5e3)).dvPerYear, 1e-2, "5 km band");
  assert.ok(rb5.reboostsPerYear > 3.5 * rb.reboostsPerYear);
  close(K.orbitLifetime(400e3, 60.606) / DAY, 187.5, 5e-3, "3U 400 km");
  close(K.orbitLifetime(550e3, 60.606) / YEAR, 7.08, 5e-3, "3U 550 km");
  assert.equal(K.orbitLifetime(90e3, 60), 0);
  close(K.rotatingAtmosphereFactor(RADIUS.earth + 400e3, 51.6 * d2r), 0.9215, 1e-3);
  close(K.rotatingAtmosphereFactor(RADIUS.earth + 400e3, Math.PI / 2), 1, 1e-12);
  // Published sanity band: ISS-class drag make-up is tens of m/s per year over a solar cycle.
  const issYear = K.dragDecay(a, 100, K.atmosphericDensity(410e3)).dvPerYear * K.rotatingAtmosphereFactor(a, 51.6 * d2r);
  assert.ok(issYear > 15 && issYear < 50, `ISS drag make-up ${issYear} m/s/yr`);
  // Lifetime is set by the decay, not by where the integration is stopped.
  close(K.orbitLifetime(400e3, 60.606, "mean", 120e3) / DAY, K.orbitLifetime(400e3, 60.606) / DAY, 2e-2, "stop altitude");
  // The per-revolution drop is the decay rate times the Keplerian period.
  const T = 2 * Math.PI * Math.sqrt(a ** 3 / MU.earth);
  close(d.daPerRev, d.dadt * T, 1e-12, "da per rev");
  close(d.dvPerRev * (YEAR / T), d.dvPerYear, 1e-12, "dv per rev");
  // Struct shape the console builtins depend on.
  assert.deepEqual(Object.keys(d).sort(), ["aD", "beta", "dPPerRev", "dadt", "daPerRev", "dvPerRev", "dvPerYear", "period", "rho"].sort());
  assert.deepEqual(Object.keys(rb).sort(), ["dvPerReboost", "dvPerYear", "interval", "reboostsPerYear"].sort());
});

test("J2 secular rates, sun-synchronous and repeat ground tracks", () => {
  const gps = K.j2Rates(26560e3, 0, 55 * d2r);
  close(gps.raanDot * r2d * DAY, -0.03878, 2e-3);
  close(gps.nodalPeriod, 43076.48, 1e-5);
  const iss = K.j2Rates(RADIUS.earth + 400e3, 0, 51.6 * d2r);
  close(iss.raanDot * r2d * DAY, -5.0023, 1e-3);
  close(iss.nodalPeriod, 5549.29, 1e-5);
  close(iss.anomalisticPeriod, 5553.0, 1e-4);
  close(iss.revsPerNodalDay, 15.3148, 1e-4);
  const sso = K.j2Rates(RADIUS.earth + 700e3, 0, 98 * d2r);
  close(sso.raanDot * r2d * DAY, 0.9632, 2e-3);
  assert.ok(Math.abs(K.j2Rates(26554e3, 0.74, K.CRITICAL_INCLINATION).argpDot) < 1e-18);
  // Molniya apsidal rotation away from the critical inclination, and an equatorial orbit's prograde perigee drift.
  const mol = K.j2Rates(26554e3, 0.74, 70 * d2r);
  const pMol = 26554e3 * (1 - 0.74 ** 2), nMol = Math.sqrt(MU.earth / 26554e3 ** 3);
  close(mol.argpDot, 1.5 * nMol * K.J2_BODIES.earth.j2 * (K.J2_BODIES.earth.radius / pMol) ** 2 * (2 - 2.5 * Math.sin(70 * d2r) ** 2), 1e-12, "molniya argp");
  assert.ok(mol.argpDot < 0, "apsides regress above the critical inclination");
  assert.ok(K.j2Rates(7000e3, 0, 0).argpDot > 0 && K.j2Rates(7000e3, 0, Math.PI / 2).argpDot < 0);
  assert.ok(Math.abs(K.j2Rates(7000e3, 0, Math.PI / 2).raanDot) < 1e-18);
  close(K.sunSyncInclination(RADIUS.earth + 500e3) * r2d, 97.402, 2e-4);
  close(K.sunSyncInclination(RADIUS.earth + 800e3) * r2d, 98.603, 2e-4);
  close(K.sunSyncInclination(RADIUS.earth + 1000e3) * r2d, 99.479, 3e-4);
  assert.ok(Number.isNaN(K.sunSyncInclination(RADIUS.earth + 7000e3)));
  close(K.sunSyncSemiMajorAxis(K.sunSyncInclination(RADIUS.earth + 800e3)), RADIUS.earth + 800e3, 1e-9);
  // Round trip: the RAAN rate at the SSO inclination equals the target.
  close(K.j2Rates(RADIUS.earth + 800e3, 0, K.sunSyncInclination(RADIUS.earth + 800e3)).raanDot, K.SUN_SYNC_RATE, 1e-9);
  // GEO node rate and the Mars scaling check.
  close(K.j2Rates(42164e3, 0, 0.1 * d2r).raanDot * r2d * DAY, -0.013414, 2e-4);
  close(K.sunSyncInclination(3396.0e3 + 400e3, 0, "mars", (2 * Math.PI) / (686.98 * DAY)) * r2d, 92.92, 2e-3);
  assert.throws(() => K.j2Rates(7000e3, 0.2, 0.5), /below the surface/);
});

test("GEO lunisolar inclination drift by year", () => {
  close(K.A_GEO, 42164173, 1e-6);
  close(K.V_GEO, 3074.66, 1e-5);
  const g2006 = K.geoInclinationDrift(juliandate(2006, 7, 2));
  close(g2006.sunRate * r2d * YEAR, 0.2690, 2e-3);
  close(g2006.moonRate * r2d * YEAR, 0.6747, 2e-3);
  close(g2006.totalRate * r2d * YEAR, 0.9437, 2e-3);
  close(K.V_GEO * g2006.totalRate * YEAR, 50.64, 2e-3);
  const g2015 = K.geoInclinationDrift(juliandate(2015, 7, 2));
  close(g2015.totalRate * r2d * YEAR, 0.7482, 2e-3);
  close(K.lunarNodeLongitude(juliandate(2015, 7, 2)) * r2d, 185.3, 1e-3);
  // Sun drifts the vector toward RAAN 90 deg; the Moon at node 90 deg gives (-0.1316, +0.5814) deg/yr.
  close(g2006.sun[0] * r2d * YEAR, 0, 1e-9);
  close(g2006.sun[1] * r2d * YEAR, 0.2690, 2e-3);
  // Find a date with the node near 90 deg.
  let jd = juliandate(2000, 1, 1);
  while (Math.abs(K.lunarNodeLongitude(jd) - Math.PI / 2) > 1e-4) jd += 0.05;
  const g90 = K.geoInclinationDrift(jd);
  close(g90.moon[0] * r2d * YEAR, -0.1316, 5e-3);
  close(g90.moon[1] * r2d * YEAR, 0.5814, 5e-3);
  close(g90.totalRate * r2d * YEAR, 0.8605, 3e-3);
  const ns = K.geoNorthSouth(juliandate(2027, 7, 2), 0.05 * d2r);
  const rate2027 = K.geoInclinationDrift(juliandate(2027, 7, 2)).totalRate;
  close(ns.rate, rate2027, 1e-12, "ns rate");
  close(ns.dvPerBurn, 2 * K.V_GEO * Math.sin(0.05 * d2r), 1e-12, "dv per burn");
  close(ns.dvPerBurn, 5.366, 1e-3);
  close(ns.dvPerYear, K.V_GEO * rate2027 * YEAR, 1e-12, "ns dv/yr");
  // Crossing the 0.1 deg band at the 2027 drift rate takes about 47 days.
  close(ns.interval / DAY, (2 * 0.05 * d2r) / rate2027 / DAY, 1e-12);
  assert.ok(ns.interval / DAY > 30 && ns.interval / DAY < 70, `ns interval ${ns.interval / DAY} d`);
  close(ns.burnsPerYear * ns.dvPerBurn, ns.dvPerYear, 2e-3, "burns x dv");
  // A zero tolerance means continuous control: no interval, no per-burn dv.
  const tight = K.geoNorthSouth(juliandate(2027, 7, 2), 0);
  assert.equal(tight.interval, 0);
  close(tight.dvPerYear, ns.dvPerYear, 1e-12);
});

test("GEO east-west triaxiality cycle and solar-pressure eccentricity", () => {
  close(K.J22, 1.81543e-6, 1e-4);
  close(K.LAMBDA_22 * r2d, -14.929, 1e-4);
  close(K.geoLongitudeAcceleration(30.07 * d2r) * r2d * DAY * DAY, 1.7006e-3, 1e-3);
  close(K.geoLongitudeAcceleration(0) * r2d * DAY * DAY, 8.47e-4, 3e-3);
  close(K.geoLongitudeAcceleration(100 * d2r) * r2d * DAY * DAY, -1.300e-3, 3e-3);
  assert.ok(Math.abs(K.geoLongitudeAcceleration(K.LAMBDA_22 + Math.PI / 2)) < 1e-25);
  const ew = K.geoEastWest(30.07 * d2r, 0.05 * d2r);
  close(ew.dvPerYear, 1.7635, 1e-3);
  close(ew.cycle / DAY, 21.69, 2e-3);
  close(ew.dvPerManeuver, 0.1047, 2e-3);
  close(ew.maneuversPerYear, 16.84, 2e-3);
  close(ew.stable[0] * r2d, 75.07, 1e-3);
  close(ew.stable[1] * r2d, -104.93, 1e-3);
  close(ew.unstable[1] * r2d, 165.07, 1e-3);
  // Annual dv is independent of the box; cycle time scales with sqrt(box).
  const wide = K.geoEastWest(30.07 * d2r, 0.2 * d2r);
  close(wide.dvPerYear, ew.dvPerYear, 1e-12);
  close(wide.cycle / ew.cycle, 2, 1e-9);
  assert.equal(K.geoEastWest(K.LAMBDA_22 + Math.PI / 2, 0.05 * d2r).cycle, Infinity);
  close(K.GEO_LIBRATION_PERIOD / DAY, 815.5, 2e-3);
  const srp = K.srpEccentricity(1.3, 0.05);
  close(srp.aSrp, 2.964e-7, 1e-3);
  close(srp.eNatural, 7.263e-4, 1e-3);
  close(srp.libration * r2d, 0.0832, 2e-3);
  close(srp.dvCancelPerYear, 7.02, 2e-3);
});

test("mission propellant telescopes to the rocket equation", () => {
  const p = K.missionPropellant(3000, 50, 15, 300);
  close(p.propellant, 675.09, 1e-4);
  close(p.perYear[0]!, 50.555, 1e-4);
  close(p.perYear[14]!, 39.850, 1e-4);
  close(p.perYear.reduce((s, x) => s + x, 0), p.propellant, 1e-9);
  close(K.missionPropellant(3000, 50, 15, 1800).propellant, 124.79, 1e-4);
  close(K.propellantFromDry(3000, 750, 300), 871.11, 1e-4);
  close(K.missionPropellant(3000, 50, 15, 300, 0.05).propellant, 704.53, 1e-4);
});

test("maintenance functions are exposed to the console", () => {
  let out = "";
  const c = createConsole({ print: (s) => (out += s) });
  c.run(`
    d = drag_decay(410e3, 420000, 2000, 2.1);
    rb = reboost(420e3, 20e3, 420000, 2000, 2.1);
    j = j2_rates(26560e3, 0, deg2rad(55));
    ew = geo_ew(deg2rad(30.07), deg2rad(0.05));
    g = geo_inc_drift(juliandate(2006, 7, 2));
    b = mission_prop(3000, 50, 15, 300);
    fprintf('%.1f %.1f %.4f %.3f %.3f %.1f %.1f\\n', d.dv_year, rb.interval / 86400, rad2deg(j.raan_dot) * 86400, ew.dv_year, rad2deg(g.total) * 365.25 * 86400, b.propellant, rad2deg(sunsync_inc(R_earth + 800e3)));
  `);
  assert.equal(out, "29.1 142.4 -0.0388 1.764 0.944 675.1 98.6\n");
});
