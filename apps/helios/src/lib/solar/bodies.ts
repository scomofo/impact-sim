import {
  aphelionPosition,
  bodyPosition as keplerBodyPosition,
  emptyFocusPosition,
  orbitPoints as keplerOrbitPoints,
  perihelionPosition,
  type Vec3,
} from "./kepler";

export const SCENE_BG = "#06070b";

export type BodyId =
  | "sun"
  | "mercury"
  | "venus"
  | "earth"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune";

export type BodyKind = "star" | "terrestrial" | "gas-giant" | "ice-giant";

export interface MoonDef {
  name: string;
  radius: number;
  orbitRadius: number;
  periodDays: number;
  color: string;
}

export interface RingDef {
  inner: number;
  outer: number;
}

export interface Body {
  id: BodyId;
  name: string;
  kind: BodyKind;
  radius: number;
  orbitRadius: number;
  periodYears: number;
  eccentricity: number;
  inclination: number;
  longNode: number;
  argPeriapsis: number;
  meanAnomaly0: number;
  tilt: number;
  dayHours: number;
  color: string;
  atmosphere?: string;
  clouds?: boolean;
  rings?: RingDef;
  moons?: MoonDef[];
  focusDistance: number;
  au: number;
  diameterKm: number;
  gravity: string;
  moonsCount: number;
  yearLabel: string;
  dayLabel: string;
  summary: string;
}

const DEG = Math.PI / 180;

export const BODY_ORDER: BodyId[] = [
  "sun",
  "mercury",
  "venus",
  "earth",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
];

