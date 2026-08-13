// physics.js — pure impact physics, no rendering dependencies. SI units throughout
// unless a name says otherwise; theta = impact angle from the horizontal.
//
// Cratering + entry + thermal/seismic: Collins, Melosh & Marcus 2005 (Earth Impact
// Effects Program, M&PS 40, 817). Giant impacts: Leinhardt & Stewart 2012 (ApJ 745,
// 79) with the Genda, Kokubo & Ida 2012 merge criterion. Constants verified against
// the published papers (see scratchpad research notes).

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
  ocean: { label: 'Deep ocean (3.8 km)', rho: 2700, waterDepth: 3800 },
};

const sinDeg = (d) => Math.sin((d * Math.PI) / 180);
const cosDeg = (d) => Math.cos((d * Math.PI) / 180);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function impactorMass(diameter, density) {
  return density * (Math.PI / 6) * diameter ** 3;
}

// ---------------------------------------------------------------------------
// Atmospheric entry (CM&M section: breakup + pancake model). Applied only for
// L0 < 1 km; larger bodies punch through the atmosphere unaffected.
// Returns airburst-vs-surface outcome and the decelerated surface velocity.
// ---------------------------------------------------------------------------
const RHO_AIR0 = 1.0;  // kg/m^3 — deliberate EIEP simplification (not 1.225)
const SCALE_H = 8000;  // m
const CD = 2.0;
const PANCAKE_FP = 7;

export function simulateEntry({ L0, rhoI, v0, angleDeg }) {
  const sinT = sinDeg(angleDeg);
  if (L0 >= 1000) return { outcome: 'surface', vSurface: v0 };
  const rhoAir = (z) => RHO_AIR0 * Math.exp(-z / SCALE_H);
  const vIntact = (z) =>
    v0 * Math.exp((-3 * rhoAir(z) * CD * SCALE_H) / (4 * rhoI * L0 * sinT)); // Eq. 8
  const Yi = 10 ** (2.107 + 0.0624 * Math.sqrt(rhoI));                        // Eq. 9, Pa
  const If = (4.07 * CD * SCALE_H * Yi) / (rhoI * L0 * v0 * v0 * sinT);       // Eq. 12
  if (If >= 1) {
    const vTerm = Math.sqrt((4 * rhoI * L0 * EARTH.g) / (3 * CD * RHO_AIR0));
    return { outcome: 'surface', vSurface: Math.max(vIntact(0), vTerm) };
  }
  const zStar = -SCALE_H * (Math.log(Yi / (RHO_AIR0 * v0 * v0)) +
    1.308 - 0.314 * If - 1.303 * Math.sqrt(1 - If));                          // Eq. 11
  const vStar = vIntact(Math.max(zStar, 0));
  const l = L0 * sinT * Math.sqrt(rhoI / (CD * rhoAir(zStar)));               // Eq. 16
  const zBurst = zStar - 2 * SCALE_H *
    Math.log(1 + (l / (2 * SCALE_H)) * Math.sqrt(PANCAKE_FP ** 2 - 1));       // Eq. 18
  const Lz = (z) => L0 * Math.sqrt(1 +
    ((2 * SCALE_H / l) * (Math.exp((zStar - z) / (2 * SCALE_H)) - 1)) ** 2);  // Eq. 15
  const vPancake = (z) => { // Eq. 17 with a numerical integral
    const N = 64, dz = (zStar - z) / N;
    let I = 0;
    for (let i = 0; i <= N; i++) {
      I += (i === 0 || i === N ? 0.5 : 1) * rhoAir(z + i * dz) * Lz(z + i * dz) ** 2 * dz;
    }
    return vStar * Math.exp((-3 * CD * I) / (4 * rhoI * L0 ** 3 * sinT));
  };
  if (zBurst > 0) {
    return { outcome: 'airburst', zBreakup: zStar, zBurst, vBurst: vPancake(zBurst) };
  }
  return { outcome: 'surface', zBreakup: zStar, vSurface: vPancake(0) };
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
  const r = Math.sqrt((eta * E) / (2 * Math.PI * phiBurn));
  // No thermal exposure once the whole fireball sits below the horizon (Eq. 36-37).
  const Rf = 0.002 * Math.cbrt(E);
  const rHorizon = EARTH.radius * Math.acos(clamp(1 - Rf / EARTH.radius, -1, 1));
  return Math.min(r, rHorizon);
}

