import * as THREE from "three";
import type { BodyId } from "./bodies";

const cache = new Map<string, THREE.Texture>();

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, oct = 4): number {
  let n = 0;
  let a = 0.5;
  let f = 1;
  let s = 0;
  for (let i = 0; i < oct; i++) {
    n += a * valueNoise(x * f, y * f);
    s += a;
    a *= 0.5;
    f *= 2;
  }
  return n / s;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((e1 - e0 === 0 ? 0 : (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix3(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

type RGB = [number, number, number];

function toTexture(canvas: HTMLCanvasElement, wrapS: THREE.Wrapping = THREE.RepeatWrapping): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = wrapS;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function paint(
  w: number,
  h: number,
  fn: (u: number, v: number) => RGB,
  alphaFn?: (u: number, v: number) => number,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const [r, g, b] = fn(u, v);
      const i = (y * w + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = alphaFn ? Math.round(clamp01(alphaFn(u, v)) * 255) : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas);
}

function blob(u: number, v: number, cx: number, cy: number, sx: number, sy: number): number {
  const dx = (u - cx) / sx;
  const dy = (v - cy) / sy;
  return Math.exp(-(dx * dx + dy * dy));
}

function mercury(u: number, v: number): RGB {
  const n = fbm(u * 14, v * 8, 5);
  const crater = Math.pow(Math.max(0, 0.58 - fbm(u * 28, v * 16, 3)), 2);
  const c = 78 + n * 95 - crater * 55;
  const warm = n * 18;
  return [c + warm, c + 4, c - 6];
}

function venus(u: number, v: number): RGB {
  const warp = fbm(u * 3, v * 2, 3);
  const n = fbm(u * 6 + warp * 2.2, v * 10, 4);
  const swirl = fbm(u * 10 + n, v * 14, 3);
  const cream: RGB = [214, 196, 158];
  const dust: RGB = [176, 142, 96];
  const cloud: RGB = [236, 224, 198];
  return mix3(mix3(dust, cream, n), cloud, smoothstep(0.45, 0.8, swirl));
}

function earthLand(u: number, v: number, n: number): number {
  return (
    n * 0.62 +
    blob(u, v, 0.18, 0.48, 0.09, 0.16) * 0.55 +
    blob(u, v, 0.52, 0.5, 0.11, 0.2) * 0.7 +
    blob(u, v, 0.58, 0.68, 0.08, 0.1) * 0.45 +
    blob(u, v, 0.82, 0.42, 0.1, 0.14) * 0.5 +
    blob(u, v, 0.88, 0.62, 0.07, 0.08) * 0.35
  );
}

function earth(u: number, v: number): RGB {
  const lat = v * 2 - 1;
  const warp = fbm(u * 4, v * 3, 3);
  const n = fbm(u * 7 + warp * 1.4, v * 10, 5);
  const landMask = earthLand(u, v, n);
  const land = landMask > 0.58;
  const ice = smoothstep(0.68, 0.88, Math.abs(lat));
  const oceanDeep: RGB = [10, 38, 86];
  const ocean: RGB = [24, 86, 152];
  const coast: RGB = [28, 110, 132];
  const grass: RGB = [58, 108, 56];
  const dirt: RGB = [118, 96, 58];
  const polar: RGB = [236, 241, 246];
  let col: RGB;
  if (land) {
    col = mix3(grass, dirt, smoothstep(0.58, 0.78, n));
  } else {
    col = mix3(oceanDeep, ocean, n);
    if (landMask > 0.5) col = mix3(col, coast, 0.45);
  }
  return mix3(col, polar, ice);
}

function earthNight(u: number, v: number): RGB {
  const warp = fbm(u * 4, v * 3, 3);
  const n = fbm(u * 7 + warp * 1.4, v * 10, 5);
  if (earthLand(u, v, n) <= 0.58) return [0, 0, 0];
  const ice = smoothstep(0.68, 0.88, Math.abs(v * 2 - 1));
  if (ice > 0.55) return [0, 0, 0];
  const grid = hash2(Math.floor(u * 90), Math.floor(v * 48));
  const speckle = hash2(u * 180, v * 96);
  const city = grid > 0.72 ? Math.pow(speckle, 6) : 0;
  const g = city * 255;
  return [g, g * 0.72, g * 0.32];
}

function mars(u: number, v: number): RGB {
  const lat = v * 2 - 1;
  const n = fbm(u * 10, v * 8, 5);
  const dark = fbm(u * 18, v * 12, 3);
  const rust: RGB = [168, 78, 48];
  const dust: RGB = [198, 118, 72];
  const basalt: RGB = [92, 48, 36];
  const ice: RGB = [232, 228, 220];
  let col = mix3(rust, dust, n);
  col = mix3(col, basalt, smoothstep(0.62, 0.85, dark));
  const cap = smoothstep(0.72, 0.9, Math.abs(lat));
  return mix3(col, ice, cap);
}

function banded(u: number, v: number, palette: RGB[], freq: number, warpAmt: number): RGB {
  const warp = fbm(u * 3, v * 2, 3) * warpAmt;
  const y = v * freq + warp;
  const t = (Math.sin(y * Math.PI * 2) * 0.5 + 0.5) * (palette.length - 1);
  const i = Math.floor(t);
  const f = t - i;
  const a = palette[Math.min(i, palette.length - 1)]!;
  const b = palette[Math.min(i + 1, palette.length - 1)]!;
  const storm = fbm(u * 12, v * 10, 3);
  return mix3(mix3(a, b, f), a, storm * 0.18);
}

function jupiter(u: number, v: number): RGB {
  const palette: RGB[] = [
    [196, 148, 96],
    [232, 210, 170],
    [176, 116, 70],
    [240, 220, 186],
    [164, 96, 62],
    [214, 176, 122],
  ];
  let col = banded(u, v, palette, 7.5, 1.4);
  const dx = (u - 0.34) / 0.07;
  const dy = (v - 0.6) / 0.045;
  const spot = Math.exp(-(dx * dx + dy * dy));
  const red: RGB = [176, 64, 42];
  return mix3(col, red, spot * 0.85);
}

function saturn(u: number, v: number): RGB {
  const palette: RGB[] = [
    [214, 186, 132],
    [236, 216, 168],
    [198, 166, 112],
    [242, 226, 186],
    [186, 154, 104],
  ];
  return banded(u, v, palette, 6.2, 0.7);
}

function uranus(u: number, v: number): RGB {
  const n = fbm(u * 6, v * 8, 3);
  const band = 0.5 + 0.5 * Math.sin(v * Math.PI * 8 + n);
  const a: RGB = [142, 204, 210];
  const b: RGB = [176, 224, 226];
  const c: RGB = [118, 186, 196];
  return mix3(mix3(a, b, n), c, band * 0.25);
}

function neptune(u: number, v: number): RGB {
  const n = fbm(u * 7, v * 8, 4);
  const deep: RGB = [28, 70, 156];
  const mid: RGB = [52, 108, 196];
  const haze: RGB = [96, 150, 220];
  let col = mix3(deep, mid, n);
  col = mix3(col, haze, fbm(u * 4, v * 3, 3) * 0.35);
  const dx = (u - 0.62) / 0.08;
  const dy = (v - 0.42) / 0.05;
  const spot = Math.exp(-(dx * dx + dy * dy));
  const dark: RGB = [16, 40, 92];
  return mix3(col, dark, spot * 0.7);
}

const painters: Record<Exclude<BodyId, "sun">, (u: number, v: number) => RGB> = {
  mercury,
  venus,
  earth,
  mars,
  jupiter,
  saturn,
  uranus,
  neptune,
};

export function planetTexture(id: Exclude<BodyId, "sun">): THREE.Texture {
  const hit = cache.get(id);
  if (hit) return hit;
  const hiRes = id === "earth" || id === "jupiter" || id === "saturn";
  const tex = paint(hiRes ? 512 : 384, hiRes ? 256 : 192, painters[id]);
  cache.set(id, tex);
  return tex;
}

export function nightTexture(): THREE.Texture {
  const hit = cache.get("earth-night");
  if (hit) return hit;
  const tex = paint(512, 256, earthNight);
  cache.set("earth-night", tex);
  return tex;
}

export function cloudTexture(): THREE.Texture {
  const hit = cache.get("clouds");
  if (hit) return hit;
  const tex = paint(
    512,
    256,
    () => [244, 248, 252],
    (u, v) => {
      const n = fbm(u * 8, v * 12, 5);
      return Math.max(0, (n - 0.5) * 2.1);
    },
  );
  cache.set("clouds", tex);
  return tex;
}

export function ringTexture(kind: "gold" | "ice"): THREE.Texture {
  const key = `ring-${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = 1024;
  const h = 48;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let x = 0; x < w; x++) {
    const u = x / w;
    let a = 0;
    if (u > 0.04 && u < 0.98) {
      const bands = 0.45 + 0.55 * Math.abs(Math.sin(u * 70 + fbm(u * 20, 0.2, 3) * 4));
      a = 0.12 + bands * (kind === "gold" ? 0.55 : 0.28);
      if (kind === "gold" && u > 0.46 && u < 0.53) a *= 0.12;
    }
    const rgb: RGB = kind === "gold" ? [214, 192, 148] : [190, 210, 220];
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      d[i] = rgb[0];
      d[i + 1] = rgb[1];
      d[i + 2] = rgb[2];
      d[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = toTexture(canvas, THREE.ClampToEdgeWrapping);
  cache.set(key, tex);
  return tex;
}

export function glowTexture(): THREE.Texture {
  const hit = cache.get("glow");
  if (hit) return hit;
  const s = 256;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255, 228, 160, 0.95)");
  g.addColorStop(0.16, "rgba(255, 176, 70, 0.42)");
  g.addColorStop(0.4, "rgba(255, 120, 36, 0.1)");
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set("glow", tex);
  return tex;
}
