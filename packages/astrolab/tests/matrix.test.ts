import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/matrix.ts";

const close = (a: number, b: number, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test("linspace and colon match MATLAB", () => {
  assert.deepEqual(Array.from(M.linspace(0, 1, 5).data), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(Array.from(M.colon(1, 2, 7).data), [1, 3, 5, 7]);
  assert.deepEqual(Array.from(M.colon(5, -1, 3).data), [5, 4, 3]);
  assert.equal(M.numel(M.colon(3, 1, 1)), 0);
  assert.equal(M.numel(M.colon(0, 0.1, 1)), 11);
});

test("mldivide solves square systems and inv round-trips", () => {
  const A = M.toMatrix([[4, -2], [1, 1]]);
  const b = M.colvec([2, 3]);
  const x = M.mldivide(A, b);
  close(x.data[0]!, 4 / 3);
  close(x.data[1]!, 5 / 3);
  const I = M.mtimes(A, M.inv(A));
  close(I.data[0]!, 1); close(I.data[1]!, 0); close(I.data[2]!, 0); close(I.data[3]!, 1);
  close(M.det(A), 6);
});

test("least squares for tall systems", () => {
  const A = M.toMatrix([[1, 1], [1, 2], [1, 3]]);
  const b = M.colvec([1, 2, 3]);
  const x = M.mldivide(A, b);
  close(x.data[0]!, 0, 1e-10);
  close(x.data[1]!, 1, 1e-10);
});

test("implicit expansion and reductions", () => {
  const m = M.toMatrix([[1, 2], [3, 4]]);
  const r = M.plus(m, M.rowvec([10, 20]));
  assert.deepEqual(M.toArray(r), [[11, 22], [13, 24]]);
  assert.deepEqual(Array.from(M.sum(m).data), [4, 6]);
  assert.deepEqual(Array.from(M.mean(M.rowvec([1, 2, 3])).data), [2]);
  assert.deepEqual(Array.from(M.cumsum(M.rowvec([1, 2, 3])).data), [1, 3, 6]);
  assert.throws(() => M.plus(M.zeros(2, 3), M.zeros(3, 2)), /dimensions must agree/);
});

test("cross, dot, norm and matrix power", () => {
  const c = M.cross(M.rowvec([1, 0, 0]), M.rowvec([0, 1, 0]));
  assert.deepEqual(Array.from(c.data), [0, 0, 1]);
  assert.equal(M.dot(M.rowvec([1, 2, 3]), M.rowvec([4, 5, 6])), 32);
  close(M.norm(M.rowvec([3, 4])), 5);
  const p = M.mpower(M.toMatrix([[1, 1], [0, 1]]), M.toMatrix(3));
  assert.deepEqual(M.toArray(p), [[1, 3], [0, 1]]);
});

test("column-major linear indexing and format", () => {
  const m = M.toMatrix([[1, 2], [3, 4]]);
  assert.deepEqual(M.toVector(m), [1, 3, 2, 4]);
  assert.deepEqual(Array.from(M.linearIndex(m, [1, 2]).data), [3, 2]);
  assert.equal(M.format(M.toMatrix(0.5)), "0.5000");
  assert.equal(M.format(M.toMatrix(3)), "3");
});
