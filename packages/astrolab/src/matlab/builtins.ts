/** Builtin function library for the MATLAB console. */

import * as M from "../matrix.ts";
import type { Matrix } from "../matrix.ts";
import * as N from "../numeric.ts";
import * as A from "../astro.ts";
import * as I from "../impact.ts";
import * as E from "../entry.ts";
import { ode45, ode4, type OdeOptions } from "../ode.ts";
import {
  RuntimeError, formatValue, isFunction, isStruct, logical, struct, toMat, toNumber, typeName,
  type Builtins, type FunctionValue, type Interpreter, type Value,
} from "./interpreter.ts";

type Impl = (args: Value[], nargout: number, interp: Interpreter) => Value | Value[] | void;

const fns: Builtins = new Map();

function def(name: string, impl: Impl, help = ""): void {
  const f: FunctionValue = {
    kind: "function",
    name,
    call(args, nargout, interp) {
      const r = impl(args, nargout, interp);
      if (r === undefined) return [];
      return Array.isArray(r) ? r : [r];
    },
  };
  (f as FunctionValue & { help?: string }).help = help;
  fns.set(name, f);
}

const num = (args: Value[], i: number, what: string): number => {
  if (args[i] === undefined) throw new RuntimeError(`Not enough input arguments (missing ${what})`);
  return toNumber(args[i]!, what);
};
const mat = (args: Value[], i: number, what: string): Matrix => {
  if (args[i] === undefined) throw new RuntimeError(`Not enough input arguments (missing ${what})`);
  return toMat(args[i]!, what);
};
const str = (args: Value[], i: number, what: string): string => {
  const v = args[i];
  if (typeof v !== "string") throw new RuntimeError(`${what} must be a char array`);
  return v;
};
const fn = (args: Value[], i: number, what: string, interp: Interpreter): FunctionValue => {
  const v = args[i];
  if (v === undefined) throw new RuntimeError(`Not enough input arguments (missing ${what})`);
  if (isFunction(v)) return v;
  if (typeof v === "string") {
    const f = interp.lookupFunction(v);
    if (f) return f;
  }
  throw new RuntimeError(`${what} must be a function handle`);
};
const vec3 = (m: Matrix, what: string): A.Vec3 => {
  if (M.numel(m) !== 3) throw new RuntimeError(`${what} must have 3 elements`);
  return [m.data[0]!, m.data[1]!, m.data[2]!];
};
const arr = (m: Matrix): number[] => Array.from(m.data);
const callScalarFn = (f: FunctionValue, interp: Interpreter) => (x: number): number =>
  toNumber(interp.callFunction(f, [M.toMatrix(x)], 1)[0]!, "function result");

// ---- element-wise math ------------------------------------------------------

const unary: Record<string, (x: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
  exp: Math.exp, log: Math.log, log10: Math.log10, log2: Math.log2, sqrt: Math.sqrt, abs: Math.abs,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, fix: Math.trunc, sign: Math.sign,
  cbrt: Math.cbrt, expm1: Math.expm1, log1p: Math.log1p,
  deg2rad: N.deg2rad, rad2deg: N.rad2deg, wrapTo2Pi: N.wrapTo2Pi, wrapToPi: N.wrapToPi,
  isnan: (x) => (Number.isNaN(x) ? 1 : 0), isinf: (x) => (Math.abs(x) === Infinity ? 1 : 0),
  isfinite: (x) => (Number.isFinite(x) ? 1 : 0), gamma: (x) => gammaFn(x), factorial: (x) => gammaFn(x + 1),
};
for (const [name, f] of Object.entries(unary)) def(name, (a) => M.map(mat(a, 0, "x"), f), `${name}(x) element-wise`);
def("atan2", (a) => M.elementwise(mat(a, 0, "y"), mat(a, 1, "x"), Math.atan2));
def("hypot", (a) => M.elementwise(mat(a, 0, "a"), mat(a, 1, "b"), Math.hypot));
def("mod", (a) => M.elementwise(mat(a, 0, "a"), mat(a, 1, "m"), (x, m) => (m === 0 ? x : x - Math.floor(x / m) * m)));
def("rem", (a) => M.elementwise(mat(a, 0, "a"), mat(a, 1, "m"), (x, m) => (m === 0 ? x : x % m)));
def("power", (a) => M.power(mat(a, 0, "a"), mat(a, 1, "b")));
def("nthroot", (a) => M.elementwise(mat(a, 0, "x"), mat(a, 1, "n"), (x, n) => (x < 0 && n % 2 === 1 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n))));

function gammaFn(x: number): number {
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaFn(1 - x));
  x -= 1;
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let a = c[0]!;
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (x + i);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

// ---- constants ---------------------------------------------------------------

def("pi", () => M.toMatrix(Math.PI));
def("e", () => M.toMatrix(Math.E));
def("Inf", () => M.toMatrix(Infinity));
def("inf", () => M.toMatrix(Infinity));
def("NaN", () => M.toMatrix(NaN));
def("nan", () => M.toMatrix(NaN));
def("eps", (a) => M.toMatrix(a.length ? Math.pow(2, Math.floor(Math.log2(Math.abs(num(a, 0, "x")))) - 52) : Number.EPSILON));
def("true", () => logical(M.toMatrix(1)));
def("false", () => logical(M.toMatrix(0)));
def("realmax", () => M.toMatrix(Number.MAX_VALUE));
def("realmin", () => M.toMatrix(2.2250738585072014e-308));
def("i", () => { throw new RuntimeError("Complex numbers are not supported in this console"); });
def("j", () => { throw new RuntimeError("Complex numbers are not supported in this console"); });

// Astro constants (SI): mu_earth, R_earth, AU, G, day, year …
for (const [k, v] of Object.entries(A.MU)) def(`mu_${k}`, () => M.toMatrix(v), `gravitational parameter of ${k}, m^3/s^2`);
for (const [k, v] of Object.entries(A.RADIUS)) def(`R_${k}`, () => M.toMatrix(v), `mean radius of ${k}, m`);
def("AU", () => M.toMatrix(A.AU), "astronomical unit, m");
def("G", () => M.toMatrix(A.G), "gravitational constant");
def("day", () => M.toMatrix(A.DAY), "seconds per day");
def("year", () => M.toMatrix(A.YEAR), "seconds per Julian year");
def("g0", () => M.toMatrix(I.EARTH_G), "standard gravity, m/s^2");

// ---- construction ------------------------------------------------------------

const dims = (a: Value[], what: string): [number, number] => {
  if (a.length === 0) return [1, 1];
  if (a.length === 1) {
    const m = mat(a, 0, what);
    if (M.numel(m) === 2) return [m.data[0]!, m.data[1]!];
    return [toNumber(m), toNumber(m)];
  }
  return [num(a, 0, "rows"), num(a, 1, "cols")];
};
def("zeros", (a) => M.zeros(...dims(a, "size")));
def("ones", (a) => M.ones(...dims(a, "size")));
def("eye", (a) => M.eye(a.length ? num(a, 0, "n") : 1));
def("rand", (a) => M.map(M.zeros(...dims(a, "size")), () => Math.random()));
def("randn", (a) => M.map(M.zeros(...dims(a, "size")), () => {
  const u = 1 - Math.random(), v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}));
