/**
 * MATLAB-style ODE solvers. `ode45` is the Dormand–Prince 5(4) pair with the
 * same adaptive error control MATLAB uses (RelTol / AbsTol, mixed norm), and
 * `ode4` is a fixed-step classical Runge–Kutta integrator.
 */

export type OdeRhs = (t: number, y: Float64Array) => ArrayLike<number>;

export interface OdeOptions {
  /** Relative tolerance (MATLAB default 1e-3). */
  RelTol?: number;
  /** Absolute tolerance (MATLAB default 1e-6). */
  AbsTol?: number;
  MaxStep?: number;
  InitialStep?: number;
  /** Upper bound on accepted steps; guards against runaway integrations. */
  MaxSteps?: number;
  /**
   * Event function like MATLAB's `Events` option: returns
   * `[value, isterminal, direction]` per event. Integration stops at the first
   * terminal event; the event time is located by secant iteration.
   */
  Events?: (t: number, y: Float64Array) => { value: number[]; isterminal: boolean[]; direction: number[] };
}

export interface OdeSolution {
  t: number[];
  /** y[i] is the state at t[i]. */
  y: Float64Array[];
  /** Event times, states and indices, mirroring MATLAB's `[te, ye, ie]`. */
  te: number[];
  ye: Float64Array[];
  ie: number[];
  stats: { steps: number; failed: number; fevals: number };
}

const A21 = 1 / 5;
const A31 = 3 / 40, A32 = 9 / 40;
const A41 = 44 / 45, A42 = -56 / 15, A43 = 32 / 9;
const A51 = 19372 / 6561, A52 = -25360 / 2187, A53 = 64448 / 6561, A54 = -212 / 729;
const A61 = 9017 / 3168, A62 = -355 / 33, A63 = 46732 / 5247, A64 = 49 / 176, A65 = -5103 / 18656;
const B1 = 35 / 384, B3 = 500 / 1113, B4 = 125 / 192, B5 = -2187 / 6784, B6 = 11 / 84;
const E1 = 71 / 57600, E3 = -71 / 16695, E4 = 71 / 1920, E5 = -17253 / 339200, E6 = 22 / 525, E7 = -1 / 40;

function evaluate(f: OdeRhs, t: number, y: Float64Array, n: number): Float64Array {
  const out = f(t, y);
  if (out.length !== n) throw new Error(`ode45: rhs returned ${out.length} values, expected ${n}`);
  return out instanceof Float64Array ? out : Float64Array.from(out as ArrayLike<number>);
}

/**
 * `ode45(f, tspan, y0, opts)`. When `tspan` has exactly two entries the
 * solver returns every accepted step; with more entries it returns the
 * solution at exactly those times (dense output by quartic Hermite
 * interpolation), matching MATLAB.
 */
