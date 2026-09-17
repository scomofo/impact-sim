import type { LagrangePoint, PointId, Vec2 } from "./types";

/** Routh critical mass ratio. L4/L5 are linearly stable below this. */
export const ROUTH_MU = 0.5 * (1 - Math.sqrt(69) / 9);

export const MIN_MU = 1e-6;
export const MAX_MU = 0.5;

export function clampMu(mu: number) {
  return Math.min(MAX_MU, Math.max(MIN_MU, mu));
}

export function isStable(mu: number) {
  return mu < ROUTH_MU;
}

export function primaryPos(mu: number): Vec2 {
  return { x: -mu, y: 0 };
}

export function secondaryPos(mu: number): Vec2 {
  return { x: 1 - mu, y: 0 };
}

/** Effective potential Ω = (x²+y²)/2 + (1-μ)/r1 + μ/r2 */
export function omega(x: number, y: number, mu: number) {
  const r1 = Math.hypot(x + mu, y);
  const r2 = Math.hypot(x - 1 + mu, y);
  return 0.5 * (x * x + y * y) + (1 - mu) / Math.max(r1, 1e-12) + mu / Math.max(r2, 1e-12);
}

/** ∇Ω — gravitational + centrifugal, no Coriolis. */
export function omegaGrad(x: number, y: number, mu: number): Vec2 {
  const dx1 = x + mu;
  const dx2 = x - 1 + mu;
  const r1 = Math.hypot(dx1, y);
  const r2 = Math.hypot(dx2, y);
  const r1s = Math.max(r1 * r1 * r1, 1e-18);
  const r2s = Math.max(r2 * r2 * r2, 1e-18);
  return {
    x: x - ((1 - mu) * dx1) / r1s - (mu * dx2) / r2s,
    y: y - ((1 - mu) * y) / r1s - (mu * y) / r2s,
  };
}

export function jacobi(x: number, y: number, vx: number, vy: number, mu: number) {
  return 2 * omega(x, y, mu) - (vx * vx + vy * vy);
}

function collinearForce(x: number, mu: number) {
  const r1 = Math.abs(x + mu);
  const r2 = Math.abs(x - 1 + mu);
  return x - ((1 - mu) * (x + mu)) / (r1 * r1 * r1) - (mu * (x - 1 + mu)) / (r2 * r2 * r2);
}

function collinearDeriv(x: number, mu: number) {
  const r1 = Math.abs(x + mu);
  const r2 = Math.abs(x - 1 + mu);
  return 1 + (2 * (1 - mu)) / (r1 * r1 * r1) + (2 * mu) / (r2 * r2 * r2);
}

function solveCollinear(mu: number, guess: number) {
  let x = guess;
  for (let i = 0; i < 48; i++) {
    const r1 = Math.abs(x + mu);
    const r2 = Math.abs(x - 1 + mu);
    if (r1 < 1e-14 || r2 < 1e-14) break;
    const f = collinearForce(x, mu);
    const df = collinearDeriv(x, mu);
    const step = f / df;
    x -= step;
    if (Math.abs(step) < 1e-15) break;
  }
  return x;
}

export function lagrangePoints(mu: number): Record<PointId, LagrangePoint> {
  const g = Math.cbrt(mu / 3);
  const l1x = solveCollinear(mu, 1 - mu - g);
  const l2x = solveCollinear(mu, 1 - mu + g);
  const l3x = solveCollinear(mu, -1 - (5 * mu) / 12);
  const l4x = 0.5 - mu;
  const l4y = Math.sqrt(3) / 2;
  const stable = isStable(mu);
  const mk = (
    id: PointId,
    x: number,
    y: number,
    collinear: boolean,
    forceStable: boolean,
  ): LagrangePoint => ({
    id,
    x,
    y,
    omega: omega(x, y, mu),
    collinear,
    stable: forceStable,
  });
  return {
    L1: mk("L1", l1x, 0, true, false),
    L2: mk("L2", l2x, 0, true, false),
    L3: mk("L3", l3x, 0, true, false),
    L4: mk("L4", l4x, l4y, false, stable),
    L5: mk("L5", l4x, -l4y, false, stable),
  };
}

