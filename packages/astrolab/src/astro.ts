/**
 * Orbital-mechanics toolbox in the spirit of MATLAB's Aerospace Toolbox and
 * Curtis's *Orbital Mechanics for Engineering Students* companion scripts.
 * Units are SI unless a function says otherwise; angles are radians.
 */

import { fzero, wrapTo2Pi } from "./numeric.ts";
import { ode45, type OdeOptions, type OdeSolution } from "./ode.ts";

/** Standard gravitational parameters μ = GM in m³/s² (JPL DE440 / IAU 2015). */
export const MU = {
  sun: 1.32712440018e20,
  mercury: 2.2032e13,
  venus: 3.24859e14,
  earth: 3.986004418e14,
  moon: 4.9048695e12,
  mars: 4.282837e13,
  jupiter: 1.26686534e17,
  saturn: 3.7931187e16,
  uranus: 5.793939e15,
  neptune: 6.836529e15,
} as const;

/** Mean equatorial radii in metres. */
export const RADIUS = {
  sun: 6.957e8,
  mercury: 2.4397e6,
  venus: 6.0518e6,
  earth: 6.378137e6,
  moon: 1.7374e6,
  mars: 3.3962e6,
  jupiter: 7.1492e7,
  saturn: 6.0268e7,
  uranus: 2.5559e7,
  neptune: 2.4764e7,
} as const;

export const AU = 1.495978707e11;
export const G = 6.6743e-11;
export const DAY = 86400;
export const YEAR = 365.25 * DAY;

export type Vec3 = [number, number, number];

export interface OrbitalElements {
  /** Semi-major axis, m (negative for hyperbolic). */
  a: number;
  e: number;
  /** Inclination. */
  i: number;
  /** Right ascension of the ascending node. */
  raan: number;
  /** Argument of periapsis. */
  argp: number;
  /** True anomaly. */
  nu: number;
}

export interface StateVector {
  r: Vec3;
  v: Vec3;
}

const v3 = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a: Vec3): number => Math.hypot(a[0], a[1], a[2]),
};
export { v3 };