def("linspace", (a) => M.linspace(num(a, 0, "a"), num(a, 1, "b"), a.length > 2 ? num(a, 2, "n") : 100));
def("logspace", (a) => M.map(M.linspace(num(a, 0, "a"), num(a, 1, "b"), a.length > 2 ? num(a, 2, "n") : 50), (x) => Math.pow(10, x)));
def("colon", (a) => (a.length === 2 ? M.colon(num(a, 0, "a"), 1, num(a, 1, "b")) : M.colon(num(a, 0, "a"), num(a, 1, "step"), num(a, 2, "b"))));
def("diag", (a) => M.diag(mat(a, 0, "v")));
def("repmat", (a) => {
  const m = mat(a, 0, "A");
  const [r, c] = dims(a.slice(1), "size");
  const rows: Matrix[] = [];
  for (let i = 0; i < r; i++) rows.push(M.horzcat(...Array.from({ length: c }, () => m)));
  return M.vertcat(...rows);
});
def("reshape", (a) => {
  const m = mat(a, 0, "A");
  const [r, c] = dims(a.slice(1), "size");
  if (r * c !== M.numel(m)) throw new RuntimeError("reshape: number of elements must not change");
  const lin = M.toVector(m);
  const out = M.matrix(r, c);
  for (let k = 0; k < lin.length; k++) out.data[(k % r) * c + Math.floor(k / r)] = lin[k]!;
  return out;
});
def("horzcat", (a) => M.horzcat(...a.map((v) => toMat(v))));
def("vertcat", (a) => M.vertcat(...a.map((v) => toMat(v))));
def("fliplr", (a) => { const m = mat(a, 0, "A"); return M.index(m, null, Array.from({ length: m.cols }, (_, j) => m.cols - 1 - j)); });
def("flipud", (a) => { const m = mat(a, 0, "A"); return M.index(m, Array.from({ length: m.rows }, (_, i) => m.rows - 1 - i), null); });
def("flip", (a) => { const m = mat(a, 0, "A"); return m.rows === 1 ? M.index(m, null, Array.from({ length: m.cols }, (_, j) => m.cols - 1 - j)) : M.index(m, Array.from({ length: m.rows }, (_, i) => m.rows - 1 - i), null); });

// ---- shape & reductions ------------------------------------------------------

def("size", (a, nargout) => {
  const m = mat(a, 0, "A");
  if (a.length > 1) return M.toMatrix(num(a, 1, "dim") === 1 ? m.rows : m.cols);
  if (nargout >= 2) return [M.toMatrix(m.rows), M.toMatrix(m.cols)];
  return M.rowvec([m.rows, m.cols]);
});
def("numel", (a) => M.toMatrix(typeof a[0] === "string" ? a[0].length : M.numel(mat(a, 0, "A"))));
def("length", (a) => { const v = a[0]; if (typeof v === "string") return M.toMatrix(v.length); const m = mat(a, 0, "A"); return M.toMatrix(M.numel(m) === 0 ? 0 : Math.max(m.rows, m.cols)); });
def("ndims", () => M.toMatrix(2));
def("isempty", (a) => logical(M.toMatrix((typeof a[0] === "string" ? a[0].length === 0 : M.numel(mat(a, 0, "A")) === 0) ? 1 : 0)));
def("isscalar", (a) => logical(M.toMatrix(M.isMatrix(a[0]) && M.isScalar(a[0]) ? 1 : 0)));
def("isvector", (a) => logical(M.toMatrix(M.isMatrix(a[0]) && M.isVector(a[0]) ? 1 : 0)));
def("isnumeric", (a) => logical(M.toMatrix(M.isMatrix(a[0]) ? 1 : 0)));
def("ischar", (a) => logical(M.toMatrix(typeof a[0] === "string" ? 1 : 0)));
def("isstruct", (a) => logical(M.toMatrix(a[0] !== undefined && isStruct(a[0]) ? 1 : 0)));
def("isa", (a) => logical(M.toMatrix(a[0] !== undefined && typeName(a[0]) === str(a, 1, "class") ? 1 : 0)));
def("class", (a) => (a[0] === undefined ? "double" : typeName(a[0])));
def("sum", (a) => M.sum(mat(a, 0, "A")));
def("prod", (a) => M.prod(mat(a, 0, "A")));
def("mean", (a) => M.mean(mat(a, 0, "A")));
def("std", (a) => M.std(mat(a, 0, "A")));
def("var", (a) => M.map(M.std(mat(a, 0, "A")), (s) => s * s));
def("cumsum", (a) => M.cumsum(mat(a, 0, "A")));
def("cumprod", (a) => { const m = mat(a, 0, "A"); const out = M.map(m, (x) => x); for (let k = 1; k < out.data.length; k++) out.data[k] *= out.data[k - 1]!; return out; });
def("diff", (a) => { const m = mat(a, 0, "A"); const v = arr(m); const d = v.slice(1).map((x, i) => x - v[i]!); return m.rows === 1 ? M.rowvec(d) : M.colvec(d); });
def("max", (a, nargout) => {
  if (a.length >= 2 && M.numel(mat(a, 1, "B")) > 0) return M.elementwise(mat(a, 0, "A"), mat(a, 1, "B"), Math.max);
  const m = mat(a, 0, "A");
  const v = M.max(m);
  if (nargout < 2) return v;
  const lin = M.isVector(m) ? arr(m) : null;
  if (lin) { let k = -1; lin.forEach((x, i) => { if (!Number.isNaN(x) && (k < 0 || x > lin[k]!)) k = i; }); return [v, M.toMatrix(k + 1)]; }
  const idx = M.matrix(1, m.cols);
  for (let j = 0; j < m.cols; j++) { let k = 0; for (let i = 1; i < m.rows; i++) if (M.get(m, i, j) > M.get(m, k, j)) k = i; idx.data[j] = k + 1; }
  return [v, idx];
});
def("min", (a, nargout) => {
  if (a.length >= 2 && M.numel(mat(a, 1, "B")) > 0) return M.elementwise(mat(a, 0, "A"), mat(a, 1, "B"), Math.min);
  const m = mat(a, 0, "A");
  const v = M.min(m);
  if (nargout < 2) return v;
  const lin = M.isVector(m) ? arr(m) : null;
  if (lin) { let k = -1; lin.forEach((x, i) => { if (!Number.isNaN(x) && (k < 0 || x < lin[k]!)) k = i; }); return [v, M.toMatrix(k + 1)]; }
  const idx = M.matrix(1, m.cols);
  for (let j = 0; j < m.cols; j++) { let k = 0; for (let i = 1; i < m.rows; i++) if (M.get(m, i, j) < M.get(m, k, j)) k = i; idx.data[j] = k + 1; }
  return [v, idx];
});
def("any", (a) => logical(M.toMatrix(Array.from(mat(a, 0, "A").data).some((x) => x !== 0) ? 1 : 0)));
def("all", (a) => logical(M.toMatrix(Array.from(mat(a, 0, "A").data).every((x) => x !== 0) ? 1 : 0)));
def("find", (a) => {
  const m = mat(a, 0, "A");
  const lin = M.toVector(m);
  const ks: number[] = [];
  lin.forEach((x, k) => { if (x !== 0) ks.push(k + 1); });
  const limit = a.length > 1 ? num(a, 1, "n") : ks.length;
  const out = ks.slice(0, limit);
  return m.rows === 1 ? M.rowvec(out) : M.colvec(out);
});
def("sort", (a, nargout) => {
  const m = mat(a, 0, "A");
  const desc = a.length > 1 && typeof a[1] === "string" && a[1].toLowerCase() === "descend";
  const idx = arr(m).map((_, i) => i).sort((i, j) => (desc ? m.data[j]! - m.data[i]! : m.data[i]! - m.data[j]!));
  const sorted = idx.map((i) => m.data[i]!);
  const shape = (v: number[]) => (m.rows === 1 ? M.rowvec(v) : M.colvec(v));
  return nargout >= 2 ? [shape(sorted), shape(idx.map((i) => i + 1))] : shape(sorted);
});
def("ind2sub", (a, nargout) => {
  const sz = arr(mat(a, 0, "size"));
  const rows = sz[0] ?? 1;
  const ks = mat(a, 1, "index");
  const rr = M.map(ks, (k) => ((k - 1) % rows) + 1);
  const cc = M.map(ks, (k) => Math.floor((k - 1) / rows) + 1);
  return nargout >= 2 ? [rr, cc] : ks;
}, "[row, col] = ind2sub(size(A), k)");
def("sub2ind", (a) => { const sz = arr(mat(a, 0, "size")); const rows = sz[0] ?? 1; return M.elementwise(mat(a, 1, "row"), mat(a, 2, "col"), (i, j) => (j - 1) * rows + i); });
def("unique", (a) => { const m = mat(a, 0, "A"); const u = [...new Set(arr(m))].sort((x, y) => x - y); return m.rows === 1 ? M.rowvec(u) : M.colvec(u); });
def("numel", (a) => M.toMatrix(typeof a[0] === "string" ? a[0].length : M.numel(mat(a, 0, "A"))));

