import { create } from "zustand";
import type { BodyId } from "./bodies";

const KEY = "helios-prefs-v2";

type Prefs = {
  speed: number;
  showLabels: boolean;
  showTrails: boolean;
};

function loadPrefs(): Partial<Prefs> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Prefs) : {};
  } catch {
    return {};
  }
}

function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota */
  }
}

type HeliosState = {
  paused: boolean;
  speed: number;
  focusedId: BodyId;
  showLabels: boolean;
  showTrails: boolean;
  perturbed: boolean;
  resonance: boolean;
  hasInteracted: boolean;
  togglePaused: () => void;
  setSpeed: (speed: number) => void;
  setFocused: (id: BodyId) => void;
  toggleLabels: () => void;
  toggleTrails: () => void;
  togglePerturbed: () => void;
  toggleResonance: () => void;
  resetView: () => void;
};

function persist(state: HeliosState) {
  savePrefs({
    speed: state.speed,
    showLabels: state.showLabels,
    showTrails: state.showTrails,
  });
}

export const useHelios = create<HeliosState>((set, get) => ({
  paused: false,
  speed: 1,
  focusedId: "sun",
  showLabels: true,
  showTrails: true,
  perturbed: true,
  resonance: true,
  hasInteracted: false,
  togglePaused: () => set((s) => ({ paused: !s.paused, hasInteracted: true })),
  setSpeed: (speed) => {
    set({ speed, hasInteracted: true });
    persist(get());
  },
  setFocused: (focusedId) => set({ focusedId, hasInteracted: true }),
  toggleLabels: () => {
    set((s) => ({ showLabels: !s.showLabels, hasInteracted: true }));
    persist(get());
  },
  toggleTrails: () => {
    set((s) => ({ showTrails: !s.showTrails, hasInteracted: true }));
    persist(get());
  },
  togglePerturbed: () => set((s) => ({ perturbed: !s.perturbed, hasInteracted: true })),
  toggleResonance: () => set((s) => ({ resonance: !s.resonance, hasInteracted: true })),
  resetView: () => set({ focusedId: "sun", hasInteracted: true }),
}));

export function hydrateHeliosPrefs() {
  const prefs = loadPrefs();
  const patch: Partial<HeliosState> = {};
  if (typeof prefs.speed === "number") patch.speed = Math.min(16, Math.max(0.25, prefs.speed));
  if (typeof prefs.showLabels === "boolean") patch.showLabels = prefs.showLabels;
  if (typeof prefs.showTrails === "boolean") patch.showTrails = prefs.showTrails;
  if (Object.keys(patch).length) useHelios.setState(patch);
}
