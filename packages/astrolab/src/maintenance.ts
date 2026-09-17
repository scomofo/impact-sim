/**
 * Orbit-maintenance / station-keeping toolbox: atmospheric drag decay and
 * reboost cadence, J2 secular rates and special orbits, geostationary
 * north–south (lunisolar) and east–west (triaxiality) budgets, solar-pressure
 * eccentricity, and propellant over a mission.
 *
 * Formulas follow Vallado (drag, J2, third-body, tesseral resonance), Wertz &
 * Larson SMAD (drag per revolution) and Soop, *Handbook of Geostationary
 * Orbits* (GEO control cycles). SI units and radians throughout; altitudes
 * are spherical (r − R_earth). Near-circular formulas assume e ≲ 0.002.
 */

import { AU, DAY, MU, RADIUS, YEAR, hohmann, propellantFraction } from "./astro.ts";

export const G0 = 9.80665;
/** Earth inertial rotation rate, rad/s (IERS 2010). */
export const OMEGA_EARTH = 7.292115e-5;
/** Mean tropical year, s. */
export const TROPICAL_YEAR = 365.2422 * DAY;
/** RAAN rate a sun-synchronous orbit must hold, rad/s (+0.98565 deg/day). */
export const SUN_SYNC_RATE = (2 * Math.PI) / TROPICAL_YEAR;

/** Zonal J2 with the reference radius of the gravity model that defines it. */
export const J2_BODIES = {
  earth: { j2: 1.08262668e-3, radius: 6378137, mu: MU.earth },
  moon: { j2: 2.033e-4, radius: 1738.0e3, mu: MU.moon },
  mars: { j2: 1.9555e-3, radius: 3396.0e3, mu: MU.mars },
} as const;
export type J2Body = keyof typeof J2_BODIES;

// ---- atmosphere ---------------------------------------------------------------

/**
 * Vallado Table 8-4 exponential atmosphere: [base altitude km, density kg/m³,
 * scale height km]. Band i applies for h0_i ≤ h < h0_(i+1); the last row
 * extends upward. 0–25 km USSA-76, 25–500 km CIRA-72, above 500 km CIRA-72
 * with T_exo = 1000 K (moderate-to-high solar activity).
 */
export const DENSITY_TABLE: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1.225, 7.249], [25, 3.899e-2, 6.349], [30, 1.774e-2, 6.682], [40, 3.972e-3, 7.554],
  [50, 1.057e-3, 8.382], [60, 3.206e-4, 7.714], [70, 8.770e-5, 6.549], [80, 1.905e-5, 5.799],
  [90, 3.396e-6, 5.382], [100, 5.297e-7, 5.877], [110, 9.661e-8, 7.263], [120, 2.438e-8, 9.473],
  [130, 8.484e-9, 12.636], [140, 3.845e-9, 16.149], [150, 2.070e-9, 22.523], [180, 5.464e-10, 29.740],
  [200, 2.789e-10, 37.105], [250, 7.248e-11, 45.546], [300, 2.418e-11, 53.628], [350, 9.518e-12, 53.298],
  [400, 3.725e-12, 58.515], [450, 1.585e-12, 60.828], [500, 6.967e-13, 63.822], [600, 1.454e-13, 71.835],
  [700, 3.614e-14, 88.667], [800, 1.170e-14, 124.64], [900, 5.245e-15, 181.05], [1000, 3.019e-15, 268.00],
];

export type SolarActivity = "low" | "mean" | "high";

/**
 * Solar-activity multipliers on the table density by altitude (km): ratios of
 * SMAD's solar-minimum and solar-maximum columns to its mean column. "mean"
 * is the table itself. Rough knob: real densities vary ×3 (200 km) to ×30
 * (600 km) over a solar cycle.
 */
const ACTIVITY_FACTORS: ReadonlyArray<readonly [number, number, number]> = [
  [200, 0.70, 1.39], [300, 0.42, 2.03], [400, 0.27, 2.78], [500, 0.18, 3.68],
  [600, 0.16, 4.70], [700, 0.21, 5.40], [800, 0.31, 4.56], [1000, 0.42, 3.17],
];