export function ode45(f: OdeRhs, tspan: ArrayLike<number>, y0: ArrayLike<number>, opts: OdeOptions = {}): OdeSolution {
  if (tspan.length < 2) throw new Error("ode45: tspan must have at least two entries");
  const t0 = tspan[0]!;
  const tf = tspan[tspan.length - 1]!;
  const dir = Math.sign(tf - t0) || 1;
  const rtol = opts.RelTol ?? 1e-3;
  const atol = opts.AbsTol ?? 1e-6;
  const maxStep = opts.MaxStep ?? Math.abs(tf - t0) / 10;
  const maxSteps = opts.MaxSteps ?? 200000;
  const n = y0.length;
  const requested = tspan.length > 2 ? Array.from(tspan as ArrayLike<number>) : null;

  let t = t0;
  let y = Float64Array.from(y0 as ArrayLike<number>);
  let k1 = evaluate(f, t, y, n);
  let fevals = 1;
  const stats = { steps: 0, failed: 0, fevals: 0 };
  const sol: OdeSolution = { t: [t], y: [Float64Array.from(y)], te: [], ye: [], ie: [], stats };
  let nextOut = 1;

  const errNorm = (ynew: Float64Array, err: Float64Array): number => {
    let m = 0;
    for (let i = 0; i < n; i++) {
      const sc = atol + rtol * Math.max(Math.abs(y[i]!), Math.abs(ynew[i]!));
      m = Math.max(m, Math.abs(err[i]!) / sc);
    }
    return m;
  };

  // Initial step (Hairer, Nørsett & Wanner, II.4).
  let h = opts.InitialStep ?? 0;
  if (!h) {
    let d0 = 0, d1 = 0;
    for (let i = 0; i < n; i++) {
      const sc = atol + rtol * Math.abs(y[i]!);
      d0 = Math.max(d0, Math.abs(y[i]!) / sc);
      d1 = Math.max(d1, Math.abs(k1[i]!) / sc);
    }
    h = d0 < 1e-5 || d1 < 1e-5 ? 1e-6 : 0.01 * (d0 / d1);
    h = Math.min(h, Math.abs(tf - t0), maxStep);
  }

  let prevEvent: number[] | null = null;
  if (opts.Events) prevEvent = opts.Events(t, y).value;

  const yTmp = new Float64Array(n);
  const ynew = new Float64Array(n);
  const err = new Float64Array(n);

  while (dir * (tf - t) > 1e-12 * Math.max(1, Math.abs(t))) {
    if (stats.steps >= maxSteps) throw new Error("ode45: exceeded MaxSteps; the problem may be stiff or the tolerances too tight");
    h = Math.min(h, maxStep, Math.abs(tf - t));
    const hs = dir * h;

    for (let i = 0; i < n; i++) yTmp[i] = y[i]! + hs * A21 * k1[i]!;
    const k2 = evaluate(f, t + hs / 5, yTmp, n);
    for (let i = 0; i < n; i++) yTmp[i] = y[i]! + hs * (A31 * k1[i]! + A32 * k2[i]!);
    const k3 = evaluate(f, t + (3 * hs) / 10, yTmp, n);
    for (let i = 0; i < n; i++) yTmp[i] = y[i]! + hs * (A41 * k1[i]! + A42 * k2[i]! + A43 * k3[i]!);
    const k4 = evaluate(f, t + (4 * hs) / 5, yTmp, n);
    for (let i = 0; i < n; i++) yTmp[i] = y[i]! + hs * (A51 * k1[i]! + A52 * k2[i]! + A53 * k3[i]! + A54 * k4[i]!);
    const k5 = evaluate(f, t + (8 * hs) / 9, yTmp, n);
    for (let i = 0; i < n; i++)
      yTmp[i] = y[i]! + hs * (A61 * k1[i]! + A62 * k2[i]! + A63 * k3[i]! + A64 * k4[i]! + A65 * k5[i]!);
    const k6 = evaluate(f, t + hs, yTmp, n);
    for (let i = 0; i < n; i++)
      ynew[i] = y[i]! + hs * (B1 * k1[i]! + B3 * k3[i]! + B4 * k4[i]! + B5 * k5[i]! + B6 * k6[i]!);
    const k7 = evaluate(f, t + hs, ynew, n);
    fevals += 6;
    for (let i = 0; i < n; i++)
      err[i] = hs * (E1 * k1[i]! + E3 * k3[i]! + E4 * k4[i]! + E5 * k5[i]! + E6 * k6[i]! + E7 * k7[i]!);

    const e = errNorm(ynew, err);
    if (!(e <= 1)) {
      stats.failed++;
      if (!Number.isFinite(e)) h *= 0.1;
      else h *= Math.max(0.1, 0.9 * Math.pow(e, -1 / 5));
      if (h < 1e-14 * Math.max(1, Math.abs(t))) throw new Error(`ode45: step size became too small at t = ${t}`);
      continue;
    }

    const tnew = t + hs;
    const yOld = y;
    const k1Old = k1;
    stats.steps++;

    // Quartic Hermite interpolant on [t, tnew] using endpoint slopes.
    const interp = (s: number): Float64Array => {
      const th = (s - t) / hs;
      const out = new Float64Array(n);
      const h00 = 2 * th ** 3 - 3 * th ** 2 + 1;
      const h10 = th ** 3 - 2 * th ** 2 + th;
      const h01 = -2 * th ** 3 + 3 * th ** 2;
      const h11 = th ** 3 - th ** 2;
      for (let i = 0; i < n; i++) out[i] = h00 * yOld[i]! + h10 * hs * k1Old[i]! + h01 * ynew[i]! + h11 * hs * k7[i]!;
      return out;
    };

    let stopAt: number | null = null;
    let stopState: Float64Array | null = null;
    if (opts.Events && prevEvent) {
      const now = opts.Events(tnew, ynew);
      for (let j = 0; j < now.value.length; j++) {
        const v0 = prevEvent[j]!;
        const v1 = now.value[j]!;
        const d = now.direction[j] ?? 0;
        const crossed = (v0 < 0 && v1 >= 0 && d >= 0) || (v0 > 0 && v1 <= 0 && d <= 0);
        if (!crossed || v0 === v1) continue;
        // Locate the root with regula falsi on the interpolant.
        let a = t, b = tnew, fa = v0, fb = v1, te = tnew;
        for (let it = 0; it < 50; it++) {
          te = b - (fb * (b - a)) / (fb - fa);
          const ve = opts.Events(te, interp(te)).value[j]!;
          if (Math.abs(ve) < 1e-12 || Math.abs(b - a) < 1e-12) break;
          if (Math.sign(ve) === Math.sign(fa)) { a = te; fa = ve; } else { b = te; fb = ve; }
        }
        const ye = interp(te);
        sol.te.push(te); sol.ye.push(ye); sol.ie.push(j);
        if (now.isterminal[j] && (stopAt === null || dir * (te - stopAt) < 0)) { stopAt = te; stopState = ye; }
      }
      prevEvent = now.value;
    }

    const tEnd = stopAt ?? tnew;
    if (requested) {
      while (nextOut < requested.length && dir * (requested[nextOut]! - tEnd) <= 1e-12) {
        const s = requested[nextOut]!;
        sol.t.push(s);
        sol.y.push(s === tnew ? Float64Array.from(ynew) : interp(s));
        nextOut++;
      }
      if (stopAt !== null) { sol.t.push(stopAt); sol.y.push(stopState!); }
    } else {
      sol.t.push(tEnd);
      sol.y.push(stopAt !== null ? stopState! : Float64Array.from(ynew));
    }
    if (stopAt !== null) break;

    t = tnew;
    y = Float64Array.from(ynew);
    k1 = k7; // FSAL
    h *= Math.min(5, Math.max(0.2, 0.9 * Math.pow(Math.max(e, 1e-10), -1 / 5)));
  }
  stats.fevals = fevals;
  return sol;
}

