import { createConsole, formatValue, RuntimeError, type PlotState, type Value } from "@orbital-suite/astrolab";
import { isMatrix, isScalar, format, numel } from "@orbital-suite/astrolab";
import { EXAMPLES } from "./examples";
import { porkchopScript, PLANETS } from "./porkchop";
import { transferScript, CENTRAL_BODIES } from "./transfer";
import { budgetScript } from "./budget";
import { drawFigure } from "./figure";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const output = $<HTMLPreElement>("output");
const editor = $<HTMLTextAreaElement>("editor");
const prompt = $<HTMLInputElement>("prompt");
const canvas = $<HTMLCanvasElement>("figure");
const figureEmpty = $<HTMLDivElement>("figure-empty");
const varsBody = $<HTMLTableElement>("vars").querySelector("tbody")!;
const examples = $<HTMLSelectElement>("examples");

let lastPlot: PlotState | null = null;

function append(text: string, cls?: string): void {
  const span = document.createElement("span");
  if (cls) span.className = cls;
  span.textContent = text;
  output.appendChild(span);
  output.scrollTop = output.scrollHeight;
}

const interp = createConsole({
  print: (s) => append(s),
  plot: (state) => {
    lastPlot = state;
    figureEmpty.classList.toggle("hidden", state.series.length > 0 || state.contour !== null);
    drawFigure(canvas, state);
  },
  clear: () => { output.textContent = ""; },
  now: () => performance.now(),
});

function describe(v: Value): { size: string; cls: string; value: string } {
  if (isMatrix(v)) {
    const value = isScalar(v) ? format(v) : numel(v) <= 6 ? format(v).replace(/\s+/g, " ").trim() : `${v.rows}x${v.cols} double`;
    return { size: `${v.rows}x${v.cols}`, cls: "double", value };
  }
  if (typeof v === "string") return { size: `1x${v.length}`, cls: "char", value: `'${v}'` };
  if (v.kind === "function") return { size: "1x1", cls: "function_handle", value: `@${v.name}` };
  return { size: "1x1", cls: "struct", value: [...v.fields.keys()].join(", ") };
}

function refreshVars(): void {
  varsBody.textContent = "";
  for (const [name, v] of [...interp.vars.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const d = describe(v);
    const tr = document.createElement("tr");
    for (const [text, cls] of [[name, ""], [d.size, ""], [d.cls, ""], [d.value, "value"]] as const) {
      const td = document.createElement("td");
      td.textContent = text;
      if (cls) td.className = cls;
      tr.appendChild(td);
    }
    varsBody.appendChild(tr);
  }
}

function run(src: string, echo: string | null): void {
  if (echo !== null) append(`>> ${echo}\n`, "cmd");
  try {
    interp.run(src);
  } catch (e) {
    const msg = e instanceof RuntimeError ? (e.line !== undefined && !/line \d+/.test(e.message) ? `Error on line ${e.line}: ${e.message}` : `Error: ${e.message}`) : `Error: ${(e as Error).message}`;
    append(msg + "\n", "err");
  }
  refreshVars();
}

$("run").addEventListener("click", () => run(editor.value, "run script"));
$("clear").addEventListener("click", () => { output.textContent = ""; });
editor.addEventListener("keydown", (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") { ev.preventDefault(); run(editor.value, "run script"); }
  if (ev.key === "Tab") { ev.preventDefault(); const s = editor.selectionStart; editor.setRangeText("  ", s, editor.selectionEnd, "end"); }
});

const history: string[] = [];
let historyPos = 0;
prompt.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") {
    const cmd = prompt.value.trim();
    prompt.value = "";
    if (!cmd) return;
    history.push(cmd);
    historyPos = history.length;
    run(cmd, cmd);
  } else if (ev.key === "ArrowUp") {
    ev.preventDefault();
    if (historyPos > 0) { historyPos--; prompt.value = history[historyPos] ?? ""; }
  } else if (ev.key === "ArrowDown") {
    ev.preventDefault();
    if (historyPos < history.length) { historyPos++; prompt.value = history[historyPos] ?? ""; }
  }
});

for (const [i, ex] of EXAMPLES.entries()) {
  const opt = document.createElement("option");
  opt.value = String(i);
  opt.textContent = ex.title;
  examples.appendChild(opt);
}
examples.addEventListener("change", () => {
  const ex = EXAMPLES[Number(examples.value)];
  if (ex) editor.value = ex.code;
});

// ---- Porkchop tool -------------------------------------------------------------
const dialog = $<HTMLDialogElement>("porkchop");
const form = $<HTMLFormElement>("porkchop-form");
for (const name of ["from", "to"] as const) {
  const sel = form.elements.namedItem(name) as HTMLSelectElement;
  for (const p of PLANETS) {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p[0]!.toUpperCase() + p.slice(1);
    sel.appendChild(opt);
  }
}
(form.elements.namedItem("from") as HTMLSelectElement).value = "earth";
(form.elements.namedItem("to") as HTMLSelectElement).value = "mars";
const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = new Date();
const inDays = (n: number) => iso(new Date(today.getTime() + n * 86400e3));
(form.elements.namedItem("dep0") as HTMLInputElement).value = inDays(0);
(form.elements.namedItem("dep1") as HTMLInputElement).value = inDays(540);
(form.elements.namedItem("arr0") as HTMLInputElement).value = inDays(150);
(form.elements.namedItem("arr1") as HTMLInputElement).value = inDays(900);