// ---------------------------------------------------------------------------
// Distance-based effects: what happens to an observer at great-circle distance
// r (m) from ground zero. All from CM&M 2005.
// ---------------------------------------------------------------------------

// Peak blast overpressure (Pa) at distance r, optional burst altitude (Eq. 54-58).
export function peakOverpressure(E, r, zBurst = 0) {
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
  [426000, 'cars thrown, girder bridges collapse'],
  [379000, 'steel-frame buildings near collapse'],
  [297000, 'truss bridges collapse'],
  [121000, 'multistory brick buildings collapse'],
  [42600, 'wood-frame houses collapse'],
  [6900, 'glass windows shatter'],
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
  if (exposure > 0.38e6 * scale) effects.push('grass and trees ignite');
  const duration = (eta * E) / (2 * Math.PI * Rf * Rf * 5.67e-8 * 3000 ** 4); // Eq. 35
  return { exposure, effects, duration, Rf, belowHorizon: false };
}

// Effective seismic magnitude at distance (Eq. 41) and Mercalli intensity (Table 2).
export function seismicAtDistance(M, r) {
  const rkm = r / 1000;
  let Meff;
  if (rkm < 60) Meff = M - 0.0238 * rkm;
  else if (rkm < 700) Meff = M - 0.0048 * rkm - 1.1644;
  else Meff = M - 1.66 * Math.log10(r / EARTH.radius) - 6.399;
  let mercalli;
  if (Meff < 2) mercalli = 'not felt';
  else if (Meff < 4) mercalli = 'II–IV · light shaking';
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
  if (energyMt < 200 && fireballR && r > fireballR) {
    return { thickness: 0, note: 'ejecta stifled by the atmosphere' };
  }
  const thickness = Dtc ** 4 / (112 * r ** 3);
  // Ejection velocity for this range (45° launch, Eq. 52) and flight time.
  const t = Math.tan(r / (2 * EARTH.radius));
  const ve = Math.sqrt((2 * EARTH.g * EARTH.radius * t) / (1 + t));
  let arrival;
  if (r < 2e6) {
    arrival = (Math.SQRT2 * ve) / EARTH.g;                      // flat-Earth limit
  } else {
    const x = (ve * ve) / (EARTH.g * EARTH.radius);
    const e2 = 0.5 * ((x - 1) ** 2 + 1), e = Math.sqrt(e2);
    const a = (ve * ve) / (2 * EARTH.g * (1 - e2));
    const mu = EARTH.g * EARTH.radius ** 2;
    const cosThL = clamp(((a * (1 - e2)) / EARTH.radius - 1) / e, -1, 1);
    const thL = Math.acos(cosThL);
    const EL = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(thL / 2));
    const tL = (EL - e * Math.sin(EL)) * Math.sqrt(a ** 3 / mu);
    arrival = 2 * Math.PI * Math.sqrt(a ** 3 / mu) - 2 * tL;
  }
  if (arrival > 3600) return { thickness: 0, note: 'only fine condensed-vapor fallout' };
  return { thickness, arrival, ve };
}