export const BODIES: Record<BodyId, Body> = {
  sun: {
    id: "sun",
    name: "Sun",
    kind: "star",
    radius: 4.6,
    orbitRadius: 0,
    periodYears: 0,
    eccentricity: 0,
    inclination: 0,
    longNode: 0,
    argPeriapsis: 0,
    meanAnomaly0: 0,
    tilt: 7.25 * DEG,
    dayHours: 609.12,
    color: "#f3c15b",
    focusDistance: 98,
    au: 0,
    diameterKm: 1_392_700,
    gravity: "28 g",
    moonsCount: 0,
    yearLabel: "—",
    dayLabel: "25.4 d",
    summary:
      "The occupied focus of every Keplerian ellipse here. From this point each planet sweeps equal area in equal time, and P² scales with a³.",
  },
  mercury: {
    id: "mercury",
    name: "Mercury",
    kind: "terrestrial",
    radius: 0.85,
    orbitRadius: 11.6,
    periodYears: 0.241,
    eccentricity: 0.2056,
    inclination: 7.0 * DEG,
    longNode: 48.33 * DEG,
    argPeriapsis: 29.12 * DEG,
    meanAnomaly0: 174.8 * DEG,
    tilt: 0.03 * DEG,
    dayHours: 1407.6,
    color: "#9a9086",
    focusDistance: 5.2,
    au: 0.387,
    diameterKm: 4879,
    gravity: "0.38 g",
    moonsCount: 0,
    yearLabel: "88.0 d",
    dayLabel: "58.6 d",
    summary:
      "The textbook Keplerian. Eccentricity 0.206 pulls perihelion in so far that the planet more than doubles its speed between aphelion and perihelion.",
  },
  venus: {
    id: "venus",
    name: "Venus",
    kind: "terrestrial",
    radius: 1.02,
    orbitRadius: 16.2,
    periodYears: 0.615,
    eccentricity: 0.0068,
    inclination: 3.39 * DEG,
    longNode: 76.68 * DEG,
    argPeriapsis: 54.89 * DEG,
    meanAnomaly0: 50.42 * DEG,
    tilt: 2.6 * DEG,
    dayHours: -5832.5,
    color: "#d9c3a1",
    atmosphere: "#e8d7b0",
    focusDistance: 5.2,
    au: 0.723,
    diameterKm: 12_104,
    gravity: "0.91 g",
    moonsCount: 0,
    yearLabel: "225 d",
    dayLabel: "243 d ↩",
    summary:
      "Earth’s veiled twin, and the roundest orbit in the system — eccentricity 0.007, a near-perfect circle with the Sun still at a focus.",
  },
  earth: {
    id: "earth",
    name: "Earth",
    kind: "terrestrial",
    radius: 1.08,
    orbitRadius: 21.6,
    periodYears: 1,
    eccentricity: 0.0167,
    inclination: 0,
    longNode: 0,
    argPeriapsis: 102.94 * DEG,
    meanAnomaly0: -2.48 * DEG,
    tilt: 23.44 * DEG,
    dayHours: 23.93,
    color: "#3f7ec4",
    atmosphere: "#7eb6ff",
    clouds: true,
    moons: [
      {
        name: "Moon",
        radius: 0.21,
        orbitRadius: 2.35,
        periodDays: 27.3,
        color: "#c5c1b8",
      },
    ],
    focusDistance: 6.2,
    au: 1,
    diameterKm: 12_742,
    gravity: "1.00 g",
    moonsCount: 1,
    yearLabel: "365.25 d",
    dayLabel: "23h 56m",
    summary:
      "The measuring stick of Kepler’s third law: one year, one astronomical unit. A slight 0.017 eccentricity writes the 3% perihelion–aphelion swing.",
  },
  mars: {
    id: "mars",
    name: "Mars",
    kind: "terrestrial",
    radius: 0.82,
    orbitRadius: 28.6,
    periodYears: 1.881,
    eccentricity: 0.0934,
    inclination: 1.85 * DEG,
    longNode: 49.56 * DEG,
    argPeriapsis: 286.5 * DEG,
    meanAnomaly0: 19.39 * DEG,
    tilt: 25.19 * DEG,
    dayHours: 24.62,
    color: "#c16a4a",
    atmosphere: "#e0a080",
    focusDistance: 4.5,
    au: 1.524,
    diameterKm: 6779,
    gravity: "0.38 g",
    moonsCount: 2,
    yearLabel: "687 d",
    dayLabel: "24h 37m",
    summary:
      "The orbit Kepler actually solved. Eccentricity 0.093 is enough that equal-area wedges fatten visibly at perihelion — the second law, in motion.",
  },
  jupiter: {
    id: "jupiter",
    name: "Jupiter",
    kind: "gas-giant",
    radius: 2.7,
    orbitRadius: 44.2,
    periodYears: 11.86,
    eccentricity: 0.0489,
    inclination: 1.3 * DEG,
    longNode: 100.46 * DEG,
    argPeriapsis: 273.87 * DEG,
    meanAnomaly0: 20.07 * DEG,
    tilt: 3.13 * DEG,
    dayHours: 9.93,
    color: "#d0a36a",
    atmosphere: "#e8c48a",
    focusDistance: 13.5,
    au: 5.203,
    diameterKm: 139_820,
    gravity: "2.53 g",
    moonsCount: 95,
    yearLabel: "11.86 yr",
    dayLabel: "9h 56m",
    summary:
      "a = 5.2 AU, P = 11.86 yr. Cube the axis, square the period — Kepler III holds to three figures, even this far from the Sun.",
  },
  saturn: {
    id: "saturn",
    name: "Saturn",
    kind: "gas-giant",
    radius: 2.25,
    orbitRadius: 58.4,
    periodYears: 29.46,
    eccentricity: 0.0565,
    inclination: 2.49 * DEG,
    longNode: 113.67 * DEG,
    argPeriapsis: 339.39 * DEG,
    meanAnomaly0: -43.12 * DEG,
    tilt: 26.73 * DEG,
    dayHours: 10.7,
    color: "#e0c48a",
    atmosphere: "#ead8a8",
    rings: { inner: 2.7, outer: 4.6 },
    focusDistance: 16.5,
    au: 9.537,
    diameterKm: 116_460,
    gravity: "1.06 g",
    moonsCount: 146,
    yearLabel: "29.5 yr",
    dayLabel: "10h 42m",
    summary:
      "Nearly thirty years to close an ellipse of 9.5 AU. P² / a³ still sits on unity, the same constant that sets Mercury’s 88-day year.",
  },
  uranus: {
    id: "uranus",
    name: "Uranus",
    kind: "ice-giant",
    radius: 1.48,
    orbitRadius: 72.2,
    periodYears: 84.01,
    eccentricity: 0.0472,
    inclination: 0.77 * DEG,
    longNode: 74.01 * DEG,
    argPeriapsis: 96.99 * DEG,
    meanAnomaly0: 142.27 * DEG,
    tilt: 97.77 * DEG,
    dayHours: -17.24,
    color: "#9bd3d8",
    atmosphere: "#c5f0f2",
    rings: { inner: 1.7, outer: 2.35 },
    focusDistance: 8.6,
    au: 19.191,
    diameterKm: 50_724,
    gravity: "0.89 g",
    moonsCount: 28,
    yearLabel: "84.0 yr",
    dayLabel: "17h 14m ↩",
    summary:
      "Eighty-four years around a 19 AU ellipse. The third law is scale-free: the same P² ∝ a³ that times the inner worlds times this ice giant.",
  },
  neptune: {
    id: "neptune",
    name: "Neptune",
    kind: "ice-giant",
    radius: 1.42,
    orbitRadius: 86.4,
    periodYears: 164.8,
    eccentricity: 0.0086,
    inclination: 1.77 * DEG,
    longNode: 131.78 * DEG,
    argPeriapsis: 273.19 * DEG,
    meanAnomaly0: 259.91 * DEG,
    tilt: 28.32 * DEG,
    dayHours: 16.11,
    color: "#3c6fd0",
    atmosphere: "#6f97ea",
    focusDistance: 8.4,
    au: 30.07,
    diameterKm: 49_244,
    gravity: "1.14 g",
    moonsCount: 16,
    yearLabel: "165 yr",
    dayLabel: "16h 07m",
    summary:
      "The last planet, on a nearly circular 30 AU path. Kepler III still closes: a century and a half is exactly what a³ demands of 30 AU.",
  },
};

