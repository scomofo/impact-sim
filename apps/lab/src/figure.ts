import type { PlotState, ContourField } from "@orbital-suite/astrolab";

const COLORS = ["#4f8ef7", "#e8734a", "#e8c170", "#8a5cf5", "#3fbf8f", "#e35d8f", "#c9a06a"];

interface Style { color: string; dashed: boolean; dotted: boolean; marker: string | null; line: boolean }

/** Parse a MATLAB line spec such as 'r--', 'ko', 'b-', ':' */
function parseStyle(spec: string, index: number): Style {
  const s: Style = { color: COLORS[index % COLORS.length]!, dashed: false, dotted: false, marker: null, line: true };
  const colors: Record<string, string> = { r: "#e35d5d", g: "#3fbf8f", b: "#4f8ef7", k: "#ebe8e1", m: "#c95df0", c: "#4fd1e0", y: "#e8c170", w: "#ffffff" };
  let hasLineToken = false;
  for (const ch of spec) if ("-:".includes(ch)) hasLineToken = true;
  for (let i = 0; i < spec.length; i++) {
    const ch = spec[i]!;
    if (colors[ch]) s.color = colors[ch]!;
    else if (ch === "-" && spec[i + 1] === "-") { s.dashed = true; i++; }
    else if (ch === "-" && spec[i + 1] === ".") { s.dashed = true; s.dotted = true; i++; }
    else if (ch === ":") s.dotted = true;
    else if ("o+*.xsd^v".includes(ch)) s.marker = ch;
  }
  if (s.marker && !hasLineToken) s.line = false;
  return s;
}

type Scale = "linear" | "semilogy" | "semilogx" | "loglog";

