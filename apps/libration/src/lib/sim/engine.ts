import { createAudio } from "./audio";
import {
  clampMu,
  isStable,
  jacobi,
  lagrangePoints,
  planarLyapunov,
  POINT_ORDER,
  predictPath,
  primaryPos,
  rk4Step,
  rotate,
  secondaryPos,
} from "./cr3bp";
import { missionById, missionsForSystem, signatureMissions } from "./missions";
import {
  buildContours,
  buildHillMask,
  buildPotentialField,
  drawFrame,
  makeStarfield,
  resizeCanvas,
  screenToWorld,
  viewCenter,
  type Star,
} from "./draw";
import { systemById } from "./systems";
import type {
  Camera,
  EngineApi,
  FlingState,
  Frame,
  Halo,
  HudSnapshot,
  Particle,
  PointId,
  Probe,
  SystemId,
} from "./types";

const STEP = 1 / 90;
const TRAIL_CAP = 220;
const TRAIL_SPACING = 0.012;
const MAX_PROBES = 40;
const MIN_ZOOM = 70;
const MAX_ZOOM = 3600;
const FLING_SCALE = 0.95;
const SAVE_KEY = "libration-v3";

type Saved = {
  version: 1;
  system: SystemId;
  mu: number;
  trails: boolean;
  mute: boolean;
  frame: Frame;
  potential: boolean;
  hills: boolean;
  timeScale: number;
};

let live: EngineApi | null = null;