export function solarActivityFactor(h: number, activity: SolarActivity): number {
  if (activity === "mean") return 1;
  const col = activity === "low" ? 1 : 2;
  const hk = h / 1e3;
  if (hk <= ACTIVITY_FACTORS[0]![0]) return hk < 150 ? 1 : ACTIVITY_FACTORS[0]![col];
  const last = ACTIVITY_FACTORS[ACTIVITY_FACTORS.length - 1]!;
  if (hk >= last[0]) return last[col];
  for (let i = 1; i < ACTIVITY_FACTORS.length; i++) {
    const [h1, ...f1] = ACTIVITY_FACTORS[i]!;
    const [h0, ...f0] = ACTIVITY_FACTORS[i - 1]!;
    if (hk <= h1) {
      const t = (hk - h0) / (h1 - h0);
      // Interpolate the logarithm so the factor stays positive and smooth.
      return Math.exp(Math.log(f0[col - 1]!) + t * (Math.log(f1[col - 1]!) - Math.log(f0[col - 1]!)));
    }
  }
  return 1;
}

/** Piecewise-exponential density at spherical altitude h (m). */
export function atmosphericDensity(h: number, activity: SolarActivity = "mean"): number {
  const hk = Math.max(0, h) / 1e3;
  let row = DENSITY_TABLE[0]!;
  for (const r of DENSITY_TABLE) {
    if (r[0] <= hk) row = r;
    else break;
  }
  return row[1] * Math.exp(-(hk - row[0]) / row[2]) * solarActivityFactor(h, activity);
}

// ---- drag decay and reboost ---------------------------------------------------

export interface DragDecay {
  /** Density used, kg/m³. */
  rho: number;
  /** Ballistic coefficient m/(C_D A), kg/m². */
  beta: number;
  /** Drag deceleration, m/s². */
  aD: number;
  /** Secular decay rate da/dt, m/s (negative). */
  dadt: number;
  /** Change in semi-major axis per revolution, m (negative). */
  daPerRev: number;
  /** Change in period per revolution, s (negative). */
  dPPerRev: number;
  /** Drag-makeup Δv per revolution and per year, m/s. */
  dvPerRev: number;
  dvPerYear: number;
  period: number;
}

/** Near-circular secular drag effects at semi-major axis a with ballistic coefficient beta = m/(C_D A). */
export function dragDecay(a: number, beta: number, rho: number, mu = MU.earth): DragDecay {
  if (!(beta > 0)) throw new Error("dragDecay: ballistic coefficient must be positive");
  const v = Math.sqrt(mu / a);
  const period = 2 * Math.PI * Math.sqrt(a ** 3 / mu);
  const aD = (rho * mu) / (2 * beta * a);
  return {
    rho, beta, aD,
    dadt: -(rho * Math.sqrt(mu * a)) / beta,
    daPerRev: -(2 * Math.PI * rho * a * a) / beta,
    dPPerRev: -(6 * Math.PI * Math.PI * rho * a * a) / (beta * v),
    dvPerRev: aD * period,
    dvPerYear: aD * YEAR,
    period,
  };
}

/** Rotating-atmosphere factor on drag for a circular orbit of radius r and inclination i (King-Hele, first order). */
export function rotatingAtmosphereFactor(r: number, i: number, mu = MU.earth, omega = OMEGA_EARTH): number {
  const v = Math.sqrt(mu / r);
  return Math.pow(1 - (r * omega * Math.cos(i)) / v, 2);
}

/** Time (s) for the orbit to decay from altitude hTop to hBottom (m), midpoint quadrature in altitude. */
export function decayTime(hTop: number, hBottom: number, beta: number, activity: SolarActivity = "mean", mu = MU.earth, R = RADIUS.earth): number {
  if (!(beta > 0)) throw new Error("decayTime: ballistic coefficient must be positive");
  if (hBottom >= hTop) return 0;
  const span = hTop - hBottom;
  const n = Math.max(20, Math.ceil(span / 500));
  const dh = span / n;
  let t = 0;
  for (let k = 0; k < n; k++) {
    const hm = hBottom + (k + 0.5) * dh;
    const rho = atmosphericDensity(hm, activity);
    if (rho <= 0) return Infinity;
    t += (beta * dh) / (rho * Math.sqrt(mu * (R + hm)));
  }
  return t;
}

