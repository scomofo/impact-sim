/** MATLAB-style scalar numerics: root finding, quadrature, interpolation and fitting. */

import { matrix, type Matrix, numel, rowvec, isVector, colvec } from "./matrix.ts";

export interface FzeroOptions {
  TolX?: number;
  MaxIter?: number;
}

/**
 * `fzero(f, x0)` with Brent's method. `x0` may be a bracketing pair `[a, b]`
 * or a single starting guess, in which case the bracket is found by expanding
 * outward as MATLAB does.
 */
export function fzero(f: (x: number) => number, x0: number | [number, number], opts: FzeroOptions = {}): number {
  const tol = opts.TolX ?? 2.2e-16 * 4;
  const maxIter = opts.MaxIter ?? 200;
  let a: number, b: number, fa: number, fb: number;
  if (Array.isArray(x0)) {
    [a, b] = x0;
    fa = f(a);
    fb = f(b);
  } else {
    a = b = x0;
    fa = fb = f(x0);
    if (fa === 0) return x0;
    let dx = x0 === 0 ? 0.02 : Math.abs(x0) / 50;
    let found = false;
    for (let i = 0; i < 60 && !found; i++) {
      dx *= 1.6;
      a = x0 - dx; fa = f(a);
      b = x0 + dx; fb = f(b);
      if (Number.isFinite(fa) && Number.isFinite(fb) && Math.sign(fa) !== Math.sign(fb)) found = true;
      else if (Number.isFinite(fa) && Math.sign(fa) !== Math.sign(f(x0))) { b = x0; fb = f(x0); found = true; }
      else if (Number.isFinite(fb) && Math.sign(fb) !== Math.sign(f(x0))) { a = x0; fa = f(x0); found = true; }
    }
    if (!found) throw new Error("fzero: unable to find a sign change around the starting point");
  }
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (Math.sign(fa) === Math.sign(fb)) throw new Error("fzero: function values at the interval endpoints must differ in sign");

  let c = a, fc = fa, d = b - a, e = d;
  for (let iter = 0; iter < maxIter; iter++) {
    if (Math.sign(fb) === Math.sign(fc)) { c = a; fc = fa; d = b - a; e = d; }
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
    const m = 0.5 * (c - b);
    const tolAct = 2 * tol * Math.max(Math.abs(b), 1);
    if (Math.abs(m) <= tolAct || fb === 0) return b;
    if (Math.abs(e) >= tolAct && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p: number, q: number;
      if (a === c) { p = 2 * m * s; q = 1 - s; }
      else {
        const qq = fa / fc, r = fb / fc;
        p = s * (2 * m * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q; else p = -p;
      if (2 * p < Math.min(3 * m * q - Math.abs(tolAct * q), Math.abs(e * q))) { e = d; d = p / q; }
      else { d = m; e = m; }
    } else { d = m; e = m; }
    a = b; fa = fb;
    b += Math.abs(d) > tolAct ? d : Math.sign(m) * tolAct;
    fb = f(b);
  }
  return b;
}

/** Nelder–Mead simplex like MATLAB's `fminsearch`. */
export function fminsearch(f: (x: number[]) => number, x0: number[], opts: { TolX?: number; TolFun?: number; MaxIter?: number } = {}): { x: number[]; fval: number; iterations: number } {
  const n = x0.length;
  const tolX = opts.TolX ?? 1e-4, tolF = opts.TolFun ?? 1e-4, maxIter = opts.MaxIter ?? 200 * n;
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const p = x0.slice();
    p[i] = p[i] !== 0 ? p[i]! * 1.05 : 0.00025;
    simplex.push(p);
  }
  let fv = simplex.map(f);
  let iter = 0;
  const order = () => {
    const idx = fv.map((_, i) => i).sort((a, b) => fv[a]! - fv[b]!);
    simplex = idx.map((i) => simplex[i]!);
    fv = idx.map((i) => fv[i]!);
  };
  order();
  while (iter++ < maxIter) {
    const spread = Math.max(...simplex.slice(1).map((p) => Math.max(...p.map((v, i) => Math.abs(v - simplex[0]![i]!)))));
    const fspread = Math.max(...fv.slice(1).map((v) => Math.abs(v - fv[0]!)));
    if (spread <= tolX && fspread <= tolF) break;
    const centroid = Array.from({ length: n }, (_, i) => simplex.slice(0, n).reduce((s, p) => s + p[i]!, 0) / n);
    const worst = simplex[n]!;
    const pt = (coef: number) => centroid.map((c, i) => c + coef * (worst[i]! - c));
    const xr = pt(-1), fr = f(xr);
    if (fr < fv[0]!) {
      const xe = pt(-2), fe = f(xe);
      if (fe < fr) { simplex[n] = xe; fv[n] = fe; } else { simplex[n] = xr; fv[n] = fr; }
    } else if (fr < fv[n - 1]!) { simplex[n] = xr; fv[n] = fr; }
    else {
      const outside = fr < fv[n]!;
      const xc = pt(outside ? -0.5 : 0.5), fc = f(xc);
      if (fc < (outside ? fr : fv[n]!)) { simplex[n] = xc; fv[n] = fc; }
      else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i]!.map((v, j) => simplex[0]![j]! + 0.5 * (v - simplex[0]![j]!));
          fv[i] = f(simplex[i]!);
        }
      }
    }
    order();
  }
  return { x: simplex[0]!, fval: fv[0]!, iterations: iter };
}

