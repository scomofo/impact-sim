import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { startApp } from '../js/startup.js';
import { createSceneLoop } from '../js/scene-runtime.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
let dom, warnings, originalWarn;
const el = (id) => document.getElementById(id);
beforeEach(() => {
  dom = new JSDOM(html, { url: 'http://localhost:8742/?p=apophis' });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.history = dom.window.history;
  warnings = []; originalWarn = console.warn; console.warn = (...args) => warnings.push(args);
});
afterEach(() => {
  console.warn = originalWarn; dom.window.close();
  delete globalThis.window; delete globalThis.document; delete globalThis.history;
});

function input(id, value) {
  el(id).value = String(value);
  el(id).dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

async function checkAssessmentSurvives() {
  input('dia-input', '');
  assert.equal(el('export-btn').disabled, true);
  input('dia-input', 370.125);
  for (const id of ['launch-btn', 'reset-btn', 'cinematic-btn', 'truescale-chk', 'time-slider', 'play-btn', 'scrub-slider']) {
    assert.equal(el(id).disabled, true, id);
  }
  assert.equal(el('app-status').hidden, false);
  assert.match(el('app-status').textContent, /3D view unavailable/);
  assert.equal(el('timeline').hidden, true);
  assert.equal(el('scene').childElementCount, 0);
  assert.equal(el('pin-btn').disabled, false);
  el('pin-btn').click();
  assert.equal(el('compare-tray').children.length, 1);
  assert.match(el('sensitivity-readouts').textContent, /370/);
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  let blob;
  URL.createObjectURL = (value) => { blob = value; return 'blob:test'; };
  URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function () {};
  try {
    el('export-btn').click();
    const report = JSON.parse(await blob.text());
    assert.equal(report.inputs.diameter, 370.125);
    assert.equal(report.inputs.velocity, 12600);
    assert.equal(report.sensitivity.scenarios.length, 3);
    assert.equal(report.event, null);
  } finally { URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
}

test('WebGL initialization failure retains editable assessments and exports', async () => {
  await startApp({ loadScene: async () => ({ initScene() { throw new Error('No WebGL'); } }) });
  await checkAssessmentSurvives();
  assert.equal(warnings.length, 1);
});

for (const failure of ['context loss', 'render exception']) {
  test(`${failure} after a launch disables 3D while preserving calculations`, async () => {
    let canvas, nextFrame, disposed = 0;
    await startApp({ loadScene: async () => ({ initScene(ui, { onFailure }) {
      canvas = document.createElement('canvas'); el('scene').appendChild(canvas);
      const loop = createSceneLoop({ canvas, page: document,
        requestFrame: (callback) => { nextFrame = callback; return 1; }, cancelFrame: () => { nextFrame = null; },
        frame() { throw new Error('GPU render error'); }, onFailure,
      });
      return {
        onObserver() {}, onLaunch() { ui.setTimeline(48, []); },
        dispose() { disposed++; loop.stop(); },
      };
    } }) });
    assert.equal(el('launch-btn').disabled, false);
    assert.equal(el('app-status').hidden, true);
    el('launch-btn').click();
    assert.equal(el('timeline').hidden, false);
    if (failure === 'context loss') canvas.dispatchEvent(new dom.window.Event('webglcontextlost'));
    else {
      // jsdom starts hidden, as an offscreen document; activate the test scene.
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new dom.window.Event('visibilitychange'));
      nextFrame(0);
    }
    await checkAssessmentSurvives();
    assert.equal(disposed, 1);
    assert.equal(warnings.length, 1);
  });
}