/** Solve Kepler's equation M = E − e·sin E for the eccentric anomaly (elliptic). */
export function keplerE(M: number, e: number, tol = 1e-12): number {
  if (e < 0 || e >= 1) throw new Error("keplerE: eccentricity must be in [0, 1)");
  const Mw = wrapTo2Pi(M);
  let E = e < 0.8 ? Mw : Math.PI;
  for (let i = 0; i < 50; i++) {
    const f = E - e * Math.sin(E) - Mw;
    const dE = f / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

/** Solve the hyperbolic Kepler equation M = e·sinh H − H. */
export function keplerH(M: number, e: number, tol = 1e-12): number {
  if (e <= 1) throw new Error("keplerH: eccentricity must exceed 1");
  let H = Math.asinh(M / e);
  for (let i = 0; i < 50; i++) {
    const f = e * Math.sinh(H) - H - M;
    const dH = f / (e * Math.cosh(H) - 1);
    H -= dH;
    if (Math.abs(dH) < tol) break;
  }
  return H;
}

export const eccentricToTrue = (E: number, e: number): number =>
  2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
export const trueToEccentric = (nu: number, e: number): number =>
  2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
export const meanToTrue = (M: number, e: number): number => eccentricToTrue(keplerE(M, e), e);
export const trueToMean = (nu: number, e: number): number => {
  const E = trueToEccentric(nu, e);
  return E - e * Math.sin(E);
};

export const period = (a: number, mu: number): number => 2 * Math.PI * Math.sqrt(a ** 3 / mu);
export const meanMotion = (a: number, mu: number): number => Math.sqrt(mu / a ** 3);
/** Vis-viva speed at radius r on an orbit of semi-major axis a. */
export const visViva = (r: number, a: number, mu: number): number => Math.sqrt(mu * (2 / r - 1 / a));
export const circularSpeed = (r: number, mu: number): number => Math.sqrt(mu / r);
export const escapeSpeed = (r: number, mu: number): number => Math.sqrt((2 * mu) / r);
export const specificEnergy = (r: number, v: number, mu: number): number => v ** 2 / 2 - mu / r;

/** Classical elements → perifocal-frame-rotated inertial state (`coe2rv` / Curtis `sv_from_coe`). */
export function kepler2cart(el: OrbitalElements, mu: number): StateVector {
  const { a, e, i, raan, argp, nu } = el;
  const p = a * (1 - e * e);
  const r = p / (1 + e * Math.cos(nu));
  const rPf: Vec3 = [r * Math.cos(nu), r * Math.sin(nu), 0];
  const vPf: Vec3 = [-Math.sqrt(mu / p) * Math.sin(nu), Math.sqrt(mu / p) * (e + Math.cos(nu)), 0];
  const cO = Math.cos(raan), sO = Math.sin(raan), ci = Math.cos(i), si = Math.sin(i), cw = Math.cos(argp), sw = Math.sin(argp);
  const R: number[][] = [
    [cO * cw - sO * sw * ci, -cO * sw - sO * cw * ci, sO * si],
    [sO * cw + cO * sw * ci, -sO * sw + cO * cw * ci, -cO * si],
    [sw * si, cw * si, ci],
  ];
  const rot = (v: Vec3): Vec3 => [
    R[0]![0]! * v[0] + R[0]![1]! * v[1] + R[0]![2]! * v[2],
    R[1]![0]! * v[0] + R[1]![1]! * v[1] + R[1]![2]! * v[2],
    R[2]![0]! * v[0] + R[2]![1]! * v[1] + R[2]![2]! * v[2],
  ];
  return { r: rot(rPf), v: rot(vPf) };
}

/** Inertial state → classical elements (`rv2coe` / Curtis `coe_from_sv`). */
export function cart2kepler(sv: StateVector, mu: number): OrbitalElements {
  const { r, v } = sv;
  const rn = v3.norm(r), vn = v3.norm(v);
  const h = v3.cross(r, v);
  const hn = v3.norm(h);
  const n: Vec3 = [-h[1], h[0], 0];
  const nn = v3.norm(n);
  const evec = v3.sub(v3.scale(v3.cross(v, h), 1 / mu), v3.scale(r, 1 / rn));
  const e = v3.norm(evec);
  const energy = vn ** 2 / 2 - mu / rn;
  const a = Math.abs(e - 1) > 1e-10 ? -mu / (2 * energy) : Infinity;
  const i = Math.acos(Math.min(1, Math.max(-1, h[2] / hn)));
  const tiny = 1e-10;
  let raan = 0, argp = 0, nu: number;
  if (nn > tiny) {
    raan = Math.acos(Math.min(1, Math.max(-1, n[0] / nn)));
    if (n[1] < 0) raan = 2 * Math.PI - raan;
  }
  if (e > tiny) {
    if (nn > tiny) {
      argp = Math.acos(Math.min(1, Math.max(-1, v3.dot(n, evec) / (nn * e))));
      if (evec[2] < 0) argp = 2 * Math.PI - argp;
    } else {
      // Equatorial: argument of periapsis measured from the x axis (longitude of periapsis).
      argp = Math.atan2(evec[1], evec[0]);
      if (h[2] < 0) argp = 2 * Math.PI - argp;
      argp = wrapTo2Pi(argp);
    }
    nu = Math.acos(Math.min(1, Math.max(-1, v3.dot(evec, r) / (e * rn))));
    if (v3.dot(r, v) < 0) nu = 2 * Math.PI - nu;
  } else if (nn > tiny) {
    // Circular inclined: argument of latitude.
    nu = Math.acos(Math.min(1, Math.max(-1, v3.dot(n, r) / (nn * rn))));
    if (r[2] < 0) nu = 2 * Math.PI - nu;
  } else {
    // Circular equatorial: true longitude.
    nu = Math.atan2(r[1], r[0]);
    if (h[2] < 0) nu = 2 * Math.PI - nu;
    nu = wrapTo2Pi(nu);
  }
  return { a, e, i, raan, argp, nu };
}

/** Two-body equations of motion for `ode45`: y = [x y z vx vy vz]. */
export function twoBodyRhs(mu: number): (t: number, y: Float64Array) => number[] {
  return (_t, y) => {
    const r3 = Math.pow(y[0]! ** 2 + y[1]! ** 2 + y[2]! ** 2, 1.5);
    return [y[3]!, y[4]!, y[5]!, (-mu * y[0]!) / r3, (-mu * y[1]!) / r3, (-mu * y[2]!) / r3];
  };
}

/** Numerically propagate a state vector with `ode45` (tight tolerances by default). */
export function propagate(sv: StateVector, mu: number, tspan: ArrayLike<number>, opts: OdeOptions = {}): OdeSolution {
  return ode45(twoBodyRhs(mu), tspan, [...sv.r, ...sv.v], { RelTol: 1e-10, AbsTol: 1e-12, ...opts });
}

/** Analytic Keplerian propagation by `dt` seconds (elliptic and hyperbolic). */
export function propagateKepler(sv: StateVector, mu: number, dt: number): StateVector {
  const el = cart2kepler(sv, mu);
  if (el.e < 1) {
    const M = trueToMean(el.nu, el.e) + meanMotion(el.a, mu) * dt;
    return kepler2cart({ ...el, nu: meanToTrue(M, el.e) }, mu);
  }
  const H0 = 2 * Math.atanh(Math.sqrt((el.e - 1) / (el.e + 1)) * Math.tan(el.nu / 2));
  const M = el.e * Math.sinh(H0) - H0 + Math.sqrt(mu / (-el.a) ** 3) * dt;
  const H = keplerH(M, el.e);
  const nu = 2 * Math.atan(Math.sqrt((el.e + 1) / (el.e - 1)) * Math.tanh(H / 2));
  return kepler2cart({ ...el, nu }, mu);
}

/** Δv to leave a circular parking orbit of radius r onto a hyperbola with excess speed vinf (patched conics). */
export const escapeDeltaV = (vinf: number, r: number, mu: number): number => Math.sqrt(vinf * vinf + (2 * mu) / r) - Math.sqrt(mu / r);

/** Δv to capture from excess speed vinf into an orbit with periapsis rp and eccentricity e (0 = circular). */
export function captureDeltaV(vinf: number, rp: number, mu: number, e = 0): number {
  const vHyp = Math.sqrt(vinf * vinf + (2 * mu) / rp);
  const vOrbit = Math.sqrt((mu * (1 + e)) / rp);
  return vHyp - vOrbit;
}

/** Tsiolkovsky: propellant mass fraction for Δv at specific impulse isp (s). */
export const propellantFraction = (dv: number, isp: number): number => 1 - Math.exp(-dv / (isp * 9.80665));

export interface HohmannResult {
  /** Burn to enter the transfer ellipse. */
  dv1: number;
  /** Burn to circularize at the target radius. */
  dv2: number;
  dvTotal: number;
  /** Transfer time (half the transfer period). */
  tof: number;
  aTransfer: number;
}

/** Hohmann transfer between coplanar circular orbits of radii r1 and r2. */
export function hohmann(r1: number, r2: number, mu: number): HohmannResult {
  const aT = (r1 + r2) / 2;
  const v1 = circularSpeed(r1, mu), v2 = circularSpeed(r2, mu);
  const dv1 = Math.abs(visViva(r1, aT, mu) - v1);
  const dv2 = Math.abs(v2 - visViva(r2, aT, mu));
  return { dv1, dv2, dvTotal: dv1 + dv2, tof: period(aT, mu) / 2, aTransfer: aT };
}

/** Bi-elliptic transfer via an intermediate apoapsis rB. */
export function biElliptic(r1: number, r2: number, rB: number, mu: number): { dv1: number; dv2: number; dv3: number; dvTotal: number; tof: number } {
  const a1 = (r1 + rB) / 2, a2 = (rB + r2) / 2;
  const dv1 = Math.abs(visViva(r1, a1, mu) - circularSpeed(r1, mu));
  const dv2 = Math.abs(visViva(rB, a2, mu) - visViva(rB, a1, mu));
  const dv3 = Math.abs(circularSpeed(r2, mu) - visViva(r2, a2, mu));
  return { dv1, dv2, dv3, dvTotal: dv1 + dv2 + dv3, tof: (period(a1, mu) + period(a2, mu)) / 2 };
}

/** Delta-v for a simple plane change of angle `di` at speed v. */
export const planeChange = (v: number, di: number): number => 2 * v * Math.sin(di / 2);

/** Synodic period of two circular orbits. */
export const synodicPeriod = (T1: number, T2: number): number => Math.abs(1 / (1 / T1 - 1 / T2));

/** Sphere of influence radius of a secondary of mass m2 orbiting m1 at distance d. */
export const sphereOfInfluence = (d: number, m2: number, m1: number): number => d * Math.pow(m2 / m1, 2 / 5);

/** Hill radius for a secondary of mass m2 on a circular orbit of radius d around m1. */
export const hillRadius = (d: number, m2: number, m1: number): number => d * Math.cbrt(m2 / (3 * m1));

/**
 * Stumpff functions used by the universal-variable Lambert / Kepler solvers.
 */
export function stumpffC(z: number): number {
  if (z > 1e-6) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-6) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 1 / 2 - z / 24 + z * z / 720;
}
export function stumpffS(z: number): number {
  if (z > 1e-6) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); }
  if (z < -1e-6) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); }
  return 1 / 6 - z / 120 + z * z / 5040;
}