export const PLANETS: Body[] = BODY_ORDER.filter((id) => id !== "sun").map((id) => BODIES[id]);

export function getBody(id: BodyId): Body {
  return BODIES[id];
}

export function kindLabel(kind: BodyKind): string {
  if (kind === "star") return "G2V star";
  if (kind === "terrestrial") return "Terrestrial planet";
  if (kind === "gas-giant") return "Gas giant";
  return "Ice giant";
}

export function spinRate(body: Body): number {
  if (body.id === "sun") return 0.08;
  const hours = Math.abs(body.dayHours);
  const period = Math.min(48, Math.max(4.2, 10 * (hours / 24)));
  const sign = body.dayHours < 0 ? -1 : 1;
  return sign * ((Math.PI * 2) / period);
}

const _scratch: Vec3 = { x: 0, y: 0, z: 0 };

export function bodyPosition(body: Body, timeDays: number, out: Vec3 = _scratch): Vec3 {
  return keplerBodyPosition(body, timeDays, out);
}

export function orbitPoints(body: Body, segments = 160): [number, number, number][] {
  return keplerOrbitPoints(body, segments);
}

export function formatDiameter(km: number): string {
  return `${km.toLocaleString("en-US")} km`;
}

export function shadingNotes(id: BodyId): string {
  if (id === "sun") return "Procedural corona · additive halo · G2V blackbody";
  if (id === "mercury") return "Wrap Lambert · crater bump · airless terminator";
  if (id === "venus") return "Thick Mie limb · soft wrap · low bump";
  if (id === "earth") return "Ocean spec · city lights · cloud shadows · Rayleigh limb";
  if (id === "mars") return "Wrap Lambert · polar frost · thin dust limb · bump";
  if (id === "jupiter") return "Animated bands · wrap Lambert · Great Red Spot · limb";
  if (id === "saturn") return "Banded albedo · ring-plane shadow · golden limb";
  if (id === "uranus") return "Methane limb · faint bands · ring shadow";
  return "Deep Rayleigh limb · dark vortex · wrap Lambert";
}

export { perihelionPosition, aphelionPosition, emptyFocusPosition };