export function drawFigure(canvas: HTMLCanvasElement, state: PlotState & { scale?: string }): void {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  if (state.series.length === 0 && !state.contour) return;

  const scale = (state.scale ?? "linear") as Scale;
  const logX = scale === "semilogx" || scale === "loglog";
  const logY = scale === "semilogy" || scale === "loglog";
  const tx = (x: number) => (logX ? Math.log10(x) : x);
  const ty = (y: number) => (logY ? Math.log10(y) : y);

  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const s of state.series) {
    for (let i = 0; i < s.x.length; i++) {
      const x = tx(s.x[i]!), y = ty(s.y[i]!);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
    }
  }
  if (state.contour) {
    const c = state.contour;
    xmin = Math.min(xmin, ...c.x); xmax = Math.max(xmax, ...c.x);
    ymin = Math.min(ymin, ...c.y); ymax = Math.max(ymax, ...c.y);
  }
  if (!Number.isFinite(xmin) || !Number.isFinite(ymin)) return;
  if (xmax === xmin) { xmin -= 1; xmax += 1; }
  if (ymax === ymin) { ymin -= 1; ymax += 1; }
  const padX = state.contour && state.series.length === 0 ? 0 : (xmax - xmin) * 0.05;
  const padY = state.contour && state.series.length === 0 ? 0 : (ymax - ymin) * 0.06;
  xmin -= padX; xmax += padX; ymin -= padY; ymax += padY;

  const margin = { left: 58, right: 16, top: state.title ? 32 : 16, bottom: state.xlabel ? 44 : 30 };
  let pw = rect.width - margin.left - margin.right;
  let ph = rect.height - margin.top - margin.bottom;
  if (state.equal && !logX && !logY) {
    const sx = pw / (xmax - xmin), sy = ph / (ymax - ymin);
    const s = Math.min(sx, sy);
    const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
    xmin = cx - pw / (2 * s); xmax = cx + pw / (2 * s);
    ymin = cy - ph / (2 * s); ymax = cy + ph / (2 * s);
  }
  const X = (x: number) => margin.left + ((x - xmin) / (xmax - xmin)) * pw;
  const Y = (y: number) => margin.top + ph - ((y - ymin) / (ymax - ymin)) * ph;

  const muted = "#8f8b85", grid = "rgba(235,232,225,0.08)", axis = "rgba(235,232,225,0.35)";
  ctx.font = "11px 'IBM Plex Mono', monospace";
  ctx.fillStyle = muted;

  const ticks = (lo: number, hi: number, n = 6): number[] => {
    const span = hi - lo;
    const raw = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9 * span; v += step) out.push(Number(v.toFixed(12)));
    return out;
  };
  const fmt = (v: number, log: boolean): string => {
    if (log) return `1e${v}`;
    if (v === 0) return "0";
    const a = Math.abs(v);
    if (a >= 1e5 || a < 1e-3) return v.toExponential(1);
    return String(Number(v.toPrecision(4)));
  };

  ctx.strokeStyle = grid; ctx.lineWidth = 1;
  for (const v of ticks(xmin, xmax)) {
    const px = X(v);
    if (state.grid) { ctx.beginPath(); ctx.moveTo(px, margin.top); ctx.lineTo(px, margin.top + ph); ctx.stroke(); }
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(fmt(v, logX), px, margin.top + ph + 6);
  }
  for (const v of ticks(ymin, ymax, 5)) {
    const py = Y(v);
    if (state.grid) { ctx.beginPath(); ctx.moveTo(margin.left, py); ctx.lineTo(margin.left + pw, py); ctx.stroke(); }
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(fmt(v, logY), margin.left - 8, py);
  }
  ctx.strokeStyle = axis;
  ctx.strokeRect(margin.left, margin.top, pw, ph);

  ctx.save();
  ctx.beginPath(); ctx.rect(margin.left, margin.top, pw, ph); ctx.clip();
  if (state.contour) drawContour(ctx, state.contour, X, Y, tx, ty);
  state.series.forEach((s, i) => {
    const st = parseStyle(s.style, i);
    ctx.strokeStyle = st.color; ctx.fillStyle = st.color; ctx.lineWidth = 1.6;
    ctx.setLineDash(st.dashed && st.dotted ? [8, 3, 2, 3] : st.dashed ? [8, 5] : st.dotted ? [2, 4] : []);
    if (st.line) {
      ctx.beginPath();
      let pen = false;
      for (let k = 0; k < s.x.length; k++) {
        const x = tx(s.x[k]!), y = ty(s.y[k]!);
        if (!Number.isFinite(x) || !Number.isFinite(y)) { pen = false; continue; }
        if (pen) ctx.lineTo(X(x), Y(y)); else { ctx.moveTo(X(x), Y(y)); pen = true; }
      }
      ctx.stroke();
    }
    if (st.marker) {
      ctx.setLineDash([]);
      for (let k = 0; k < s.x.length; k++) {
        const x = tx(s.x[k]!), y = ty(s.y[k]!);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const px = X(x), py = Y(y);
        ctx.beginPath();
        switch (st.marker) {
          case "o": ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.stroke(); break;
          case ".": ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill(); break;
          case "+": ctx.moveTo(px - 4, py); ctx.lineTo(px + 4, py); ctx.moveTo(px, py - 4); ctx.lineTo(px, py + 4); ctx.stroke(); break;
          case "x": ctx.moveTo(px - 3, py - 3); ctx.lineTo(px + 3, py + 3); ctx.moveTo(px + 3, py - 3); ctx.lineTo(px - 3, py + 3); ctx.stroke(); break;
          case "s": ctx.strokeRect(px - 3, py - 3, 6, 6); break;
          default: ctx.moveTo(px, py - 4); ctx.lineTo(px + 4, py + 3); ctx.lineTo(px - 4, py + 3); ctx.closePath(); ctx.stroke();
        }
      }
    }
  });
  ctx.restore();
  ctx.setLineDash([]);

  ctx.fillStyle = "#ebe8e1";
  if (state.title) { ctx.font = "500 13px 'IBM Plex Sans', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(state.title, margin.left + pw / 2, 8); }
  ctx.fillStyle = muted; ctx.font = "11px 'IBM Plex Sans', sans-serif";
  if (state.xlabel) { ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(state.xlabel, margin.left + pw / 2, rect.height - 6); }
  if (state.ylabel) { ctx.save(); ctx.translate(12, margin.top + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(state.ylabel, 0, 0); ctx.restore(); }

  if (state.legend && state.legend.length) {
    ctx.font = "11px 'IBM Plex Mono', monospace";
    const w = Math.max(...state.legend.map((l) => ctx.measureText(l).width)) + 34;
    const h = state.legend.length * 16 + 8;
    const lx = margin.left + pw - w - 8, ly = margin.top + 8;
    ctx.fillStyle = "rgba(10,12,16,0.85)"; ctx.fillRect(lx, ly, w, h);
    ctx.strokeStyle = axis; ctx.strokeRect(lx, ly, w, h);
    state.legend.forEach((label, i) => {
      const st = parseStyle(state.series[i]?.style ?? "", i);
      ctx.strokeStyle = st.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(lx + 8, ly + 12 + i * 16); ctx.lineTo(lx + 24, ly + 12 + i * 16); ctx.stroke();
      ctx.fillStyle = "#ebe8e1"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(label, lx + 30, ly + 12 + i * 16);
    });
  }
}

/** Viridis-like colour ramp for filled contours / heatmaps. */
function ramp(t: number): string {
  const stops: [number, number, number][] = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
  const u = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(u));
  const f = u - i;
  const a = stops[i]!, b = stops[i + 1]!;
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)}, ${Math.round(a[1] + (b[1] - a[1]) * f)}, ${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}

