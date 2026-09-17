import { omega, primaryPos, rotate, secondaryPos } from "./cr3bp";
import type { SystemDef } from "./systems";
import type {
  Camera,
  FlingState,
  Frame,
  LagrangePoint,
  Particle,
  PointId,
  Probe,
} from "./types";

export type Star = { x: number; y: number; r: number; a: number; par: number };

const BG = "#08090c";
const STEEL = "rgba(185, 196, 204, 0.55)";
const STEEL_DIM = "rgba(185, 196, 204, 0.18)";
const PAPER = "#ece8e1";
const PAPER_DIM = "rgba(236, 232, 225, 0.55)";

export function makeStarfield(count = 240): Star[] {
  const stars: Star[] = [];
  let s = 0x51a2c7d;
  const rnd = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rnd(),
      y: rnd(),
      r: rnd() < 0.1 ? 1.25 : rnd() * 0.85 + 0.3,
      a: 0.16 + rnd() * 0.5,
      par: 0.03 + rnd() * 0.1,
    });
  }
  return stars;
}

export function resizeCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const bw = Math.max(1, Math.round(w * dpr));
  const bh = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h, dpr };
}

export function viewCenter(w: number, h: number) {
  const bottom = h < 760 ? Math.min(360, h * 0.42) : 150;
  const top = h < 760 ? 72 : 68;
  return { cx: w / 2, cy: top + (h - bottom - top) * 0.52 };
}

export function screenToWorld(sx: number, sy: number, cam: Camera, w: number, h: number) {
  const { cx, cy } = viewCenter(w, h);
  return {
    x: cam.x + (sx - cx) / cam.zoom,
    y: cam.y + (sy - cy) / cam.zoom,
  };
}

export function worldToScreen(x: number, y: number, cam: Camera, w: number, h: number) {
  const { cx, cy } = viewCenter(w, h);
  return { x: (x - cam.x) * cam.zoom + cx, y: (y - cam.y) * cam.zoom + cy };
}

type FieldCache = {
  mu: number;
  canvas: HTMLCanvasElement;
};

const FIELD_EXTENT = 1.85;
const FIELD_SIZE = 220;

