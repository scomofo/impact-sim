import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('failed optional Three.js import leaves working assessment controls', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost:8742/?p=bennu' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.history = dom.window.history;
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args[0]);
  try {
    // Node has no browser importmap; the optional bare 'three' import fails.
    await import('../js/app.js');
    assert.match(document.getElementById('app-status').textContent, /3D view unavailable/);
    assert.equal(document.getElementById('launch-btn').disabled, true);
    assert.equal(document.getElementById('export-btn').disabled, false);
    assert.equal(document.getElementById('dia-input').value, '490');
    const field = document.getElementById('dia-input');
    field.value = '1000'; field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.equal(document.getElementById('export-btn').disabled, false);
    assert.match(document.getElementById('readouts').textContent, /Incoming energy/);
    assert.equal(document.getElementById('launch-btn').disabled, true);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = originalWarn;
    dom.window.close();
    delete globalThis.window; delete globalThis.document; delete globalThis.history;
  }
});