export function createEngine(
  canvas: HTMLCanvasElement,
  onHud: (s: HudSnapshot) => void,
): EngineApi {
  live?.destroy();
  const prev = (window as unknown as { __libration?: EngineApi }).__libration;
  if (prev && prev !== live) prev.destroy();
  live = null;

  const rawCtx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!rawCtx) throw new Error("Canvas 2D is unavailable.");
  const ctx = rawCtx;

  const audio = createAudio();
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let systemId: SystemId = "sun-earth";
  let mu = systemById(systemId).mu;
  let points = lagrangePoints(mu);
  let probes: Probe[] = [];
  const particles: Particle[] = [];
  const stars: Star[] = makeStarfield();
  const cam: Camera = { x: 0, y: 0, zoom: 240 };
  const fling: FlingState = {
    active: false,
    x0: 0,
    y0: 0,
    x1: 0,
    y1: 0,
    pointerId: -1,
  };

  let paused = false;
  let timeScale = 1;
  let frame: Frame = "rotating";
  let potential = false;
  let hills = false;
  let trails = true;
  let mute = false;
  let selected: PointId | null = "L2";
  let selectedMission: string | null = "jwst";
  let hint = true;
  let running = false;
  let raf = 0;
  let acc = 0;
  let last = 0;
  let simTime = 0;
  let size = { w: 800, h: 600, dpr: 1 };
  let fitted = false;
  let predict: Float32Array | null = null;
  let panPointer = -1;
  let panLastX = 0;
  let panLastY = 0;
  let pinch: { idA: number; idB: number; dist: number; midX: number; midY: number } | null =
    null;
  const pointers = new Map<number, { x: number; y: number }>();
  const keys = new Set<string>();
  let hudDirty = true;
  let hudClock = 0;
  let nextProbeId = 1;
  let field = buildPotentialField(mu);
  let contours = buildContours(mu, [
    lagrangePoints(mu).L1.omega,
    lagrangePoints(mu).L2.omega,
    lagrangePoints(mu).L3.omega,
  ]);
  let hill: HTMLCanvasElement | null = null;
  let hillC = NaN;

  const saved = loadSave();
  if (saved) {
    systemId = saved.system;
    mu = clampMu(saved.mu);
    trails = saved.trails;
    mute = saved.mute;
    frame = saved.frame;
    potential = saved.potential;
    hills = saved.hills;
    timeScale = saved.timeScale;
    audio.setMute(mute);
    points = lagrangePoints(mu);
    field = buildPotentialField(mu);
    contours = buildContours(mu, [points.L1.omega, points.L2.omega, points.L3.omega]);
  }

  seedDemo();
  fitCamera(true);

  function snapshot(): HudSnapshot {
    const lastProbe = probes[probes.length - 1];
    return {
      paused,
      timeScale,
      frame,
      potential,
      hills,
      trails,
      mute,
      system: systemId,
      mu,
      stable: isStable(mu),
      probeCount: probes.length,
      selected,
      selectedMission,
      jacobi: lastProbe ? lastProbe.jacobi : null,
      hint,
      simDays: (simTime / (Math.PI * 2)) * systemById(systemId).periodDays,
    };
  }

  function emitHud() {
    hudDirty = false;
    onHud(snapshot());
  }

  function persist() {
    try {
      const data: Saved = {
        version: 1,
        system: systemId,
        mu,
        trails,
        mute,
        frame,
        potential,
        hills,
        timeScale,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* quota */
    }
  }

  function rebuildPoints() {
    points = lagrangePoints(mu);
    field = buildPotentialField(mu);
    contours = buildContours(mu, [points.L1.omega, points.L2.omega, points.L3.omega]);
    hill = null;
    hillC = NaN;
    hudDirty = true;
  }

  function recordTrail(pr: Probe) {
    const dx = pr.x - pr.lastTrailX;
    const dy = pr.y - pr.lastTrailY;
    if (dx * dx + dy * dy < TRAIL_SPACING * TRAIL_SPACING) return;
    const i = pr.trailHead % (pr.trail.length / 2);
    pr.trail[i * 2] = pr.x;
    pr.trail[i * 2 + 1] = pr.y;
    pr.trailHead += 1;
    if (pr.trailCount < pr.trail.length / 2) pr.trailCount += 1;
    pr.lastTrailX = pr.x;
    pr.lastTrailY = pr.y;
  }

  function spawnProbe(
    x: number,
    y: number,
    vx: number,
    vy: number,
    silent = false,
    extra?: {
      label?: string;
      missionId?: string;
      keep?: boolean;
      halo?: Halo | null;
    },
  ) {
    if (probes.length >= MAX_PROBES) probes.shift();
    const pr: Probe = {
      id: nextProbeId++,
      x,
      y,
      vx,
      vy,
      trail: new Float32Array(TRAIL_CAP * 2),
      trailCount: 0,
      trailHead: 0,
      lastTrailX: x,
      lastTrailY: y,
      jacobi: jacobi(x, y, vx, vy, mu),
      flash: 1,
      hue: 40,
      label: extra?.label ?? null,
      missionId: extra?.missionId ?? null,
      keep: extra?.keep ?? false,
      halo: extra?.halo ?? null,
    };
    probes.push(pr);
    hint = false;
    hudDirty = true;
    if (!silent) audio.drop();
    return pr;
  }

  function spawnMissionCraft(id: string, silent = true) {
    const m = missionById(id);
    if (!m || m.system !== systemId) return;
    const pt = points[m.point];
    const ph = m.phase;
    if (m.orbit === "tadpole") {
      const w = 0.38;
      const ax = m.amp;
      const ay = m.amp * 0.58;
      spawnProbe(
        pt.x + ax * Math.cos(ph),
        pt.y + ay * Math.sin(ph),
        -ax * w * Math.sin(ph),
        ay * w * Math.cos(ph),
        silent,
        {
          label: m.name,
          missionId: m.id,
          keep: true,
          halo: { lx: pt.x, ly: pt.y, ax, ay, w, wy: w, phase: ph },
        },
      );
      return;
    }
    if (m.orbit === "halo" || m.orbit === "lissajous" || m.orbit === "nrho") {
      const ly = planarLyapunov(pt.x, pt.y, mu, m.amp);
      let ax = ly.ax;
      let ay = ly.ay;
      const w = ly.w;
      let wy = w;
      if (m.orbit === "lissajous") wy = w * (2 / 3);
      if (m.orbit === "nrho") {
        ax *= 0.55;
        ay *= 1.12;
      }
      spawnProbe(
        ly.lx + ax * Math.cos(ph),
        ly.ly + ay * Math.sin(ph),
        -ax * w * Math.sin(ph),
        ay * wy * Math.cos(ph),
        silent,
        {
          label: m.name,
          missionId: m.id,
          keep: true,
          halo: { lx: ly.lx, ly: ly.ly, ax, ay, w, wy, phase: ph },
        },
      );
      return;
    }
    const ang = m.point === "L5" ? -Math.PI / 10 : Math.PI / 10;
    spawnProbe(pt.x + Math.cos(ang) * m.amp, pt.y + Math.sin(ang) * m.amp, 0, 0, silent, {
      label: m.name,
      missionId: m.id,
      keep: false,
    });
  }

  function seedDemo() {
    probes = [];
    nextProbeId = 1;
    const list = missionsForSystem(systemId);
    for (const m of list) spawnMissionCraft(m.id, true);
    if (list.length === 0) {
      spawnProbe(points.L4.x, points.L4.y, 0, 0, true);
      spawnProbe(points.L1.x, 0, 0, 0, true);
      selected = "L4";
      selectedMission = null;
    } else {
      const ids = signatureMissions(systemId);
      const first = missionById(ids[0] ?? list[0].id);
      selected = first?.point ?? list[0].point;
      selectedMission = first?.id ?? list[0].id;
    }
    hint = true;
  }

  function dropAt(id: PointId, kick = 0) {
    const pt = points[id];
    const ang = Math.random() * Math.PI * 2;
    spawnProbe(pt.x, pt.y, Math.cos(ang) * kick, Math.sin(ang) * kick);
    selected = id;
    selectedMission = null;
    hudDirty = true;
  }

  function selectMission(id: string) {
    const m = missionById(id);
    if (!m || m.system !== systemId) return;
    selectedMission = id;
    selected = m.point;
    hint = false;
    hudDirty = true;
  }

  function burst(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      const ang = (Math.PI * 2 * i) / 10 + Math.random() * 0.3;
      const sp = 0.08 + Math.random() * 0.12;
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 1,
        maxLife: 0.35 + Math.random() * 0.25,
        size: 1.2 + Math.random() * 1.6,
      });
    }
  }

  function physicsFrame(h: number) {
    const prim = primaryPos(mu);
    const sec = secondaryPos(mu);
    const sys = systemById(systemId);
    for (let i = probes.length - 1; i >= 0; i--) {
      const pr = probes[i];
      const n = rk4Step(pr.x, pr.y, pr.vx, pr.vy, mu, h);
      pr.x = n.x;
      pr.y = n.y;
      pr.vx = n.vx;
      pr.vy = n.vy;
      if (pr.keep && pr.halo) {
        const t = simTime + h;
        const wt = pr.halo.w * t + pr.halo.phase;
        const wyt = pr.halo.wy * t + pr.halo.phase;
        const hx = pr.halo.lx + pr.halo.ax * Math.cos(wt);
        const hy = pr.halo.ly + pr.halo.ay * Math.sin(wyt);
        const hvx = -pr.halo.ax * pr.halo.w * Math.sin(wt);
        const hvy = pr.halo.ay * pr.halo.wy * Math.cos(wyt);
        const blend = 1 - Math.exp(-1.6 * h);
        pr.x += (hx - pr.x) * blend;
        pr.y += (hy - pr.y) * blend;
        pr.vx += (hvx - pr.vx) * blend;
        pr.vy += (hvy - pr.vy) * blend;
      }
      const r1 = Math.hypot(pr.x - prim.x, pr.y - prim.y);
      const r2 = Math.hypot(pr.x - sec.x, pr.y - sec.y);
      if (r1 < sys.primaryR * 0.82 || r2 < sys.secondaryR * 0.82 || pr.x * pr.x + pr.y * pr.y > 25) {
        burst(pr.x, pr.y);
        audio.absorb();
        probes.splice(i, 1);
        hudDirty = true;
        continue;
      }
      if (trails) recordTrail(pr);
    }
    simTime += h;
  }

  function fitCamera(instant = false) {
    const sys = systemById(systemId);
    if (sys.zoom === "secondary") {
      const s = secondaryPos(mu);
      const l1 = points.L1;
      const l2 = points.L2;
      const cx = (s.x + l1.x + l2.x) / 3;
      const span = Math.max(0.14, Math.abs(l2.x - l1.x) * 6);
      cam.x = cx;
      cam.y = 0;
      const { cy } = viewCenter(size.w, size.h);
      const availH = Math.max(160, cy * 2);
      cam.zoom = clamp(0.78 * Math.min(size.w / span, availH / (span * 0.65)), MIN_ZOOM, MAX_ZOOM);
    } else {
      const xs = POINT_ORDER.map((id) => points[id].x);
      const ys = POINT_ORDER.map((id) => points[id].y);
      const minX = Math.min(...xs) - 0.25;
      const maxX = Math.max(...xs) + 0.25;
      const minY = Math.min(...ys) - 0.2;
      const maxY = Math.max(...ys) + 0.2;
      cam.x = (minX + maxX) / 2;
      cam.y = (minY + maxY) / 2;
      const spanX = maxX - minX;
      const spanY = maxY - minY;
      const { cy } = viewCenter(size.w, size.h);
      const availH = Math.max(160, cy * 2);
      cam.zoom = clamp(
        0.82 * Math.min(size.w / spanX, availH / spanY),
        MIN_ZOOM,
        MAX_ZOOM,
      );
    }
    void instant;
  }

  function focusPoint(id: PointId) {
    selected = id;
    const pt = points[id];
    cam.x = pt.x;
    cam.y = pt.y;
    cam.zoom = clamp(cam.zoom * 1.15, MIN_ZOOM, MAX_ZOOM);
    hudDirty = true;
  }

  function nearestPoint(x: number, y: number, limit: number): PointId | null {
    let best: PointId | null = null;
    let bestD = limit * limit;
    for (const id of POINT_ORDER) {
      const pt = points[id];
      const d = (pt.x - x) ** 2 + (pt.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  function nearestCraft(x: number, y: number, limit: number): Probe | null {
    let best: Probe | null = null;
    let bestD = limit * limit;
    for (const pr of probes) {
      if (!pr.missionId) continue;
      const d = (pr.x - x) ** 2 + (pr.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = pr;
      }
    }
    return best;
  }

  function updatePredict() {
    if (!fling.active) {
      predict = null;
      return;
    }
    const vx = (fling.x1 - fling.x0) * FLING_SCALE;
    const vy = (fling.y1 - fling.y0) * FLING_SCALE;
    predict = predictPath(fling.x0, fling.y0, vx, vy, mu);
  }

  function refreshHill() {
    if (!hills || probes.length === 0) {
      hill = null;
      return;
    }
    const c = probes[probes.length - 1].jacobi;
    if (Math.abs(c - hillC) < 1e-6 && hill) return;
    hillC = c;
    hill = buildHillMask(mu, c);
  }

  function loop(ts: number) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (!last) last = ts;
    const raw = (ts - last) / 1000;
    last = ts;
    const dt = Math.min(raw, 0.05);
    size = resizeCanvas(canvas, ctx);
    if (!fitted && size.w > 80) {
      fitCamera(true);
      fitted = true;
    }

    const pan = (280 * dt) / cam.zoom;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) cam.x -= pan;
    if (keys.has("KeyD") || keys.has("ArrowRight")) cam.x += pan;
    if (keys.has("KeyW") || keys.has("ArrowUp")) cam.y -= pan;
    if (keys.has("KeyS") || keys.has("ArrowDown")) cam.y += pan;

    if (!paused) {
      acc += dt * timeScale * 0.42;
      const cap = STEP * 12;
      if (acc > cap) acc = cap;
      let steps = 0;
      while (acc >= STEP && steps < 12) {
        physicsFrame(STEP);
        acc -= STEP;
        steps += 1;
      }
    } else {
      acc = 0;
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt / p.maxLife;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = 0; i < probes.length; i++) {
      if (probes[i].flash > 0) probes[i].flash = Math.max(0, probes[i].flash - dt * 2.2);
    }

    refreshHill();

    const theta = frame === "inertial" ? simTime : 0;
    drawFrame({
      ctx,
      w: size.w,
      h: size.h,
      cam,
      mu,
      system: systemById(systemId),
      points,
      probes,
      particles,
      stars,
      fling,
      predict,
      trails,
      potential,
      hills,
      field,
      hill,
      contours,
      frame,
      theta,
      selected,
      now: ts,
      reduced,
    });

    hudClock += dt;
    if (hudDirty || hudClock > 0.12) {
      hudClock = 0;
      emitHud();
    }
  }

  function viewPos(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function pointerWorld(sx: number, sy: number) {
    if (frame !== "inertial") return screenToWorld(sx, sy, cam, size.w, size.h);
    const { cx, cy } = viewCenter(size.w, size.h);
    const camT = rotate(cam.x, cam.y, simTime);
    const ix = camT.x + (sx - cx) / cam.zoom;
    const iy = camT.y + (sy - cy) / cam.zoom;
    return rotate(ix, iy, -simTime);
  }

  function onPointerDown(e: PointerEvent) {
    audio.unlock();
    canvas.setPointerCapture(e.pointerId);
    const p = viewPos(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      fling.active = false;
      predict = null;
      const pts = [...pointers.entries()];
      const a = pts[0][1];
      const b = pts[1][1];
      pinch = {
        idA: pts[0][0],
        idB: pts[1][0],
        dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
      };
      panPointer = -1;
      return;
    }
    if (e.button === 1 || e.button === 2) {
      panPointer = e.pointerId;
      panLastX = p.x;
      panLastY = p.y;
      canvas.style.cursor = "grabbing";
      return;
    }
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const world = pointerWorld(p.x, p.y);
    fling.active = true;
    fling.pointerId = e.pointerId;
    fling.x0 = world.x;
    fling.y0 = world.y;
    fling.x1 = world.x;
    fling.y1 = world.y;
    updatePredict();
  }

  function onPointerMove(e: PointerEvent) {
    const p = viewPos(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (pinch && pointers.size >= 2) {
      const a = pointers.get(pinch.idA);
      const b = pointers.get(pinch.idB);
      if (a && b) {
        const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const before = pointerWorld(midX, midY);
        cam.zoom = clamp(cam.zoom * (dist / pinch.dist), MIN_ZOOM, MAX_ZOOM);
        const after = pointerWorld(midX, midY);
        cam.x += before.x - after.x;
        cam.y += before.y - after.y;
        cam.x -= (midX - pinch.midX) / cam.zoom;
        cam.y -= (midY - pinch.midY) / cam.zoom;
        pinch.dist = dist;
        pinch.midX = midX;
        pinch.midY = midY;
      }
      return;
    }
    if (panPointer === e.pointerId) {
      cam.x -= (p.x - panLastX) / cam.zoom;
      cam.y -= (p.y - panLastY) / cam.zoom;
      panLastX = p.x;
      panLastY = p.y;
      return;
    }
    if (fling.active && fling.pointerId === e.pointerId) {
      const world = pointerWorld(p.x, p.y);
      fling.x1 = world.x;
      fling.y1 = world.y;
      updatePredict();
    }
  }

  function endPointer(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pinch && (e.pointerId === pinch.idA || e.pointerId === pinch.idB)) pinch = null;
    if (panPointer === e.pointerId) {
      panPointer = -1;
      canvas.style.cursor = "crosshair";
    }
    if (fling.active && fling.pointerId === e.pointerId) {
      const dx = fling.x1 - fling.x0;
      const dy = fling.y1 - fling.y0;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.012) {
        const craft = nearestCraft(fling.x0, fling.y0, 20 / cam.zoom);
        if (craft?.missionId) {
          selectMission(craft.missionId);
        } else {
          const hit = nearestPoint(fling.x0, fling.y0, 18 / cam.zoom);
          if (hit) {
            selected = hit;
            dropAt(hit, 0);
          }
        }
      } else {
        spawnProbe(fling.x0, fling.y0, dx * FLING_SCALE, dy * FLING_SCALE);
      }
      fling.active = false;
      fling.pointerId = -1;
      predict = null;
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const before = pointerWorld(sx, sy);
    cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0012), MIN_ZOOM, MAX_ZOOM);
    const after = pointerWorld(sx, sy);
    cam.x += before.x - after.x;
    cam.y += before.y - after.y;
  }

  function onKeyDown(e: KeyboardEvent) {
    keys.add(e.code);
    if (e.code === "Space") {
      e.preventDefault();
      if (!e.repeat) {
        paused = !paused;
        hudDirty = true;
      }
      return;
    }
    if (e.repeat) return;
    const pointMap: Record<string, PointId> = {
      Digit1: "L1",
      Digit2: "L2",
      Digit3: "L3",
      Digit4: "L4",
      Digit5: "L5",
    };
    if (pointMap[e.code]) {
      dropAt(pointMap[e.code]);
      return;
    }
    if (e.code === "KeyR") {
      frame = frame === "rotating" ? "inertial" : "rotating";
      hudDirty = true;
      persist();
    } else if (e.code === "KeyT") {
      trails = !trails;
      hudDirty = true;
      persist();
    } else if (e.code === "KeyH") {
      hills = !hills;
      hudDirty = true;
      persist();
    } else if (e.code === "KeyP") {
      potential = !potential;
      hudDirty = true;
      persist();
    } else if (e.code === "KeyF") {
      fitCamera(true);
    } else if (e.code === "KeyK") {
      perturbAll();
    } else if (e.code === "KeyC") {
      probes = [];
      hudDirty = true;
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    keys.delete(e.code);
  }

  function perturbAll() {
    for (const pr of probes) {
      pr.vx += (Math.random() - 0.5) * 0.06;
      pr.vy += (Math.random() - 0.5) * 0.06;
      pr.jacobi = jacobi(pr.x, pr.y, pr.vx, pr.vy, mu);
      pr.flash = 1;
    }
    hill = null;
    audio.perturb();
    hudDirty = true;
  }

  function applySystem(id: SystemId, keepMu = false) {
    systemId = id;
    if (!keepMu) mu = systemById(id).mu;
    frame = "rotating";
    selectedMission = signatureMissions(id)[0] ?? null;
    rebuildPoints();
    seedDemo();
    fitCamera(true);
    persist();
  }

  function loadMission(id: string) {
    const m = missionById(id);
    if (!m) return;
    if (m.system !== systemId) {
      systemId = m.system;
      mu = systemById(m.system).mu;
      frame = "rotating";
      rebuildPoints();
      seedDemo();
    } else if (!probes.some((p) => p.missionId === m.id)) {
      spawnMissionCraft(m.id, false);
    }
    selected = m.point;
    selectedMission = m.id;
    hint = false;
    const pt = points[m.point];
    cam.x = pt.x;
    cam.y = pt.y;
    const span = Math.max(0.1, m.amp * 14);
    const { cy } = viewCenter(size.w, size.h);
    const availH = Math.max(160, cy * 2);
    cam.zoom = clamp(0.7 * Math.min(size.w / span, availH / span), MIN_ZOOM, MAX_ZOOM);
    hudDirty = true;
    persist();
  }

  const api: EngineApi = {
    start() {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(loop);
    },
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endPointer);
      canvas.removeEventListener("pointercancel", endPointer);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      audio.close();
      if (live === api) live = null;
    },
    setPaused(next) {
      paused = next;
      hudDirty = true;
    },
    setTimeScale(scale) {
      timeScale = scale;
      hudDirty = true;
      persist();
    },
    setFrame(next) {
      frame = next;
      hudDirty = true;
      persist();
    },
    setPotential(on) {
      potential = on;
      hudDirty = true;
      persist();
    },
    setHills(on) {
      hills = on;
      hudDirty = true;
      persist();
    },
    setTrails(on) {
      trails = on;
      hudDirty = true;
      persist();
    },
    setMute(on) {
      mute = on;
      audio.setMute(on);
      hudDirty = true;
      persist();
    },
    setSystem(id) {
      applySystem(id);
    },
    setMu(next) {
      mu = clampMu(next);
      rebuildPoints();
      persist();
    },
    dropAt,
    loadMission,
    selectMission,
    dropTrojans() {
      const l4 = points.L4;
      for (let i = 0; i < 9; i++) {
        const ang = (Math.PI * 2 * i) / 9;
        const rad = 0.04 + (i % 3) * 0.018;
        spawnProbe(
          l4.x + Math.cos(ang) * rad,
          l4.y + Math.sin(ang) * rad,
          (Math.random() - 0.5) * 0.01,
          (Math.random() - 0.5) * 0.01,
          true,
        );
      }
      audio.drop();
      selected = "L4";
      hudDirty = true;
    },
    perturb: perturbAll,
    clear() {
      probes = [];
      particles.length = 0;
      selectedMission = null;
      hudDirty = true;
    },
    fit() {
      fitCamera(true);
    },
    focus: focusPoint,
    snapshot,
  };

  function onContext(e: Event) {
    e.preventDefault();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContext);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  live = api;
  (window as unknown as { __libration?: EngineApi }).__libration = api;
  return api;
}

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

function loadSave(): Saved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Saved;
    if (data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}