export function buildPotentialField(mu: number): FieldCache {
  const canvas = document.createElement("canvas");
  canvas.width = FIELD_SIZE;
  canvas.height = FIELD_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { mu, canvas };
  const img = ctx.createImageData(FIELD_SIZE, FIELD_SIZE);
  const data = img.data;
  const p = primaryPos(mu);
  const s = secondaryPos(mu);
  let min = Infinity;
  let max = -Infinity;
  const vals = new Float32Array(FIELD_SIZE * FIELD_SIZE);
  const near = new Uint8Array(FIELD_SIZE * FIELD_SIZE);
  for (let j = 0; j < FIELD_SIZE; j++) {
    const y = FIELD_EXTENT - (j / (FIELD_SIZE - 1)) * 2 * FIELD_EXTENT;
    for (let i = 0; i < FIELD_SIZE; i++) {
      const x = -FIELD_EXTENT + (i / (FIELD_SIZE - 1)) * 2 * FIELD_EXTENT;
      const r1 = Math.hypot(x - p.x, y - p.y);
      const r2 = Math.hypot(x - s.x, y - s.y);
      const idx = j * FIELD_SIZE + i;
      const v = omega(x, y, mu);
      vals[idx] = v;
      if (r1 < 0.06 || r2 < 0.045) {
        near[idx] = 1;
      } else {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  const span = Math.max(1e-6, max - min);
  for (let n = 0; n < vals.length; n++) {
    const k = n * 4;
    if (near[n]) {
      data[k] = 6;
      data[k + 1] = 7;
      data[k + 2] = 10;
      data[k + 3] = 90;
      continue;
    }
    const t = Math.min(1, Math.max(0, (vals[n] - min) / span));
    const lift = t * t;
    data[k] = 10 + lift * 42;
    data[k + 1] = 12 + lift * 48;
    data[k + 2] = 16 + lift * 58;
    data[k + 3] = 28 + lift * 85;
  }
  ctx.putImageData(img, 0, 0);
  return { mu, canvas };
}

export function buildHillMask(mu: number, c: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = FIELD_SIZE;
  canvas.height = FIELD_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const img = ctx.createImageData(FIELD_SIZE, FIELD_SIZE);
  const data = img.data;
  for (let j = 0; j < FIELD_SIZE; j++) {
    const y = FIELD_EXTENT - (j / (FIELD_SIZE - 1)) * 2 * FIELD_EXTENT;
    for (let i = 0; i < FIELD_SIZE; i++) {
      const x = -FIELD_EXTENT + (i / (FIELD_SIZE - 1)) * 2 * FIELD_EXTENT;
      const om = omega(x, y, mu);
      const forbidden = 2 * om < c;
      const k = (j * FIELD_SIZE + i) * 4;
      if (forbidden) {
        data[k] = 8;
        data[k + 1] = 9;
        data[k + 2] = 12;
        data[k + 3] = 72;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function buildContours(mu: number, levels: number[]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = FIELD_SIZE;
  canvas.height = FIELD_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const n = FIELD_SIZE;
  const grid = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const y = FIELD_EXTENT - (j / (n - 1)) * 2 * FIELD_EXTENT;
    for (let i = 0; i < n; i++) {
      const x = -FIELD_EXTENT + (i / (n - 1)) * 2 * FIELD_EXTENT;
      grid[j * n + i] = omega(x, y, mu);
    }
  }
  ctx.strokeStyle = "rgba(185,196,204,0.55)";
  ctx.lineWidth = 1.1;
  const cell = (2 * FIELD_EXTENT) / (n - 1);
  const toPx = (x: number, y: number) => {
    const px = ((x + FIELD_EXTENT) / (2 * FIELD_EXTENT)) * (n - 1);
    const py = ((FIELD_EXTENT - y) / (2 * FIELD_EXTENT)) * (n - 1);
    return { px, py };
  };
  for (const level of levels) {
    ctx.beginPath();
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const x0 = -FIELD_EXTENT + i * cell;
        const y0 = FIELD_EXTENT - j * cell;
        const v00 = grid[j * n + i];
        const v10 = grid[j * n + i + 1];
        const v01 = grid[(j + 1) * n + i];
        const v11 = grid[(j + 1) * n + i + 1];
        const idx =
          (v00 > level ? 1 : 0) |
          (v10 > level ? 2 : 0) |
          (v11 > level ? 4 : 0) |
          (v01 > level ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        const lerp = (a: number, b: number, va: number, vb: number) =>
          a + ((level - va) / (vb - va || 1e-9)) * (b - a);
        const top = { x: lerp(x0, x0 + cell, v00, v10), y: y0 };
        const right = { x: x0 + cell, y: lerp(y0, y0 - cell, v10, v11) };
        const bottom = { x: lerp(x0, x0 + cell, v01, v11), y: y0 - cell };
        const left = { x: x0, y: lerp(y0, y0 - cell, v00, v01) };
        const segs: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
        if (idx === 1 || idx === 14) segs.push({ a: left, b: top });
        else if (idx === 2 || idx === 13) segs.push({ a: top, b: right });
        else if (idx === 4 || idx === 11) segs.push({ a: right, b: bottom });
        else if (idx === 8 || idx === 7) segs.push({ a: bottom, b: left });
        else if (idx === 3 || idx === 12) segs.push({ a: left, b: right });
        else if (idx === 6 || idx === 9) segs.push({ a: top, b: bottom });
        else if (idx === 5) {
          segs.push({ a: left, b: top });
          segs.push({ a: right, b: bottom });
        } else if (idx === 10) {
          segs.push({ a: top, b: right });
          segs.push({ a: bottom, b: left });
        }
        for (const seg of segs) {
          const a = toPx(seg.a.x, seg.a.y);
          const b = toPx(seg.b.x, seg.b.y);
          ctx.moveTo(a.px, a.py);
          ctx.lineTo(b.px, b.py);
        }
      }
    }
    ctx.stroke();
  }
  return canvas;
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cam: Camera,
  stars: Star[],
) {
  const ox = -cam.x * 8;
  const oy = -cam.y * 8;
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    const x = ((s.x * w + ox * s.par) % w + w) % w;
    const y = ((s.y * h + oy * s.par) % h + h) % h;
    ctx.fillStyle = `rgba(236,232,225,${s.a})`;
    ctx.beginPath();
    ctx.arc(x, y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w * 0.5, h * 0.46, h * 0.12, w * 0.5, h * 0.5, h * 0.82);
  g.addColorStop(0, "rgba(8,9,12,0)");
  g.addColorStop(1, "rgba(8,9,12,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function xf(x: number, y: number, theta: number, frame: Frame) {
  if (frame === "rotating" || theta === 0) return { x, y };
  return rotate(x, y, theta);
}

export function drawFrame(opts: {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  cam: Camera;
  mu: number;
  system: SystemDef;
  points: Record<PointId, LagrangePoint>;
  probes: Probe[];
  particles: Particle[];
  stars: Star[];
  fling: FlingState;
  predict: Float32Array | null;
  trails: boolean;
  potential: boolean;
  hills: boolean;
  field: FieldCache | null;
  hill: HTMLCanvasElement | null;
  contours: HTMLCanvasElement | null;
  frame: Frame;
  theta: number;
  selected: PointId | null;
  now: number;
  reduced: boolean;
}) {
  const { ctx, w, h, cam, stars } = opts;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  drawStars(ctx, w, h, cam, stars);

  const { cx, cy } = viewCenter(w, h);
  const camT = xf(cam.x, cam.y, opts.theta, opts.frame);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-camT.x, -camT.y);

  if (opts.potential && opts.field) {
    ctx.save();
    if (opts.frame === "inertial") ctx.rotate(opts.theta);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(
      opts.field.canvas,
      -FIELD_EXTENT,
      -FIELD_EXTENT,
      FIELD_EXTENT * 2,
      FIELD_EXTENT * 2,
    );
    ctx.restore();
  }

  if (opts.hills && opts.hill) {
    ctx.save();
    if (opts.frame === "inertial") ctx.rotate(opts.theta);
    ctx.globalAlpha = 0.55;
    ctx.drawImage(opts.hill, -FIELD_EXTENT, -FIELD_EXTENT, FIELD_EXTENT * 2, FIELD_EXTENT * 2);
    ctx.restore();
  }

  if (opts.contours) {
    ctx.save();
    if (opts.frame === "inertial") ctx.rotate(opts.theta);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(
      opts.contours,
      -FIELD_EXTENT,
      -FIELD_EXTENT,
      FIELD_EXTENT * 2,
      FIELD_EXTENT * 2,
    );
    ctx.restore();
  }

  drawGeometry(ctx, opts);
  if (opts.trails) drawTrails(ctx, opts.probes, opts.frame, opts.theta, cam.zoom);
  if (opts.predict) drawPredict(ctx, opts.predict, opts.frame, opts.theta);
  drawBodies(ctx, opts);
  drawPoints(ctx, opts);
  drawProbes(ctx, opts);
  drawParticles(ctx, opts.particles, opts.frame, opts.theta);
  if (opts.fling.active) drawFling(ctx, opts.fling, opts.frame, opts.theta);

  ctx.restore();
  drawVignette(ctx, w, h);
  drawPointLabels(ctx, opts);
  drawCraftLabels(ctx, opts);
}

function drawGeometry(
  ctx: CanvasRenderingContext2D,
  opts: {
    mu: number;
    points: Record<PointId, LagrangePoint>;
    frame: Frame;
    theta: number;
    cam: Camera;
  },
) {
  const p = xf(-opts.mu, 0, opts.theta, opts.frame);
  const s = xf(1 - opts.mu, 0, opts.theta, opts.frame);
  const l4 = xf(opts.points.L4.x, opts.points.L4.y, opts.theta, opts.frame);
  const l5 = xf(opts.points.L5.x, opts.points.L5.y, opts.theta, opts.frame);
  const lw = 1 / opts.cam.zoom;

  ctx.strokeStyle = STEEL_DIM;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(s.x, s.y);
  ctx.stroke();

  ctx.setLineDash([4 * lw, 5 * lw]);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(l4.x, l4.y);
  ctx.lineTo(s.x, s.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(l5.x, l5.y);
  ctx.lineTo(s.x, s.y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(236,232,225,0.35)";
  ctx.beginPath();
  ctx.arc(0, 0, 3 * lw, 0, Math.PI * 2);
  ctx.fill();
}

function drawBodies(
  ctx: CanvasRenderingContext2D,
  opts: {
    mu: number;
    system: SystemDef;
    frame: Frame;
    theta: number;
    cam: Camera;
  },
) {
  const p0 = xf(-opts.mu, 0, opts.theta, opts.frame);
  const s0 = xf(1 - opts.mu, 0, opts.theta, opts.frame);
  disc(ctx, p0.x, p0.y, opts.system.primaryR, opts.system.primaryFill, opts.system.primaryGlow);
  disc(
    ctx,
    s0.x,
    s0.y,
    opts.system.secondaryR,
    opts.system.secondaryFill,
    opts.system.secondaryGlow,
  );
}

function disc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  glow: string,
) {
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const g = ctx.createRadialGradient(x - r * 0.28, y - r * 0.32, r * 0.08, x, y, r);
  g.addColorStop(0, glow);
  g.addColorStop(0.55, fill);
  g.addColorStop(1, "#0b0c10");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawPoints(
  ctx: CanvasRenderingContext2D,
  opts: {
    points: Record<PointId, LagrangePoint>;
    selected: PointId | null;
    frame: Frame;
    theta: number;
    cam: Camera;
    now: number;
    reduced: boolean;
  },
) {
  const lw = 1.2 / opts.cam.zoom;
  const ids: PointId[] = ["L1", "L2", "L3", "L4", "L5"];
  for (const id of ids) {
    const pt = opts.points[id];
    const p = xf(pt.x, pt.y, opts.theta, opts.frame);
    const selected = opts.selected === id;
    const pulse = selected && !opts.reduced ? 1 + 0.08 * Math.sin(opts.now * 0.004) : 1;
    const s = (selected ? 9 : 7) * pulse * lw;
    ctx.strokeStyle = pt.stable ? PAPER : STEEL;
    ctx.lineWidth = lw;
    ctx.globalAlpha = selected ? 1 : 0.8;
    ctx.beginPath();
    ctx.moveTo(p.x - s, p.y);
    ctx.lineTo(p.x + s, p.y);
    ctx.moveTo(p.x, p.y - s);
    ctx.lineTo(p.x, p.y + s);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, s * 1.35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawPointLabels(
  ctx: CanvasRenderingContext2D,
  opts: {
    w: number;
    h: number;
    cam: Camera;
    points: Record<PointId, LagrangePoint>;
    selected: PointId | null;
    frame: Frame;
    theta: number;
    system: SystemDef;
    mu: number;
  },
) {
  const camT: Camera = {
    ...opts.cam,
    ...xf(opts.cam.x, opts.cam.y, opts.theta, opts.frame),
  };
  const ids: PointId[] = ["L1", "L2", "L3", "L4", "L5"];
  ctx.font = "500 11px 'IBM Plex Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (const id of ids) {
    const pt = opts.points[id];
    const p = xf(pt.x, pt.y, opts.theta, opts.frame);
    const s = worldToScreen(p.x, p.y, camT, opts.w, opts.h);
    const dy = id === "L2" ? 22 : id === "L1" ? -14 : -12;
    ctx.fillStyle = opts.selected === id ? PAPER : PAPER_DIM;
    ctx.fillText(id, s.x, s.y + dy);
  }
  const prim = xf(-opts.mu, 0, opts.theta, opts.frame);
  const sec = xf(1 - opts.mu, 0, opts.theta, opts.frame);
  const ps = worldToScreen(prim.x, prim.y, camT, opts.w, opts.h);
  const ss = worldToScreen(sec.x, sec.y, camT, opts.w, opts.h);
  ctx.fillStyle = PAPER_DIM;
  ctx.font = "500 10px 'IBM Plex Sans', sans-serif";
  ctx.fillText(opts.system.primary, ps.x, ps.y + opts.system.primaryR * opts.cam.zoom + 16);
  ctx.fillText(
    opts.system.secondary,
    ss.x,
    ss.y + opts.system.secondaryR * opts.cam.zoom + 16,
  );
}

function drawTrails(
  ctx: CanvasRenderingContext2D,
  probes: Probe[],
  frame: Frame,
  theta: number,
  zoom: number,
) {
  ctx.lineWidth = 1.1 / zoom;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let i = 0; i < probes.length; i++) {
    const pr = probes[i];
    if (pr.trailCount < 2) continue;
    const cap = pr.trail.length / 2;
    const n = pr.trailCount;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const idx = (pr.trailHead - n + k + cap * 8) % cap;
      const wx = pr.trail[idx * 2];
      const wy = pr.trail[idx * 2 + 1];
      const p = xf(wx, wy, theta, frame);
      if (k === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = "rgba(236,232,225,0.38)";
    ctx.stroke();
  }
}

function drawProbes(
  ctx: CanvasRenderingContext2D,
  opts: { probes: Probe[]; frame: Frame; theta: number; cam: Camera },
) {
  const r = 3.2 / opts.cam.zoom;
  for (let i = 0; i < opts.probes.length; i++) {
    const pr = opts.probes[i];
    const p = xf(pr.x, pr.y, opts.theta, opts.frame);
    const craft = Boolean(pr.label);
    const rad = r * (craft ? 1.35 : 1) * (1 + pr.flash * 0.8);
    ctx.fillStyle = PAPER;
    ctx.globalAlpha = 0.95;
    if (craft) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawCraftLabels(
  ctx: CanvasRenderingContext2D,
  opts: {
    w: number;
    h: number;
    cam: Camera;
    probes: Probe[];
    frame: Frame;
    theta: number;
  },
) {
  const camT: Camera = {
    ...opts.cam,
    ...xf(opts.cam.x, opts.cam.y, opts.theta, opts.frame),
  };
  ctx.font = "500 11px 'IBM Plex Sans', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (let i = 0; i < opts.probes.length; i++) {
    const pr = opts.probes[i];
    if (!pr.label) continue;
    const p = xf(pr.x, pr.y, opts.theta, opts.frame);
    const s = worldToScreen(p.x, p.y, camT, opts.w, opts.h);
    ctx.fillStyle = PAPER;
    ctx.fillText(pr.label, s.x + 10, s.y - 1);
  }
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  frame: Frame,
  theta: number,
) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const q = xf(p.x, p.y, theta, frame);
    ctx.globalAlpha = Math.max(0, p.life) * 0.7;
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(q.x, q.y, 0.01 * p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPredict(
  ctx: CanvasRenderingContext2D,
  path: Float32Array,
  frame: Frame,
  theta: number,
) {
  if (path.length < 4) return;
  ctx.setLineDash([0.03, 0.04]);
  ctx.strokeStyle = "rgba(185,196,204,0.7)";
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  for (let i = 0; i < path.length; i += 2) {
    const p = xf(path[i], path[i + 1], theta, frame);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawFling(
  ctx: CanvasRenderingContext2D,
  fling: FlingState,
  frame: Frame,
  theta: number,
) {
  const a = xf(fling.x0, fling.y0, theta, frame);
  const b = xf(fling.x1, fling.y1, theta, frame);
  ctx.strokeStyle = PAPER_DIM;
  ctx.lineWidth = 0.01;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(a.x, a.y, 0.012, 0, Math.PI * 2);
  ctx.fill();
}