/** Filled cells plus marching-squares iso-lines. `z[row][col]` over (x[col], y[row]). */
function drawContour(
  ctx: CanvasRenderingContext2D,
  c: ContourField,
  X: (x: number) => number,
  Y: (y: number) => number,
  tx: (x: number) => number,
  ty: (y: number) => number,
): void {
  const rows = c.y.length, cols = c.x.length;
  const finite = c.z.flat().filter((v) => Number.isFinite(v));
  if (finite.length === 0) return;
  const zmin = Math.min(...finite), zmax = Math.max(...finite);
  const levels = c.levels.length ? c.levels : [zmin, zmax];
  const lo = Math.min(zmin, levels[0]!), hi = Math.max(zmax, levels[levels.length - 1]!);

  if (c.filled) {
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const v = c.z[i]![j]!;
        if (!Number.isFinite(v)) continue;
        // Quantise to the level bands so filled contours look like contourf, not a heatmap.
        let band = 0;
        while (band < levels.length && v >= levels[band]!) band++;
        const x0 = j === 0 ? c.x[0]! : (c.x[j - 1]! + c.x[j]!) / 2;
        const x1 = j === cols - 1 ? c.x[cols - 1]! : (c.x[j]! + c.x[j + 1]!) / 2;
        const y0 = i === 0 ? c.y[0]! : (c.y[i - 1]! + c.y[i]!) / 2;
        const y1 = i === rows - 1 ? c.y[rows - 1]! : (c.y[i]! + c.y[i + 1]!) / 2;
        ctx.fillStyle = ramp(band / levels.length);
        const px0 = X(tx(x0)), px1 = X(tx(x1)), py0 = Y(ty(y0)), py1 = Y(ty(y1));
        ctx.fillRect(Math.min(px0, px1), Math.min(py0, py1), Math.abs(px1 - px0) + 0.6, Math.abs(py1 - py0) + 0.6);
      }
    }
  }

  ctx.lineWidth = c.filled ? 0.9 : 1.4;
  ctx.setLineDash([]);
  levels.forEach((level, li) => {
    ctx.strokeStyle = c.filled ? "rgba(10,12,16,0.55)" : ramp((level - lo) / Math.max(1e-300, hi - lo));
    ctx.beginPath();
    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const z00 = c.z[i]![j]!, z01 = c.z[i]![j + 1]!, z10 = c.z[i + 1]![j]!, z11 = c.z[i + 1]![j + 1]!;
        if (![z00, z01, z10, z11].every(Number.isFinite)) continue;
        const idx = (z00 >= level ? 8 : 0) | (z01 >= level ? 4 : 0) | (z11 >= level ? 2 : 0) | (z10 >= level ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const xa = c.x[j]!, xb = c.x[j + 1]!, ya = c.y[i]!, yb = c.y[i + 1]!;
        const lerp = (p: number, q: number, zp: number, zq: number) => p + ((level - zp) / (zq - zp)) * (q - p);
        // Edge midpoints: top (between 00-01), right (01-11), bottom (10-11), left (00-10).
        const top: [number, number] = [lerp(xa, xb, z00, z01), ya];
        const right: [number, number] = [xb, lerp(ya, yb, z01, z11)];
        const bottom: [number, number] = [lerp(xa, xb, z10, z11), yb];
        const left: [number, number] = [xa, lerp(ya, yb, z00, z10)];
        const segs: [[number, number], [number, number]][] = [];
        switch (idx) {
          case 1: case 14: segs.push([left, bottom]); break;
          case 2: case 13: segs.push([bottom, right]); break;
          case 3: case 12: segs.push([left, right]); break;
          case 4: case 11: segs.push([top, right]); break;
          case 5: segs.push([top, left], [bottom, right]); break;
          case 6: case 9: segs.push([top, bottom]); break;
          case 7: case 8: segs.push([top, left]); break;
          case 10: segs.push([top, right], [left, bottom]); break;
        }
        for (const [p, q] of segs) {
          ctx.moveTo(X(tx(p[0])), Y(ty(p[1])));
          ctx.lineTo(X(tx(q[0])), Y(ty(q[1])));
        }
      }
    }
    ctx.stroke();
    void li;
  });
}