/**
 * Lambert's problem by the universal-variable method (Bate, Mueller & White;
 * Curtis Algorithm 5.2). Returns the departure and arrival velocities for the
 * transfer from r1 to r2 in time `tof`. `prograde` selects the short/long way
 * via the sign of the z component of r1 × r2.
 */
export function lambert(r1: Vec3, r2: Vec3, tof: number, mu: number, prograde = true): { v1: Vec3; v2: Vec3 } {
  const r1n = v3.norm(r1), r2n = v3.norm(r2);
  const c12 = v3.cross(r1, r2);
  let theta = Math.acos(Math.min(1, Math.max(-1, v3.dot(r1, r2) / (r1n * r2n))));
  if (prograde ? c12[2] < 0 : c12[2] >= 0) theta = 2 * Math.PI - theta;
  const A = Math.sin(theta) * Math.sqrt((r1n * r2n) / (1 - Math.cos(theta)));
  if (!Number.isFinite(A) || A === 0) throw new Error("lambert: transfer angle of 0 or π is degenerate");
  const y = (z: number): number => r1n + r2n + (A * (z * stumpffS(z) - 1)) / Math.sqrt(stumpffC(z));
  const F = (z: number): number => {
    const yz = y(z);
    if (yz < 0) return NaN;
    return Math.pow(yz / stumpffC(z), 1.5) * stumpffS(z) + A * Math.sqrt(yz) - Math.sqrt(mu) * tof;
  };
  // Bracket z between the hyperbolic and multi-revolution limits.
  let zLo = -4 * Math.PI ** 2, zHi = 4 * Math.PI ** 2;
  while (!(y(zLo) > 0) || !Number.isFinite(F(zLo))) zLo += 0.5;
  while (!(F(zHi) > 0)) zHi -= 0.1;
  if (!(F(zLo) < 0)) { /* fall back to a broader search */ zLo = -50; while (!(y(zLo) > 0) || !(F(zLo) < 0)) { zLo += 0.5; if (zLo >= zHi) throw new Error("lambert: no solution bracketed"); } }
  const z = fzero(F, [zLo, zHi]);
  const yz = y(z);
  const f = 1 - yz / r1n, g = A * Math.sqrt(yz / mu), gdot = 1 - yz / r2n;
  const v1 = v3.scale(v3.sub(r2, v3.scale(r1, f)), 1 / g);
  const v2 = v3.scale(v3.sub(v3.scale(r2, gdot), r1), 1 / g);
  return { v1, v2 };
}

