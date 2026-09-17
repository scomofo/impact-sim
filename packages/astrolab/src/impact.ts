/**
 * Impact-scaling relations (Collins, Melosh & Marcus 2005; Holsapple 1993)
 * exposed in the same units as the rest of the toolbox so they can be used
 * from MATLAB-style scripts. The interactive assessment in `apps/impact` has
 * its own validated implementation; these are the compact analytical forms.
 */

export const EARTH_G = 9.80665;
export const TNT_J = 4.184e12; // joules per kiloton of TNT

export interface ImpactorInput {
  /** Diameter, m. */
  diameter: number;
  /** Bulk density, kg/m³. */
  density: number;
  /** Impact speed at the surface, m/s. */
  speed: number;
  /** Trajectory angle above horizontal, radians. */
  angle: number;
  /** Target density, kg/m³ (2500 sedimentary rock, 2750 crystalline, 1000 water). */
  targetDensity?: number;
  /** Surface gravity, m/s². */
  gravity?: number;
}

export interface ImpactResult {
  mass: number;
  energy: number;
  energyKt: number;
  energyMt: number;
  /** Transient crater diameter, m. */
  transientDiameter: number;
  /** Final rim-to-rim crater diameter, m (simple-to-complex transition applied). */
  finalDiameter: number;
  transientDepth: number;
  complex: boolean;
  /** Seismic moment magnitude from the Collins et al. energy relation. */
  magnitude: number;
  /** Recurrence interval in years from the Collins et al. flux fit. */
  recurrenceYears: number;
}

export function impactorMass(diameter: number, density: number): number {
  return (Math.PI / 6) * density * diameter ** 3;
}

/** Collins et al. (2005) π-scaling transient crater diameter. */
export function transientCraterDiameter(inp: ImpactorInput): number {
  const rhoT = inp.targetDensity ?? 2500;
  const g = inp.gravity ?? EARTH_G;
  return (
    1.161 *
    Math.pow(inp.density / rhoT, 1 / 3) *
    Math.pow(inp.diameter, 0.78) *
    Math.pow(inp.speed, 0.44) *
    Math.pow(g, -0.22) *
    Math.pow(Math.sin(inp.angle), 1 / 3)
  );
}

export function impact(inp: ImpactorInput): ImpactResult {
  const mass = impactorMass(inp.diameter, inp.density);
  const energy = 0.5 * mass * inp.speed ** 2;
  const g = inp.gravity ?? EARTH_G;
  const Dtc = transientCraterDiameter(inp);
  // Simple-to-complex transition scales inversely with gravity (3.2 km on Earth).
  const Dc = 3200 * (EARTH_G / g);
  const Dsimple = 1.25 * Dtc;
  const complex = Dsimple > Dc;
  const finalDiameter = complex ? (1.17 * Math.pow(Dtc, 1.13)) / Math.pow(Dc, 0.13) : Dsimple;
  const magnitude = 0.67 * Math.log10(energy) - 5.87;
  const energyMt = energy / (TNT_J * 1000);
  const recurrenceYears = 109 * Math.pow(energyMt, 0.78);
  return {
    mass,
    energy,
    energyKt: energy / TNT_J,
    energyMt,
    transientDiameter: Dtc,
    finalDiameter,
    transientDepth: Dtc / (2 * Math.SQRT2),
    complex,
    magnitude,
    recurrenceYears,
  };
}

/** Peak overpressure (Pa) at distance r (m) for yield E (J), Collins et al. eq. 54–55. */
export function airblastOverpressure(energy: number, r: number, burstAltitude = 0): number {
  const kt = energy / TNT_J;
  const scale = Math.cbrt(kt);
  const r1 = r / scale;
  const z = burstAltitude / scale;
  if (z <= 0) {
    const px = 75000;
    const rx = 290;
    return (px * rx) / (4 * r1) * (1 + 3 * Math.pow(rx / r1, 1.3));
  }
  // Airburst: Collins et al. eq. 55 with regular-reflection/Mach-stem crossover.
  const rm = 550 * z / (1.2 * (550 - z));
  const p0 = 3.14e11 * Math.pow(z, -2.6);
  const p1 = 1.8e7 * Math.pow(z, -1.13);
  if (r1 < rm) return p0 * Math.exp(-3.4e-4 * r1) + p1 * Math.exp(-1.8e-4 * r1);
  return 3.14e11 * Math.pow(Math.hypot(z, r1), -2.6) + 1.8e7 * Math.pow(Math.hypot(z, r1), -1.13);
}

/** Thermal exposure (J/m²) at distance r for a luminous-efficiency η fireball. */
export function thermalExposure(energy: number, r: number, luminousEfficiency = 3e-3): number {
  return (luminousEfficiency * energy) / (2 * Math.PI * r * r);
}

/** Fireball radius (m), Collins et al. eq. 28. */
export const fireballRadius = (energy: number): number => 0.002 * Math.pow(energy, 1 / 3);
