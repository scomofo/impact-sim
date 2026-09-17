import { PLANETS, type Body, type BodyId } from "./bodies";
import { eccentricAnomalyAt, perifocalToWorld, type Vec3 } from "./kepler";

/** Gaussian gravitational constant squared: AU³ / day². */
export const MU_SUN = 0.0002959122082855911;
const C_AU_DAY = 173.14463267424;

export const MASS_EARTH: Record<Exclude<BodyId, "sun">, number> = {
  mercury: 0.0553,
  venus: 0.815,
  earth: 1,
  mars: 0.107,
  jupiter: 317.83,
  saturn: 95.16,
  uranus: 14.54,
  neptune: 17.15,
};

const SUN_EARTH_MASSES = 332946;

const AU_VIS: [number, number][] = [
  [0, 0],
  [0.387, 11.6],
  [0.723, 16.2],
  [1, 21.6],
  [1.524, 28.6],
  [5.203, 44.2],
  [9.537, 58.4],
  [19.191, 72.2],
  [30.07, 86.4],
];

export function auToVisualRadius(au: number): number {
  if (au <= 0) return 0;
  for (let i = 1; i < AU_VIS.length; i++) {
    const [a0, vis0] = AU_VIS[i - 1]!;
    const [a1, vis1] = AU_VIS[i]!;
    if (au <= a1) {
      const t = (au - a0) / Math.max(1e-9, a1 - a0);
      return vis0 + t * (vis1 - vis0);
    }
  }
  const [aN, visN] = AU_VIS[AU_VIS.length - 1]!;
  return visN * (au / aN);
}

export function auToVisual(px: number, py: number, pz: number, out: Vec3): Vec3 {
  const r = Math.hypot(px, py, pz);
  if (r < 1e-12) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }
  const s = auToVisualRadius(r) / r;
  out.x = px * s;
  out.y = py * s;
  out.z = pz * s;
  return out;
}

type BodyState = {
  id: Exclude<BodyId, "sun">;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ax: number;
  ay: number;
  az: number;
  mu: number;
};

const ids = PLANETS.map((b) => b.id as Exclude<BodyId, "sun">);

function velocityFromE(body: Body, E: number, out: Vec3): Vec3 {
  const a = body.au;
  const e = body.eccentricity;
  const n = Math.sqrt(MU_SUN / (a * a * a));
  const den = 1 - e * Math.cos(E);
  const vxp = (-a * n * Math.sin(E)) / den;
  const vyp = (a * n * Math.sqrt(Math.max(0, 1 - e * e)) * Math.cos(E)) / den;
  return perifocalToWorld(body, vxp, vyp, out);
}

function positionAu(body: Body, E: number, out: Vec3): Vec3 {
  const a = body.au;
  const e = body.eccentricity;
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E);
  return perifocalToWorld(body, xp, yp, out);
}

function makeState(): BodyState[] {
  return ids.map((id) => ({
    id,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    ax: 0,
    ay: 0,
    az: 0,
    mu: 0,
  }));
}

const _p: Vec3 = { x: 0, y: 0, z: 0 };
const _v: Vec3 = { x: 0, y: 0, z: 0 };
const TRAIL_N = 140;

