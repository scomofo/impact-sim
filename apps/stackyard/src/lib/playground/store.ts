import { create } from "zustand";

export type ShapeKind = "sphere" | "box" | "cylinder";

export interface BodySpec {
  id: string;
  kind: ShapeKind;
  position: [number, number, number];
  rotation: [number, number, number];
  color: string;
  scale: number;
}

export const TABLE_TOP = 0.26;
export const TABLE_RADIUS = 8.6;
export const MAX_BODIES = 72;

export const SHAPE = {
  sphere: { radius: 0.5, halfHeight: 0.5 },
  box: { half: 0.5, halfHeight: 0.5 },
  cylinder: { radius: 0.38, halfHeight: 0.58 },
} as const;

const KIND_HSL: Record<ShapeKind, [number, number, number]> = {
  sphere: [14, 38, 56],
  box: [138, 16, 54],
  cylinder: [204, 22, 52],
};

export function colorFor(kind: ShapeKind): string {
  const [h, s, l] = KIND_HSL[kind];
  const hh = h + (Math.random() - 0.5) * 12;
  const ss = Math.max(8, s + (Math.random() - 0.5) * 8);
  const ll = Math.max(42, Math.min(64, l + (Math.random() - 0.5) * 10));
  return `hsl(${hh.toFixed(1)} ${ss.toFixed(1)}% ${ll.toFixed(1)}%)`;
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq.toString(36)}`;
}

function makeStarter(): BodySpec[] {
  const bodies: BodySpec[] = [];
  const gap = 1.06;
  const layers: number[][] = [[-1.06, 0, 1.06], [-0.53, 0.53], [0]];
  layers.forEach((xs, layer) => {
    xs.forEach((x, i) => {
      bodies.push({
        id: `seed-box-${layer}-${i}`,
        kind: "box",
        position: [x, TABLE_TOP + SHAPE.box.halfHeight + layer * gap, 0],
        rotation: [0, 0, 0],
        color: colorFor("box"),
        scale: 1,
      });
    });
  });
  bodies.push(
    {
      id: "seed-sphere-0",
      kind: "sphere",
      position: [2.55, TABLE_TOP + SHAPE.sphere.halfHeight + 0.02, 1.35],
      rotation: [0, 0, 0],
      color: colorFor("sphere"),
      scale: 1,
    },
    {
      id: "seed-sphere-1",
      kind: "sphere",
      position: [3.35, TABLE_TOP + SHAPE.sphere.halfHeight + 0.02, 0.35],
      rotation: [0, 0, 0],
      color: colorFor("sphere"),
      scale: 1.08,
    },
    {
      id: "seed-cyl-0",
      kind: "cylinder",
      position: [-2.7, TABLE_TOP + SHAPE.cylinder.halfHeight + 0.02, 1.1],
      rotation: [0, 0.35, 0],
      color: colorFor("cylinder"),
      scale: 1,
    },
  );
  return bodies;
}

interface PlaygroundState {
  kind: ShapeKind;
  gravity: number;
  restitution: number;
  paused: boolean;
  bodies: BodySpec[];
  grabbedId: string | null;
  setKind: (kind: ShapeKind) => void;
  setGravity: (gravity: number) => void;
  setRestitution: (restitution: number) => void;
  setPaused: (paused: boolean) => void;
  setGrabbedId: (id: string | null) => void;
  spawnAt: (x: number, y: number, z: number, kind?: ShapeKind) => void;
  dropSelected: () => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const usePlayground = create<PlaygroundState>((set, get) => ({
  kind: "sphere",
  gravity: 9.81,
  restitution: 0.38,
  paused: false,
  bodies: makeStarter(),
  grabbedId: null,
  setKind: (kind) => set({ kind }),
  setGravity: (gravity) => set({ gravity }),
  setRestitution: (restitution) => set({ restitution }),
  setPaused: (paused) => set({ paused }),
  setGrabbedId: (grabbedId) => set({ grabbedId }),
  spawnAt: (x, y, z, kind) => {
    const state = get();
    if (state.bodies.length >= MAX_BODIES) return;
    const nextKind = kind ?? state.kind;
    const scale = 0.88 + Math.random() * 0.28;
    const yaw = Math.random() * Math.PI * 2;
    set({
      bodies: [
        ...state.bodies,
        {
          id: nextId(nextKind),
          kind: nextKind,
          position: [x, y, z],
          rotation: [0, yaw, 0],
          color: colorFor(nextKind),
          scale,
        },
      ],
    });
  },
  dropSelected: () => {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 1.4;
    get().spawnAt(
      Math.cos(angle) * radius,
      TABLE_TOP + 5.6,
      Math.sin(angle) * radius,
    );
  },
  remove: (id) =>
    set((state) => ({
      bodies: state.bodies.filter((body) => body.id !== id),
      grabbedId: state.grabbedId === id ? null : state.grabbedId,
    })),
  clear: () => set({ bodies: [], grabbedId: null, paused: false }),
}));