/** Uncontrolled orbital lifetime (s) from altitude h0 down to hStop (default 100 km). */
export function orbitLifetime(h0: number, beta: number, activity: SolarActivity = "mean", hStop = 100e3): number {
  if (h0 <= hStop) return 0;
  return decayTime(h0, hStop, beta, activity);
}

export interface ReboostCycle {
  /** Time between reboosts, s. */
  interval: number;
  /** Exact two-burn Hohmann Δv per reboost, m/s. */
  dvPerReboost: number;
  reboostsPerYear: number;
  dvPerYear: number;
}

/** Deadband reboost cycle: the orbit decays from hHi to hHi − dh, then is raised back (m). */
export function reboostCycle(hHi: number, dh: number, beta: number, activity: SolarActivity = "mean", mu = MU.earth, R = RADIUS.earth): ReboostCycle {
  if (!(dh > 0)) throw new Error("reboostCycle: deadband must be positive");
  const interval = decayTime(hHi, hHi - dh, beta, activity, mu, R);
  const dvPerReboost = hohmann(R + hHi - dh, R + hHi, mu).dvTotal;
  const reboostsPerYear = interval > 0 ? YEAR / interval : Infinity;
  return { interval, dvPerReboost, reboostsPerYear, dvPerYear: dvPerReboost * reboostsPerYear };
}

// ---- J2 secular effects ---------------------------------------------------------

export interface J2Rates {
  /** Secular rates, rad/s. */
  raanDot: number;
  argpDot: number;
  meanAnomalyDot: number;
  keplerPeriod: number;
  nodalPeriod: number;
  anomalisticPeriod: number;
  /** Revolutions per nodal day (repeat-ground-track ratio), Earth only. */
  revsPerNodalDay: number;
}

export function j2Rates(a: number, e: number, i: number, body: J2Body = "earth"): J2Rates {
  const { j2, radius, mu } = J2_BODIES[body];
  if (!(a > 0) || !(e >= 0 && e < 1)) throw new Error("j2Rates: need a > 0 and 0 <= e < 1");
  if (a * (1 - e) <= radius) throw new Error("j2Rates: periapsis is below the surface");
  const p = a * (1 - e * e);
  const n = Math.sqrt(mu / a ** 3);
  const k = 1.5 * n * j2 * (radius / p) ** 2;
  const s2 = Math.sin(i) ** 2;
  const raanDot = -k * Math.cos(i);
  const argpDot = k * (2 - 2.5 * s2);
  const meanAnomalyDot = k * Math.sqrt(1 - e * e) * (1 - 1.5 * s2);
  const omega = body === "earth" ? OMEGA_EARTH : NaN;
  return {
    raanDot, argpDot, meanAnomalyDot,
    keplerPeriod: (2 * Math.PI) / n,
    nodalPeriod: (2 * Math.PI) / (n + meanAnomalyDot + argpDot),
    anomalisticPeriod: (2 * Math.PI) / (n + meanAnomalyDot),
    revsPerNodalDay: (n + meanAnomalyDot + argpDot) / (omega - raanDot),
  };
}

/** Sun-synchronous inclination (rad) for semi-major axis a and eccentricity e; NaN when none exists. */
export function sunSyncInclination(a: number, e = 0, body: J2Body = "earth", targetRate = SUN_SYNC_RATE): number {
  const { j2, radius, mu } = J2_BODIES[body];
  const c = -((2 / 3) * targetRate * (1 - e * e) ** 2 * Math.pow(a, 3.5)) / (j2 * radius * radius * Math.sqrt(mu));
  return Math.abs(c) > 1 ? NaN : Math.acos(c);
}

/** Semi-major axis (m) that is sun-synchronous at inclination i (rad); NaN unless cos i < 0. */
export function sunSyncSemiMajorAxis(i: number, e = 0, body: J2Body = "earth", targetRate = SUN_SYNC_RATE): number {
  const { j2, radius, mu } = J2_BODIES[body];
  const num = -3 * j2 * radius * radius * Math.sqrt(mu) * Math.cos(i);
  const den = 2 * targetRate * (1 - e * e) ** 2;
  return num / den <= 0 ? NaN : Math.pow(num / den, 2 / 7);
}

export const CRITICAL_INCLINATION = Math.atan(2);

