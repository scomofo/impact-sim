// physics.js — pure impact physics, no rendering dependencies. SI units throughout
// unless a name says otherwise; theta = impact angle from the horizontal.
//
// Cratering + entry + thermal/seismic: Collins, Melosh & Marcus 2005 (Earth Impact
// Effects Program, M&PS 40, 817). Giant impacts: Leinhardt & Stewart 2012 (ApJ 745,
// 79) with the Genda, Kokubo & Ida 2012 merge criterion. See docs/MODEL.md for
// equation provenance, application limits, and explicitly heuristic extensions.

export const G = 6.674e-11;
export const MT_TNT = 4.184e15; // J per megaton TNT
export const M_MOON = 7.346e22; // kg

export const EARTH = {
  radius: 6.371e6,      // m
  mass: 5.972e24,       // kg
  g: 9.81,              // m/s^2
  escapeVel: 11186,     // m/s (surface escape velocity)
  targetDensity: 2500,  // kg/m^3 (EIEP sedimentary-rock target)
  spinAngMom: 5.86e33,  // kg m^2/s, present-day rotation
  momentFactor: 0.335,  // I = k M R^2 for a differentiated Earth-like body
};

export const MAX_DISTANCE = Math.PI * EARTH.radius;
// Application bounds, not a claim of scientific validity throughout this range.
export const INPUT_LIMITS = Object.freeze({
  diameter: [10, 7420000], density: [500, 8000], velocity: [5000, 72000],
  angleDeg: [5, 90], waterDepth: [0, 11000],
});

