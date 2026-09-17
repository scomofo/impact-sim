import type { Body } from "./bodies";

const TWO_PI = Math.PI * 2;

export type Vec3 = { x: number; y: number; z: number };

function wrapPi(angle: number): number {
  const t = (angle + Math.PI) / TWO_PI;
  return (t - Math.floor(t)) * TWO_PI - Math.PI;
}

/** Newton–Raphson solution of Kepler's equation M = E − e sin E. */
export function solveKepler(meanAnomaly: number, e: number): number {
  const M = wrapPi(meanAnomaly);
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
  for (let i = 0; i < 10; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-9) break;
  }
  return E;
}

export function meanMotion(body: Body): number {
  if (body.periodYears <= 0) return 0;
  return TWO_PI / (body.periodYears * 365.25);
}

export function eccentricAnomalyAt(body: Body, timeDays: number): number {
  const M = meanMotion(body) * timeDays + body.meanAnomaly0;
  return solveKepler(M, body.eccentricity);
}

/**
 * Perifocal (x along periapsis, y in the orbital plane) → three.js Y-up world.
 * Sun sits at the occupied focus (the origin).
 */
export function perifocalToWorld(body: Body, xp: number, yp: number, out: Vec3): Vec3 {
  const cosw = Math.cos(body.argPeriapsis);
  const sinw = Math.sin(body.argPeriapsis);
  const xN = cosw * xp - sinw * yp;
  const yN = sinw * xp + cosw * yp;
  const cosi = Math.cos(body.inclination);
  const sini = Math.sin(body.inclination);
  const cosO = Math.cos(body.longNode);
  const sinO = Math.sin(body.longNode);
  out.x = cosO * xN - sinO * yN * cosi;
  out.y = yN * sini;
  out.z = sinO * xN + cosO * yN * cosi;
  return out;
}

export function positionFromE(body: Body, E: number, out: Vec3): Vec3 {
  const a = body.orbitRadius;
  const e = body.eccentricity;
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E);
  return perifocalToWorld(body, xp, yp, out);
}

export function bodyPosition(body: Body, timeDays: number, out: Vec3): Vec3 {
  if (body.orbitRadius === 0) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }
  return positionFromE(body, eccentricAnomalyAt(body, timeDays), out);
}

export function orbitPoints(body: Body, segments = 180): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const tmp = { x: 0, y: 0, z: 0 };
  for (let i = 0; i <= segments; i++) {
    positionFromE(body, (i / segments) * TWO_PI, tmp);
    pts.push([tmp.x, tmp.y, tmp.z]);
  }
  return pts;
}

export function perihelionPosition(body: Body, out: Vec3): Vec3 {
  return positionFromE(body, 0, out);
}

export function aphelionPosition(body: Body, out: Vec3): Vec3 {
  return positionFromE(body, Math.PI, out);
}

/** Vacant focus, opposite the Sun through the ellipse centre. */
export function emptyFocusPosition(body: Body, out: Vec3): Vec3 {
  const a = body.orbitRadius;
  const e = body.eccentricity;
  return perifocalToWorld(body, -2 * a * e, 0, out);
}

export type KeplerLive = {
  radiusAu: number;
  perihelionAu: number;
  aphelionAu: number;
  eccentricity: number;
  speedRatio: number;
  thirdLaw: number;
  trueAnomalyDeg: number;
};

export function keplerLive(body: Body, timeDays: number): KeplerLive {
  const e = body.eccentricity;
  const a = body.au;
  const E = eccentricAnomalyAt(body, timeDays);
  const rNorm = 1 - e * Math.cos(E);
  const radiusAu = a * rNorm;
  const speedRatio = Math.sqrt(Math.max(0, 2 / rNorm - 1));
  const trueAnomaly = Math.atan2(Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E), Math.cos(E) - e);
  const thirdLaw = a > 0 && body.periodYears > 0 ? (body.periodYears * body.periodYears) / (a * a * a) : 1;
  return {
    radiusAu,
    perihelionAu: a * (1 - e),
    aphelionAu: a * (1 + e),
    eccentricity: e,
    speedRatio,
    thirdLaw,
    trueAnomalyDeg: ((trueAnomaly * 180) / Math.PI + 360) % 360,
  };
}