// ---- geostationary --------------------------------------------------------------

export const A_GEO = Math.cbrt(MU.earth / (OMEGA_EARTH * OMEGA_EARTH));
export const V_GEO = A_GEO * OMEGA_EARTH;
export const OBLIQUITY = (23.4393 * Math.PI) / 180;
const I_MOON = (5.145 * Math.PI) / 180;
const A_MOON = 3.844e8;
const K_SUN = MU.sun / AU ** 3;
const K_MOON = MU.moon / A_MOON ** 3;
/** EGM96 unnormalised degree-2 order-2 coefficients. */
const C22 = 1.57446e-6;
const S22 = -9.03804e-7;
export const J22 = Math.hypot(C22, S22);
/** East longitude of the equatorial ellipse's major axis (unstable points), rad. */
export const LAMBDA_22 = 0.5 * Math.atan2(S22, C22);
/** Solar radiation pressure at 1 AU, N/m². */
export const P_SRP = 4.56e-6;

/** Mean longitude of the Moon's ascending node (rad), Meeus ch. 47. */
export function lunarNodeLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525;
  const deg = 125.0445479 - 1934.1362891 * T + 0.0020754 * T * T;
  return ((((deg % 360) + 360) % 360) * Math.PI) / 180;
}

export interface GeoInclinationDrift {
  /** Inclination-vector drift components (i_x = i cos Ω, i_y = i sin Ω), rad/s. */
  sun: [number, number];
  moon: [number, number];
  total: [number, number];
  /** Magnitudes, rad/s. */
  sunRate: number;
  moonRate: number;
  totalRate: number;
  /** Direction of the total drift in the (i_x, i_y) plane, rad. */
  direction: number;
  /** Inclination of the Moon's orbit to the equator, rad. */
  moonEquatorialInclination: number;
}

/** Secular lunisolar drift of a near-equatorial GEO inclination vector at Julian date jd. */
export function geoInclinationDrift(jd: number): GeoInclinationDrift {
  const n = OMEGA_EARTH;
  const drift = (k: number, nx: number, ny: number, nz: number): [number, number] => [
    -0.75 * (k / n) * nz * nx,
    -0.75 * (k / n) * nz * ny,
  ];
  const sun = drift(K_SUN, 0, -Math.sin(OBLIQUITY), Math.cos(OBLIQUITY));
  const om = lunarNodeLongitude(jd);
  const nx = Math.sin(I_MOON) * Math.sin(om);
  const ny = -Math.sin(I_MOON) * Math.cos(om) * Math.cos(OBLIQUITY) - Math.cos(I_MOON) * Math.sin(OBLIQUITY);
  const nz = Math.cos(I_MOON) * Math.cos(OBLIQUITY) - Math.sin(I_MOON) * Math.cos(om) * Math.sin(OBLIQUITY);
  const moon = drift(K_MOON, nx, ny, nz);
  const total: [number, number] = [sun[0] + moon[0], sun[1] + moon[1]];
  return {
    sun, moon, total,
    sunRate: Math.hypot(sun[0], sun[1]),
    moonRate: Math.hypot(moon[0], moon[1]),
    totalRate: Math.hypot(total[0], total[1]),
    direction: Math.atan2(total[1], total[0]),
    moonEquatorialInclination: Math.acos(nz),
  };
}

export interface GeoNorthSouth {
  /** Inclination drift, rad/s. */
  rate: number;
  dvPerYear: number;
  /** Time between burns for an inclination tolerance iBox (bias strategy), s. */
  interval: number;
  dvPerBurn: number;
  burnsPerYear: number;
}

export function geoNorthSouth(jd: number, iBox: number): GeoNorthSouth {
  const rate = geoInclinationDrift(jd).totalRate;
  const interval = rate > 0 ? (2 * iBox) / rate : Infinity;
  const dvPerBurn = 2 * V_GEO * Math.sin(iBox);
  return { rate, dvPerYear: V_GEO * rate * YEAR, interval, dvPerBurn, burnsPerYear: rate > 0 ? YEAR / interval : 0 };
}

