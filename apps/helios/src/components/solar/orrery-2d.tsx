import { useEffect, useRef } from "react";
import {
  BODIES,
  PLANETS,
  bodyPosition,
  getBody,
  orbitPoints,
  type Body,
} from "@/lib/solar/bodies";
import { nbody, auToVisualRadius } from "@/lib/solar/nbody";
import {
  ASTEROIDS,
  GALILEAN,
  KIRKWOOD,
  NAMED_RESONANCES,
  asteroidPos,
  lonOf,
  plutoPos,
  wrapPi,
} from "@/lib/solar/resonance";
import { DAYS_PER_SECOND, sim } from "@/lib/solar/sim";
import { useHelios } from "@/lib/solar/store";

type Vec = { x: number; y: number; z: number };

const _pos: Vec = { x: 0, y: 0, z: 0 };
const _ast: Vec = { x: 0, y: 0, z: 0 };
const _pl: Vec = { x: 0, y: 0, z: 0 };
const _b: Vec = { x: 0, y: 0, z: 0 };
const ORBIT_CACHE = PLANETS.map((body) => ({
  body,
  pts: orbitPoints(body, 180),
}));

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function shade(hex: string, amt: number): string {
  const n = hex.replace("#", "");
  const r = clamp(parseInt(n.slice(0, 2), 16) + amt, 0, 255);
  const g = clamp(parseInt(n.slice(2, 4), 16) + amt, 0, 255);
  const b = clamp(parseInt(n.slice(4, 6), 16) + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}

export function Orrery2D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const el = canvas;
    const ctx = el.getContext("2d", { alpha: false });
    if (!ctx) return;
    const g = ctx;

    const cam = {
      yaw: 0.55,
      pitch: 0.42,
      dist: 118,
      targetDist: 118,
      look: { x: 0, y: 0, z: 0 },
      lookTo: { x: 0, y: 0, z: 0 },
    };
    const drag = { on: false, x: 0, y: 0, moved: false };
    let raf = 0;
    let last = performance.now();
    let w = 0;
    let h = 0;
    let dpr = 1;

    const stars = Array.from({ length: 160 }, (_, i) => ({
      x: (Math.sin(i * 12.9898) * 43758.5453) % 1,
      y: (Math.sin(i * 78.233) * 24634.634) % 1,
      r: 0.4 + ((i * 13) % 7) * 0.18,
      a: 0.25 + ((i * 9) % 5) * 0.08,
    }));

    const projected: { body: Body; sx: number; sy: number; z: number; r: number }[] = [];

    function resize() {
      const rect = el.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      el.width = Math.floor(w * dpr);
      el.height = Math.floor(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function project(p: Vec) {
      const lx = p.x - cam.look.x;
      const ly = p.y - cam.look.y;
      const lz = p.z - cam.look.z;
      const cy = Math.cos(cam.yaw);
      const sy = Math.sin(cam.yaw);
      const cp = Math.cos(cam.pitch);
      const sp = Math.sin(cam.pitch);
      const x1 = lx * cy - lz * sy;
      const z1 = lx * sy + lz * cy;
      const y2 = ly * cp - z1 * sp;
      const z2 = ly * sp + z1 * cp;
      const depth = z2 + cam.dist;
      const fl = 520;
      const s = fl / Math.max(24, depth);
      return { sx: w / 2 + x1 * s, sy: h / 2 - y2 * s, z: depth, s };
    }

    function screenRadius(body: Body, scale: number) {
      const min = body.id === "sun" ? 16 : 7;
      return Math.max(min, body.radius * scale * 0.9);
    }

    function drawGlobe(
      x: number,
      y: number,
      r: number,
      color: string,
      lightX: number,
      lightY: number,
      isSun: boolean,
    ) {
      const dx = lightX - x;
      const dy = lightY - y;
      const len = Math.hypot(dx, dy) || 1;
      const hx = x - (dx / len) * r * 0.38;
      const hy = y - (dy / len) * r * 0.38;
      if (isSun) {
        const glow = ctx!.createRadialGradient(x, y, r * 0.2, x, y, r * 3.2);
        glow.addColorStop(0, "rgba(255,200,90,0.55)");
        glow.addColorStop(0.35, "rgba(255,140,40,0.14)");
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx!.fillStyle = glow;
        ctx!.beginPath();
        ctx!.arc(x, y, r * 3.2, 0, Math.PI * 2);
        ctx!.fill();
      }
      const g = ctx!.createRadialGradient(hx, hy, r * 0.08, x, y, r);
      if (isSun) {
        g.addColorStop(0, "#fff4c8");
        g.addColorStop(0.45, "#f3c15b");
        g.addColorStop(1, "#c45a12");
      } else {
        g.addColorStop(0, shade(color, 70));
        g.addColorStop(0.45, color);
        g.addColorStop(1, shade(color, -110));
      }
      ctx!.beginPath();
      ctx!.arc(x, y, r, 0, Math.PI * 2);
      ctx!.fillStyle = g;
      ctx!.fill();
      if (!isSun) {
        ctx!.beginPath();
        ctx!.arc(x, y, r, 0, Math.PI * 2);
        ctx!.strokeStyle = "rgba(255,255,255,0.18)";
        ctx!.lineWidth = 1;
        ctx!.stroke();
      }
    }

    function paint() {
      const { showTrails, showLabels, focusedId, perturbed, resonance } = useHelios.getState();
      ctx!.fillStyle = "#06070b";
      ctx!.fillRect(0, 0, w, h);

      for (const st of stars) {
        ctx!.fillStyle = `rgba(236,236,232,${st.a})`;
        ctx!.beginPath();
        ctx!.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      const sunP = project({ x: 0, y: 0, z: 0 });
      const sunR = screenRadius(BODIES.sun, sunP.s);

      if (showTrails) {
        for (const { body, pts } of ORBIT_CACHE) {
          ctx!.beginPath();
          let started = false;
          for (const [x, y, z] of pts) {
            const p = project({ x, y, z });
            if (p.z < 8) continue;
            if (!started) {
              ctx!.moveTo(p.sx, p.sy);
              started = true;
            } else ctx!.lineTo(p.sx, p.sy);
          }
          ctx!.closePath();
          const focused = body.id === focusedId;
          ctx!.strokeStyle = body.color;
          ctx!.globalAlpha = perturbed ? (focused ? 0.28 : 0.12) : focused ? 0.9 : 0.55;
          ctx!.lineWidth = perturbed ? 1.2 : focused ? 2.4 : 1.6;
          if (perturbed) ctx!.setLineDash([5, 6]);
          ctx!.stroke();
          ctx!.setLineDash([]);
          ctx!.globalAlpha = 1;
        }

        if (perturbed) {
          for (const body of PLANETS) {
            if (body.id === focusedId && cam.dist < 52) continue;
            const trail = nbody.trail(body.id);
            const head = nbody.trailHead(body.id);
            if (!trail.length) continue;
            ctx!.beginPath();
            let started = false;
            const n = trail.length / 3;
            for (let k = 0; k < n; k++) {
              const i = (head + k * 3) % trail.length;
              const x = trail[i]!;
              const y = trail[i + 1]!;
              const z = trail[i + 2]!;
              if (x === 0 && y === 0 && z === 0) {
                started = false;
                continue;
              }
              const p = project({ x, y, z });
              if (p.z < 8) continue;
              if (!started) {
                ctx!.moveTo(p.sx, p.sy);
                started = true;
              } else ctx!.lineTo(p.sx, p.sy);
            }
            ctx!.strokeStyle = body.color;
            ctx!.globalAlpha = body.id === focusedId ? 0.95 : 0.7;
            ctx!.lineWidth = body.id === focusedId ? 2.6 : 1.8;
            ctx!.stroke();
            ctx!.globalAlpha = 1;
          }
        }
      }

      if (resonance) {
        const visPos = (id: (typeof PLANETS)[number]["id"], out: Vec) => {
          if (perturbed) nbody.visualPos(id, out);
          else bodyPosition(getBody(id), sim.time, out);
        };

        for (const g of KIRKWOOD) {
          const vis = auToVisualRadius(g.au);
          ctx!.beginPath();
          let started = false;
          for (let i = 0; i <= 96; i++) {
            const a = (i / 96) * Math.PI * 2;
            const p = project({ x: vis * Math.cos(a), y: 0, z: vis * Math.sin(a) });
            if (p.z < 8) continue;
            if (!started) {
              ctx!.moveTo(p.sx, p.sy);
              started = true;
            } else ctx!.lineTo(p.sx, p.sy);
          }
          ctx!.strokeStyle = "rgba(236,236,232,0.22)";
          ctx!.lineWidth = 1.4;
          ctx!.setLineDash([2, 5]);
          ctx!.stroke();
          ctx!.setLineDash([]);
          const tag = project({ x: vis * 0.22, y: 0, z: vis * 0.98 });
          if (tag.z > 8) {
            ctx!.font = "600 9px 'IBM Plex Sans', system-ui, sans-serif";
            ctx!.fillStyle = "rgba(236,236,232,0.55)";
            ctx!.fillText(g.label, tag.sx + 4, tag.sy);
          }
        }

        for (const ast of ASTEROIDS) {
          asteroidPos(ast, sim.time, _ast);
          const p = project(_ast);
          if (p.z < 8) continue;
          ctx!.fillStyle = "rgba(201,208,218,0.55)";
          ctx!.beginPath();
          ctx!.arc(p.sx, p.sy, 1.05, 0, Math.PI * 2);
          ctx!.fill();
        }

        for (const pair of NAMED_RESONANCES) {
          visPos(pair.inner, _pos);
          visPos(pair.outer, _b);
          const d = Math.abs(wrapPi(lonOf(_pos.x, _pos.z) - lonOf(_b.x, _b.z)));
          if (d < 0.24) {
            const far = project(_b);
            ctx!.beginPath();
            ctx!.moveTo(sunP.sx, sunP.sy);
            ctx!.lineTo(far.sx, far.sy);
            ctx!.strokeStyle = getBody(pair.inner).color;
            ctx!.globalAlpha = 0.45;
            ctx!.lineWidth = 1.5;
            ctx!.stroke();
            ctx!.globalAlpha = 1;
          }
        }

        plutoPos(sim.time, _pl);
      }

      drawGlobe(sunP.sx, sunP.sy, sunR, BODIES.sun.color, sunP.sx - 8, sunP.sy - 8, true);

      projected.length = 0;
      for (const body of PLANETS) {
        if (perturbed) nbody.visualPos(body.id, _pos);
        else bodyPosition(body, sim.time, _pos);
        const p = project(_pos);
        if (p.z < 8) continue;
        const r = screenRadius(body, p.s);
        projected.push({ body, sx: p.sx, sy: p.sy, z: p.z, r });
      }
      projected.sort((a, b) => b.z - a.z);

      for (const item of projected) {
        if (item.body.rings) {
          ctx!.save();
          ctx!.translate(item.sx, item.sy);
          ctx!.rotate(-0.45);
          ctx!.scale(1, 0.38);
          ctx!.beginPath();
          ctx!.arc(0, 0, item.r * 2.05, 0, Math.PI * 2);
          ctx!.strokeStyle = item.body.color;
          ctx!.globalAlpha = 0.55;
          ctx!.lineWidth = item.r * 0.35;
          ctx!.stroke();
          ctx!.globalAlpha = 1;
          ctx!.restore();
        }
        drawGlobe(item.sx, item.sy, item.r, item.body.color, sunP.sx, sunP.sy, false);
        if (item.body.id === "earth") {
          const a = (sim.time / 27.3) * Math.PI * 2;
          ctx!.beginPath();
          ctx!.arc(item.sx + Math.cos(a) * item.r * 2.1, item.sy + Math.sin(a) * item.r * 0.7, Math.max(2.2, item.r * 0.28), 0, Math.PI * 2);
          ctx!.fillStyle = "#c5c1b8";
          ctx!.fill();
        }
        if (item.body.id === "jupiter" && resonance && (focusedId === "jupiter" || cam.dist < 40)) {
          for (const moon of GALILEAN) {
            const ang = (sim.time / moon.days) * Math.PI * 2 + (moon.name === "Ganymede" ? Math.PI : 0);
            const mx = item.sx + Math.cos(ang) * item.r * moon.r;
            const my = item.sy + Math.sin(ang) * item.r * moon.r * 0.55;
            ctx!.beginPath();
            ctx!.arc(mx, my, Math.max(1.8, item.r * 0.16), 0, Math.PI * 2);
            ctx!.fillStyle = moon.color;
            ctx!.fill();
            if (showLabels && focusedId === "jupiter") {
              ctx!.font = "600 9px 'IBM Plex Sans', system-ui, sans-serif";
              ctx!.fillStyle = "#ecece8";
              ctx!.fillText(moon.name.toUpperCase(), mx + 6, my - 2);
            }
          }
          if (focusedId === "jupiter") {
            ctx!.font = "600 10px 'IBM Plex Sans', system-ui, sans-serif";
            ctx!.fillStyle = "rgba(236,236,232,0.7)";
            ctx!.fillText("4 : 2 : 1 LAPLACE", item.sx + item.r + 10, item.sy + item.r + 14);
          }
        }
        if (showLabels && focusedId !== item.body.id) {
          ctx!.font = "600 11px 'IBM Plex Sans', system-ui, sans-serif";
          ctx!.fillStyle = "#ecece8";
          ctx!.fillText(item.body.name.toUpperCase(), item.sx + item.r + 8, item.sy - 2);
        }
      }

      if (showLabels) {
        ctx!.font = "600 11px 'IBM Plex Sans', system-ui, sans-serif";
        ctx!.fillStyle = "#ecece8";
        ctx!.fillText("SUN", sunP.sx + sunR + 10, sunP.sy - 2);
      }

      if (resonance) {
        const pPl = project(_pl);
        if (pPl.z > 8) {
          drawGlobe(pPl.sx, pPl.sy, Math.max(3.2, 0.35 * pPl.s), "#c4b7a2", sunP.sx, sunP.sy, false);
          if (showLabels) {
            ctx!.font = "600 10px 'IBM Plex Sans', system-ui, sans-serif";
            ctx!.fillStyle = "#ecece8";
            ctx!.fillText("PLUTO  3 : 2", pPl.sx + 8, pPl.sy - 2);
          }
        }
        ctx!.font = "600 10px 'IBM Plex Sans', system-ui, sans-serif";
        for (const pair of NAMED_RESONANCES) {
          if (focusedId !== "sun" && focusedId !== pair.inner && focusedId !== pair.outer) continue;
          const inner = projected.find((q) => q.body.id === pair.inner);
          const outer = projected.find((q) => q.body.id === pair.outer);
          if (!inner || !outer) continue;
          const mx = (inner.sx + outer.sx) / 2;
          const my = (inner.sy + outer.sy) / 2;
          ctx!.fillStyle = "rgba(236,236,232,0.82)";
          ctx!.fillText(pair.name, mx + 6, my);
        }
      }
    }

    function tick(now: number) {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const state = useHelios.getState();
      sim.tick(dt, state.speed, state.paused);
      if (state.perturbed) {
        if (!nbody.ready) nbody.reset(sim.time);
        if (!state.paused) nbody.step(dt * state.speed * DAYS_PER_SECOND, nbody.boost);
      } else {
        nbody.ready = false;
      }

      const focus = getBody(state.focusedId);
      if (state.perturbed) nbody.visualPos(focus.id, _pos);
      else bodyPosition(focus, sim.time, _pos);
      cam.lookTo.x = _pos.x;
      cam.lookTo.y = _pos.y;
      cam.lookTo.z = _pos.z;
      cam.targetDist = focus.id === "sun" ? 118 : Math.max(18, focus.focusDistance * 3.4);
      const k = 1 - Math.pow(0.001, dt);
      cam.look.x = lerp(cam.look.x, cam.lookTo.x, k);
      cam.look.y = lerp(cam.look.y, cam.lookTo.y, k);
      cam.look.z = lerp(cam.look.z, cam.lookTo.z, k);
      cam.dist = lerp(cam.dist, cam.targetDist, k);

      paint();
      raf = requestAnimationFrame(tick);
    }

    function pick(clientX: number, clientY: number): Body | typeof BODIES.sun | null {
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const sunP = project({ x: 0, y: 0, z: 0 });
      const sunR = screenRadius(BODIES.sun, sunP.s);
      let best: { body: Body; d: number } | null = null;
      const sunD = Math.hypot(x - sunP.sx, y - sunP.sy);
      if (sunD < sunR + 10) return BODIES.sun;
      for (const item of projected) {
        const d = Math.hypot(x - item.sx, y - item.sy);
        if (d < item.r + 12 && (!best || d < best.d)) best = { body: item.body, d };
      }
      return best?.body ?? null;
    }

    const onPointerDown = (e: PointerEvent) => {
      drag.on = true;
      drag.moved = false;
      drag.x = e.clientX;
      drag.y = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!drag.on) {
        const hit = pick(e.clientX, e.clientY);
        el.style.cursor = hit ? "pointer" : "grab";
        return;
      }
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 3) drag.moved = true;
      cam.yaw -= dx * 0.005;
      cam.pitch = clamp(cam.pitch + dy * 0.004, -0.12, 1.15);
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (drag.on && !drag.moved) {
        const hit = pick(e.clientX, e.clientY);
        if (hit) useHelios.getState().setFocused(hit.id);
      }
      drag.on = false;
      el.style.cursor = "grab";
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.targetDist = clamp(cam.targetDist + e.deltaY * 0.08, 14, 220);
    };

    resize();
    raf = requestAnimationFrame(tick);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 h-full w-full touch-none"
      style={{ display: "block", cursor: "grab", background: "#06070b" }}
      aria-label="Solar system"
    />
  );
}