// ---- linear algebra ----------------------------------------------------------

def("transpose", (a) => M.transpose(mat(a, 0, "A")));
def("dot", (a) => M.toMatrix(M.dot(mat(a, 0, "a"), mat(a, 1, "b"))));
def("cross", (a) => M.cross(mat(a, 0, "a"), mat(a, 1, "b")));
def("norm", (a) => M.toMatrix(M.norm(mat(a, 0, "A"))));
def("det", (a) => M.toMatrix(M.det(mat(a, 0, "A"))));
def("inv", (a) => M.inv(mat(a, 0, "A")));
def("trace", (a) => M.toMatrix(arr(M.diag(mat(a, 0, "A"))).reduce((s, x) => s + x, 0)));
def("rank", (a) => {
  const m = mat(a, 0, "A");
  // Row-echelon rank with a relative tolerance.
  const rows = M.toArray(m);
  let rank = 0;
  const cols = m.cols;
  const tol = 1e-10 * Math.max(1, M.norm(m));
  for (let c = 0; c < cols && rank < rows.length; c++) {
    let p = rank;
    for (let r = rank + 1; r < rows.length; r++) if (Math.abs(rows[r]![c]!) > Math.abs(rows[p]![c]!)) p = r;
    if (Math.abs(rows[p]![c]!) < tol) continue;
    [rows[rank], rows[p]] = [rows[p]!, rows[rank]!];
    for (let r = rank + 1; r < rows.length; r++) {
      const f = rows[r]![c]! / rows[rank]![c]!;
      for (let j = c; j < cols; j++) rows[r]![j] -= f * rows[rank]![j]!;
    }
    rank++;
  }
  return M.toMatrix(rank);
});
def("mldivide", (a) => M.mldivide(mat(a, 0, "A"), mat(a, 1, "B")));
def("kron", (a) => {
  const x = mat(a, 0, "A"), y = mat(a, 1, "B");
  const out = M.matrix(x.rows * y.rows, x.cols * y.cols);
  for (let i = 0; i < x.rows; i++) for (let j = 0; j < x.cols; j++)
    for (let k = 0; k < y.rows; k++) for (let l = 0; l < y.cols; l++)
      out.data[(i * y.rows + k) * out.cols + j * y.cols + l] = M.get(x, i, j) * M.get(y, k, l);
  return out;
});

// ---- numerics ----------------------------------------------------------------

def("fzero", (a, _n, interp) => {
  const f = callScalarFn(fn(a, 0, "fun", interp), interp);
  const x0 = mat(a, 1, "x0");
  return M.toMatrix(N.fzero(f, M.numel(x0) === 2 ? [x0.data[0]!, x0.data[1]!] : toNumber(x0)));
});
def("fminsearch", (a, nargout, interp) => {
  const f = fn(a, 0, "fun", interp);
  const x0 = mat(a, 1, "x0");
  const r = N.fminsearch((x) => toNumber(interp.callFunction(f, [x0.rows === 1 ? M.rowvec(x) : M.colvec(x)], 1)[0]!), arr(x0));
  const x = x0.rows === 1 ? M.rowvec(r.x) : M.colvec(r.x);
  return nargout >= 2 ? [x, M.toMatrix(r.fval)] : x;
});
def("fminbnd", (a, nargout, interp) => {
  const f = callScalarFn(fn(a, 0, "fun", interp), interp);
  let lo = num(a, 1, "x1"), hi = num(a, 2, "x2");
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = hi - gr * (hi - lo), d = lo + gr * (hi - lo);
  for (let i = 0; i < 200 && Math.abs(hi - lo) > 1e-10; i++) {
    if (f(c) < f(d)) hi = d; else lo = c;
    c = hi - gr * (hi - lo); d = lo + gr * (hi - lo);
  }
  const x = (lo + hi) / 2;
  return nargout >= 2 ? [M.toMatrix(x), M.toMatrix(f(x))] : M.toMatrix(x);
});
def("integral", (a, _n, interp) => {
  const f = callScalarFn(fn(a, 0, "fun", interp), interp);
  const lo = num(a, 1, "a"), hi = num(a, 2, "b");
  // Adaptive Simpson.
  const simpson = (l: number, r: number, fl: number, fm: number, fr: number): number => ((r - l) / 6) * (fl + 4 * fm + fr);
  const rec = (l: number, r: number, fl: number, fm: number, fr: number, whole: number, tol: number, depth: number): number => {
    const m = (l + r) / 2, lm = (l + m) / 2, rm = (m + r) / 2;
    const flm = f(lm), frm = f(rm);
    const left = simpson(l, m, fl, flm, fm), right = simpson(m, r, fm, frm, fr);
    if (depth > 40 || Math.abs(left + right - whole) <= 15 * tol) return left + right + (left + right - whole) / 15;
    return rec(l, m, fl, flm, fm, left, tol / 2, depth + 1) + rec(m, r, fm, frm, fr, right, tol / 2, depth + 1);
  };
  const fl = f(lo), fr = f(hi), fm = f((lo + hi) / 2);
  return M.toMatrix(rec(lo, hi, fl, fm, fr, simpson(lo, hi, fl, fm, fr), 1e-10, 0));
});
def("trapz", (a) => (a.length === 1 ? M.toMatrix(N.trapz(arr(mat(a, 0, "y")))) : M.toMatrix(N.trapz(arr(mat(a, 0, "x")), arr(mat(a, 1, "y"))))));
def("cumtrapz", (a) => { const x = mat(a, 0, "x"); const y = a.length > 1 ? mat(a, 1, "y") : x; const xs = a.length > 1 ? arr(x) : arr(x).map((_, i) => i); const r = N.cumtrapz(xs, arr(y)); return y.rows === 1 ? M.rowvec(r) : M.colvec(r); });
def("interp1", (a) => { const xq = mat(a, 2, "xq"); const r = N.interp1(arr(mat(a, 0, "x")), arr(mat(a, 1, "y")), arr(xq)); return M.matrix(xq.rows, xq.cols, r); });
def("polyfit", (a) => M.rowvec(N.polyfit(arr(mat(a, 0, "x")), arr(mat(a, 1, "y")), num(a, 2, "n"))));
def("polyval", (a) => { const p = arr(mat(a, 0, "p")); return M.map(mat(a, 1, "x"), (x) => N.polyval(p, x)); });
def("roots", (a) => {
  // Companion-matrix-free: Durand–Kerner for real roots reported with imaginary parts dropped when tiny.
  const p = arr(mat(a, 0, "p"));
  while (p.length && p[0] === 0) p.shift();
  const n = p.length - 1;
  if (n < 1) return M.matrix(0, 0);
  const re = Array.from({ length: n }, (_, k) => Math.cos((2 * Math.PI * k) / n + 0.4) * 0.9);
  const im = Array.from({ length: n }, (_, k) => Math.sin((2 * Math.PI * k) / n + 0.4) * 0.9);
  const lead = p[0]!;
  const evalP = (x: number, y: number): [number, number] => { let rr = 0, ii = 0; for (const c of p) { const nr = rr * x - ii * y + c / lead; ii = rr * y + ii * x; rr = nr; } return [rr, ii]; };
  for (let it = 0; it < 500; it++) {
    let moved = 0;
    for (let k = 0; k < n; k++) {
      let [nr, ni] = evalP(re[k]!, im[k]!);
      let dr = 1, di = 0;
      for (let j = 0; j < n; j++) { if (j === k) continue; const ar = re[k]! - re[j]!, ai = im[k]! - im[j]!; const t = dr * ar - di * ai; di = dr * ai + di * ar; dr = t; }
      const den = dr * dr + di * di;
      const qr = (nr * dr + ni * di) / den, qi = (ni * dr - nr * di) / den;
      re[k] -= qr; im[k] -= qi; moved = Math.max(moved, Math.hypot(qr, qi));
      [nr, ni] = [0, 0];
    }
    if (moved < 1e-14) break;
  }
  const out = re.map((r, k) => (Math.abs(im[k]!) < 1e-8 ? r : NaN));
  if (out.some(Number.isNaN)) throw new RuntimeError("roots: complex roots found; this console reports real roots only");
  return M.colvec(out.sort((x, y) => y - x));
});
def("meshgrid", (a) => { const [X, Y] = N.meshgrid(mat(a, 0, "x"), a.length > 1 ? mat(a, 1, "y") : mat(a, 0, "x")); return [X, Y]; });