// Everything an observer at distance r experiences, with arrival times.
export function observerReport(res, r) {
  if (res.regime === 'giant') return { giant: true };
  if (res.regime === 'airburst') {
    const E = res.burstEnergyMt * MT_TNT;
    const p = peakOverpressure(E, r, res.burstAlt);
    // CM&M 2005's blast fit loses accuracy for high scaled burst altitudes
    // (Collins et al. 2017 revisits this) — flag rather than overstate.
    const unreliable = res.burstAlt / Math.cbrt(E / 4.184e12) > 550;
    return {
      blast: { p, wind: peakWindSpeed(p), damage: blastDamage(p), arrival: r / 330, unreliable },
      seismic: null, thermal: null, ejecta: null,
    };
  }
  const c = res.crater;
  if (r <= c.Dfr / 2) return { insideCrater: true };
  const thermal = thermalAtDistance(res.energySurf, r, res.vSurface);
  const insideFireball = thermal && !thermal.belowHorizon && r < thermal.Rf;
  const p = peakOverpressure(res.energySurf, r, 0);
  return {
    insideFireball,
    thermal,
    blast: { p, wind: peakWindSpeed(p), damage: blastDamage(p), arrival: r / 330 },
    seismic: seismicAtDistance(res.seismic, r),
    ejecta: ejectaAtDistance(c.Dtc, c.Dfr / 2, res.energyMt, thermal?.Rf, r),
  };
}

// Severity bands per Chapman & Morrison 1994 / Toon et al. 1997 (Mt TNT).
export function severityLadder(energyMt) {
  if (energyMt < 1e2) return { level: 0, label: 'Local damage' };
  if (energyMt < 1e4) return { level: 1, label: 'Regional devastation' };
  if (energyMt < 1e5) return { level: 2, label: 'Continental catastrophe' };
  if (energyMt < 1e6) return { level: 3, label: 'Global climate catastrophe' };
  if (energyMt < 1e8) return { level: 4, label: 'Civilization-ending' };
  if (energyMt < 3e10) return { level: 5, label: 'Mass extinction — Chicxulub class and beyond' };
  return { level: 5, label: 'Oceans boil — surface sterilized' };
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

  // Debris disk heuristic (Canup SPH anchor; ± factor ~3). Only merging geometries.
  let diskMass = 0;
  if (merged && outcome !== 'erosion') {
    diskMass = clamp(0.45 * mp * b * b * Math.exp(-(vRatio - 1) / 0.6), 0, 0.05 * Mtot);
  }
  const diskMoons = diskMass / M_MOON;
  const moonForming = diskMoons >= 0.4;

  // Energy partitioning (heuristic; f_int = 0.5 of Q_R goes internal).
  const meltFraction = clamp((0.5 * QR) / 2.0e6, 0, 1);
  const magmaOcean = 0.5 * QR >= 1.0e6;

  // Spin from delivered angular momentum (merged cases).
  const Limp = mu * velocity * b * (rt + rp);
  const Mlr = mlrFrac * Mtot;
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
    moonForming, diskMoons, synestia, gamma, alpha,
  };
}

