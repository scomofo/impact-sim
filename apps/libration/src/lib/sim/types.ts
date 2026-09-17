export type PointId = "L1" | "L2" | "L3" | "L4" | "L5";

export type Frame = "rotating" | "inertial";

export type SystemId = "earth-moon" | "sun-earth" | "sun-jupiter" | "equal";

export type Vec2 = { x: number; y: number };

export type LagrangePoint = {
  id: PointId;
  x: number;
  y: number;
  omega: number;
  collinear: boolean;
  stable: boolean;
};

export type Halo = {
  lx: number;
  ly: number;
  ax: number;
  ay: number;
  w: number;
  wy: number;
  phase: number;
};

export type Probe = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  trail: Float32Array;
  trailCount: number;
  trailHead: number;
  lastTrailX: number;
  lastTrailY: number;
  jacobi: number;
  flash: number;
  hue: number;
  label: string | null;
  missionId: string | null;
  keep: boolean;
  halo: Halo | null;
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
};

export type Camera = {
  x: number;
  y: number;
  zoom: number;
};

export type FlingState = {
  active: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  pointerId: number;
};

export type HudSnapshot = {
  paused: boolean;
  timeScale: number;
  frame: Frame;
  potential: boolean;
  hills: boolean;
  trails: boolean;
  mute: boolean;
  system: SystemId;
  mu: number;
  stable: boolean;
  probeCount: number;
  selected: PointId | null;
  selectedMission: string | null;
  jacobi: number | null;
  hint: boolean;
  simDays: number;
};

export type EngineApi = {
  start: () => void;
  destroy: () => void;
  setPaused: (paused: boolean) => void;
  setTimeScale: (scale: number) => void;
  setFrame: (frame: Frame) => void;
  setPotential: (on: boolean) => void;
  setHills: (on: boolean) => void;
  setTrails: (on: boolean) => void;
  setMute: (on: boolean) => void;
  setSystem: (id: SystemId) => void;
  setMu: (mu: number) => void;
  dropAt: (id: PointId, kick?: number) => void;
  loadMission: (id: string) => void;
  selectMission: (id: string) => void;
  dropTrojans: () => void;
  perturb: () => void;
  clear: () => void;
  fit: () => void;
  focus: (id: PointId) => void;
  snapshot: () => HudSnapshot;
};
