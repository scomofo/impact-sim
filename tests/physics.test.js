import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeImpact, observerReport, impactorMass, simulateEntry, craterResults,
  peakOverpressure, blastDamage, seismicMagnitude, seismicAtDistance,
  tsunamiAtDistance, thermalAtDistance, burnRadius, EARTH, MT_TNT,
  COMPOSITIONS, TARGETS, MAX_DISTANCE,
} from '../js/physics.js';
import { CATALOG } from '../js/catalog.js';

const nominal = { diameter: 1750, density: 2700, velocity: 20000, angleDeg: 45, target: 'crystalline' };
function near(actual, expected, relative = 0.03) {
  assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * relative,
    `${actual} is not within ${relative * 100}% of ${expected}`);
}
function assertFinite(value, path = 'result') {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `${path}: ${value}`);
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) assertFinite(child, `${path}.${key}`);
  }
}

test('sphere mass and kinetic energy have the expected dimensions and scaling', () => {
  near(impactorMass(10, 3000), 1570796.3267948965, 1e-12);
  const first = computeImpact(nominal);
  near(computeImpact({ ...nominal, diameter: 3500 }).energy / first.energy, 8, 1e-12);
  near(computeImpact({ ...nominal, velocity: 40000 }).energy / first.energy, 4, 1e-12);
});

test('reject invalid inputs before calculating, including unknown targets', () => {
  for (const key of ['diameter', 'density', 'velocity', 'angleDeg']) {
    for (const value of [NaN, Infinity, -Infinity, undefined, null, '1000', 0, -1]) {
      assert.throws(() => computeImpact({ ...nominal, [key]: value }), RangeError);
    }
  }
  for (const extra of [{ target: 'oceen' }, { target: 'toString' }, { diameter: 7420001 },
    { velocity: 72001 }, { angleDeg: 91 }, { waterDepth: 50 }, { waterDepth: -1 }]) {
    assert.throws(() => computeImpact({ ...nominal, ...extra }), RangeError);
  }
  assert.throws(() => computeImpact(), TypeError);
});

// Independent, rounded reference values from Collins et al. 2005 Table 6.
// https://doi.org/10.1111/j.1945-5100.2005.tb00157.x
test('published 40 m iron benchmark: deceleration, crater and distant blast', () => {
  const res = computeImpact({ ...nominal, diameter: 40, density: 8000, target: 'sedimentary' });
  const obs = observerReport(res, 200000);
  near(res.vSurface, 10000);
  near(res.energySurf, 1.3e16);
  near(res.crater.Dfr, 1200);
  near(res.seismic, 4.9, 0.01);
  near(obs.blast.p, 400);
  near(obs.blast.wind, 0.96);
  assert.equal(obs.thermal, null);
  assert.equal(obs.ejecta.thickness, 0);
  assert.equal(obs.blast.damage, null);
});

test('published 1.75 km rock benchmark: thermal, crater, blast and arrival', () => {
  const res = computeImpact(nominal);
  const obs = observerReport(res, 200000);
  near(res.energySurf, 1.5e21);
  near(res.crater.Dfr, 23700);
  near(res.fireball, 23000);
  near(obs.thermal.exposure, 14.8e6);
  near(obs.thermal.duration, 300);
  near(res.seismic, 8.3, 0.01);
  near(obs.blast.p, 80000);
  near(obs.blast.wind, 145);
  near(obs.ejecta.arrival, 206);
  near(obs.ejecta.thickness, 0.09, 0.15); // table and equation differ ~10%
  near(obs.blast.arrival, 606, 0.001);
});

test('large-event crater benchmark is retained but blast extrapolation is flagged', () => {
  const res = computeImpact({ ...nominal, diameter: 18000 });
  near(res.crater.Dfr, 186000);
  near(res.seismic, 10.4, 0.01);
  assert.equal(observerReport(res, 200000).blast.unreliable, true);
});