// ---------------------------------------------------------------------------
// Top-level: everything the UI needs from one call.
// ---------------------------------------------------------------------------
export function computeImpact({ diameter, density, velocity, angleDeg, target = 'sedimentary' }) {
  const mass = impactorMass(diameter, density);
  const energy0 = 0.5 * mass * velocity * velocity;   // top-of-atmosphere
  const energyMt = energy0 / MT_TNT;
  const gamma = mass / EARTH.mass;

  const base = {
    diameter, density, velocity, angleDeg, mass,
    energy: energy0, energyMt, gamma,
    chicxulubs: energyMt / 1.0e8,
    recurrence: recurrenceYears(energyMt),
  };

  const entry = simulateEntry({ L0: diameter, rhoI: density, v0: velocity, angleDeg });
  if (entry.outcome === 'airburst') {
    const burstEnergy = 0.5 * mass * entry.vBurst * entry.vBurst;
    return {
      ...base, regime: 'airburst',
      breakupAlt: entry.zBreakup, burstAlt: entry.zBurst,
      burstEnergyMt: burstEnergy / MT_TNT,
      severity: severityLadder(energyMt),
    };
  }

  const vSurf = entry.vSurface;
  const eSurf = 0.5 * mass * vSurf * vSurf;
  const tgt = TARGETS[target] ?? TARGETS.sedimentary;

  // Ocean target: crater the water column first, decay velocity through the
  // water (Eq. 65, C_D = 0.877), then crater the seafloor with what is left.
  let waterCrater = null, tsunami = false, vFloor = vSurf;
  if (tgt.waterDepth) {
    waterCrater = craterResults(diameter, density, vSurf, angleDeg, 1000, true).Dtc;
    vFloor = vSurf * Math.exp(
      (-3 * 1000 * 0.877 * tgt.waterDepth) / (2 * density * diameter * sinDeg(angleDeg)));
    tsunami = waterCrater > tgt.waterDepth;
  }
  const seafloorStopped = tgt.waterDepth && vFloor < 1000;
  const crater = craterResults(diameter, density, tgt.waterDepth ? vFloor : vSurf, angleDeg, tgt.rho);

  // Regime bridge: smoothstep on transient-crater size vs planet radius; mass
  // ratio > 1e-2 is always global (LS12 similar-size regime).
  const x = clamp((crater.Dtc / EARTH.radius - 0.5) / 1.0, 0, 1);
  const globalWeight = x * x * (3 - 2 * x);

  if (gamma > 0.01 || globalWeight >= 0.5) {
    return {
      ...base, regime: 'giant',
      giant: giantResults(mass, diameter / 2, velocity, angleDeg),
      severity: { level: 5, label: 'Planet-altering giant impact' },
    };
  }

  const fb = fireballRadius(eSurf, vSurf);
  return {
    ...base, regime: 'crater',
    vSurface: vSurf, energySurf: eSurf,
    seismic: seismicMagnitude(eSurf),   // shaking couples to the surface energy
    target, waterDepth: tgt.waterDepth ?? 0, waterCrater, tsunami, seafloorStopped,
    crater,
    basin: crater.Dtc > 0.25 * EARTH.radius, // crater scaling stretched — basin event
    melt: meltVolume(eSurf, angleDeg, vSurf, crater.Vtc),
    fireball: fb,
    fireballTimeMax: fb ? fb / vSurf : null,                          // Eq. 33
    fireballDuration: fb
      ? (3e-3 * eSurf) / (2 * Math.PI * fb * fb * 5.67e-8 * 3000 ** 4) // Eq. 35
      : null,
    burn: burnRadius(eSurf, eSurf / MT_TNT, vSurf),
    severity: severityLadder(energyMt),
  };
}

// Reference events (CM&M validation set + giant-impact anchors).
export const PRESETS = [
  { name: 'Chelyabinsk', diameter: 20, comp: 'rock', velocity: 19000, angleDeg: 18 },
  { name: 'Tunguska', diameter: 55, comp: 'rock', velocity: 15000, angleDeg: 35 },
  { name: 'Barringer', diameter: 50, comp: 'iron', velocity: 17000, angleDeg: 45 },
  { name: 'Chicxulub', diameter: 12000, comp: 'rock', velocity: 20000, angleDeg: 60 },
  { name: 'Vredefort', diameter: 15000, comp: 'rock', velocity: 20000, angleDeg: 45 },
  { name: 'Ceres-size', diameter: 940000, comp: 'rock', velocity: 15000, angleDeg: 45 },
  { name: 'Moon-size', diameter: 3474000, comp: 'rock', velocity: 12000, angleDeg: 45 },
  // 7420 km at 3000 kg/m^3 = 6.42e23 kg = the canonical Theia (Mars) mass.
  { name: 'Theia (Moon-forming)', diameter: 7420000, comp: 'rock', velocity: 10000, angleDeg: 45 },
  { name: 'Hit-and-run', diameter: 6800000, comp: 'rock', velocity: 13000, angleDeg: 40 },
];
