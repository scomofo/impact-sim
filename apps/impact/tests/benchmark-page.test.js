import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { initBenchmarks } from '../js/benchmark-page.js';

test('dashboard filters examples, retains discrepancies, recalculates, and exports all source-backed cases', async () => {
  const dom = new JSDOM(await readFile(new URL('../benchmarks.html', import.meta.url), 'utf8'));
  const d = dom.window.document;
  initBenchmarks(d);
  assert.equal(d.querySelectorAll('.benchmark-case').length, 3);
  const select = d.getElementById('benchmark-filter');
  select.value = 'rock18000'; select.dispatchEvent(new dom.window.Event('change'));
  assert.equal(d.querySelectorAll('.benchmark-case').length, 1);
  assert.match(d.getElementById('benchmark-results').textContent, /Review discrepancy/);
  d.getElementById('benchmark-run').click();
  assert.equal(d.querySelectorAll('.benchmark-case').length, 1);
  let blob;
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  URL.createObjectURL = (b) => { blob = b; return 'blob:test'; }; URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function () {};
  try {
    d.getElementById('benchmark-export').click();
    const report = JSON.parse(await blob.text());
    assert.equal(report.cases.length, 3);
    assert.match(report.source.url, /10.1111/);
    assert.equal(report.tolerancePercent, 3);
    assert.match(d.getElementById('benchmark-status').textContent, /No overall accuracy score/);
  } finally { URL.createObjectURL = create; URL.revokeObjectURL = revoke; dom.window.close(); }
});
