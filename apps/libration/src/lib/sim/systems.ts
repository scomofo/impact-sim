import type { PointId, SystemId } from "./types";

export type Mission = {
  name: string;
  point: PointId;
  note: string;
};

export type SystemDef = {
  id: SystemId;
  label: string;
  pair: string;
  primary: string;
  secondary: string;
  mu: number;
  periodDays: number;
  primaryR: number;
  secondaryR: number;
  primaryFill: string;
  primaryGlow: string;
  secondaryFill: string;
  secondaryGlow: string;
  zoom: "wide" | "secondary";
  blurb: string;
  missions: Mission[];
};

export const SYSTEMS: readonly SystemDef[] = [
  {
    id: "earth-moon",
    label: "Earth–Moon",
    pair: "Earth and Moon",
    primary: "Earth",
    secondary: "Moon",
    mu: 0.0121506683,
    periodDays: 27.32,
    primaryR: 0.052,
    secondaryR: 0.02,
    primaryFill: "#8ea0ae",
    primaryGlow: "#c5d4de",
    secondaryFill: "#cfc6b8",
    secondaryGlow: "#ebe4d8",
    zoom: "wide",
    blurb: "Close enough to see all five seats at once. L4 and L5 are stable — barely.",
    missions: [
      {
        name: "Lunar Gateway",
        point: "L2",
        note: "Planned NRHO staging post in the Earth–Moon L2 family.",
      },
      {
        name: "Queqiao",
        point: "L2",
        note: "Halo relay that keeps the lunar farside in contact.",
      },
      {
        name: "O’Neill sites",
        point: "L5",
        note: "The classic proposal for a co-orbital habitat.",
      },
    ],
  },
  {
    id: "sun-earth",
    label: "Sun–Earth",
    pair: "Sun and Earth",
    primary: "Sun",
    secondary: "Earth",
    mu: 3.0034e-6,
    periodDays: 365.25,
    primaryR: 0.04,
    secondaryR: 0.0032,
    primaryFill: "#ddd4c4",
    primaryGlow: "#f4eee4",
    secondaryFill: "#6f8ea3",
    secondaryGlow: "#b7cfe0",
    zoom: "secondary",
    blurb: "L1 and L2 cling to Earth — a million miles toward and away from the Sun.",
    missions: [
      {
        name: "SOHO · DSCOVR",
        point: "L1",
        note: "Unbroken sunlight and a constant watch on the solar wind.",
      },
      {
        name: "JWST · Gaia · Euclid",
        point: "L2",
        note: "Cold, radio-quiet, and always in line for power and Earth comms.",
      },
      {
        name: "Vigil",
        point: "L5",
        note: "Planned side-on sentinel, 60° behind Earth.",
      },
    ],
  },
  {
    id: "sun-jupiter",
    label: "Sun–Jupiter",
    pair: "Sun and Jupiter",
    primary: "Sun",
    secondary: "Jupiter",
    mu: 9.5387e-4,
    periodDays: 4332.6,
    primaryR: 0.068,
    secondaryR: 0.036,
    primaryFill: "#ddd4c4",
    primaryGlow: "#f4eee4",
    secondaryFill: "#c4b39a",
    secondaryGlow: "#e5d6bc",
    zoom: "wide",
    blurb: "The textbook Trojan camps. Thousands of asteroids share Jupiter’s orbit.",
    missions: [
      {
        name: "Greek camp",
        point: "L4",
        note: "Leading Trojans, 60° ahead of Jupiter.",
      },
      {
        name: "Trojan camp",
        point: "L5",
        note: "Trailing swarm. Lucy is touring both.",
      },
    ],
  },
  {
    id: "equal",
    label: "Equal mass",
    pair: "Twin worlds",
    primary: "A",
    secondary: "B",
    mu: 0.5,
    periodDays: 20,
    primaryR: 0.055,
    secondaryR: 0.055,
    primaryFill: "#c8c2b6",
    primaryGlow: "#ebe6dc",
    secondaryFill: "#9aa8b4",
    secondaryGlow: "#d2dde6",
    zoom: "wide",
    blurb: "Past the Routh limit the triangular points lose their Coriolis grip.",
    missions: [],
  },
];

export const SYSTEM_MAP = new Map(SYSTEMS.map((s) => [s.id, s]));

export function systemById(id: SystemId): SystemDef {
  return SYSTEM_MAP.get(id) ?? SYSTEMS[0];
}

export type PointCopy = {
  id: PointId;
  title: string;
  seat: string;
  body: string;
  use: string;
};

export const POINT_COPY: Record<PointId, PointCopy> = {
  L1: {
    id: "L1",
    title: "Interior collinear",
    seat: "Between the two masses",
    body: "A saddle in the effective potential. Leave a probe here at rest and the slightest numerical breath sends it sliding toward one body or the other. The Coriolis force cannot hold it.",
    use: "The solar-facing doorstep: continuous sunlight, a clean view of the solar wind, a waypoint between worlds.",
  },
  L2: {
    id: "L2",
    title: "Exterior collinear",
    seat: "Beyond the smaller mass",
    body: "Another saddle, just outside the secondary. Halo and Lissajous orbits station-keep here with modest fuel — never quite at rest, always looping around the unstable point.",
    use: "Deep-space telescopes sit here so the Sun, Earth, and Moon stay in one patch of sky: power, comms, and a cold dark view.",
  },
  L3: {
    id: "L3",
    title: "Opposite collinear",
    seat: "Beyond the larger mass",
    body: "Almost opposite the secondary, slightly off the unit circle. Unstable, remote, and forever hidden behind the primary from the smaller world’s point of view.",
    use: "No operational spacecraft. Science fiction parked a counter-Earth here. Reality left it empty.",
  },
  L4: {
    id: "L4",
    title: "Leading Trojan",
    seat: "60° ahead — an equilateral triangle",
    body: "A maximum of the effective potential, not a well. For mass ratios below the Routh limit, Coriolis turns a hilltop into a trap: tadpole orbits librate around the point instead of rolling off.",
    use: "Jupiter’s Greek camp. A natural parking orbit for co-orbital companions and, one day, habitats.",
  },
  L5: {
    id: "L5",
    title: "Trailing Trojan",
    seat: "60° behind — the other triangle",
    body: "Mirror of L4. Same stability criterion, same tadpole and horseshoe families. Drop a cloud of probes here and they braid around the point for as long as the mass ratio allows.",
    use: "Jupiter’s Trojan camp, and the Earth–Moon site O’Neill picked for a colony.",
  },
};