/** Circular restricted three-body equations in the rotating frame (dimensionless). */
export function cr3bpRhs(mu: number): (t: number, y: Float64Array) => number[] {
  return (_t, y) => {
    const [x, yy, z, vx, vy, vz] = y as unknown as [number, number, number, number, number, number];
    const r1 = Math.pow((x + mu) ** 2 + yy ** 2 + z ** 2, 1.5);
    const r2 = Math.pow((x - 1 + mu) ** 2 + yy ** 2 + z ** 2, 1.5);
    const ax = x + 2 * vy - ((1 - mu) * (x + mu)) / r1 - (mu * (x - 1 + mu)) / r2;
    const ay = yy - 2 * vx - ((1 - mu) * yy) / r1 - (mu * yy) / r2;
    const az = -((1 - mu) * z) / r1 - (mu * z) / r2;
    return [vx, vy, vz, ax, ay, az];
  };
}

/** Jacobi constant in the rotating CR3BP frame. */
export function jacobiConstant(mu: number, y: ArrayLike<number>): number {
  const [x, yy, z, vx, vy, vz] = y as unknown as [number, number, number, number, number, number];
  const r1 = Math.hypot(x + mu, yy, z), r2 = Math.hypot(x - 1 + mu, yy, z);
  return x * x + yy * yy + (2 * (1 - mu)) / r1 + (2 * mu) / r2 - (vx * vx + vy * vy + vz * vz);
}