export const nbody = {
  bodies: makeState(),
  boost: 70,
  grGain: 6e4,
  ready: false,
  trails: {} as Record<string, number[]>,
  trailAt: {} as Record<string, number>,
  lastX: {} as Record<string, number>,
  lastY: {} as Record<string, number>,
  lastZ: {} as Record<string, number>,

  reset(timeDays: number) {
    const scratchP = _p;
    const scratchV = _v;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i]!;
      const def = PLANETS.find((p) => p.id === b.id)!;
      const E = eccentricAnomalyAt(def, timeDays);
      positionAu(def, E, scratchP);
      velocityFromE(def, E, scratchV);
      b.x = scratchP.x;
      b.y = scratchP.y;
      b.z = scratchP.z;
      b.vx = scratchV.x;
      b.vy = scratchV.y;
      b.vz = scratchV.z;
      b.mu = (MASS_EARTH[b.id] / SUN_EARTH_MASSES) * MU_SUN;
      this.trails[b.id] = new Array(TRAIL_N * 3).fill(0);
      this.trailAt[b.id] = 0;
      this.lastX[b.id] = NaN;
      this.lastY[b.id] = NaN;
      this.lastZ[b.id] = NaN;
    }
    this.forces(this.boost);
    this.ready = true;
  },

  forces(boost: number) {
    const bs = this.bodies;
    const n = bs.length;
    const gr = this.grGain;
    for (let i = 0; i < n; i++) {
      const b = bs[i]!;
      const r2 = b.x * b.x + b.y * b.y + b.z * b.z;
      const r = Math.sqrt(r2);
      const r3 = r2 * r + 1e-18;
      let ax = (-MU_SUN * b.x) / r3;
      let ay = (-MU_SUN * b.y) / r3;
      let az = (-MU_SUN * b.z) / r3;
      if (b.id === "mercury") {
        const extra = (3 * MU_SUN * MU_SUN * gr) / (C_AU_DAY * C_AU_DAY * r2 * r2);
        ax += (extra * b.x) / r;
        ay += (extra * b.y) / r;
        az += (extra * b.z) / r;
      }
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const o = bs[j]!;
        const dx = b.x - o.x;
        const dy = b.y - o.y;
        const dz = b.z - o.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const d = Math.sqrt(d2);
        const d3 = d2 * d + 1e-18;
        const m = o.mu * boost;
        ax -= (m * dx) / d3;
        ay -= (m * dy) / d3;
        az -= (m * dz) / d3;
      }
      b.ax = ax;
      b.ay = ay;
      b.az = az;
    }
  },

  verlet(h: number, boost: number) {
    const bs = this.bodies;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i]!;
      b.x += b.vx * h + 0.5 * b.ax * h * h;
      b.y += b.vy * h + 0.5 * b.ay * h * h;
      b.z += b.vz * h + 0.5 * b.az * h * h;
      b.vx += 0.5 * b.ax * h;
      b.vy += 0.5 * b.ay * h;
      b.vz += 0.5 * b.az * h;
    }
    this.forces(boost);
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i]!;
      b.vx += 0.5 * b.ax * h;
      b.vy += 0.5 * b.ay * h;
      b.vz += 0.5 * b.az * h;
    }
  },

  step(dtDays: number, boost: number) {
    if (!this.ready) this.reset(0);
    this.boost = boost;
    let left = dtDays;
    while (left > 1e-8) {
      const h = Math.min(0.11, left);
      this.verlet(h, boost);
      left -= h;
    }
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i]!;
      auToVisual(b.x, b.y, b.z, _p);
      const lx = this.lastX[b.id];
      if (
        Number.isFinite(lx) &&
        Math.hypot(_p.x - lx, _p.y - (this.lastY[b.id] ?? 0), _p.z - (this.lastZ[b.id] ?? 0)) < 0.7
      ) {
        continue;
      }
      this.lastX[b.id] = _p.x;
      this.lastY[b.id] = _p.y;
      this.lastZ[b.id] = _p.z;
      const trail = this.trails[b.id]!;
      const at = this.trailAt[b.id]!;
      trail[at] = _p.x;
      trail[at + 1] = _p.y;
      trail[at + 2] = _p.z;
      this.trailAt[b.id] = (at + 3) % trail.length;
    }
  },

  visualPos(id: BodyId, out: Vec3): Vec3 {
    if (id === "sun") {
      out.x = 0;
      out.y = 0;
      out.z = 0;
      return out;
    }
    const b = this.bodies.find((s) => s.id === id);
    if (!b) {
      out.x = 0;
      out.y = 0;
      out.z = 0;
      return out;
    }
    return auToVisual(b.x, b.y, b.z, out);
  },

  trail(id: BodyId): number[] {
    return this.trails[id] ?? [];
  },

  trailHead(id: BodyId): number {
    return this.trailAt[id] ?? 0;
  },
};

export type PerturbLive = {
  radiusAu: number;
  keplerAu: number;
  deltaAu: number;
  tug: string;
  boost: number;
};

export function perturbLive(id: BodyId, keplerAu: number): PerturbLive | null {
  if (id === "sun") return null;
  const b = nbody.bodies.find((s) => s.id === id);
  if (!b) return null;
  const radiusAu = Math.hypot(b.x, b.y, b.z);
  let best = "Jupiter";
  let bestA = 0;
  for (const o of nbody.bodies) {
    if (o.id === id) continue;
    const dx = b.x - o.x;
    const dy = b.y - o.y;
    const dz = b.z - o.z;
    const d3 = Math.pow(dx * dx + dy * dy + dz * dz, 1.5) + 1e-18;
    const a = (o.mu * nbody.boost) / d3;
    if (a > bestA) {
      bestA = a;
      best = PLANETS.find((p) => p.id === o.id)?.name ?? o.id;
    }
  }
  return {
    radiusAu,
    keplerAu,
    deltaAu: radiusAu - keplerAu,
    tug: best,
    boost: nbody.boost,
  };
}