function buildScript(): string | null {
  const data = new FormData(form);
  const get = (k: string) => String(data.get(k) ?? "");
  const from = get("from"), to = get("to");
  if (from === to) { append("Porkchop: departure and arrival bodies must differ.\n", "err"); return null; }
  const dates = ["dep0", "dep1", "arr0", "arr1"].map((k) => get(k));
  if (dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) { append("Porkchop: enter all four dates.\n", "err"); return null; }
  if (dates[0]! >= dates[1]! || dates[2]! >= dates[3]!) { append("Porkchop: each range must end after it starts.\n", "err"); return null; }
  const n = Math.min(300, Math.max(10, Number(get("n")) || 80));
  return porkchopScript({ from, to, dep: [dates[0]!, dates[1]!], arr: [dates[2]!, dates[3]!], n, what: get("what") as "C3" | "vinf_arr" | "total", retro: get("dir") === "retro" });
}
$("porkchop-open").addEventListener("click", () => dialog.showModal());
$("porkchop-cancel").addEventListener("click", () => dialog.close());
$("porkchop-insert").addEventListener("click", () => { const s = buildScript(); if (s) { editor.value = s; dialog.close(); } });
form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const s = buildScript();
  if (!s) return;
  editor.value = s;
  dialog.close();
  run(s, "porkchop tool");
});

// ---- Transfer planner tool ---------------------------------------------------
const tDialog = $<HTMLDialogElement>("transfer");
const tForm = $<HTMLFormElement>("transfer-form");
{
  const sel = tForm.elements.namedItem("body") as HTMLSelectElement;
  for (const b of CENTRAL_BODIES) {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b[0]!.toUpperCase() + b.slice(1);
    sel.appendChild(opt);
  }
  sel.value = "earth";
}
function buildTransferScript(): string | null {
  const data = new FormData(tForm);
  const get = (k: string) => String(data.get(k) ?? "");
  const r1 = Number(get("r1")), r2 = Number(get("r2"));
  const mode = get("mode") as "altitude" | "radius";
  if (!(r1 >= 0 && r2 >= 0) || (mode === "radius" && (r1 <= 0 || r2 <= 0))) { append("Transfer: orbit sizes must be positive numbers.\n", "err"); return null; }
  if (r1 === r2) { append("Transfer: the two orbits must differ.\n", "err"); return null; }
  const ratio = Math.max(1.01, Number(get("ratio")) || 3);
  const di = Math.min(180, Math.max(0, Number(get("di")) || 0));
  return transferScript({ body: get("body"), mode, r1, r2, ratio, planeChangeDeg: di, plot: get("plot") as "dv" | "orbits" });
}
$("transfer-open").addEventListener("click", () => tDialog.showModal());
$("transfer-cancel").addEventListener("click", () => tDialog.close());
$("transfer-insert").addEventListener("click", () => { const s = buildTransferScript(); if (s) { editor.value = s; tDialog.close(); } });
tForm.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const s = buildTransferScript();
  if (!s) return;
  editor.value = s;
  tDialog.close();
  run(s, "transfer tool");
});

// ---- Launch window / dv budget tool -----------------------------------------
const bDialog = $<HTMLDialogElement>("budget");
const bForm = $<HTMLFormElement>("budget-form");
for (const name of ["from", "to"] as const) {
  const sel = bForm.elements.namedItem(name) as HTMLSelectElement;
  for (const p of PLANETS) {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p[0]!.toUpperCase() + p.slice(1);
    sel.appendChild(opt);
  }
}
(bForm.elements.namedItem("from") as HTMLSelectElement).value = "earth";
(bForm.elements.namedItem("to") as HTMLSelectElement).value = "mars";
(bForm.elements.namedItem("dep0") as HTMLInputElement).value = inDays(0);
(bForm.elements.namedItem("dep1") as HTMLInputElement).value = inDays(800);
function buildBudgetScript(): string | null {
  const data = new FormData(bForm);
  const get = (k: string) => String(data.get(k) ?? "");
  const from = get("from"), to = get("to");
  if (from === to) { append("Budget: departure and arrival bodies must differ.\n", "err"); return null; }
  const dep0 = get("dep0"), dep1 = get("dep1");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dep0) || !/^\d{4}-\d{2}-\d{2}$/.test(dep1) || dep0 >= dep1) { append("Budget: enter a departure range that ends after it starts.\n", "err"); return null; }
  return budgetScript({
    from, to,
    parkAlt: Math.max(0, Number(get("park")) || 0),
    captureAlt: Math.max(0, Number(get("cap")) || 0),
    captureEcc: Number(get("ecc")),
    dep: [dep0, dep1],
    maxTof: Math.max(30, Number(get("tof")) || 400),
    n: Math.min(300, Math.max(10, Number(get("n")) || 70)),
    tolerance: Math.max(0, Number(get("tol")) || 0) / 100,
    margin: Math.max(0, Number(get("margin")) || 0) / 100,
    isp: Math.max(50, Number(get("isp")) || 320),
  });
}
$("budget-open").addEventListener("click", () => bDialog.showModal());
$("budget-cancel").addEventListener("click", () => bDialog.close());
$("budget-insert").addEventListener("click", () => { const s = buildBudgetScript(); if (s) { editor.value = s; bDialog.close(); } });
bForm.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const s = buildBudgetScript();
  if (!s) return;
  editor.value = s;
  bDialog.close();
  run(s, "budget tool");
});

new ResizeObserver(() => { if (lastPlot) drawFigure(canvas, lastPlot); }).observe(canvas);

editor.value = EXAMPLES[0]!.code;
append("Orbital Lab — MATLAB-syntax console backed by the astrolab toolbox.\nType help for the function list, or run an example script.\n\n", "muted");
run("x = R_earth + 400e3; v = vcirc(x, mu_earth);", null);
append(formatValue(interp.vars.get("v")!, "v_circ_400km"), "muted");
refreshVars();
prompt.focus();
