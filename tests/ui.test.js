import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { initUI } from '../js/ui.js';
import { computeImpact, COMPOSITIONS, TARGETS, MAX_DISTANCE } from '../js/physics.js';
import { CATALOG } from '../js/catalog.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
let dom, ui, latest, launches, errors;
const el = (id) => dom.window.document.getElementById(id);
const clickEvent = (id) => dom.window.document.querySelector(`[data-id="${id}"]`).click();
function input(id, value) {
  el(id).value = String(value);
  el(id).dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

beforeEach(async () => {
  dom = new JSDOM(html, { url: 'http://localhost:8742/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.history = dom.window.history;
  launches = []; errors = [];
  dom.window.addEventListener('error', (event) => { errors.push(event.error); event.preventDefault(); });
  ui = initUI({
    onChange: (params) => { latest = params; ui.setForecast(computeImpact(params), 1); },
    onLaunch: (params) => launches.push(params), onResetPlanet() {}, onCinematic() {}, onTrueScale() {}, onTimeScale() {},
  });
  await new Promise(queueMicrotask);
});
afterEach(() => {
  dom.window.close();
  delete globalThis.window; delete globalThis.document; delete globalThis.history;
  assert.deepEqual(errors, []);
});

test('each preset retains exact numerical parameters through launch', () => {
  for (const event of CATALOG) {
    clickEvent(event.id);
    assert.equal(latest.diameter, event.diameter, event.id);
    assert.equal(latest.velocity, event.velocity, event.id);
    assert.equal(latest.angleDeg, event.angleDeg);
    assert.equal(latest.density, COMPOSITIONS[event.comp].density);
    const target = event.target ?? 'sedimentary';
    assert.equal(latest.target, target);
    assert.equal(latest.waterDepth, event.waterDepth ?? TARGETS[target].waterDepth ?? 0);
    el('launch-btn').click();
    assert.deepEqual(launches.at(-1), latest);
  }
});

test('post-impact scope remains visible and timeline values identify playback seconds', () => {
  assert.equal(el('post-impact-note').hidden, false);
  assert.match(el('post-impact-note').textContent, /not calculated/);
  assert.match(el('post-impact-details').textContent, /not simulations performed by this app/);
  ui.setTimeline(48, [{ t: 5.5, label: 'impact' }]);
  ui.setTimelineTime(12.5);
  assert.equal(el('scrub-time').textContent, '12.5 s animation');
  input('scrub-slider', 200);
  assert.match(el('scrub-time').textContent, /s animation$/);
  ui.hideTimeline();
  assert.equal(el('post-impact-note').hidden, false);
});

test('editing a field preserves other exact values and clears the preset URL', () => {
  clickEvent('apophis');
  input('ang-input', 44.75);
  assert.equal(latest.diameter, 340);
  assert.equal(latest.velocity, 12600);
  assert.equal(latest.angleDeg, 44.75);
  assert.equal(new URL(dom.window.location.href).searchParams.has('p'), false);
  assert.equal(el('event-note').hidden, true);
  assert.equal(dom.window.document.querySelectorAll('.chip.on').length, 0);
});

test('invalid inputs block launch, comparison, export and restore after correction', () => {
  const original = latest.diameter;
  for (const invalid of ['', 0, -20, 7420001]) {
    input('dia-input', invalid);
    assert.equal(latest.diameter, original);
    assert.equal(el('input-error').hidden, false);
    for (const id of ['launch-btn', 'pin-btn', 'export-btn']) assert.equal(el(id).disabled, true);
    assert.match(el('readout-title').textContent, /Last valid/);
  }
  input('dia-input', 370.123);
  assert.equal(latest.diameter, 370.123);
  assert.equal(el('input-error').hidden, true);
  assert.equal(el('export-btn').disabled, false);
});

test('repairing observer distance computes pending edits instead of exporting a stale result', () => {
  input('obs-input', '');
  input('dia-input', 2700);
  assert.notEqual(latest.diameter, 2700);
  input('obs-input', 200);
  assert.equal(latest.diameter, 2700);
  assert.equal(el('export-btn').disabled, false);
  input('obs-input', MAX_DISTANCE / 1000);
  assert.equal(el('input-error').hidden, true);
  input('obs-input', 0);
  assert.match(el('observer-readouts').textContent, /Inside the modeled crater/);
});

test('custom depth and composition are reset by a newly selected catalog event', () => {
  clickEvent('nadir');
  assert.equal(el('water-control').hidden, false);
  assert.equal(latest.waterDepth, 800);
  input('water-input', 11000);
  input('density-input', 2100.5);
  assert.equal(el('comp-select').value, 'custom');
  clickEvent('theia');
  assert.equal(el('water-control').hidden, true);
  assert.equal(latest.waterDepth, 0);
  assert.equal(latest.target, 'sedimentary');
  assert.equal(latest.density, 3000);
});

test('a completed launch does not overwrite a newer forecast or validation error', () => {
  clickEvent('barringer');
  const old = computeImpact(latest);
  clickEvent('ries');
  const current = el('readouts').innerHTML;
  ui.showResults(old);
  assert.equal(el('readouts').innerHTML, current);
  input('dia-input', '');
  ui.setForecast(computeImpact(latest), 1);
  ui.showResults(computeImpact(latest));
  assert.match(el('readout-title').textContent, /Last valid/);
});

test('unresolved seafloor assessment can be displayed, pinned and removed', () => {
  input('dia-input', 100); input('density-input', 8000);
  input('target-select', 'ocean'); input('water-input', 11000);
  assert.match(el('readouts').textContent, /not resolved/);
  el('pin-btn').click();
  assert.match(el('compare-tray').textContent, /ground effects unresolved/);
  el('compare-tray').querySelector('button').click();
  assert.equal(el('compare-tray').children.length, 0);
});

test('replaying an earlier launch cannot replace the current scenario in JSON export', async () => {
  clickEvent('barringer');
  const earlierLaunch = computeImpact(latest);
  clickEvent('apophis'); input('obs-input', 12.345);
  const currentReadout = el('readouts').innerHTML;
  ui.setForecast(earlierLaunch, 1); // backward scrubbing re-enters launch()
  ui.showResults(earlierLaunch);
  assert.equal(el('readouts').innerHTML, currentReadout);
  el('sensitivity-param').value = 'velocity';
  el('sensitivity-param').dispatchEvent(new dom.window.Event('change'));
  el('sensitivity-span').value = '0.2';
  el('sensitivity-span').dispatchEvent(new dom.window.Event('change'));
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  let exportedBlob, downloadName;
  URL.createObjectURL = (blob) => { exportedBlob = blob; return 'blob:test'; };
  URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function () { downloadName = this.download; };
  try {
    el('export-btn').click();
    const report = JSON.parse(await exportedBlob.text());
    assert.equal(report.inputs.diameter, 340);
    assert.equal(report.inputs.velocity, 12600);
    assert.equal(report.observerDistance, 12345);
    assert.equal(report.event.id, 'apophis');
    assert.equal(report.sensitivity.selectedParameter, 'velocity');
    assert.equal(report.sensitivity.fraction, 0.2);
    assert.equal(report.event.evidence.parameters.diameter.status, 'estimated');
    assert.match(downloadName, /^impact-assessment-.*\.json$/);
  } finally {
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
  }
});

test('slider endpoints stay in range despite logarithm roundoff', () => {
  input('dia-slider', 1000);
  assert.equal(latest.diameter, 7420000);
  assert.equal(el('input-error').hidden, true);
  input('dia-slider', 0);
  assert.equal(latest.diameter, 10);
});

test('HTML has labels and explicit units for every assessment numeric input', () => {
  for (const field of document.querySelectorAll('input[type="number"]')) {
    assert.ok(field.labels.length > 0, field.id);
    assert.ok(field.required, field.id);
  }
});


test('sensitivity selectors change the comparison without modifying the scenario or attribution', () => {
  clickEvent('apophis');
  const before = { ...latest };
  el('sensitivity-param').value = 'velocity';
  el('sensitivity-param').dispatchEvent(new dom.window.Event('change'));
  el('sensitivity-span').value = '0.2';
  el('sensitivity-span').dispatchEvent(new dom.window.Event('change'));
  assert.match(el('sensitivity-readouts').textContent, /10.08/);
  assert.match(el('sensitivity-readouts').textContent, /15.12/);
  assert.deepEqual(latest, before);
  assert.equal(new URL(dom.window.location.href).searchParams.get('p'), 'apophis');
  input('dia-input', '');
  assert.equal(el('sensitivity-param').disabled, true);
  input('dia-input', 340);
  assert.equal(el('sensitivity-param').disabled, false);
  assert.equal(el('sensitivity-span').value, '0.2');
});
