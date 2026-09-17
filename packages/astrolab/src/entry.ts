/**
 * Planar atmospheric-entry dynamics over a spherical, non-rotating planet
 * with an exponential atmosphere, integrated with `ode45`. Follows the
 * classic formulation (Vinh; Regan & Anandakrishnan) with Sutton–Graves
 * convective stagnation heating.
 */

import { ode45, type OdeSolution } from "./ode.ts";
import { MU, RADIUS } from "./astro.ts";

export interface Atmosphere {
  /** Surface density, kg/m³. */
  rho0: number;
  /** Scale height, m. */
  H: number;
  /** Sutton–Graves constant, kg^0.5 / m. */
  kSG: number;
  mu: number;
  radius: number;
}

export const ATMOSPHERES: Record<string, Atmosphere> = {
  earth: { rho0: 1.225, H: 7200, kSG: 1.7415e-4, mu: MU.earth, radius: RADIUS.earth },
  mars: { rho0: 0.020, H: 11100, kSG: 1.9027e-4, mu: MU.mars, radius: RADIUS.mars },
  venus: { rho0: 65, H: 15900, kSG: 1.8960e-4, mu: MU.venus, radius: RADIUS.venus },
  titan: { rho0: 5.43, H: 40000, kSG: 1.7407e-4, mu: MU.titan, radius: RADIUS.titan },
  jupiter: { rho0: 0.16, H: 27000, kSG: 6.556e-5, mu: MU.jupiter, radius: RADIUS.jupiter },
};

export interface EntryOptions {
  /** Vehicle mass, kg. */
  mass: number;
  /** Reference area, m². */
  area: number;
  cd: number;
  /** Lift-to-drag ratio (0 = ballistic). */
  ld?: number;
  /** Bank angle, rad; lift is scaled by cos(bank). */
  bank?: number;
  /** Nose radius for stagnation heating, m. */
  noseRadius?: number;
  /** Stop when the altitude drops below this, m. */
  stopAltitude?: number;
  /** Stop when speed drops below this, m/s (e.g. parachute deploy). */
  stopSpeed?: number;
  /** Maximum integration time, s. */
  maxTime?: number;
}

export interface EntryResult {
  t: number[];
  /** Altitude, m. */
  h: number[];
  /** Speed, m/s. */
  v: number[];
  /** Flight-path angle, rad (negative = descending). */
  gamma: number[];
  /** Downrange distance along the surface, m. */
  range: number[];
  /** Deceleration, m/s² (drag + lift magnitude). */
  decel: number[];
  /** Stagnation-point convective heat flux, W/m². */
  qdot: number[];
  /** Integrated heat load, J/m². */
  heatLoad: number[];
  /** Dynamic pressure, Pa. */
  q: number[];
  peakDecel: number;
  peakQdot: number;
  totalHeatLoad: number;
  /** How the integration ended. */
  outcome: "landed" | "slowed" | "skipped-out" | "timeout";
  ballisticCoefficient: number;
}

export function density(atm: Atmosphere, h: number): number {
  return atm.rho0 * Math.exp(-h / atm.H);
}

/** Right-hand side: y = [r, v, gamma, s, Q]. */
export function entryRhs(atm: Atmosphere, opt: EntryOptions): (t: number, y: Float64Array) => number[] {
  const beta = opt.mass / (opt.cd * opt.area);
  const ld = opt.ld ?? 0;
  const cosBank = Math.cos(opt.bank ?? 0);
  const rn = opt.noseRadius ?? 1;
  return (_t, y) => {
    const r = y[0]!, v = y[1]!, gamma = y[2]!;
    const h = r - atm.radius;
    const rho = density(atm, Math.max(h, -20000));
    const g = atm.mu / (r * r);
    const aD = (0.5 * rho * v * v) / beta;
    const aL = aD * ld * cosBank;
    const dv = -aD - g * Math.sin(gamma);
    const dgamma = (v > 1 ? aL / v : 0) + (v / r - g / v) * Math.cos(gamma);
    const dr = v * Math.sin(gamma);
    const ds = (atm.radius / r) * v * Math.cos(gamma);
    const qdot = atm.kSG * Math.sqrt(rho / rn) * v * v * v;
    return [dr, dv, dgamma, ds, qdot];
  };
}

export function entry(body: string, v0: number, gamma0: number, h0: number, opt: EntryOptions): EntryResult {
  const atm = ATMOSPHERES[body.toLowerCase()];
  if (!atm) throw new Error(`entry: no atmosphere model for '${body}' (have ${Object.keys(ATMOSPHERES).join(", ")})`);
  const stopH = opt.stopAltitude ?? 0;
  const stopV = opt.stopSpeed ?? 0;
  const maxTime = opt.maxTime ?? 3600;
  const rhs = entryRhs(atm, opt);
  const sol: OdeSolution = ode45(rhs, [0, maxTime], [atm.radius + h0, v0, gamma0, 0, 0], {
    RelTol: 1e-8,
    AbsTol: 1e-6,
    MaxStep: 5,
    Events: (_t, y) => ({
      value: [y[0]! - atm.radius - stopH, y[1]! - stopV, y[0]! - atm.radius - (h0 + 1)],
      isterminal: [true, true, true],
      direction: [-1, -1, 1],
    }),
  });
  const beta = opt.mass / (opt.cd * opt.area);
  const ld = opt.ld ?? 0;
  const cosBank = Math.cos(opt.bank ?? 0);
  const rn = opt.noseRadius ?? 1;
  const out: EntryResult = { t: [], h: [], v: [], gamma: [], range: [], decel: [], qdot: [], heatLoad: [], q: [], peakDecel: 0, peakQdot: 0, totalHeatLoad: 0, outcome: "timeout", ballisticCoefficient: beta };
  sol.t.forEach((t, i) => {
    const y = sol.y[i]!;
    const h = y[0]! - atm.radius, v = y[1]!;
    const rho = density(atm, Math.max(h, -20000));
    const q = 0.5 * rho * v * v;
    const aD = q / beta;
    const decel = aD * Math.hypot(1, ld * cosBank);
    const qdot = atm.kSG * Math.sqrt(rho / rn) * v * v * v;
    out.t.push(t); out.h.push(h); out.v.push(v); out.gamma.push(y[2]!); out.range.push(y[3]!);
    out.decel.push(decel); out.qdot.push(qdot); out.heatLoad.push(y[4]!); out.q.push(q);
    out.peakDecel = Math.max(out.peakDecel, decel);
    out.peakQdot = Math.max(out.peakQdot, qdot);
  });
  out.totalHeatLoad = out.heatLoad[out.heatLoad.length - 1] ?? 0;
  const ie = sol.ie[sol.ie.length - 1];
  out.outcome = ie === 0 ? "landed" : ie === 1 ? "slowed" : ie === 2 ? "skipped-out" : "timeout";
  return out;
}
