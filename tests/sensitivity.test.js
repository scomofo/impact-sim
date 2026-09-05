import test from 'node:test';
import assert from 'node:assert/strict';
import { parameterSensitivity, sensitivityStudy, createAssessmentReport } from '../js/assessment.js';
import { INPUT_LIMITS } from '../js/physics.js';
const input = { diameter: 1000, density: 3000, velocity: 20000, angleDeg: 45, target: 'ocean', waterDepth: 800 };

test('one-at-a-time energy follows cubic size, quadratic speed, linear density and angle independence', () => {
  const original = structuredClone(input);
  for (const [parameter, ratio] of Object.entries({ diameter: 1.331, velocity: 1.21, density: 1.1, angleDeg: 1 })) {
    const samples = parameterSensitivity(input, parameter);
    assert.ok(Math.abs(samples[2].energyMt / samples[1].energyMt - ratio) < 1e-12);
    for (const sample of samples) for (const key of Object.keys(input)) {
      if (key !== parameter) assert.equal(sample.inputs[key], input[key]);
    }
  }
  assert.deepEqual(input, original);
});

test('all parameter bounds report clipping and retain exact requested and actual values', () => {
  for (const parameter of ['diameter', 'velocity', 'density', 'angleDeg']) {
    for (const [side, index] of [[0, 0], [1, 2]]) {
      const value = INPUT_LIMITS[parameter][side];
      const sample = parameterSensitivity({ ...input, [parameter]: value }, parameter, 0.5)[index];
      assert.equal(sample.value, value);
      assert.equal(sample.clipped, true);
      assert.notEqual(sample.requestedValue, value);
    }
  }
  assert.throws(() => parameterSensitivity({ ...input, diameter: -1 }), RangeError);
  for (const parameter of ['toString', 'target', '__proto__']) assert.throws(() => parameterSensitivity(input, parameter), RangeError);
  for (const fraction of [NaN, Infinity, 0, -0.1, 0.51, '0.1']) assert.throws(() => sensitivityStudy(input, { fraction }), RangeError);
});

test('exports preserve chosen sensitivity settings, all four analyses and legacy diameter samples', () => {
  const report = createAssessmentReport(input, 200000, { sensitivity: { parameter: 'velocity', fraction: 0.2 } });
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.sensitivity.selectedParameter, 'velocity');
  assert.equal(report.sensitivity.fraction, 0.2);
  assert.equal(report.sensitivity.analyses.length, 4);
  const speed = report.sensitivity.analyses.find((a) => a.parameter === 'velocity');
  assert.equal(speed.unit, 'm/s');
  assert.equal(speed.scenarios[1].value, 20000);
  assert.equal(speed.scenarios[1].value * speed.displayScale, 20);
  assert.deepEqual(report.sensitivity.scenarios, report.sensitivity.analyses[0].scenarios);
  assert.deepEqual(JSON.parse(JSON.stringify(report)).sensitivity, report.sensitivity);
});
