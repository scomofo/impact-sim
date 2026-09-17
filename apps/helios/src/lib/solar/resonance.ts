import { BODIES, PLANETS, type BodyId } from "./bodies";
import { solveKepler, type Vec3 } from "./kepler";
import { auToVisual } from "./nbody";

const TWO_PI = Math.PI * 2;
const JUP_A = 5.203;

export type NamedResonance = {
  inner: BodyId;
  outer: BodyId;
  p: number;
  q: number;
  name: string;
  blurb: string;
};

export const NAMED_RESONANCES: NamedResonance[] = [
  {
    inner: "venus",
    outer: "earth",
    p: 13,
    q: 8,
    name: "13 : 8",
    blurb: "Eight Earth years, thirteen Venus years — they almost meet again in the same sky.",
  },
  {
    inner: "jupiter",
    outer: "saturn",
    p: 5,
    q: 2,
    name: "5 : 2",
    blurb: "The Great Inequality. Five Jovian years ≈ two Saturnian; conjunctions drift over ~59 yr.",
  },
  {
    inner: "uranus",
    outer: "neptune",
    p: 2,
    q: 1,
    name: "2 : 1",
    blurb: "Near 2:1, not locked. The ice giants still shove each other’s nodes and perihelia.",
  },
];

export type KirkwoodGap = {
  p: number;
  q: number;
  au: number;
  label: string;
};

/** Asteroid : Jupiter mean-motion. a = a_J · (q/p)^{2/3}. */
export const KIRKWOOD: KirkwoodGap[] = [
  { p: 4, q: 1, au: JUP_A * (1 / 4) ** (2 / 3), label: "4:1" },
  { p: 3, q: 1, au: JUP_A * (1 / 3) ** (2 / 3), label: "3:1" },
  { p: 5, q: 2, au: JUP_A * (2 / 5) ** (2 / 3), label: "5:2" },
  { p: 7, q: 3, au: JUP_A * (3 / 7) ** (2 / 3), label: "7:3" },
  { p: 2, q: 1, au: JUP_A * (1 / 2) ** (2 / 3), label: "2:1" },
];

function gapWidth(g: KirkwoodGap): number {
  return g.p === 3 || g.p === 2 ? 0.055 : 0.038;
}

export type Asteroid = {
  a: number;
  e: number;
  m0: number;
  inc: number;
};

function inGap(a: number): boolean {
  return KIRKWOOD.some((g) => Math.abs(a - g.au) < gapWidth(g));
}

function seed(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export const ASTEROIDS: Asteroid[] = (() => {
  const out: Asteroid[] = [];
  let i = 0;
  while (out.length < 420 && i < 4000) {
    const a = 2.06 + seed(i) * 1.28;
    i += 1;
    if (inGap(a)) continue;
    out.push({
      a,
      e: 0.02 + seed(i + 3) * 0.08,
      m0: seed(i + 7) * TWO_PI,
      inc: (seed(i + 11) - 0.5) * 0.12,
    });
  }
  return out;
})();

export function asteroidPos(ast: Asteroid, timeDays: number, out: Vec3): Vec3 {
  const tYears = ast.a ** 1.5;
  const M = ast.m0 + (TWO_PI * timeDays) / (tYears * 365.25);
  const E = solveKepler(M, ast.e);
  const xp = ast.a * (Math.cos(E) - ast.e);
  const yp = ast.a * Math.sqrt(Math.max(0, 1 - ast.e * ast.e)) * Math.sin(E);
  return auToVisual(xp, yp * ast.inc, yp, out);
}

export function plutoPos(timeDays: number, out: Vec3): Vec3 {
  const a = 39.48;
  const e = 0.2488;
  const T = 247.94 * 365.25;
  const M = TWO_PI * (timeDays / T);
  const E = solveKepler(M, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const i = 0.3;
  const w = 1.99;
  const xN = Math.cos(w) * xp - Math.sin(w) * yp;
  const yN = Math.sin(w) * xp + Math.cos(w) * yp;
  return auToVisual(xN, yN * Math.sin(i), yN * Math.cos(i), out);
}

export const GALILEAN = [
  { name: "Io", days: 1.769, r: 2.15, color: "#e8d59a" },
  { name: "Europa", days: 3.551, r: 3.25, color: "#c9d4e2" },
  { name: "Ganymede", days: 7.155, r: 4.55, color: "#b9a58a" },
] as const;

export function lonOf(x: number, z: number): number {
  return Math.atan2(z, x);
}

export function wrapPi(a: number): number {
  const t = (a + Math.PI) / TWO_PI;
  return (t - Math.floor(t)) * TWO_PI - Math.PI;
}

export function synodicYears(inner: number, outer: number): number {
  const d = Math.abs(1 / inner - 1 / outer);
  return d > 1e-9 ? 1 / d : Infinity;
}

export type ResonanceLive = {
  hits: {
    pair: NamedResonance;
    ratio: number;
    ideal: number;
    errorPct: number;
    synodic: number;
    ddeg: number;
    aligned: boolean;
  }[];
  kirkwood: KirkwoodGap[];
};

export function resonanceLive(
  id: BodyId,
  lons: Partial<Record<BodyId, number>>,
): ResonanceLive {
  const hits = NAMED_RESONANCES.filter((r) => id === "sun" || r.inner === id || r.outer === id).map(
    (pair) => {
      const inner = BODIES[pair.inner];
      const outer = BODIES[pair.outer];
      const ratio = outer.periodYears / inner.periodYears;
      const ideal = pair.p / pair.q;
      const li = lons[pair.inner];
      const lo = lons[pair.outer];
      const d = li === undefined || lo === undefined ? Math.PI : Math.abs(wrapPi(li - lo));
      return {
        pair,
        ratio,
        ideal,
        errorPct: (Math.abs(ratio - ideal) / ideal) * 100,
        synodic: synodicYears(inner.periodYears, outer.periodYears),
        ddeg: (d * 180) / Math.PI,
        aligned: d < 0.22,
      };
    },
  );
  return { hits, kirkwood: KIRKWOOD };
}

export function bestHitFor(id: BodyId): NamedResonance | undefined {
  return NAMED_RESONANCES.find((r) => r.inner === id || r.outer === id);
}