// ---- ODE ---------------------------------------------------------------------

function odeOptions(v: Value | undefined): OdeOptions {
  if (v === undefined || !isStruct(v)) return {};
  const o: OdeOptions = {};
  const g = (k: string) => { const x = v.fields.get(k); return x === undefined ? undefined : toNumber(x, k); };
  o.RelTol = g("RelTol"); o.AbsTol = g("AbsTol"); o.MaxStep = g("MaxStep"); o.InitialStep = g("InitialStep");
  return o;
}
def("odeset", (a) => {
  const fields: Record<string, Value> = {};
  for (let i = 0; i + 1 < a.length; i += 2) fields[str(a, i, "option name")] = a[i + 1]!;
  return struct(fields);
});

function solveOde(kind: "ode45" | "ode4", a: Value[], nargout: number, interp: Interpreter): Value | Value[] {
  const f = fn(a, 0, "odefun", interp);
  const tspan = arr(mat(a, 1, "tspan"));
  const y0 = mat(a, 2, "y0");
  const opts = odeOptions(a[3]);
  let events: OdeOptions["Events"];
  if (isStruct(a[3] ?? M.toMatrix(0)) && (a[3] as { fields: Map<string, Value> }).fields.has("Events")) {
    const ef = (a[3] as { fields: Map<string, Value> }).fields.get("Events")!;
    if (!isFunction(ef)) throw new RuntimeError("Events option must be a function handle");
    events = (t, y) => {
      const r = interp.callFunction(ef, [M.toMatrix(t), M.colvec(y)], 3);
      const value = arr(toMat(r[0] ?? M.toMatrix(0)));
      const term = arr(toMat(r[1] ?? M.toMatrix(0))).map((x) => x !== 0);
      const dir = arr(toMat(r[2] ?? M.toMatrix(0)));
      return { value, isterminal: value.map((_, i) => term[i] ?? term[0] ?? false), direction: value.map((_, i) => dir[i] ?? dir[0] ?? 0) };
    };
  }
  const rhs = (t: number, y: Float64Array) => {
    const out = interp.callFunction(f, [M.toMatrix(t), M.colvec(y)], 1)[0];
    if (out === undefined) throw new RuntimeError("ODE function returned nothing");
    return toMat(out, "ODE derivative").data;
  };
  const sol = kind === "ode45" ? ode45(rhs, tspan, arr(y0), { ...opts, Events: events }) : ode4(rhs, tspan, arr(y0));
  const t = M.colvec(sol.t);
  const y = M.matrix(sol.y.length, y0.data.length);
  sol.y.forEach((row, i) => y.data.set(row, i * y.cols));
  if (nargout <= 1) return struct({ x: M.rowvec(sol.t), y: M.transpose(y), t, te: M.colvec(sol.te), ie: M.colvec(sol.ie.map((k) => k + 1)), stats: struct({ nsteps: sol.stats.steps, nfailed: sol.stats.failed, nfevals: sol.stats.fevals }) });
  const outs: Value[] = [t, y];
  if (nargout >= 3) {
    outs.push(M.colvec(sol.te));
    const ye = M.matrix(sol.ye.length, y0.data.length);
    sol.ye.forEach((row, i) => ye.data.set(row, i * ye.cols));
    outs.push(ye, M.colvec(sol.ie.map((k) => k + 1)));
  }
  return outs;
}
def("ode45", (a, n, interp) => solveOde("ode45", a, n, interp), "[t,y] = ode45(@(t,y) f, tspan, y0, options)");
def("ode23", (a, n, interp) => solveOde("ode45", a, n, interp));
def("ode113", (a, n, interp) => solveOde("ode45", a, n, interp));
def("ode4", (a, n, interp) => solveOde("ode4", a, n, interp), "[t,y] = ode4(@(t,y) f, tspan, y0) fixed-step RK4");

// ---- astrodynamics -----------------------------------------------------------