/** Trapezoidal integration `trapz(x, y)` or unit spacing `trapz(y)`. */
export function trapz(x: ArrayLike<number>, y?: ArrayLike<number>): number {
  if (!y) { y = x; x = Array.from({ length: y.length }, (_, i) => i); }
  let s = 0;
  for (let i = 1; i < y.length; i++) s += 0.5 * (x[i]! - x[i - 1]!) * (y[i]! + y[i - 1]!);
  return s;
}

export function cumtrapz(x: ArrayLike<number>, y: ArrayLike<number>): number[] {
  const out = [0];
  for (let i = 1; i < y.length; i++) out.push(out[i - 1]! + 0.5 * (x[i]! - x[i - 1]!) * (y[i]! + y[i - 1]!));
  return out;
}

/** Linear interpolation `interp1(x, y, xq)`; NaN outside the range like MATLAB. */
export function interp1(x: ArrayLike<number>, y: ArrayLike<number>, xq: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let k = 0; k < xq.length; k++) {
    const q = xq[k]!;
    if (q < x[0]! || q > x[x.length - 1]!) { out.push(NaN); continue; }
    let lo = 0, hi = x.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (x[mid]! <= q) lo = mid; else hi = mid; }
    const t = x[hi] === x[lo] ? 0 : (q - x[lo]!) / (x[hi]! - x[lo]!);
    out.push(y[lo]! + t * (y[hi]! - y[lo]!));
  }
  return out;
}

/** Least-squares polynomial fit; returns coefficients highest power first like `polyfit`. */
export function polyfit(x: ArrayLike<number>, y: ArrayLike<number>, deg: number): number[] {
  // Solve the normal equations via QR-free Gaussian elimination on a small system.
  const m = deg + 1;
  const ata = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const aty = new Array<number>(m).fill(0);
  for (let k = 0; k < x.length; k++) {
    const pw: number[] = [];
    for (let i = 0; i < m; i++) pw.push(Math.pow(x[k]!, deg - i));
    for (let i = 0; i < m; i++) {
      aty[i] += pw[i]! * y[k]!;
      for (let j = 0; j < m; j++) ata[i]![j] += pw[i]! * pw[j]!;
    }
  }
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(ata[r]![c]!) > Math.abs(ata[p]![c]!)) p = r;
    [ata[c], ata[p]] = [ata[p]!, ata[c]!];
    [aty[c], aty[p]] = [aty[p]!, aty[c]!];
    for (let r = c + 1; r < m; r++) {
      const f = ata[r]![c]! / ata[c]![c]!;
      for (let j = c; j < m; j++) ata[r]![j] -= f * ata[c]![j]!;
      aty[r] -= f * aty[c]!;
    }
  }
  const coef = new Array<number>(m).fill(0);
  for (let i = m - 1; i >= 0; i--) {
    let s = aty[i]!;
    for (let j = i + 1; j < m; j++) s -= ata[i]![j]! * coef[j]!;
    coef[i] = s / ata[i]![i]!;
  }
  return coef;
}

export function polyval(p: ArrayLike<number>, x: number): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) s = s * x + p[i]!;
  return s;
}

/** `meshgrid(x, y)` → `[X, Y]` matrices. */
export function meshgrid(x: Matrix, y: Matrix): [Matrix, Matrix] {
  if (!isVector(x) || !isVector(y)) throw new Error("meshgrid: vector inputs required");
  const nx = numel(x), ny = numel(y);
  const X = matrix(ny, nx), Y = matrix(ny, nx);
  for (let i = 0; i < ny; i++)
    for (let j = 0; j < nx; j++) { X.data[i * nx + j] = x.data[j]!; Y.data[i * nx + j] = y.data[i]!; }
  return [X, Y];
}

export const deg2rad = (d: number): number => (d * Math.PI) / 180;
export const rad2deg = (r: number): number => (r * 180) / Math.PI;
export const wrapTo2Pi = (a: number): number => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
export const wrapToPi = (a: number): number => {
  const w = wrapTo2Pi(a);
  return w > Math.PI ? w - 2 * Math.PI : w;
};

export { rowvec, colvec };