function requireRange(name, value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be a finite number from ${min} to ${max}.`);
  }
}

export function validateInputs(input) {
  if (!input || typeof input !== 'object') throw new TypeError('Impact parameters are required.');
  for (const name of ['diameter', 'density', 'velocity', 'angleDeg']) {
    requireRange(name, input[name], ...INPUT_LIMITS[name]);
  }
  const target = input.target ?? 'sedimentary';
  if (typeof target !== 'string' || !Object.hasOwn(TARGETS, target)) throw new RangeError('Unknown target terrain.');
  const waterDepth = input.waterDepth ?? TARGETS[target].waterDepth ?? 0;
  requireRange('waterDepth', waterDepth, ...INPUT_LIMITS.waterDepth);
  if (waterDepth > 0 && !TARGETS[target].waterDepth) {
    throw new RangeError('Water depth requires a water target.');
  }
  return { diameter: input.diameter, density: input.density, velocity: input.velocity,
    angleDeg: input.angleDeg, target, waterDepth };
}

function validateDistance(r, allowZero = false) {
  requireRange('distance (m)', r, allowZero ? 0 : 1, MAX_DISTANCE);
}

const L_EM = 3.5e34;    // Earth–Moon system angular momentum, kg m^2/s

export const COMPOSITIONS = {
  ice: { label: 'Icy (comet)', density: 1000 },
  porous: { label: 'Porous rock', density: 1500 },
  rock: { label: 'Dense rock', density: 3000 },
  iron: { label: 'Iron', density: 7900 },
};

export const TARGETS = {
  sedimentary: { label: 'Sedimentary rock', rho: 2500 },
  crystalline: { label: 'Crystalline rock', rho: 2750 },
  shelf: { label: 'Continental shelf (default 150 m)', rho: 2500, waterDepth: 150 },
  ocean: { label: 'Deep ocean (default 3.8 km)', rho: 2700, waterDepth: 3800 },
};

const sinDeg = (d) => Math.sin((d * Math.PI) / 180);
const cosDeg = (d) => Math.cos((d * Math.PI) / 180);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function impactorMass(diameter, density) {
  return density * (Math.PI / 6) * diameter ** 3;
}

// ---------------------------------------------------------------------------
// Atmospheric entry (CM&M section: breakup + pancake model). Applied only for
// cratering-scale objects. Avoid a discontinuous atmosphere bypass at 1 km.
// Returns airburst-vs-surface outcome and the decelerated surface velocity.
// ---------------------------------------------------------------------------
const RHO_AIR0 = 1.0;  // kg/m^3 — deliberate EIEP simplification (not 1.225)
const SCALE_H = 8000;  // m
const CD = 2.0;
const PANCAKE_FP = 7;

export function simulateEntry({ L0, rhoI, v0, angleDeg }) {
  requireRange('diameter', L0, ...INPUT_LIMITS.diameter);
  requireRange('density', rhoI, ...INPUT_LIMITS.density);
  requireRange('velocity', v0, ...INPUT_LIMITS.velocity);
  requireRange('angleDeg', angleDeg, ...INPUT_LIMITS.angleDeg);
  const sinT = sinDeg(angleDeg);
  const rhoAir = (z) => RHO_AIR0 * Math.exp(-z / SCALE_H);
  const vIntact = (z) =>
    v0 * Math.exp((-3 * rhoAir(z) * CD * SCALE_H) / (4 * rhoI * L0 * sinT)); // Eq. 8
  const Yi = 10 ** (2.107 + 0.0624 * Math.sqrt(rhoI));                        // Eq. 9, Pa
  const If = (4.07 * CD * SCALE_H * Yi) / (rhoI * L0 * v0 * v0 * sinT);       // Eq. 12
  if (If >= 1) {
    const vTerm = Math.sqrt((4 * rhoI * L0 * EARTH.g) / (3 * CD * RHO_AIR0));
    return { outcome: 'surface', vSurface: Math.min(v0, Math.max(vIntact(0), vTerm)), dispersion: L0 };
  }
  const zStar = -SCALE_H * (Math.log(Yi / (RHO_AIR0 * v0 * v0)) +
    1.308 - 0.314 * If - 1.303 * Math.sqrt(1 - If));                          // Eq. 11
  if (zStar <= 0) return { outcome: 'surface', vSurface: vIntact(0), dispersion: L0 };
  const vStar = vIntact(zStar);
  const l = L0 * sinT * Math.sqrt(rhoI / (CD * rhoAir(zStar)));               // Eq. 16
  const zBurst = zStar - 2 * SCALE_H *
    Math.log(1 + (l / (2 * SCALE_H)) * Math.sqrt(PANCAKE_FP ** 2 - 1));       // Eq. 18
  const Lz = (z) => L0 * Math.sqrt(1 +
    ((2 * SCALE_H / l) * (Math.exp((zStar - z) / (2 * SCALE_H)) - 1)) ** 2);  // Eq. 15
  const vPancake = (z) => { // Eq. 17 with a numerical integral
    const N = 256, dz = (zStar - z) / N;
    let I = 0;
    for (let i = 0; i <= N; i++) {
      I += (i === 0 || i === N ? 1 : i % 2 ? 4 : 2) *
        rhoAir(z + i * dz) * Lz(z + i * dz) ** 2 * dz / 3;
    }
    return vStar * Math.exp((-3 * CD * I) / (4 * rhoI * L0 ** 3 * sinT));
  };
  if (zBurst > 0) {
    return { outcome: 'airburst', zBreakup: zStar, zBurst, vBurst: vPancake(zBurst), dispersion: Lz(zBurst) };
  }
  return { outcome: 'surface', zBreakup: zStar, vSurface: vPancake(0), dispersion: Lz(0) };
}

// ---------------------------------------------------------------------------
// Cratering regime (CM&M 2005)
// ---------------------------------------------------------------------------
const DTC_COMPLEX = 2560; // m transient — equals the 3.2 km final-diameter transition

export function craterResults(diameter, density, vSurface, angleDeg, rhoT = 2500, water = false) {
  const Dtc =
    (water ? 1.365 : 1.161) *
    Math.cbrt(density / rhoT) *
    diameter ** 0.78 *
    vSurface ** 0.44 *
    EARTH.g ** -0.22 *
    sinDeg(angleDeg) ** (1 / 3);                                 // Eq. 21

  const dtc = Dtc / (2 * Math.SQRT2);                            // transient depth
  const Vtc = (Math.PI / (16 * Math.SQRT2)) * Dtc ** 3;          // Eq. 46
  if (Dtc <= DTC_COMPLEX) {
    const Dfr = 1.25 * Dtc;                                      // Eq. 22
    const hfr = (0.07 * Dtc ** 4) / Dfr ** 3;                    // Eq. 48
    const Vbr = 0.032 * Dfr ** 3;                                // Eq. 23
    const tbr = (2.8 * Vbr * (dtc + hfr)) / (dtc * Dfr * Dfr);   // Eq. 24
    return { Dtc, Dfr, depth: dtc + hfr - tbr, isComplex: false, Vtc };
  }
  const DfrKm = (1.17 * (Dtc / 1000) ** 1.13) / 3.2 ** 0.13;     // Eq. 27 (km)
  return { Dtc, Dfr: DfrKm * 1000, depth: 400 * DfrKm ** 0.3, isComplex: true, Vtc }; // Eq. 28
}

export function meltVolume(E, angleDeg, vSurface, Vtc) {
  if (vSurface < 12000) return 0;                     // below melting threshold
  return Math.min(8.9e-12 * E * sinDeg(angleDeg), Vtc); // Eq. 30, capped at Vtc
}

export function fireballRadius(E, vSurface) {
  if (vSurface < 15000) return null;                  // no vapor fireball below ~15 km/s
  return 0.002 * Math.cbrt(E);                        // Eq. 32
}

export function seismicMagnitude(E) {
  return 0.67 * Math.log10(E) - 5.87;                 // Eq. 40
}

export function recurrenceYears(energyMt) {
  return 109 * energyMt ** 0.78;                      // Eq. 3
}

// Radius (m) within which thermal exposure exceeds the 3rd-degree-burn threshold
// (0.42 MJ/m^2 at 1 Mt, scaling as E^1/6 — CM&M Table 1 / Eq. 39). Horizon-capped.
export function burnRadius(E, energyMt, vSurface) {
  if (vSurface < 15000) return null;
  const eta = 3e-3;
  const phiBurn = 0.42e6 * energyMt ** (1 / 6);
  const r = Math.sqrt((eta * E) / (2 * Math.PI * phiBurn)); // f = 1 closed form
  const Rf = 0.002 * Math.cbrt(E);
  const rHorizon = EARTH.radius * Math.acos(clamp(1 - Rf / EARTH.radius, -1, 1));
  // Partial fireball visibility (Eq. 36) pulls the true burn ring well inside
  // the f = 1 solution; bisect the exact exposure between the brackets.
  // Exposure is monotonically decreasing on (0, rHorizon), so the root is unique.
  let lo = 1, hi = Math.min(r, rHorizon);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (thermalAtDistance(E, mid, vSurface).exposure >= phiBurn) lo = mid;
    else hi = mid;
  }
  return lo;
}

// ---------------------------------------------------------------------------
// Distance-based effects: what happens to an observer at great-circle distance
// r (m) from ground zero. All from CM&M 2005.
// ---------------------------------------------------------------------------

// Peak blast overpressure (Pa) at distance r, optional burst altitude (Eq. 54-58).
export function peakOverpressure(E, r, zBurst = 0) {
  requireRange('blast energy (J)', E, 0, Number.MAX_VALUE);
  validateDistance(r, zBurst > 0);
  requireRange('burst altitude (m)', zBurst, 0, 1e6);
  if (E === 0) return 0;
  const s = Math.cbrt(E / 4.184e12);            // yield-scale to 1 kt
  const r1 = r / s, zb1 = zBurst / s;
  const eq54 = (rr, rx) => ((75000 * rx) / (4 * rr)) * (1 + 3 * (rx / rr) ** 1.3);
  if (zb1 <= 0) return eq54(r1, 290);
  const rm1 = zb1 >= 550 ? Infinity : (550 * zb1) / (1.2 * (550 - zb1));  // Eq. 58
  if (r1 >= rm1) return eq54(r1, 289 + 0.65 * zb1);                       // Mach region
  return 3.14e11 * zb1 ** -2.6 * Math.exp(-(34.87 * zb1 ** -1.73) * r1);  // regular reflection
}

// Peak wind speed behind the blast front (Eq. 59), m/s.
export function peakWindSpeed(p) {
  const P0 = 1e5, c0 = 330;
  return ((5 * p) / (7 * P0)) * (c0 / Math.sqrt(1 + (6 * p) / (7 * P0)));
}

export const BLAST_DAMAGE = [ // Pa thresholds, descending (Table 4)
  [426000, 'vehicles severely displaced and deformed'],
  [379000, 'girder bridges may collapse'],
  [297000, 'vehicles may overturn'],
  [273000, 'steel frames may approach collapse'],
  [121000, 'truss bridges may collapse'],
  [100000, 'truss bracing may deform severely'],
  [42600, 'load-bearing masonry buildings may collapse'],
  [38500, 'masonry walls may crack severely'],
  [26800, 'wood-frame buildings may largely collapse'],
  [22900, 'wood-frame roofs and partitions may fail'],
  [6900, 'window glass may shatter'],
];
export function blastDamage(p) {
  for (const [thr, desc] of BLAST_DAMAGE) if (p >= thr) return desc;
  return null;
}

// Thermal exposure (J/m^2) at distance r with horizon correction (Eq. 34-37),
// plus what it ignites/burns at this yield (thresholds scale as E^1/6, Eq. 39).
export function thermalAtDistance(E, r, vSurface) {
  if (vSurface < 15000) return null;                 // no vapor fireball
  const Rf = 0.002 * Math.cbrt(E);
  const h = (1 - Math.cos(r / EARTH.radius)) * EARTH.radius;   // hidden height (Eq. 37)
  if (h >= Rf) return { exposure: 0, belowHorizon: true, Rf };
  let f = 1;
  if (h > 0) {
    const x = h / Rf, del = Math.acos(x);
    f = (2 / Math.PI) * (del - x * Math.sin(del));             // visible fraction (Eq. 36)
  }
  const eta = 3e-3;
  const exposure = (f * eta * E) / (2 * Math.PI * r * r);
  const scale = (E / MT_TNT) ** (1 / 6);
  const effects = [];
  if (exposure > 1.0e6 * scale) effects.push('clothing ignites');
  if (exposure > 0.42e6 * scale) effects.push('3rd-degree burns');
  else if (exposure > 0.25e6 * scale) effects.push('2nd-degree burns');
  else if (exposure > 0.13e6 * scale) effects.push('1st-degree burns');
  if (exposure > 0.38e6 * scale) effects.push('grass may ignite');
  if (exposure > 0.25e6 * scale) effects.push('deciduous trees may ignite');
  const duration = (eta * E) / (2 * Math.PI * Rf * Rf * 5.67e-8 * 3000 ** 4); // Eq. 35
  return { exposure, effects, duration, Rf, belowHorizon: false };
}

// Effective seismic magnitude at distance (Eq. 41) and Mercalli intensity (Table 2).
export function seismicAtDistance(M, r) {
  validateDistance(r, true);
  const rkm = r / 1000;
  let Meff;
  if (rkm < 60) Meff = M - 0.0238 * rkm;
  else if (rkm < 700) Meff = M - 0.0048 * rkm - 1.1644;
  else Meff = M - 1.66 * Math.log10(r / EARTH.radius) - 6.399;
  let mercalli;
  if (Meff < 2) mercalli = 'I–II · weak or not felt';
  else if (Meff < 3) mercalli = 'II–III · weak shaking';
  else if (Meff < 4) mercalli = 'III–IV · light shaking';
  else if (Meff < 5) mercalli = 'IV–V · moderate shaking';
  else if (Meff < 6) mercalli = 'VI–VII · damaging shaking';
  else if (Meff < 7) mercalli = 'VII–VIII · severe, buildings damaged';
  else if (Meff < 8) mercalli = 'IX–X · destructive';
  else if (Meff < 9) mercalli = 'X–XI · devastating';
  else mercalli = 'XII · total destruction';
  return { Meff, mercalli, arrival: rkm / 5 };                  // surface waves ~5 km/s
}

// Ejecta blanket at distance r from crater center (Eq. 47, 50-52).
export function ejectaAtDistance(Dtc, DfrHalf, energyMt, fireballR, r) {
  if (r <= DfrHalf) return null;                                // inside the crater
  // Below 200 Mt the atmosphere stifles the deposit beyond the fireball length
  // scale (spec Section 7) — unconditional, not gated on a visible fireball.
  if (energyMt < 200 && r > fireballR) {
    return { thickness: 0, note: 'ejecta stifled by the atmosphere' };
  }
  const thickness = Dtc ** 4 / (112 * r ** 3);
  // Ejection velocity for this range (45° launch, Eq. 52) and the exact Kepler
  // time of flight — verified stable and exact at all ranges, so no flat-Earth
  // shortcut (that limit is off by up to 22% near 2,000 km).
  const t = Math.tan(r / (2 * EARTH.radius));
  const ve = Math.sqrt((2 * EARTH.g * EARTH.radius * t) / (1 + t));
  const x = (ve * ve) / (EARTH.g * EARTH.radius);
  const e2 = 0.5 * ((x - 1) ** 2 + 1), e = Math.sqrt(e2);
  if (e2 >= 1 || !Number.isFinite(e2) || !Number.isFinite(e) || e === 0) {
    return { thickness: 0, note: 'ejecta on escape trajectories — no blanket' };
  }
  const a = (ve * ve) / (2 * EARTH.g * (1 - e2));
  const mu = EARTH.g * EARTH.radius ** 2;
  const cosThL = clamp(((a * (1 - e2)) / EARTH.radius - 1) / e, -1, 1);
  const thL = Math.acos(cosThL);
  const EL = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(thL / 2));
  const tL = (EL - e * Math.sin(EL)) * Math.sqrt(a ** 3 / mu);
  const arrival = 2 * Math.PI * Math.sqrt(a ** 3 / mu) - 2 * tL;
  if (arrival > 3600) return { thickness: 0, note: 'only fine condensed-vapor fallout' };
  return { thickness, arrival, ve };
}

// Deep-water tsunami amplitude at range r (m). Amplitude at the cavity wall
// is capped by water depth; then 1/sqrt(r) cylindrical spreading. Speed is
// shallow-water c = sqrt(g h). Order-of-magnitude, not a full hydrocode.
export function tsunamiAtDistance(waterCrater, waterDepth, r) {
  validateDistance(r, true);
  if (!(waterCrater > 0) || !(waterDepth > 0)) return null;
  if (r <= waterCrater / 2) return { insideCavity: true, amplitude: null, arrival: null };
  const amp0 = Math.min(waterDepth, 0.14 * waterCrater);
  const amplitude = amp0 * Math.sqrt(waterCrater / (2 * r));
  const c = Math.sqrt(EARTH.g * waterDepth);
  return { amplitude, arrival: r / c, heuristic: true, coastalRunup: null };
}

// Everything an observer at distance r experiences, with arrival times.
export function observerReport(res, r) {
  validateDistance(r, true);
  if (res.regime === 'giant') return { giant: true };
  if (res.regime === 'airburst') {
    const E = res.blastEnergy;
    const p = peakOverpressure(E, r, res.burstAlt);
    // CM&M 2005's blast fit loses accuracy for high scaled burst altitudes
    // (Collins et al. 2017 revisits this) — flag rather than overstate.
    const unreliable = res.burstAlt / Math.cbrt(E / 4.184e12) > 550 || E > 1e4 * MT_TNT || r > 1e6;
    return {
      blast: { p, wind: peakWindSpeed(p), damage: blastDamage(p),
        arrival: Math.hypot(r, res.burstAlt) / 330, unreliable, arrivalApproximate: true },
      seismic: null, thermal: null, ejecta: null,
    };
  }
  const c = res.crater;
  const tsunami = res.tsunami ? tsunamiAtDistance(res.waterCrater, res.waterDepth, r) : null;
  if (res.waterCrater && r <= res.waterCrater / 2) return { insideWaterCavity: true, tsunami };
  if (c && r <= c.Dfr / 2) return { insideCrater: true };
  if (r < 1) return { unresolvedNearField: true };
  const thermal = thermalAtDistance(res.energySurf, r, res.vSurface);
  const insideFireball = thermal && !thermal.belowHorizon && r < thermal.Rf;
  const p = peakOverpressure(res.energySurf, r, 0);
  const report = {
    insideFireball,
    thermal,
    blast: {
      p, wind: peakWindSpeed(p), damage: blastDamage(p), arrival: r / 330,
      // The 1-kt blast fit overestimates 2-5x above ~1e4 Mt (paper caveat).
      unreliable: res.energySurf > 1e4 * MT_TNT || r > 1e6, arrivalApproximate: true,
    },
    seismic: res.seismic == null ? null : seismicAtDistance(res.seismic, r),
    // Solid-ground energy and its ungated fireball length scale set stifling.
    ejecta: c ? ejectaAtDistance(c.Dtc, c.Dfr / 2, res.energySeafloor / MT_TNT,
      0.002 * Math.cbrt(res.energySeafloor), r) : null,
    groundEffectsUnresolved: !c,
  };
  if (res.tsunami && res.waterCrater && res.waterDepth) {
    report.tsunami = tsunami;
  }
  return report;
}

// Display-only energy bands. These are NOT climate, casualty, or extinction predictions.
export function severityLadder(energyMt) {
  if (energyMt < 1e2) return { level: 0, label: 'Energy band · below 100 Mt' };
  if (energyMt < 1e4) return { level: 1, label: 'Energy band · 100–10,000 Mt' };
  if (energyMt < 1e5) return { level: 2, label: 'Energy band · 10⁴–10⁵ Mt' };
  if (energyMt < 1e6) return { level: 3, label: 'Energy band · 10⁵–10⁶ Mt' };
  if (energyMt < 1e8) return { level: 4, label: 'Energy band · 10⁶–10⁸ Mt' };
  return { level: 5, label: 'Energy band · above 10⁸ Mt' };
}

// ---------------------------------------------------------------------------
// Giant-impact regime (Leinhardt & Stewart 2012 + Genda et al. 2012).
// Angle convention: our angleDeg is from the horizontal, so the LS12 impact
// parameter is b = cos(angleDeg); b = sin(theta_LS) with theta_LS from the
// line of centers.
// ---------------------------------------------------------------------------
const C_STAR = 1.9;
const MU_BAR = 0.36;

export function giantResults(mp, rp, velocity, angleDeg) {
  const mt = EARTH.mass, rt = EARTH.radius;
  const Mtot = mp + mt;
  const gamma = mp / mt;
  const mu = (mp * mt) / Mtot;

  const vEsc = Math.sqrt((2 * G * Mtot) / (rt + rp));
  const vRatio = velocity / vEsc;

  const b = cosDeg(angleDeg);
  const bCrit = rt / (rt + rp);                                  // LS12 eq. 6
  const grazing = b > bCrit;

  // Merge/hit-and-run critical velocity (Genda et al. 2012).
  const g2 = ((mt - mp) / (mt + mp)) ** 2;
  const t52 = (1 - b) ** 2.5;
  const vCr = vEsc * (2.43 * g2 * t52 - 0.0408 * g2 + 1.86 * t52 + 1.08);

  const QR = (mu * velocity * velocity) / (2 * Mtot);

  // Q'*_RD: principal value + mass-ratio + oblique corrections (LS12 eqs. 28, 23, 15).
  const RC1 = Math.cbrt((3 * Mtot) / (4 * Math.PI * 1000));
  let QStar = C_STAR * 0.8 * Math.PI * 1000 * G * RC1 * RC1;
  QStar *= (((gamma + 1) ** 2) / (4 * gamma)) ** (2 / (3 * MU_BAR) - 1);
  const l = Math.min((rt + rp) * (1 - b), 2 * rp);
  const alpha = clamp((3 * rp * l * l - l ** 3) / (4 * rp ** 3), 0, 1);
  const muAlpha = (alpha * mp * mt) / (alpha * mp + mt);
  QStar *= (mu / muAlpha) ** (2 - 1.5 * MU_BAR);

  const ratio = QR / QStar;

  // Largest-remnant mass fraction (LS12 eqs. 5, 44).
  let mlrFrac = ratio < 1.8
    ? clamp(1 - 0.5 * ratio, 0, 1)
    : 0.1 * (ratio / 1.8) ** -1.5;

  const mtFrac = mt / Mtot;
  let outcome;
  if (vRatio <= 1) {
    outcome = 'perfect merge'; mlrFrac = 1;
  } else if (velocity < vCr) {
    outcome = grazing ? 'graze-and-merge' : 'accretion';
    mlrFrac = Math.max(mlrFrac, 0.99);
  } else if (grazing && mlrFrac >= 0.95 * mtFrac) {
    outcome = 'hit-and-run';
    mlrFrac = mtFrac;
  } else if (mlrFrac >= mtFrac) {
    outcome = 'partial accretion';
  } else if (mlrFrac >= 0.5) {
    outcome = 'erosion';
  } else if (mlrFrac >= 0.1) {
    outcome = 'catastrophic disruption';
  } else {
    outcome = 'super-catastrophic';
  }

  const merged = outcome === 'perfect merge' || outcome === 'accretion' ||
    outcome === 'graze-and-merge' || outcome === 'partial accretion' || outcome === 'erosion';

  // Uncalibrated debris-disk heuristic. Only merging geometries.
  let diskMass = 0;
  if (merged && outcome !== 'erosion') {
    // A heuristic disk cannot contain mass already assigned to the remnant.
    diskMass = clamp(0.45 * mp * b * b * Math.exp(-(vRatio - 1) / 0.6),
      0, Math.min(0.05 * Mtot, (1 - mlrFrac) * Mtot));
  }
  const diskMoons = diskMass / M_MOON;
  const moonForming = diskMoons >= 0.4;

  // Energy partitioning (heuristic; f_int = 0.5 of Q_R goes internal).
  const meltFraction = clamp((0.5 * QR) / 2.0e6, 0, 1);
  const magmaOcean = 0.5 * QR >= 1.0e6;

  // Spin from delivered angular momentum (merged cases).
  const Limp = mu * velocity * b * (rt + rp);
  const Mlr = mlrFrac * Mtot;
  const otherMass = Math.max(0, Mtot - Mlr - diskMass);
  let dayHours = null, synestia = false;
  if (merged) {
    const Lpost = 0.9 * Limp + EARTH.spinAngMom;
    const I = EARTH.momentFactor * Mlr * rt * rt;
    const Tmin = 1.7 * 2 * Math.PI * Math.sqrt(rt ** 3 / (G * Mlr)); // fluid stability floor
    dayHours = Math.max((2 * Math.PI * I) / Lpost, Tmin) / 3600;
    synestia = 0.5 * QR > 2.0e6 && Lpost > 1.5 * L_EM * (Mtot / EARTH.mass) ** (5 / 3);
  }

  return {
    vEsc, vRatio, vCr, b, bCrit, grazing, QR, QStar, ratio,
    mlrFrac, Mlr, outcome, merged, dayHours, magmaOcean, meltFraction,
    moonForming, diskMoons, diskMass, otherMass, synestia, gamma, alpha,
  };
}

// ---------------------------------------------------------------------------
// Top-level: everything the UI needs from one call.
// ---------------------------------------------------------------------------
export function computeImpact(input) {
  const inputs = validateInputs(input);
  const { diameter, density, velocity, angleDeg, target, waterDepth } = inputs;
  const mass = impactorMass(diameter, density);
  const energy0 = 0.5 * mass * velocity * velocity;
  const energyMt = energy0 / MT_TNT;
  const gamma = mass / EARTH.mass;
  const base = {
    ...inputs, inputs, mass, energy: energy0, energyMt, gamma,
    chicxulubs: energyMt / 1.0e8,
    recurrence: recurrenceYears(energyMt),
  };

  // Application regime bridge, independent of the selected terrain. Crater
  // scaling at planetary size is only a routing indicator, not a prediction.
  const routingCrater = craterResults(diameter, density, velocity, angleDeg);
  if (gamma > 0.01 || routingCrater.Dtc >= EARTH.radius) {
    return {
      ...base, regime: 'giant', recurrence: null,
      giant: giantResults(mass, diameter / 2, velocity, angleDeg),
      severity: { level: 5, label: 'Planet-altering giant impact' },
    };
  }

  const entry = simulateEntry({ L0: diameter, rhoI: density, v0: velocity, angleDeg });
  if (entry.outcome === 'airburst') {
    const residualEnergy = 0.5 * mass * entry.vBurst ** 2;
    return {
      ...base, regime: 'airburst',
      breakupAlt: entry.zBreakup, burstAlt: entry.zBurst,
      vBurst: entry.vBurst, residualEnergy, depositedEnergy: energy0 - residualEnergy,
      // Static-source approximation (Collins et al. 2017): use initial kinetic
      // energy as total yield. Residual swarm energy is NOT blast yield.
      blastEnergy: energy0,
      burstEnergyMt: residualEnergy / MT_TNT, // legacy alias: residual kinetic energy
      severity: severityLadder(energyMt),
    };
  }

  const vSurf = entry.vSurface;
  const eSurf = 0.5 * mass * vSurf ** 2;
  const tgt = TARGETS[target];
  let waterCrater = null, vFloor = vSurf;
  if (waterDepth > 0) {
    waterCrater = craterResults(diameter, density, vSurf, angleDeg, 1000, true).Dtc;
    // Eq. 65 uses the post-entry swarm diameter (L), not the initial L0.
    vFloor *= Math.exp((-3 * 1000 * 0.877 * waterDepth) /
      (2 * density * entry.dispersion * sinDeg(angleDeg)));
  }
  const energySeafloor = 0.5 * mass * vFloor ** 2;
  // Below 1 km/s, withhold hypervelocity ground effects. This is an application
  // validity gate, NOT a prediction that sediment disturbance or damage is zero.
  const groundEffectsSupported = vFloor >= 1000;
  const seafloorStopped = waterDepth > 0 && !groundEffectsSupported;
  const crater = groundEffectsSupported
    ? craterResults(diameter, density, vFloor, angleDeg, tgt.rho) : null;
  const fb = fireballRadius(eSurf, vSurf);
  return {
    ...base, regime: 'crater',
    vSurface: vSurf, energySurf: eSurf, vSeafloor: vFloor, energySeafloor,
    depositedEnergy: energy0 - eSurf, waterDepositedEnergy: eSurf - energySeafloor,
    dispersion: entry.dispersion,
    seismic: groundEffectsSupported ? seismicMagnitude(energySeafloor) : null,
    waterCrater, tsunami: waterDepth > 0 && waterCrater > waterDepth,
    seafloorStopped, groundEffectsSupported, crater,
    craterField: !!crater && entry.dispersion >= crater.Dtc,
    basin: !!crater && crater.Dtc > 0.25 * EARTH.radius,
    melt: crater ? meltVolume(energySeafloor, angleDeg, vFloor, crater.Vtc) : null,
    fireball: fb,
    fireballTimeMax: fb ? fb / vSurf : null,
    fireballDuration: fb
      ? (3e-3 * eSurf) / (2 * Math.PI * fb * fb * 5.67e-8 * 3000 ** 4)
      : null,
    burn: burnRadius(eSurf, eSurf / MT_TNT, vSurf),
    severity: severityLadder(eSurf / MT_TNT),
  };
}

// Reference events (CM&M validation set + giant-impact anchors).
export const PRESETS = [
  { name: 'Chelyabinsk', diameter: 20, comp: 'rock', velocity: 19000, angleDeg: 18, lat: 54.959, lon: 60.317 },
  { name: 'Tunguska', diameter: 55, comp: 'rock', velocity: 15000, angleDeg: 35, lat: 60.886, lon: 101.894 },
  { name: 'Barringer', diameter: 50, comp: 'iron', velocity: 17000, angleDeg: 45, lat: 35.027, lon: -111.023 },
  { name: 'Chicxulub', diameter: 12000, comp: 'rock', velocity: 20000, angleDeg: 60, lat: 21.3, lon: -89.5, target: 'shelf' },
  { name: 'Vredefort', diameter: 15000, comp: 'rock', velocity: 20000, angleDeg: 45, lat: -26.86, lon: 27.47 },
  { name: 'Ceres-size', diameter: 940000, comp: 'rock', velocity: 15000, angleDeg: 45 },
  { name: 'Moon-size', diameter: 3474000, comp: 'rock', velocity: 12000, angleDeg: 45 },
  // 7420 km at 3000 kg/m^3 = 6.42e23 kg = the canonical Theia (Mars) mass.
  { name: 'Theia (Moon-forming)', diameter: 7420000, comp: 'rock', velocity: 10000, angleDeg: 45 },
  { name: 'Hit-and-run', diameter: 6800000, comp: 'rock', velocity: 13000, angleDeg: 40 },
];