def("kepler2cart", (a) => {
  const el = arr(mat(a, 0, "elements"));
  if (el.length !== 6) throw new RuntimeError("kepler2cart: elements must be [a e i RAAN argp nu]");
  const sv = A.kepler2cart({ a: el[0]!, e: el[1]!, i: el[2]!, raan: el[3]!, argp: el[4]!, nu: el[5]! }, num(a, 1, "mu"));
  return [M.colvec(sv.r), M.colvec(sv.v)];
}, "[r, v] = kepler2cart([a e i RAAN argp nu], mu)");
def("cart2kepler", (a) => {
  const el = A.cart2kepler({ r: vec3(mat(a, 0, "r"), "r"), v: vec3(mat(a, 1, "v"), "v") }, num(a, 2, "mu"));
  return M.rowvec([el.a, el.e, el.i, el.raan, el.argp, el.nu]);
}, "elements = cart2kepler(r, v, mu) → [a e i RAAN argp nu]");
def("keplerE", (a) => M.elementwise(mat(a, 0, "M"), mat(a, 1, "e"), A.keplerE), "E = keplerE(M, e) solves Kepler's equation");
def("mean2true", (a) => M.elementwise(mat(a, 0, "M"), mat(a, 1, "e"), A.meanToTrue));
def("true2mean", (a) => M.elementwise(mat(a, 0, "nu"), mat(a, 1, "e"), A.trueToMean));
def("period", (a) => M.map(mat(a, 0, "a"), (x) => A.period(x, num(a, 1, "mu"))), "T = period(a, mu)");
def("visviva", (a) => M.map(mat(a, 0, "r"), (r) => A.visViva(r, num(a, 1, "a"), num(a, 2, "mu"))), "v = visviva(r, a, mu)");
def("vcirc", (a) => M.map(mat(a, 0, "r"), (r) => A.circularSpeed(r, num(a, 1, "mu"))));
def("vesc", (a) => M.map(mat(a, 0, "r"), (r) => A.escapeSpeed(r, num(a, 1, "mu"))));
def("hohmann", (a) => { const h = A.hohmann(num(a, 0, "r1"), num(a, 1, "r2"), num(a, 2, "mu")); return struct({ dv1: h.dv1, dv2: h.dv2, dv_total: h.dvTotal, tof: h.tof, a_transfer: h.aTransfer }); }, "s = hohmann(r1, r2, mu)");
def("bielliptic", (a) => { const h = A.biElliptic(num(a, 0, "r1"), num(a, 1, "r2"), num(a, 2, "rB"), num(a, 3, "mu")); return struct({ dv1: h.dv1, dv2: h.dv2, dv3: h.dv3, dv_total: h.dvTotal, tof: h.tof }); });
def("escape_dv", (a) => M.map(mat(a, 0, "vinf"), (v) => A.escapeDeltaV(v, num(a, 1, "r_park"), num(a, 2, "mu"))), "dv = escape_dv(vinf, r_park, mu) from circular parking orbit, SI");
def("capture_dv", (a) => M.map(mat(a, 0, "vinf"), (v) => A.captureDeltaV(v, num(a, 1, "r_p"), num(a, 2, "mu"), a.length > 3 ? num(a, 3, "e") : 0)), "dv = capture_dv(vinf, r_periapsis, mu, [e]) into an orbit of eccentricity e");
def("prop_fraction", (a) => M.map(mat(a, 0, "dv"), (v) => A.propellantFraction(v, num(a, 1, "isp"))), "f = prop_fraction(dv, isp) Tsiolkovsky propellant mass fraction");
def("planechange", (a) => M.toMatrix(A.planeChange(num(a, 0, "v"), num(a, 1, "di"))));
def("synodic", (a) => M.toMatrix(A.synodicPeriod(num(a, 0, "T1"), num(a, 1, "T2"))));
def("soi", (a) => M.toMatrix(A.sphereOfInfluence(num(a, 0, "d"), num(a, 1, "m2"), num(a, 2, "m1"))));
def("hill", (a) => M.toMatrix(A.hillRadius(num(a, 0, "d"), num(a, 1, "m2"), num(a, 2, "m1"))));
def("lambert", (a) => {
  const pro = a.length > 4 ? (typeof a[4] === "string" ? a[4].toLowerCase() !== "retro" : toNumber(a[4]!) !== 0) : true;
  const r = A.lambert(vec3(mat(a, 0, "r1"), "r1"), vec3(mat(a, 1, "r2"), "r2"), num(a, 2, "tof"), num(a, 3, "mu"), pro);
  return [M.colvec(r.v1), M.colvec(r.v2)];
}, "[v1, v2] = lambert(r1, r2, tof, mu, 'pro'|'retro')");
def("twobody", (a) => {
  // Function handle for ode45: f = twobody(mu)
  const mu = num(a, 0, "mu");
  const rhs = A.twoBodyRhs(mu);
  const f: FunctionValue = { kind: "function", name: "twobody", call: (args) => [M.colvec(rhs(toNumber(args[0]!), toMat(args[1]!).data))] };
  return f;
}, "f = twobody(mu) returns @(t,y) for ode45");
def("cr3bp", (a) => {
  const mu = num(a, 0, "mu");
  const rhs = A.cr3bpRhs(mu);
  const f: FunctionValue = { kind: "function", name: "cr3bp", call: (args) => [M.colvec(rhs(toNumber(args[0]!), toMat(args[1]!).data))] };
  return f;
}, "f = cr3bp(mu) returns the rotating-frame CR3BP @(t,y) for ode45");
def("jacobi", (a) => M.toMatrix(A.jacobiConstant(num(a, 0, "mu"), arr(mat(a, 1, "state")))));
def("lagrange", (a) => { const L = A.lagrangePoints(num(a, 0, "mu")); return struct({ L1: L.L1, L2: L.L2, L3: L.L3, L4: M.rowvec(L.L4), L5: M.rowvec(L.L5) }); }, "L = lagrange(mu)");
def("propagate", (a, nargout) => {
  const r = vec3(mat(a, 0, "r"), "r"), v = vec3(mat(a, 1, "v"), "v");
  const mu = num(a, 2, "mu");
  const tspan = arr(mat(a, 3, "tspan"));
  const sol = A.propagate({ r, v }, mu, tspan);
  const t = M.colvec(sol.t);
  const y = M.matrix(sol.y.length, 6);
  sol.y.forEach((row, i) => y.data.set(row, i * 6));
  return nargout >= 2 ? [t, y] : y;
}, "[t, y] = propagate(r, v, mu, tspan)");
def("kepler_propagate", (a) => {
  const sv = A.propagateKepler({ r: vec3(mat(a, 0, "r"), "r"), v: vec3(mat(a, 1, "v"), "v") }, num(a, 2, "mu"), num(a, 3, "dt"));
  return [M.colvec(sv.r), M.colvec(sv.v)];
}, "[r, v] = kepler_propagate(r0, v0, mu, dt)");

// ---- ephemerides & porkchop ---------------------------------------------------

