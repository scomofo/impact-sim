import test from 'node:test';
import assert from 'node:assert/strict';
import { visualEffectsProfile } from '../js/visual-model.js';
import { computeImpact, COMPOSITIONS, EARTH } from '../js/physics.js';
import { CATALOG } from '../js/catalog.js';

test('airbursts do not ignite the surface', () => {
  assert.deepEqual(visualEffectsProfile({ regime: 'airburst' }), {
    thermalArc: 0, heat: 0, heatDuration: 0,
  });
});

test('ordinary crater impacts keep thermal effects local', () => {
  const profile = visualEffectsProfile({
    regime: 'crater', burn: 120_000, energyMt: 20, severity: { level: 3 },
  });
  assert.ok(profile.thermalArc < 0.02, '120 km should occupy a small planetary arc');
  assert.ok(profile.heat > 0);
  assert.equal(profile.thermalArc, 120_000 / EARTH.radius);
});

test('giant energy proxies never invent a spatial melt or thermal field', () => {
  for (const magmaOcean of [true, false]) {
    const profile = visualEffectsProfile({ regime: 'giant', giant: { magmaOcean } });
    assert.equal(profile.thermalArc, 0);
    assert.equal(profile.heat, 0);
  }
});

test('small thermal footprints are not enlarged and missing footprints stay unavailable', () => {
  for (const burn of [0, 20, 500, 10_000]) {
    const profile = visualEffectsProfile({ regime: 'crater', burn });
    assert.equal(profile.thermalArc, burn / EARTH.radius);
    assert.equal(profile.heat > 0, burn > 0);
  }
  assert.equal(visualEffectsProfile({ regime: 'crater', burn: null }).heat, 0);
});

test('energy bands cannot turn a thermal footprint into atmospheric or climate predictions', () => {
  const result = { regime: 'crater', burn: 120_000 };
  const baseline = visualEffectsProfile({ ...result, severity: { level: 0 } });
  for (let level = 1; level <= 5; level++) {
    assert.deepEqual(visualEffectsProfile({ ...result, severity: { level } }), baseline);
  }
  assert.equal(Object.hasOwn(baseline, 'dust'), false, 'unmodelled loading is not a numeric zero');
});

test('all catalog footprints stay within the calculated primary thermal-exposure distance', () => {
  for (const event of CATALOG) {
    const result = computeImpact({ ...event, density: COMPOSITIONS[event.comp].density });
    const profile = visualEffectsProfile(result);
    const reach = result.regime === 'crater' ? result.burn ?? 0 : 0;
    assert.ok(profile.thermalArc * EARTH.radius <= reach + 1e-7, event.id);
    assert.equal(profile.heat > 0, reach > 0, event.id);
  }
});
