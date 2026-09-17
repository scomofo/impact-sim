import { createConsole, formatValue, RuntimeError, type PlotState, type Value } from "@orbital-suite/astrolab";
import { isMatrix, isScalar, format, numel } from "@orbital-suite/astrolab";
import { EXAMPLES } from "./examples";
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
    figureEmpty.classList.toggle("hidden", state.series.length > 0);
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

new ResizeObserver(() => { if (lastPlot) drawFigure(canvas, lastPlot); }).observe(canvas);

editor.value = EXAMPLES[0]!.code;
append("Orbital Lab — MATLAB-syntax console backed by the astrolab toolbox.\nType help for the function list, or run an example script.\n\n", "muted");
run("x = R_earth + 400e3; v = vcirc(x, mu_earth);", null);
append(formatValue(interp.vars.get("v")!, "v_circ_400km"), "muted");
refreshVars();
prompt.focus();