const planetId = (v: Value | undefined, what: string): A.PlanetId => {
  if (typeof v !== "string") throw new RuntimeError(`${what} must be a planet name, e.g. 'earth'`);
  const id = v.toLowerCase();
  if (!(A.PLANET_IDS as readonly string[]).includes(id)) throw new RuntimeError(`${what}: unknown planet '${v}' (use ${A.PLANET_IDS.join(", ")})`);
  return id as A.PlanetId;
};
def("juliandate", (a) => {
  if (a.length === 1) { const m = mat(a, 0, "date"); const d = arr(m); return M.toMatrix(A.juliandate(d[0] ?? 2000, d[1] ?? 1, d[2] ?? 1, d[3] ?? 0, d[4] ?? 0, d[5] ?? 0)); }
  return M.toMatrix(A.juliandate(num(a, 0, "year"), num(a, 1, "month"), num(a, 2, "day"), a.length > 3 ? num(a, 3, "hour") : 0, a.length > 4 ? num(a, 4, "minute") : 0, a.length > 5 ? num(a, 5, "second") : 0));
}, "jd = juliandate(year, month, day, [h, m, s]) or juliandate([y m d])");
def("jd2date", (a) => { const d = A.jd2date(num(a, 0, "jd")); return M.rowvec([d.year, d.month, d.day, d.hour, d.minute, d.second]); }, "[y m d h mi s] = jd2date(jd)");
def("datestr", (a) => {
  const m = mat(a, 0, "jd");
  const one = (jd: number) => { const d = A.jd2date(jd + 1e-9); return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`; };
  return arr(m).map(one).join("\n");
}, "s = datestr(jd) → 'yyyy-mm-dd'");
def("ephemeris", (a) => {
  const body = planetId(a[0], "body");
  const jd = mat(a, 1, "jd");
  if (M.isScalar(jd)) { const sv = A.planetState(body, jd.data[0]!); return [M.colvec(sv.r), M.colvec(sv.v)]; }
  const R = M.matrix(M.numel(jd), 3), V = M.matrix(M.numel(jd), 3);
  arr(jd).forEach((t, i) => { const sv = A.planetState(body, t); R.data.set(sv.r, i * 3); V.data.set(sv.v, i * 3); });
  return [R, V];
}, "[r, v] = ephemeris('mars', jd) heliocentric ecliptic J2000 state, m and m/s");
def("porkchop", (a, nargout) => {
  const from = planetId(a[0], "departure body"), to = planetId(a[1], "arrival body");
  const jdDep = arr(mat(a, 2, "departure dates")), jdArr = arr(mat(a, 3, "arrival dates"));
  if (jdDep.length * jdArr.length > 250000) throw new RuntimeError("porkchop: grid too large (limit 250000 points)");
  const pro = a.length > 4 ? (typeof a[4] === "string" ? a[4].toLowerCase() !== "retro" : toNumber(a[4]!) !== 0) : true;
  const p = A.porkchop(from, to, jdDep, jdArr, pro);
  const grid = (g: number[][]) => M.toMatrix(g);
  const s = struct({ jd_dep: M.rowvec(jdDep), jd_arr: M.colvec(jdArr), C3: grid(p.c3), vinf_dep: grid(p.vinfDep), vinf_arr: grid(p.vinfArr), tof: grid(p.tof),
    best_C3: p.best.c3, best_vinf_arr: p.best.vinfArr, best_jd_dep: p.best.jdDep, best_jd_arr: p.best.jdArr, best_tof: p.best.tof });
  return nargout >= 2 ? [grid(p.c3), grid(p.vinfArr), grid(p.tof)] : s;
}, "s = porkchop('earth', 'mars', jd_dep, jd_arr) → C3 [km^2/s^2], vinf_arr [km/s], tof [days] grids");

// ---- atmospheric entry ---------------------------------------------------------

def("atmosphere", (a) => {
  const body = str(a, 0, "body").toLowerCase();
  const atm = E.ATMOSPHERES[body];
  if (!atm) throw new RuntimeError(`atmosphere: no model for '${body}' (have ${Object.keys(E.ATMOSPHERES).join(", ")})`);
  if (a.length > 1) return M.map(mat(a, 1, "h"), (h) => E.density(atm, h));
  return struct({ rho0: atm.rho0, H: atm.H, k_sg: atm.kSG, mu: atm.mu, radius: atm.radius });
}, "s = atmosphere('mars') exponential model; rho = atmosphere('mars', h) density at altitude h");
def("entry", (a) => {
  const body = str(a, 0, "body");
  const v0 = num(a, 1, "entry speed"), g0 = num(a, 2, "flight-path angle (rad)"), h0 = num(a, 3, "entry altitude");
  const o = a[4];
  const g = (k: string, d?: number): number | undefined => {
    if (o === undefined || !isStruct(o)) return d;
    const v = o.fields.get(k);
    return v === undefined ? d : toNumber(v, k);
  };
  const mass = g("m") ?? g("mass"), area = g("A") ?? g("area"), cd = g("CD") ?? g("cd");
  if (mass === undefined || area === undefined || cd === undefined) throw new RuntimeError("entry: options struct needs m, A and CD (use struct('m', 1000, 'A', 4, 'CD', 1.2, ...))");
  const r = E.entry(body, v0, g0, h0, { mass, area, cd, ld: g("LD", 0), bank: g("bank", 0), noseRadius: g("rn", 1), stopAltitude: g("h_stop", 0), stopSpeed: g("v_stop", 0), maxTime: g("t_max", 3600) });
  return struct({
    t: M.colvec(r.t), h: M.colvec(r.h), v: M.colvec(r.v), gamma: M.colvec(r.gamma), range: M.colvec(r.range),
    decel: M.colvec(r.decel), qdot: M.colvec(r.qdot), heat_load: M.colvec(r.heatLoad), q: M.colvec(r.q),
    peak_decel: r.peakDecel, peak_qdot: r.peakQdot, total_heat_load: r.totalHeatLoad, beta: r.ballisticCoefficient,
    outcome: r.outcome, t_end: r.t[r.t.length - 1] ?? 0, v_end: r.v[r.v.length - 1] ?? 0, h_end: r.h[r.h.length - 1] ?? 0, range_end: r.range[r.range.length - 1] ?? 0,
  });
}, "s = entry('earth', v0, gamma0, h0, struct('m',..,'A',..,'CD',..,'LD',0,'bank',0,'rn',1,'h_stop',0,'v_stop',0))");

// ---- impacts -----------------------------------------------------------------

def("impact", (a) => {
  const r = I.impact({ diameter: num(a, 0, "diameter"), density: num(a, 1, "density"), speed: num(a, 2, "speed"), angle: a.length > 3 ? num(a, 3, "angle") : Math.PI / 4, targetDensity: a.length > 4 ? num(a, 4, "target density") : undefined });
  return struct({ mass: r.mass, energy: r.energy, energy_kt: r.energyKt, energy_Mt: r.energyMt, D_transient: r.transientDiameter, D_final: r.finalDiameter, depth_transient: r.transientDepth, complex: r.complex ? 1 : 0, magnitude: r.magnitude, recurrence_years: r.recurrenceYears });
}, "s = impact(diameter, density, speed, angle, [target density])");
def("overpressure", (a) => M.map(mat(a, 1, "r"), (r) => I.airblastOverpressure(num(a, 0, "energy"), r, a.length > 2 ? num(a, 2, "altitude") : 0)), "p = overpressure(E, r, [burst altitude])");
def("thermal", (a) => M.map(mat(a, 1, "r"), (r) => I.thermalExposure(num(a, 0, "energy"), r)));
def("fireball", (a) => M.map(mat(a, 0, "E"), I.fireballRadius));

// ---- strings & output --------------------------------------------------------

function sprintfImpl(fmt: string, args: Value[]): string {
  const flat: (number | string)[] = [];
  for (const v of args) {
    if (typeof v === "string") flat.push(v);
    else if (M.isMatrix(v)) flat.push(...M.toVector(v));
    else throw new RuntimeError("sprintf: unsupported argument type");
  }
  const re = /%(%|[-+ 0#]*(\d+)?(?:\.(\d+))?([dfegsixXc]))/g;
  let out = "";
  let k = 0;
  const specCount = (fmt.match(re) ?? []).filter((s) => s !== "%%").length;
  const escape = (s: string) => s.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\");
  do {
    out += escape(fmt.replace(re, (m, spec: string, width: string | undefined, prec: string | undefined, conv: string) => {
      if (m === "%%") return "%";
      const v = flat[k++];
      if (v === undefined) return "";
      let s: string;
      const p = prec !== undefined ? Number(prec) : undefined;
      if (conv === "s") s = typeof v === "string" ? v : M.format(M.toMatrix(v));
      else if (conv === "c") s = typeof v === "string" ? v : String.fromCharCode(v);
      else {
        const x = typeof v === "string" ? Number(v) : v;
        if (conv === "d" || conv === "i") s = Number.isInteger(x) ? String(x) : x.toPrecision(p ?? 6).replace(/\.?0+(e|$)/, "$1");
        else if (conv === "f") s = x.toFixed(p ?? 6);
        else if (conv === "e") s = x.toExponential(p ?? 6);
        else if (conv === "x" || conv === "X") s = Math.trunc(x).toString(16);
        else s = fmtG(x, p ?? 6);
        if (spec.includes("+") && x >= 0) s = "+" + s;
      }
      if (width) { const w = Number(width); s = spec.includes("-") ? s.padEnd(w) : s.padStart(w, spec.startsWith("0") ? "0" : " "); }
      return s;
    }));
  } while (specCount > 0 && k < flat.length);
  return out;
}

function fmtG(x: number, p: number): string {
  if (x === 0) return "0";
  if (!Number.isFinite(x)) return String(x);
  const exp = Math.floor(Math.log10(Math.abs(x)));
  if (exp < -5 || exp >= p) {
    const s = x.toExponential(p - 1);
    const [mant, e] = s.split("e");
    const ex = Number(e);
    return `${mant!.replace(/\.?0+$/, "")}e${ex < 0 ? "-" : "+"}${String(Math.abs(ex)).padStart(2, "0")}`;
  }
  return String(Number(x.toPrecision(p)));
}

def("sprintf", (a) => sprintfImpl(str(a, 0, "format"), a.slice(1)));
def("fprintf", (a, _n, interp) => { interp.host.print(sprintfImpl(str(a, 0, "format"), a.slice(1))); });
def("disp", (a, _n, interp) => {
  const v = a[0];
  if (v === undefined) return;
  if (typeof v === "string") interp.host.print(v + "\n");
  else if (M.isMatrix(v)) interp.host.print((M.isScalar(v) ? "    " + M.format(v) : M.format(v)) + "\n");
  else interp.host.print(formatValue(v).replace(/^[^\n]*\n\n/, ""));
});
def("display", (a, _n, interp) => { if (a[0] !== undefined) interp.host.print(formatValue(a[0])); });
def("num2str", (a) => { const v = a[0]; if (typeof v === "string") return v; const m = toMat(v ?? M.matrix(0, 0)); if (a.length > 1 && typeof a[1] === "string") return sprintfImpl(a[1], [m]); if (M.isScalar(m)) { const x = m.data[0]!; return Number.isInteger(x) ? String(x) : fmtG(x, a.length > 1 ? num(a, 1, "precision") : 5); } return M.format(m).trim(); });
def("mat2str", (a) => { const m = mat(a, 0, "A"); if (M.isScalar(m)) return String(m.data[0]); return "[" + M.toArray(m).map((r) => r.join(" ")).join(";") + "]"; });
def("str2num", (a) => M.toMatrix(Number(str(a, 0, "s"))));
def("str2double", (a) => M.toMatrix(Number(str(a, 0, "s"))));
def("strcat", (a) => a.map((v) => (typeof v === "string" ? v : M.format(toMat(v)))).join(""));
def("upper", (a) => str(a, 0, "s").toUpperCase());
def("lower", (a) => str(a, 0, "s").toLowerCase());
def("strtrim", (a) => str(a, 0, "s").trim());
def("strcmp", (a) => logical(M.toMatrix(a[0] === a[1] && typeof a[0] === "string" ? 1 : 0)));
def("strcmpi", (a) => logical(M.toMatrix(typeof a[0] === "string" && typeof a[1] === "string" && a[0].toLowerCase() === a[1].toLowerCase() ? 1 : 0)));
def("strrep", (a) => str(a, 0, "s").split(str(a, 1, "old")).join(str(a, 2, "new")));
def("contains", (a) => logical(M.toMatrix(str(a, 0, "s").includes(str(a, 1, "pattern")) ? 1 : 0)));
def("error", (a) => { throw new RuntimeError(a.length ? sprintfImpl(str(a, 0, "message"), a.slice(1)) : "error"); });
def("warning", (a, _n, interp) => { if (a.length) interp.host.print("Warning: " + sprintfImpl(str(a, 0, "message"), a.slice(1)) + "\n"); });
def("assert", (a) => { const v = a[0]; if (v === undefined) throw new RuntimeError("assert: missing condition"); const ok = typeof v === "string" ? v.length > 0 : M.isMatrix(v) && M.numel(v) > 0 && Array.from(v.data).every((x) => x !== 0); if (!ok) throw new RuntimeError(a.length > 1 ? sprintfImpl(str(a, 1, "message"), a.slice(2)) : "Assertion failed."); });
def("struct", (a) => { const fields: Record<string, Value> = {}; for (let i = 0; i + 1 < a.length; i += 2) fields[str(a, i, "field name")] = a[i + 1]!; return struct(fields); });
def("fieldnames", (a) => { const v = a[0]; if (v === undefined || !isStruct(v)) throw new RuntimeError("fieldnames: struct required"); return [...v.fields.keys()].join("\n"); });
def("isfield", (a) => logical(M.toMatrix(a[0] !== undefined && isStruct(a[0]) && a[0].fields.has(str(a, 1, "field")) ? 1 : 0)));
def("func2str", (a, _n, interp) => "@" + fn(a, 0, "f", interp).name);
def("feval", (a, n, interp) => interp.callFunction(fn(a, 0, "f", interp), a.slice(1), n));
def("arrayfun", (a, _n, interp) => { const f = fn(a, 0, "f", interp); const m = mat(a, 1, "A"); return M.map(m, (x) => toNumber(interp.callFunction(f, [M.toMatrix(x)], 1)[0]!, "arrayfun result")); });
def("cellfun", () => { throw new RuntimeError("Cell arrays are not supported in this console"); });
def("numel", (a) => M.toMatrix(typeof a[0] === "string" ? a[0].length : M.numel(mat(a, 0, "A"))));

// ---- session -----------------------------------------------------------------

def("clc", (_a, _n, interp) => { interp.host.clear?.(); });
def("clear", (a, _n, interp) => { if (a.length === 0 || (typeof a[0] === "string" && a[0] === "all")) interp.vars.clear(); else for (const v of a) if (typeof v === "string") interp.vars.delete(v); });
def("who", (_a, _n, interp) => { interp.host.print([...interp.vars.keys()].sort().join("  ") + "\n"); });
def("whos", (_a, _n, interp) => {
  const lines = [...interp.vars.entries()].sort().map(([k, v]) => `  ${k.padEnd(12)} ${(M.isMatrix(v) ? `${v.rows}x${v.cols}` : typeof v === "string" ? `1x${v.length}` : "1x1").padEnd(10)} ${typeName(v)}`);
  interp.host.print(`  Name         Size       Class\n${lines.join("\n")}\n`);
});
def("exist", (a, _n, interp) => M.toMatrix(interp.vars.has(str(a, 0, "name")) ? 1 : interp.lookupFunction(str(a, 0, "name")) ? 5 : 0));
def("format", () => {});
def("tic", (_a, _n, interp) => { ticTime = (interp.host.now ?? Date.now)(); });
let ticTime = 0;
def("toc", (_a, nargout, interp) => { const dt = ((interp.host.now ?? Date.now)() - ticTime) / 1000; if (nargout >= 1) return M.toMatrix(dt); interp.host.print(`Elapsed time is ${dt.toFixed(6)} seconds.\n`); });
def("help", (a, _n, interp) => {
  if (a.length && typeof a[0] === "string") {
    const f = interp.lookupFunction(a[0]) as (FunctionValue & { help?: string }) | undefined;
    interp.host.print(f ? `  ${a[0]}: ${f.help || "(no help text)"}\n` : `  '${a[0]}' not found.\n`);
    return;
  }
  const groups: Record<string, string[]> = { "Orbital mechanics": [], Impacts: [], Solvers: [], "Matrices & maths": [], Plotting: [] };
  for (const [name, f] of fns) {
    const h = (f as FunctionValue & { help?: string }).help ?? "";
    if (["juliandate", "jd2date", "datestr", "ephemeris", "porkchop", "kepler2cart", "cart2kepler", "keplerE", "mean2true", "true2mean", "period", "visviva", "vcirc", "vesc", "hohmann", "bielliptic", "planechange", "synodic", "soi", "hill", "lambert", "escape_dv", "capture_dv", "prop_fraction", "twobody", "cr3bp", "jacobi", "lagrange", "propagate", "kepler_propagate"].includes(name)) groups["Orbital mechanics"]!.push(name);
    else if (["impact", "overpressure", "thermal", "fireball", "entry", "atmosphere"].includes(name)) groups["Impacts"]!.push(name);
    else if (["ode45", "ode4", "odeset", "fzero", "fminsearch", "fminbnd", "integral", "trapz", "interp1", "polyfit", "polyval", "roots"].includes(name)) groups["Solvers"]!.push(name);
    else if (["plot", "semilogy", "semilogx", "loglog", "contour", "contourf", "hold", "figure", "xlabel", "ylabel", "title", "legend", "grid", "axis", "clf", "close"].includes(name)) groups["Plotting"]!.push(name);
    else if (!h.includes("m^3") && !/^(R_|mu_)/.test(name)) groups["Matrices & maths"]!.push(name);
  }
  interp.host.print(
    Object.entries(groups).map(([g, names]) => `  ${g}:\n    ${names.sort().join(", ")}`).join("\n") +
    `\n  Constants: pi, Inf, NaN, eps, AU, G, day, year, g0, mu_<body>, R_<body> (${Object.keys(A.MU).join(", ")})\n  Type help <name> for a one-line description.\n`,
  );
});

// ---- plotting ----------------------------------------------------------------

function plotImpl(a: Value[], interp: Interpreter, transform?: "semilogy" | "semilogx" | "loglog"): void {
  const st = interp.plotState;
  if (!st.hold) { st.series = []; st.legend = null; st.contour = null; }
  let i = 0;
  while (i < a.length) {
    const x = mat(a, i, "x");
    let y: Matrix | null = null;
    let style = "";
    if (i + 1 < a.length && M.isMatrix(a[i + 1])) { y = a[i + 1] as Matrix; i += 2; }
    else { i += 1; }
    if (i < a.length && typeof a[i] === "string") { style = a[i] as string; i += 1; }
    const push = (xs: number[], ys: number[]) => st.series.push({ x: xs, y: ys, style });
    if (y === null) {
      const ys = arr(x);
      push(ys.map((_, k) => k + 1), ys);
    } else if (M.isVector(x) && M.isVector(y)) {
      if (M.numel(x) !== M.numel(y)) throw new RuntimeError("plot: vectors must be the same length");
      push(arr(x), arr(y));
    } else if (M.isVector(x) && !M.isVector(y)) {
      const n = M.numel(x);
      const cols = y.rows === n ? y.cols : y.rows;
      for (let j = 0; j < cols; j++) push(arr(x), arr(y.rows === n ? M.index(y, null, [j]) : M.index(y, [j], null)));
    } else {
      const cols = x.cols;
      for (let j = 0; j < cols; j++) push(arr(M.index(x, null, [j])), arr(M.index(y, null, [j])));
    }
  }
  (st as { scale?: string }).scale = transform ?? "linear";
  interp.host.plot?.(st);
}
def("plot", (a, _n, interp) => plotImpl(a, interp), "plot(x, y, 'style')");
def("semilogy", (a, _n, interp) => plotImpl(a, interp, "semilogy"));
def("semilogx", (a, _n, interp) => plotImpl(a, interp, "semilogx"));
def("loglog", (a, _n, interp) => plotImpl(a, interp, "loglog"));
function contourImpl(a: Value[], interp: Interpreter, filled: boolean): void {
  const st = interp.plotState;
  let x: Matrix, y: Matrix, z: Matrix, levelArg: Value | undefined;
  if (a.length >= 3 && M.isMatrix(a[2])) { x = mat(a, 0, "x"); y = mat(a, 1, "y"); z = mat(a, 2, "Z"); levelArg = a[3]; }
  else { z = mat(a, 0, "Z"); x = M.colon(1, 1, z.cols); y = M.colon(1, 1, z.rows); levelArg = a[1]; }
  if (M.numel(x) !== z.cols || M.numel(y) !== z.rows) throw new RuntimeError(`contour: Z must be ${M.numel(y)}x${M.numel(x)} for these x and y, got ${z.rows}x${z.cols}`);
  const zs = M.toArray(z);
  const finiteZ = z.data.filter((v) => Number.isFinite(v));
  let levels: number[];
  if (levelArg !== undefined && M.isMatrix(levelArg) && M.numel(levelArg) > 1) levels = arr(levelArg);
  else {
    const n = levelArg !== undefined ? toNumber(levelArg, "level count") : 10;
    const lo = Math.min(...finiteZ), hi = Math.max(...finiteZ);
    levels = Array.from({ length: n }, (_, i) => lo + ((hi - lo) * (i + 1)) / (n + 1));
  }
  if (!st.hold) { st.series = []; st.legend = null; }
  st.contour = { x: arr(x), y: arr(y), z: zs, levels, filled };
  (st as { scale?: string }).scale = "linear";
  interp.host.plot?.(st);
}
def("contour", (a, _n, interp) => contourImpl(a, interp, false), "contour(x, y, Z, [n | levels])");
def("contourf", (a, _n, interp) => contourImpl(a, interp, true), "contourf(x, y, Z, [n | levels]) filled contours");
def("colorbar", () => {});
def("colormap", () => {});
def("hold", (a, _n, interp) => { const s = a.length ? str(a, 0, "on|off") : "toggle"; interp.plotState.hold = s === "on" ? true : s === "off" ? false : !interp.plotState.hold; });
def("figure", (_a, _n, interp) => { Object.assign(interp.plotState, { series: [], contour: null, title: "", xlabel: "", ylabel: "", legend: null, hold: false }); interp.host.plot?.(interp.plotState); });
def("clf", (_a, _n, interp) => { interp.plotState.series = []; interp.plotState.contour = null; interp.host.plot?.(interp.plotState); });
def("close", (_a, _n, interp) => { interp.plotState.series = []; interp.plotState.contour = null; interp.host.plot?.(interp.plotState); });
def("xlabel", (a, _n, interp) => { interp.plotState.xlabel = str(a, 0, "label"); interp.host.plot?.(interp.plotState); });
def("ylabel", (a, _n, interp) => { interp.plotState.ylabel = str(a, 0, "label"); interp.host.plot?.(interp.plotState); });
def("title", (a, _n, interp) => { interp.plotState.title = str(a, 0, "title"); interp.host.plot?.(interp.plotState); });
def("legend", (a, _n, interp) => { interp.plotState.legend = a.filter((v): v is string => typeof v === "string"); interp.host.plot?.(interp.plotState); });
def("grid", (a, _n, interp) => { const s = a.length ? str(a, 0, "on|off") : "toggle"; interp.plotState.grid = s === "on" ? true : s === "off" ? false : !interp.plotState.grid; interp.host.plot?.(interp.plotState); });
def("axis", (a, _n, interp) => { const s = a.length ? (typeof a[0] === "string" ? a[0] : "") : ""; if (s === "equal") interp.plotState.equal = true; else if (s === "normal" || s === "auto") interp.plotState.equal = false; interp.host.plot?.(interp.plotState); });
def("drawnow", () => {});
def("pause", () => {});

export const builtins: Builtins = fns;
