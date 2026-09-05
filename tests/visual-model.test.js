import test from 'node:test';
import assert from 'node:assert/strict';
import { visualEffectsProfile } from '../js/visual-model.js';

test('airbursts do not ignite the surface', () => {
  assert.deepEqual(visualEffectsProfile({ regime: 'airburst' }), {
    thermalArc: 0, heat: 0, heatDuration: 0, globalMelt: false, dust: 0,
  });
});

test('ordinary crater impacts keep thermal effects local', () => {
  const profile = visualEffectsProfile({
    regime: 'crater', burn: 120_000, energyMt: 20, severity: { level: 3 },
  });
  assert.ok(profile.thermalArc < 0.02, '120 km should occupy a small planetary arc');
  assert.ok(profile.heat > 0);
  assert.equal(profile.globalMelt, false);
});

test('only giant impacts receive a planet-wide melt treatment', () => {
  const profile = visualEffectsProfile({ regime: 'giant', giant: { magmaOcean: true } });
  assert.ok(profile.thermalArc > Math.PI);
  assert.equal(profile.heat, 1);
  assert.equal(profile.globalMelt, true);
});