/** Fixed-step classical RK4 at exactly the times in `tspan` (`ode4` from the MATLAB File Exchange). */
export function ode4(f: OdeRhs, tspan: ArrayLike<number>, y0: ArrayLike<number>): OdeSolution {
  const n = y0.length;
  let y = Float64Array.from(y0 as ArrayLike<number>);
  const sol: OdeSolution = { t: [tspan[0]!], y: [Float64Array.from(y)], te: [], ye: [], ie: [], stats: { steps: 0, failed: 0, fevals: 0 } };
  const tmp = new Float64Array(n);
  for (let s = 1; s < tspan.length; s++) {
    const t = tspan[s - 1]!;
    const h = tspan[s]! - t;
    const k1 = evaluate(f, t, y, n);
    for (let i = 0; i < n; i++) tmp[i] = y[i]! + (h / 2) * k1[i]!;
    const k2 = evaluate(f, t + h / 2, tmp, n);
    for (let i = 0; i < n; i++) tmp[i] = y[i]! + (h / 2) * k2[i]!;
    const k3 = evaluate(f, t + h / 2, tmp, n);
    for (let i = 0; i < n; i++) tmp[i] = y[i]! + h * k3[i]!;
    const k4 = evaluate(f, t + h, tmp, n);
    const ynew = new Float64Array(n);
    for (let i = 0; i < n; i++) ynew[i] = y[i]! + (h / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!);
    y = ynew;
    sol.t.push(tspan[s]!);
    sol.y.push(Float64Array.from(y));
    sol.stats.steps++;
    sol.stats.fevals += 4;
  }
  return sol;
}