test('entry is continuous across the former 1 km atmosphere cutoff', () => {
  const entry = (L0) => simulateEntry({ L0, rhoI: 1000, v0: 20000, angleDeg: 5 });
  const below = entry(999.99), above = entry(1000.01);
  assert.equal(below.outcome, above.outcome);
  near(below.vSurface ?? below.vBurst, above.vSurface ?? above.vBurst, 0.001);
  assert.ok((above.vSurface ?? above.vBurst) < 20000);
});

test('airburst accounts for deposited and remaining energy; yield is explicit', () => {
  const res = computeImpact({ diameter: 20, density: 3000, velocity: 19000, angleDeg: 18 });
  assert.equal(res.regime, 'airburst');
  near(res.energyMt, 0.5421199559970914, 1e-12);
  assert.ok(res.burstAlt > 25000 && res.burstAlt < 40000);
  assert.ok(res.burstAlt < res.breakupAlt);
  near(res.depositedEnergy + res.residualEnergy, res.energy, 1e-12);
  assert.equal(res.blastEnergy, res.energy);
  assert.notEqual(res.blastEnergy, res.residualEnergy);
  const obs = observerReport(res, 0);
  assert.ok(obs.blast.arrival > 0);
  near(obs.blast.arrival, res.burstAlt / 330, 1e-12);
  assertFinite(obs);
});

test('ocean energy loss affects solid-ground effects, preserving surface blast and heat', () => {
  const dry = computeImpact(nominal);
  const wet = computeImpact({ ...nominal, target: 'ocean', waterDepth: 3800 });
  assert.equal(wet.energySurf, dry.energySurf);
  assert.ok(wet.energySeafloor < wet.energySurf);
  assert.ok(wet.seismic < dry.seismic);
  assert.ok(wet.melt < dry.melt);
  near(wet.seismic, seismicMagnitude(wet.energySeafloor), 1e-12);
  near(wet.energySeafloor + wet.waterDepositedEnergy + wet.depositedEnergy, wet.energy, 1e-12);
  const dryObs = observerReport(dry, 200000), wetObs = observerReport(wet, 200000);
  assert.equal(wetObs.blast.p, dryObs.blast.p);
  assert.equal(wetObs.thermal.exposure, dryObs.thermal.exposure);
  assert.ok(wetObs.ejecta.thickness < dryObs.ejecta.thickness);
});

test('marine drag uses the post-entry dispersion width', () => {
  const res = computeImpact({ ...nominal, diameter: 400, target: 'ocean', waterDepth: 800 });
  assert.ok(res.dispersion > res.diameter);
  const expected = res.vSurface * Math.exp(-3 * 1000 * 0.877 * 800 /
    (2 * res.density * res.dispersion * Math.sin(Math.PI / 4)));
  near(res.vSeafloor, expected, 1e-12);
});

test('unresolved low-speed seafloor effects are null, never fabricated zero craters', () => {
  const res = computeImpact({ ...nominal, diameter: 100, density: 8000, target: 'ocean', waterDepth: 11000 });
  assert.equal(res.regime, 'crater');
  assert.equal(res.seafloorStopped, true);
  assert.equal(res.crater, null);
  assert.equal(res.seismic, null);
  assert.equal(res.melt, null);
  const obs = observerReport(res, 200000);
  assert.equal(obs.seismic, null);
  assert.equal(obs.ejecta, null);
  assert.ok(obs.blast);
});

test('blast consequences match Table 4 at every included threshold', () => {
  const cases = [[6900, 'window'], [22900, 'roofs'], [26800, 'wood-frame buildings'],
    [38500, 'masonry walls'], [42600, 'load-bearing masonry'], [100000, 'bracing'],
    [121000, 'truss bridges'], [273000, 'steel frames'], [297000, 'overturn'],
    [379000, 'girder bridges'], [426000, 'deformed']];
  for (const [p, label] of cases) {
    assert.ok(blastDamage(p).includes(label));
    assert.ok(!blastDamage(p - 1)?.includes(label));
  }
  assert.equal(blastDamage(0), null);
  assert.equal(peakOverpressure(0, 1000), 0);
});