/** Collinear Lagrange points L1, L2, L3 (x coordinates) plus L4/L5 positions. */
export function lagrangePoints(mu: number): { L1: number; L2: number; L3: number; L4: [number, number]; L5: [number, number] } {
  const dUdx = (x: number): number => x - ((1 - mu) * (x + mu)) / Math.abs(x + mu) ** 3 - (mu * (x - 1 + mu)) / Math.abs(x - 1 + mu) ** 3;
  const eps = 1e-9;
  const L1 = fzero(dUdx, [-mu + eps, 1 - mu - eps]);
  const L2 = fzero(dUdx, [1 - mu + eps, 2]);
  const L3 = fzero(dUdx, [-2, -mu - eps]);
  const h = Math.sqrt(3) / 2;
  return { L1, L2, L3, L4: [0.5 - mu, h], L5: [0.5 - mu, -h] };
}

// ---- planetary ephemerides ---------------------------------------------------

/** Julian date from a calendar date (UTC, proleptic Gregorian), Meeus ch. 7. */
export function juliandate(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
  let y = year, m = month;
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  const d = day + (hour + minute / 60 + second / 3600) / 24;
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

/** Calendar date from a Julian date (Meeus ch. 7). */
export function jd2date(jd: number): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  const alpha = Math.floor((z - 1867216.25) / 36524.25);
  const A = z < 2299161 ? z : z + 1 + alpha - Math.floor(alpha / 4);
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const dayF = B - D - Math.floor(30.6001 * E) + f;
  const day = Math.floor(dayF);
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  const hours = (dayF - day) * 24;
  const hour = Math.floor(hours);
  const minutes = (hours - hour) * 60;
  const minute = Math.floor(minutes);
  return { year, month, day, hour, minute, second: (minutes - minute) * 60 };
}

export const J2000 = 2451545.0;
export const PLANET_IDS = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"] as const;
export type PlanetId = (typeof PLANET_IDS)[number];

/**
 * Keplerian mean elements and centennial rates valid 1800–2050 AD
 * (Standish, "Keplerian Elements for Approximate Positions of the Major
 * Planets", JPL, Table 1). Elements: a [AU], e, I [deg], L [deg],
 * long.peri [deg], long.node [deg]; rates per Julian century. The Earth
 * entry is the Earth–Moon barycentre.
 */