export function rotate(x: number, y: number, theta: number): Vec2 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** CR3BP rotating-frame acceleration including Coriolis. */
export function probeAccel(
  x: number,
  y: number,
  vx: number,
  vy: number,
  mu: number,
): Vec2 {
  const g = omegaGrad(x, y, mu);
  return { x: 2 * vy + g.x, y: -2 * vx + g.y };
}

export function rk4Step(
  x: number,
  y: number,
  vx: number,
  vy: number,
  mu: number,
  h: number,
) {
  const f = (px: number, py: number, pvx: number, pvy: number) => {
    const a = probeAccel(px, py, pvx, pvy, mu);
    return { dx: pvx, dy: pvy, dvx: a.x, dvy: a.y };
  };
  const k1 = f(x, y, vx, vy);
  const k2 = f(x + k1.dx * h * 0.5, y + k1.dy * h * 0.5, vx + k1.dvx * h * 0.5, vy + k1.dvy * h * 0.5);
  const k3 = f(x + k2.dx * h * 0.5, y + k2.dy * h * 0.5, vx + k2.dvx * h * 0.5, vy + k2.dvy * h * 0.5);
  const k4 = f(x + k3.dx * h, y + k3.dy * h, vx + k3.dvx * h, vy + k3.dvy * h);
  return {
    x: x + (h / 6) * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx),
    y: y + (h / 6) * (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy),
    vx: vx + (h / 6) * (k1.dvx + 2 * k2.dvx + 2 * k3.dvx + k4.dvx),
    vy: vy + (h / 6) * (k1.dvy + 2 * k2.dvy + 2 * k3.dvy + k4.dvy),
  };
}

export function predictPath(
  x: number,
  y: number,
  vx: number,
  vy: number,
  mu: number,
  steps = 160,
  dt = 0.045,
): Float32Array {
  const out = new Float32Array(steps * 2);
  let px = x;
  let py = y;
  let pvx = vx;
  let pvy = vy;
  for (let i = 0; i < steps; i++) {
    const n = rk4Step(px, py, pvx, pvy, mu, dt);
    px = n.x;
    py = n.y;
    pvx = n.vx;
    pvy = n.vy;
    out[i * 2] = px;
    out[i * 2 + 1] = py;
    const r1 = Math.hypot(px + mu, py);
    const r2 = Math.hypot(px - 1 + mu, py);
    if (r1 < 0.02 || r2 < 0.012 || px * px + py * py > 16) {
      return out.subarray(0, (i + 1) * 2);
    }
  }
  return out;
}

/** Linear planar Lyapunov orbit about a collinear point. */
export function planarLyapunov(xL: number, yL: number, mu: number, amp: number) {
  const r1 = Math.abs(xL + mu);
  const r2 = Math.abs(xL - 1 + mu);
  const sigma = (1 - mu) / (r1 * r1 * r1) + mu / (r2 * r2 * r2);
  const Oxx = 1 + 2 * sigma;
  const Oyy = 1 - sigma;
  const b = 4 - Oxx - Oyy;
  const c = Oxx * Oyy;
  const disc = Math.sqrt(Math.max(0, b * b - 4 * c));
  const rootA = (-b + disc) / 2;
  const rootB = (-b - disc) / 2;
  const w2 = rootA < 0 ? -rootA : rootB < 0 ? -rootB : 2;
  const w = Math.sqrt(Math.max(1e-6, w2));
  const k = (2 * w) / (Oyy + w * w);
  const ax = amp;
  const ay = Math.abs(k) * amp;
  return {
    x: xL + ax,
    y: yL,
    vx: 0,
    vy: ay * w,
    ax,
    ay,
    w,
    lx: xL,
    ly: yL,
  };
}

export const POINT_ORDER: PointId[] = ["L1", "L2", "L3", "L4", "L5"];