test('far-field seismic angle remains in radians, as defined by the paper', () => {
  const obs = seismicAtDistance(8, EARTH.radius);
  near(obs.Meff, 1.601, 1e-12);
  assert.equal(seismicAtDistance(2.5, 0).mercalli, 'II–III · weak shaking');
  assert.equal(seismicAtDistance(3.5, 0).mercalli, 'III–IV · light shaking');
});

test('thermal horizon and computed burn radius are consistent', () => {
  const energy = 1.5e21, radius = burnRadius(energy, energy / MT_TNT, 20000);
  near(thermalAtDistance(energy, radius, 20000).exposure, 0.42e6 * (energy / MT_TNT) ** (1 / 6), 1e-9);
  assert.equal(thermalAtDistance(energy, MAX_DISTANCE, 20000).exposure, 0);
  assert.equal(thermalAtDistance(energy, MAX_DISTANCE, 20000).belowHorizon, true);
});

test('tsunami spreading is bounded and does not extrapolate inside the cavity', () => {
  const cavity = tsunamiAtDistance(10000, 3800, 1000);
  assert.equal(cavity.insideCavity, true);
  assert.equal(cavity.amplitude, null);
  const first = tsunamiAtDistance(10000, 3800, 10000);
  const far = tsunamiAtDistance(10000, 3800, 40000);
  near(first.amplitude / far.amplitude, 2, 1e-12);
  assert.ok(first.amplitude <= 3800);
  assert.equal(first.coastalRunup, null);
});

test('distance validation permits ground zero and stops at the antipode', () => {
  const res = computeImpact(nominal);
  assert.equal(observerReport(res, 0).insideCrater, true);
  assertFinite(observerReport(res, MAX_DISTANCE));
  for (const r of [-1, NaN, Infinity, MAX_DISTANCE + 1, '1000']) {
    assert.throws(() => observerReport(res, r), RangeError);
  }
});

test('giant routing is terrain independent and remnant/disk mass is conserved', () => {
  for (const angleDeg of [5, 40, 45, 90]) for (const velocity of [10000, 20000, 72000]) {
    const input = { diameter: 7420000, density: 3000, velocity, angleDeg };
    const dry = computeImpact(input), wet = computeImpact({ ...input, target: 'ocean' });
    assert.equal(dry.regime, 'giant');
    assert.deepEqual(dry.giant, wet.giant);
    const g = dry.giant;
    assert.ok(g.mlrFrac > 0 && g.mlrFrac <= 1);
    near(g.Mlr + g.diskMass + g.otherMass, EARTH.mass + dry.mass, 1e-12);
    assert.ok(g.diskMass <= EARTH.mass + dry.mass - g.Mlr + dry.mass * 1e-12);
    assert.equal(dry.recurrence, null);
  }
});

test('catalog scenarios and 3,840 bounded combinations remain finite and conserve entry energy', () => {
  for (const p of CATALOG) assertFinite(computeImpact({ ...p, density: COMPOSITIONS[p.comp].density }));
  let count = 0;
  for (const diameter of [10, 20, 50, 100, 400, 999, 1000, 1001, 10000, 100000, 1e6, 7420000])
    for (const density of [500, 1000, 3000, 7900, 8000])
      for (const velocity of [5000, 11000, 20000, 72000])
        for (const angleDeg of [5, 15, 45, 90]) for (const target of Object.keys(TARGETS)) {
          const res = computeImpact({ diameter, density, velocity, angleDeg, target });
          assertFinite(res);
          if (res.regime === 'airburst') {
            assert.ok(res.residualEnergy <= res.energy);
            assert.ok(res.depositedEnergy >= 0);
          } else if (res.regime === 'crater') {
            assert.ok(res.vSurface <= velocity);
            assert.ok(res.energySeafloor <= res.energySurf);
          }
          for (const r of [0, 1000, 1e5, 1e6, MAX_DISTANCE]) assertFinite(observerReport(res, r));
          count++;
        }
  assert.equal(count, 3840);
});