const STANDISH: Record<PlanetId, [number[], number[]]> = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus: [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255], [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
  earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
  mars: [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  uranus: [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
};

/** Heliocentric ecliptic-J2000 state of a planet at Julian date `jd` (m, m/s). */
export function planetState(body: PlanetId, jd: number): StateVector {
  const entry = STANDISH[body];
  if (!entry) throw new Error(`planetState: unknown body '${body}'`);
  const T = (jd - J2000) / 36525;
  const [e0, r0] = entry;
  const el = e0.map((v, i) => v + r0[i]! * T) as [number, number, number, number, number, number];
  const [aAU, e, Ideg, Ldeg, wbarDeg, OmegaDeg] = el;
  const d2r = Math.PI / 180;
  const a = aAU * AU;
  const argp = (wbarDeg - OmegaDeg) * d2r;
  const M = ((((Ldeg - wbarDeg) % 360) + 360) % 360) * d2r;
  const nu = meanToTrue(M, e);
  return kepler2cart({ a, e, i: Ideg * d2r, raan: OmegaDeg * d2r, argp, nu }, MU.sun);
}

export interface PorkchopResult {
  /** Departure Julian dates (columns of the grids). */
  jdDep: number[];
  /** Arrival Julian dates (rows of the grids). */
  jdArr: number[];
  /** Departure characteristic energy C3 = v∞², km²/s². NaN where no solution. */
  c3: number[][];
  /** Arrival hyperbolic excess speed, km/s. */
  vinfArr: number[][];
  /** Departure hyperbolic excess speed, km/s. */
  vinfDep: number[][];
  /** Time of flight, days. */
  tof: number[][];
  /** Grid minimum of C3 and its location. */
  best: { c3: number; vinfArr: number; jdDep: number; jdArr: number; tof: number };
}

/**
 * Porkchop grid: Lambert transfers between two planets over ranges of
 * departure and arrival dates. Rows index arrival dates, columns departure
 * dates, matching how `contour(jdDep, jdArr, C3)` expects its arguments.
 */
export function porkchop(from: PlanetId, to: PlanetId, jdDep: number[], jdArr: number[], prograde = true): PorkchopResult {
  const dep = jdDep.map((jd) => planetState(from, jd));
  const arr = jdArr.map((jd) => planetState(to, jd));
  const c3: number[][] = [], vinfArr: number[][] = [], vinfDep: number[][] = [], tof: number[][] = [];
  const best = { c3: Infinity, vinfArr: NaN, jdDep: NaN, jdArr: NaN, tof: NaN };
  for (let i = 0; i < jdArr.length; i++) {
    const rowC3: number[] = [], rowVa: number[] = [], rowVd: number[] = [], rowT: number[] = [];
    for (let j = 0; j < jdDep.length; j++) {
      const dt = (jdArr[i]! - jdDep[j]!) * DAY;
      rowT.push(dt / DAY);
      if (dt <= DAY) { rowC3.push(NaN); rowVa.push(NaN); rowVd.push(NaN); continue; }
      try {
        const sol = lambert(dep[j]!.r, arr[i]!.r, dt, MU.sun, prograde);
        const vd = v3.norm(v3.sub(sol.v1, dep[j]!.v)) / 1e3;
        const va = v3.norm(v3.sub(sol.v2, arr[i]!.v)) / 1e3;
        rowC3.push(vd * vd); rowVa.push(va); rowVd.push(vd);
        if (vd * vd < best.c3) Object.assign(best, { c3: vd * vd, vinfArr: va, jdDep: jdDep[j]!, jdArr: jdArr[i]!, tof: dt / DAY });
      } catch {
        rowC3.push(NaN); rowVa.push(NaN); rowVd.push(NaN);
      }
    }
    c3.push(rowC3); vinfArr.push(rowVa); vinfDep.push(rowVd); tof.push(rowT);
  }
  return { jdDep, jdArr, c3, vinfArr, vinfDep, tof, best };
}
