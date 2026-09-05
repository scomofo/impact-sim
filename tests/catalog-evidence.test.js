import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, eventById } from '../js/catalog.js';
import { CATALOG_VERSION } from '../js/catalog-evidence.js';
import { createAssessmentReport } from '../js/assessment.js';
import { COMPOSITIONS } from '../js/physics.js';

test('every preset has scoped sources and explicit evidence for every physical input', () => {
  for (const event of CATALOG) {
    assert.ok(event.sources.length, event.id);
    const ids = new Set(event.sources.map((s) => s.id));
    for (const s of event.sources) { assert.ok(s.url.startsWith('https://')); assert.ok(s.scope); }
    assert.equal(event.evidence.catalogVersion, CATALOG_VERSION);
    for (const key of ['diameter', 'density', 'velocity', 'angleDeg', 'target', 'waterDepth']) {
      const basis = event.evidence.parameters[key];
      assert.ok(['assumed', 'estimated'].includes(basis.status));
      assert.ok(basis.detail);
      assert.ok(basis.sourceIds.every((id) => ids.has(id)));
      if (basis.status === 'estimated') assert.ok(basis.sourceIds.length);
    }
    if (event.craterKm != null) assert.ok(event.evidence.craterDefinition);
  }
});

test('catalog corrections and reconstruction distinctions survive exports', () => {
  assert.equal(eventById('apophis').diameter, 340);
  assert.match(eventById('wolfe-creek').when, /120,000/);
  assert.match(eventById('lonar').when, /debated/);
  assert.deepEqual(eventById('vredefort').evidence.craterRangeKm, [180, 300]);
  const event = eventById('hiawatha');
  assert.equal(event.evidence.parameters.density.status, 'assumed');
  const report = createAssessmentReport({ ...event, density: COMPOSITIONS[event.comp].density }, 200000, { event });
  assert.deepEqual(report.event.evidence, event.evidence);
  assert.equal(report.catalogVersion, CATALOG_VERSION);
});