/** Longitude drift acceleration from J22 at east longitude lon (rad), rad/s²; positive = eastward. */
export function geoLongitudeAcceleration(lon: number): number {
  return 18 * OMEGA_EARTH * OMEGA_EARTH * (RADIUS.earth / A_GEO) ** 2 * J22 * Math.sin(2 * (lon - LAMBDA_22));
}

export interface GeoEastWest {
  acceleration: number;
  dvPerYear: number;
  /** Free-drift parabola cycle for a longitude box of half-width box (rad), s. */
  cycle: number;
  dvPerManeuver: number;
  maneuversPerYear: number;
  /** Equilibrium longitudes, rad east. */
  stable: [number, number];
  unstable: [number, number];
}

export function geoEastWest(lon: number, box: number): GeoEastWest {
  const raw = geoLongitudeAcceleration(lon);
  // Treat rounding residuals at the equilibrium longitudes (peak is 4e-15 rad/s²) as zero.
  const acc = Math.abs(raw) < 1e-24 ? 0 : raw;
  const mag = Math.abs(acc);
  const dvPerYear = (A_GEO / 3) * mag * YEAR;
  const cycle = mag > 0 && box > 0 ? 4 * Math.sqrt(box / mag) : Infinity;
  const dvPerManeuver = mag > 0 ? ((4 * A_GEO) / 3) * Math.sqrt(box * mag) : 0;
  const wrap = (x: number) => ((x + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return {
    acceleration: acc, dvPerYear, cycle, dvPerManeuver,
    maneuversPerYear: Number.isFinite(cycle) ? YEAR / cycle : 0,
    stable: [wrap(LAMBDA_22 + Math.PI / 2), wrap(LAMBDA_22 - Math.PI / 2)],
    unstable: [wrap(LAMBDA_22), wrap(LAMBDA_22 + Math.PI)],
  };
}

/** Small-amplitude libration period about a stable GEO longitude, s (≈ 2.2 yr). */
export const GEO_LIBRATION_PERIOD = (2 * Math.PI) / Math.sqrt(2 * 18 * OMEGA_EARTH * OMEGA_EARTH * (RADIUS.earth / A_GEO) ** 2 * J22);

export interface SrpEccentricity {
  /** SRP acceleration, m/s². */
  aSrp: number;
  /** Radius of the natural eccentricity circle traced once per year. */
  eNatural: number;
  /** Daily longitude libration amplitude 2e, rad. */
  libration: number;
  /** Δv per year to cancel the eccentricity growth entirely, m/s. */
  dvCancelPerYear: number;
}

export function srpEccentricity(cr: number, areaToMass: number): SrpEccentricity {
  const aSrp = cr * areaToMass * P_SRP;
  const nSun = (2 * Math.PI) / YEAR;
  const eNatural = (1.5 * aSrp) / (V_GEO * nSun);
  return { aSrp, eNatural, libration: 2 * eNatural, dvCancelPerYear: 0.75 * aSrp * YEAR };
}

// ---- budgeting ------------------------------------------------------------------

export interface MissionPropellant {
  dvTotal: number;
  /** Propellant from the initial (start-of-station-keeping) mass, kg. */
  propellant: number;
  /** Propellant burned in each year, kg. */
  perYear: number[];
  finalMass: number;
}

/** Propellant for dvPerYear over `years` at Isp with a Δv margin fraction, from initial mass m0. */
export function missionPropellant(m0: number, dvPerYear: number, years: number, isp: number, margin = 0): MissionPropellant {
  const dvTotal = dvPerYear * years * (1 + margin);
  const perYear: number[] = [];
  let m = m0;
  const whole = Math.floor(years);
  for (let k = 0; k < whole; k++) {
    const dm = m * propellantFraction(dvPerYear * (1 + margin), isp);
    perYear.push(dm);
    m -= dm;
  }
  const frac = years - whole;
  if (frac > 1e-9) {
    const dm = m * propellantFraction(dvPerYear * frac * (1 + margin), isp);
    perYear.push(dm);
    m -= dm;
  }
  return { dvTotal, propellant: m0 * propellantFraction(dvTotal, isp), perYear, finalMass: m };
}

/** Propellant needed when `mDry` is the mass left after the Δv is spent. */
export const propellantFromDry = (mDry: number, dv: number, isp: number): number => mDry * (Math.exp(dv / (isp * G0)) - 1);
