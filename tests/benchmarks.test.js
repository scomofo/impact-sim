import test from 'node:test';
import assert from 'node:assert/strict';
import { compareValue, runBenchmarks } from '../js/benchmarks.js';

test('benchmark differences preserve direction, zero references, and unavailable results', () => {
  assert.equal(compareValue(80, 100).percentDifference, -20);
  assert.equal(compareValue(120, 100).percentDifference, 20);
  assert.equal(compareValue(null, 100).status, 'not-comparable');
  assert.equal(compareValue(Infinity, 100).status, 'not-comparable');
  assert.equal(compareValue(100, null).status, 'not-comparable');
  assert.equal(compareValue(0, 0).percentDifference, null);
  assert.equal(compareValue(10, 0).status, 'review');
});

test('fixed published inputs reproduce selected agreement and expose known discrepancies', () => {
  const report = runBenchmarks();
  assert.equal(report.cases.length, 3);
  const find = (id, key) => report.cases.find((c) => c.id === id).metrics.find((m) => m.key === key);
  assert.equal(find('iron40', 'crater').status, 'within-tolerance');
  assert.equal(find('rock1750', 'thermal').status, 'within-tolerance');
  assert.ok(find('rock1750', 'ejecta').percentDifference < -5);
  assert.ok(find('rock18000', 'pressure').percentDifference > 50);
  assert.equal(find('rock18000', 'pressure').reference, 7700000);
  assert.equal(find('iron40', 'thermal').status, 'not-comparable');
  assert.equal(report.cases[0].inputs.diameter, 40);
  assert.ok(report.cases.every((c) => c.observerDistance === 200000 && !c.error));
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
});

test('a calculation failure is shown as unavailable and never counted as agreement', () => {
  const r = runBenchmarks({ calculate() { throw new Error('broken model'); } });
  assert.ok(r.cases.every((c) => c.error === 'broken model' && c.metrics.every((m) => m.status === 'not-comparable')));
});
