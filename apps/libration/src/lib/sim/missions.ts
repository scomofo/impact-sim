import type { PointId, SystemId } from "./types";

export type MissionId =
  | "isee3"
  | "soho"
  | "ace"
  | "dscovr"
  | "aditya"
  | "wmap"
  | "gaia"
  | "jwst"
  | "euclid"
  | "artemis"
  | "queqiao"
  | "gateway"
  | "lucy"
  | "vigil";

export type MissionStatus = "active" | "complete" | "planned" | "en-route";

export type OrbitKind = "halo" | "lissajous" | "tadpole" | "nrho" | "flyby";

export type MissionDef = {
  id: MissionId;
  name: string;
  agency: string;
  years: string;
  status: MissionStatus;
  system: SystemId;
  point: PointId;
  orbit: OrbitKind;
  amp: number;
  phase: number;
  why: string;
  body: string;
};

export const MISSIONS: readonly MissionDef[] = [
  {
    id: "isee3",
    name: "ISEE-3",
    agency: "NASA / ESA",
    years: "1978–1982",
    status: "complete",
    system: "sun-earth",
    point: "L1",
    orbit: "halo",
    amp: 0.0026,
    phase: 0.4,
    why: "The first spacecraft to occupy a Lagrange point.",
    body: "A halo around Sun–Earth L1, watching the solar wind before it reached Earth. Later renamed ICE and sent to comet Giacobini–Zinner — the first to leave a libration orbit on purpose.",
  },
  {
    id: "soho",
    name: "SOHO",
    agency: "ESA / NASA",
    years: "1995–",
    status: "active",
    system: "sun-earth",
    point: "L1",
    orbit: "halo",
    amp: 0.0028,
    phase: 0,
    why: "Unbroken sunlight. No eclipses, no night.",
    body: "The Solar and Heliospheric Observatory has sat in a halo about L1 for three decades. From here the Sun is a constant disc, and coronal mass ejections are seen hours before they arrive.",
  },
  {
    id: "ace",
    name: "ACE",
    agency: "NASA",
    years: "1997–",
    status: "active",
    system: "sun-earth",
    point: "L1",
    orbit: "lissajous",
    amp: 0.0022,
    phase: 1.5,
    why: "A sentinel for the solar wind’s composition.",
    body: "The Advanced Composition Explorer samples ions and energetic particles at L1, the last clean look at the wind before Earth’s magnetosphere stirs it.",
  },
  {
    id: "dscovr",
    name: "DSCOVR",
    agency: "NOAA / NASA",
    years: "2015–",
    status: "active",
    system: "sun-earth",
    point: "L1",
    orbit: "lissajous",
    amp: 0.0024,
    phase: 2.7,
    why: "Space weather with a full-disc Earth in the rear-view.",
    body: "A climate and solar-wind watchdog at L1. EPIC photographs the sunlit Earth as a whole — the pale blue dot, continuously.",
  },
  {
    id: "aditya",
    name: "Aditya-L1",
    agency: "ISRO",
    years: "2023–",
    status: "active",
    system: "sun-earth",
    point: "L1",
    orbit: "halo",
    amp: 0.0025,
    phase: 3.9,
    why: "India’s first solar observatory at a libration point.",
    body: "Inserted into a halo about L1 in January 2024. Coronagraphs and particle detectors watch the Sun’s outer atmosphere from the same doorstep SOHO has used since 1995.",
  },
  {
    id: "wmap",
    name: "WMAP",
    agency: "NASA",
    years: "2001–2010",
    status: "complete",
    system: "sun-earth",
    point: "L2",
    orbit: "lissajous",
    amp: 0.003,
    phase: 0.9,
    why: "A cold, radio-quiet sky for the cosmic microwave background.",
    body: "Wilkinson mapped the afterglow of the Big Bang from L2, where Earth, Sun, and Moon stay in one patch of sky. The pattern it found became the standard model of cosmology.",
  },
  {
    id: "gaia",
    name: "Gaia",
    agency: "ESA",
    years: "2013–",
    status: "active",
    system: "sun-earth",
    point: "L2",
    orbit: "lissajous",
    amp: 0.0032,
    phase: 2.2,
    why: "A billion-star census, stable thermal and a clear view.",
    body: "Gaia spins slowly in a Lissajous about L2, measuring positions with microarcsecond care. The Sun, Earth, and Moon never enter the field — they stay behind the sunshade.",
  },
  {
    id: "jwst",
    name: "JWST",
    agency: "NASA / ESA / CSA",
    years: "2021–",
    status: "active",
    system: "sun-earth",
    point: "L2",
    orbit: "halo",
    amp: 0.0034,
    phase: 0,
    why: "It does not sit at L2. It orbits L2.",
    body: "A 6-month halo, 250,000 to 830,000 km around the point, so the telescope never falls into Earth’s shadow. Station-keeping burns every few weeks hold the saddle. The sunshield stays Sun-facing; the mirrors stay at 40 K.",
  },
  {
    id: "euclid",
    name: "Euclid",
    agency: "ESA / NASA",
    years: "2023–",
    status: "active",
    system: "sun-earth",
    point: "L2",
    orbit: "halo",
    amp: 0.003,
    phase: 3.5,
    why: "Dark universe survey from the same cold seat as Webb.",
    body: "Arrived at L2 in July 2023. A wide-field mapper of galaxies and weak lensing, sharing the thermal quiet of the anti-Sun point with JWST and Gaia.",
  },
  {
    id: "artemis",
    name: "ARTEMIS",
    agency: "NASA",
    years: "2010–2011",
    status: "complete",
    system: "earth-moon",
    point: "L1",
    orbit: "lissajous",
    amp: 0.038,
    phase: 0.7,
    why: "First spacecraft to linger at the Earth–Moon points.",
    body: "Two THEMIS probes, P1 and P2, were steered through Earth–Moon L1 and L2 Lissajous orbits — a proof that the lunar Lagrange seats can be used — then dropped into lunar orbit.",
  },
  {
    id: "queqiao",
    name: "Queqiao",
    agency: "CNSA",
    years: "2018–",
    status: "active",
    system: "earth-moon",
    point: "L2",
    orbit: "halo",
    amp: 0.042,
    phase: 0,
    why: "A relay that never lets the lunar farside go dark.",
    body: "Magpie Bridge. A halo about Earth–Moon L2, always in view of both Earth and the Moon’s far hemisphere. Chang’e-4 landed in Von Kármán; Queqiao is the reason we heard it.",
  },
  {
    id: "gateway",
    name: "Gateway",
    agency: "NASA / ESA / CSA / JAXA",
    years: "planned",
    status: "planned",
    system: "earth-moon",
    point: "L2",
    orbit: "nrho",
    amp: 0.048,
    phase: 1.9,
    why: "Not parked on a point — a near-rectilinear halo that kisses the Moon.",
    body: "A seven-day polar halo in the Earth–Moon L2 family. Staging post for Artemis landings. In this plane it reads as a tall, slow loop about the exterior point, skimming the lunar poles.",
  },
  {
    id: "lucy",
    name: "Lucy",
    agency: "NASA",
    years: "2021–",
    status: "en-route",
    system: "sun-jupiter",
    point: "L4",
    orbit: "tadpole",
    amp: 0.07,
    phase: 0.5,
    why: "A tour of both Trojan camps.",
    body: "Launched 2021. First L4 Trojan encounters in 2027, then on to L5. The Greek camp leads Jupiter by 60°; the Trojan camp trails. Lucy will be the first to visit both swarms.",
  },
  {
    id: "vigil",
    name: "Vigil",
    agency: "ESA",
    years: "planned ~2031",
    status: "planned",
    system: "sun-earth",
    point: "L5",
    orbit: "tadpole",
    amp: 0.04,
    phase: 1.2,
    why: "Side-on warning of solar storms, 60° behind Earth.",
    body: "The first operational spacecraft designed for Sun–Earth L5. From the trailing triangle you see the Sun’s limb before it rotates toward Earth — extra hours of space-weather lead time.",
  },
];

export const MISSION_MAP = new Map(MISSIONS.map((m) => [m.id, m]));

export function missionById(id: string): MissionDef | undefined {
  return MISSION_MAP.get(id as MissionId);
}

export function missionsForSystem(system: SystemId): MissionDef[] {
  return MISSIONS.filter((m) => m.system === system);
}

export function groupedMissions(): { point: PointId; missions: MissionDef[] }[] {
  const points: PointId[] = ["L1", "L2", "L3", "L4", "L5"];
  return points
    .map((point) => ({ point, missions: MISSIONS.filter((m) => m.point === point) }))
    .filter((g) => g.missions.length > 0);
}

export function signatureMissions(system: SystemId): MissionId[] {
  switch (system) {
    case "sun-earth":
      return ["jwst", "soho"];
    case "earth-moon":
      return ["queqiao", "artemis"];
    case "sun-jupiter":
      return ["lucy"];
    default:
      return [];
  }
}
