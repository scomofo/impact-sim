import test from 'node:test';
import assert from 'node:assert/strict';
import { computeImpact, COMPOSITIONS } from '../js/physics.js';
import { CATALOG, eventById } from '../js/catalog.js';
import { createAssessmentReport, diameterSensitivity, modelNotes, MODEL_VERSION } from '../js/assessment.js';
import { renderReadout, renderObserver } from '../js/ui.js';

const input = { diameter: 370, density: 3000, velocity: 12600, angleDeg: 45, target: 'sedimentary' };

test('report round trips exact inputs, units, observer, sources, and model version', () => {
  const options = { createdAt: '2026-09-05T00:00:00Z', event: eventById('apophis') };
  const report = createAssessmentReport(input, 500000, options);
  const restored = JSON.parse(JSON.stringify(report));
  assert.equal(restored.modelVersion, MODEL_VERSION);
  assert.equal(restored.inputs.diameter, 370);
  assert.equal(restored.inputs.velocity, 12600);
  assert.equal(restored.observerDistance, 500000);
  assert.equal(restored.event.id, 'apophis');
  assert.deepEqual(computeImpact(restored.inputs), restored.result);
  assert.deepEqual(report, createAssessmentReport(input, 500000, options));
  assert.ok(restored.sources.every((source) => source.url.startsWith('https://')));
  assert.match(restored.assumptions.nullValues, /not a zero/);
  assert.match(restored.assumptions.geography, /visual only/);
});

test('sensitivity is three fixed-input samples with cubic energy scaling', () => {
  const samples = diameterSensitivity(input);
  assert.equal(samples.length, 3);
  assert.equal(samples[1].diameter, 370);
  assert.ok(Math.abs(samples[2].energyMt / samples[1].energyMt - 1.331) < 1e-12);
  assert.equal(diameterSensitivity({ ...input, diameter: 10 })[0].diameter, 10);
  assert.equal(diameterSensitivity({ ...input, diameter: 7420000 })[2].diameter, 7420000);
  assert.throws(() => diameterSensitivity(input, NaN), RangeError);
});

test('all catalog reports render and serialize without invalid numbers or definitive mortality claims', () => {
  for (const event of CATALOG) {
    const report = createAssessmentReport({ ...event, density: COMPOSITIONS[event.comp].density }, 500000, { event });
    const html = renderReadout(report.result) + renderObserver(report.result, 500000);
    assert.doesNotMatch(html, /NaN|Infinity|undefined|instantly vaporized|Nowhere on Earth is safe/);
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(report)));
    if (report.result.regime === 'giant') assert.ok(report.notes.some((note) => note.code === 'giant-heuristics'));
  }
});

test('catalog corrections retain their primary source links and custom water depth', () => {
  assert.equal(eventById('nadir').waterDepth, 800);
  assert.match(eventById('hiawatha').when, /58 million/);
  assert.match(eventById('bennu').blurb, /through 2300/);
  for (const id of ['nadir', 'hiawatha', 'bennu']) assert.ok(eventById(id).sources.length);
});

test('missing effects and extrapolation remain visible in notes', () => {
  const airburst = computeImpact({ ...input, diameter: 20 });
  assert.ok(modelNotes(airburst).some((note) => note.code === 'airburst-thermal'));
  const wet = computeImpact({ ...input, diameter: 1750, target: 'ocean' });
  assert.ok(modelNotes(wet).some((note) => note.code === 'tsunami-heuristic'));
});
