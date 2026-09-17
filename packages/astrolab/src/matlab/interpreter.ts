/**
 * Tree-walking evaluator for the MATLAB subset. Values are numeric matrices,
 * char arrays (strings), function handles and read-only structs.
 */

import { parse, type Expr, type LValue, type Stmt } from "./parser.ts";
import { SyntaxError } from "./lexer.ts";
import * as M from "../matrix.ts";
import type { Matrix } from "../matrix.ts";

export type Value =
  | Matrix
  | string
  | FunctionValue
  | StructValue;

export interface FunctionValue {
  kind: "function";
  name: string;
  /** Number of outputs requested by the caller (`nargout`). */
  call: (args: Value[], nargout: number, interp: Interpreter) => Value[];
}

export interface StructValue {
  kind: "struct";
  fields: Map<string, Value>;
}

export class RuntimeError extends Error {
  line?: number;
  constructor(message: string, line?: number) {
    super(message);
    this.line = line;
    this.name = "RuntimeError";
  }
}

export interface PlotSeries {
  x: number[];
  y: number[];
  style: string;
  label?: string;
}

export interface ContourField {
  /** Column coordinates (length = z[0].length). */
  x: number[];
  /** Row coordinates (length = z.length). */
  y: number[];
  /** z[row][col]; NaN cells are left blank. */
  z: number[][];
  levels: number[];
  filled: boolean;
}

export interface PlotState {
  series: PlotSeries[];
  contour: ContourField | null;
  title: string;
  xlabel: string;
  ylabel: string;
  grid: boolean;
  equal: boolean;
  legend: string[] | null;
  hold: boolean;
}

/** What the interpreter needs from its host (console UI or test harness). */
export interface Host {
  print(text: string): void;
  /** Called after every plotting command with the full current figure state. */
  plot?(state: PlotState): void;
  clear?(): void;
  now?(): number;
}

export const isStruct = (v: Value): v is StructValue => typeof v === "object" && "kind" in v && v.kind === "struct";
export const isFunction = (v: Value): v is FunctionValue => typeof v === "object" && "kind" in v && v.kind === "function";

export function struct(obj: Record<string, Value | number | number[] | number[][]>): StructValue {
  const fields = new Map<string, Value>();
  for (const [k, v] of Object.entries(obj)) fields.set(k, typeof v === "number" || Array.isArray(v) ? M.toMatrix(v) : v);
  return { kind: "struct", fields };
}

export function toNumber(v: Value, what = "value"): number {
  if (M.isMatrix(v)) {
    if (M.numel(v) !== 1) throw new RuntimeError(`${what} must be a scalar, got ${v.rows}x${v.cols}`);
    return v.data[0]!;
  }
  if (typeof v === "string") throw new RuntimeError(`${what} must be numeric, got a char array`);
  throw new RuntimeError(`${what} must be numeric`);
}

export function toMat(v: Value, what = "value"): Matrix {
  if (M.isMatrix(v)) return v;
  if (typeof v === "string") return M.rowvec(Array.from(v, (c) => c.charCodeAt(0)));
  throw new RuntimeError(`${what} must be numeric`);
}

export function isTruthy(v: Value): boolean {
  if (typeof v === "string") return v.length > 0;
  if (!M.isMatrix(v)) return true;
  if (M.numel(v) === 0) return false;
  for (const x of v.data) if (x === 0 || Number.isNaN(x)) return false;
  return true;
}

export function typeName(v: Value): string {
  if (M.isMatrix(v)) return "double";
  if (typeof v === "string") return "char";
  return v.kind === "function" ? "function_handle" : "struct";
}

export function formatValue(v: Value, name = "ans"): string {
  if (M.isMatrix(v)) {
    if (M.numel(v) === 0) return `${name} =\n\n     []\n`;
    if (M.isScalar(v)) return `${name} =\n\n    ${M.format(v)}\n`;
    return `${name} =\n\n${M.format(v)}\n`;
  }
  if (typeof v === "string") return `${name} =\n\n    '${v}'\n`;
  if (v.kind === "function") return `${name} =\n\n    @${v.name}\n`;
  const lines = [...v.fields.entries()].map(([k, f]) => {
    if (M.isMatrix(f)) return `    ${k}: ${M.isScalar(f) ? M.format(f) : `[${f.rows}x${f.cols} double]`}`;
    if (typeof f === "string") return `    ${k}: '${f}'`;
    return `    ${k}: [${typeName(f)}]`;
  });
  return `${name} = \n\n  struct with fields:\n\n${lines.join("\n")}\n`;
}

class BreakSignal { }
class ContinueSignal { }
class ReturnSignal { }

export type Builtins = Map<string, FunctionValue>;

export class Interpreter {
  readonly vars = new Map<string, Value>();
  private userFunctions = new Map<string, FunctionValue>();
  readonly plotState: PlotState = emptyPlot();
  private steps = 0;
  /** Guard against infinite loops in the browser. */
  maxSteps = 5_000_000;

  host: Host;
  builtins: Builtins;
  constructor(host: Host, builtins: Builtins) {
    this.host = host;
    this.builtins = builtins;
  }

  run(src: string): void {
    this.steps = 0;
    let stmts: Stmt[];
    try {
      stmts = parse(src);
    } catch (e) {
      if (e instanceof SyntaxError) throw new RuntimeError(`Parse error on line ${e.line}: ${e.message}`, e.line);
      throw e;
    }
    // Hoist function definitions so scripts can call functions defined below.
    for (const s of stmts) if (s.kind === "function") this.defineFunction(s);
    try {
      this.execBlock(stmts.filter((s) => s.kind !== "function"), this.vars);
    } catch (e) {
      if (e instanceof ReturnSignal) return;
      if (e instanceof BreakSignal || e instanceof ContinueSignal) throw new RuntimeError("'break' or 'continue' outside a loop");
      throw e;
    }
  }

  lookupFunction(name: string): FunctionValue | undefined {
    return this.userFunctions.get(name) ?? this.builtins.get(name);
  }

  callFunction(f: FunctionValue, args: Value[], nargout = 1): Value[] {
    return f.call(args, nargout, this);
  }

  private defineFunction(s: Extract<Stmt, { kind: "function" }>): void {
    const interp = this;
    this.userFunctions.set(s.name, {
      kind: "function",
      name: s.name,
      call(args, nargout) {
        if (args.length > s.params.length) throw new RuntimeError(`Too many input arguments for ${s.name}`);
        const scope = new Map<string, Value>();
        s.params.forEach((p, i) => { if (i < args.length && p !== "~") scope.set(p, args[i]!); });
        scope.set("nargin", M.toMatrix(args.length));
        scope.set("nargout", M.toMatrix(nargout));
        try {
          interp.execBlock(s.body, scope);
        } catch (e) {
          if (!(e instanceof ReturnSignal)) throw e;
        }
        const outs: Value[] = [];
        for (let i = 0; i < Math.max(1, nargout) && i < s.outputs.length; i++) {
          const v = scope.get(s.outputs[i]!);
          if (v === undefined) {
            if (i === 0 && nargout <= 1 && s.outputs.length > 0) throw new RuntimeError(`Output argument '${s.outputs[0]}' of ${s.name} was not assigned`);
            if (i < nargout) throw new RuntimeError(`Output argument '${s.outputs[i]}' of ${s.name} was not assigned`);
            break;
          }
          outs.push(v);
        }
        return outs;
      },
    });
  }

  private tick(line?: number): void {
    if (++this.steps > this.maxSteps) throw new RuntimeError("Execution limit reached (possible infinite loop)", line);
  }

  private execBlock(stmts: Stmt[], scope: Map<string, Value>): void {
    for (const s of stmts) this.exec(s, scope);
  }

  private exec(s: Stmt, scope: Map<string, Value>): void {
    this.tick(s.line);
    try {
      switch (s.kind) {
        case "expr": {
          // Bare identifier of a variable: display it under its own name.
          if (s.expr.kind === "id" && scope.has(s.expr.name)) {
            if (s.show) this.host.print(formatValue(scope.get(s.expr.name)!, s.expr.name));
            return;
          }
          const vals = this.evalMulti(s.expr, scope, 0);
          if (vals.length === 0) return;
          const v = vals[0]!;
          scope.set("ans", v);
          if (s.show) this.host.print(formatValue(v, "ans"));
          return;
        }
        case "assign": {
          const nargout = s.targets.length;
          const vals = this.evalMulti(s.expr, scope, nargout);
          if (vals.length < nargout) throw new RuntimeError(`Not enough output arguments (requested ${nargout}, got ${vals.length})`);
          s.targets.forEach((t, i) => {
            if (t.kind === "id" && t.name === "~") return;
            this.assign(t, vals[i]!, scope);
            if (s.show) this.host.print(formatValue(this.readLValueRoot(t, scope), lvalueName(t)));
          });
          return;
        }
        case "if": {
          for (const b of s.branches) {
            if (isTruthy(this.eval(b.cond, scope))) { this.execBlock(b.body, scope); return; }
          }
          if (s.otherwise) this.execBlock(s.otherwise, scope);
          return;
        }
        case "for": {
          const it = this.eval(s.iter, scope);
          const m = toMat(it, "for-loop range");
          // Iterate over columns, as MATLAB does.
          for (let j = 0; j < m.cols; j++) {
            const col = m.rows === 1 ? M.toMatrix(m.data[j]!) : M.index(m, null, [j]);
            scope.set(s.name, col);
            try {
              this.execBlock(s.body, scope);
            } catch (e) {
              if (e instanceof BreakSignal) break;
              if (e instanceof ContinueSignal) continue;
              throw e;
            }
          }
          return;
        }
        case "while": {
          while (isTruthy(this.eval(s.cond, scope))) {
            this.tick(s.line);
            try {
              this.execBlock(s.body, scope);
            } catch (e) {
              if (e instanceof BreakSignal) break;
              if (e instanceof ContinueSignal) continue;
              throw e;
            }
          }
          return;
        }
        case "break": throw new BreakSignal();
        case "continue": throw new ContinueSignal();
        case "return": throw new ReturnSignal();
        case "function": this.defineFunction(s); return;
      }
    } catch (e) {
      if (e instanceof RuntimeError && e.line === undefined) e.line = s.line;
      if (e instanceof Error && !(e instanceof RuntimeError) && !(e instanceof BreakSignal) && !(e instanceof ContinueSignal) && !(e instanceof ReturnSignal)) {
        throw new RuntimeError(e.message, s.line);
      }
      throw e;
    }
  }

  private readLValueRoot(t: LValue, scope: Map<string, Value>): Value {
    const name = lvalueName(t);
    return scope.get(name)!;
  }

  private assign(t: LValue, v: Value, scope: Map<string, Value>): void {
    if (t.kind === "id") { scope.set(t.name, v); return; }
    if (t.kind === "field") {
      const name = lvalueName(t);
      const base = scope.get(name);
      const s: StructValue = base && isStruct(base) ? base : { kind: "struct", fields: new Map() };
      if (t.target.kind !== "id") throw new RuntimeError("Nested field assignment is not supported");
      s.fields.set(t.name, v);
      scope.set(name, s);
      return;
    }
    if (t.target.kind !== "id") throw new RuntimeError("Indexed assignment into fields is not supported");
    const name = t.target.name;
    const existing = scope.get(name);
    const base = existing === undefined ? M.matrix(0, 0) : toMat(existing, name);
    const val = toMat(v, "assigned value");
    scope.set(name, this.indexedAssign(base, t.args, val, scope));
  }

  private indexedAssign(base: Matrix, argExprs: Expr[], val: Matrix, scope: Map<string, Value>): Matrix {
    if (argExprs.length === 1) {
      const ks = this.indexList(argExprs[0]!, M.numel(base), scope, base, 0, 1);
      const isRowGrowth = base.rows <= 1;
      let out = base;
      const needed = Math.max(...ks, -1) + 1;
      if (needed > M.numel(out)) {
        const grown = isRowGrowth ? M.matrix(1, needed) : M.matrix(needed, 1);
        // Copy existing values (column-major linear order).
        const lin = M.toVector(out);
        for (let k = 0; k < lin.length; k++) grown.data[k] = lin[k]!;
        out = grown;
      } else {
        out = M.map(out, (x) => x);
      }
      if (M.numel(val) !== 1 && M.numel(val) !== ks.length) throw new RuntimeError("Unable to perform assignment because the sizes differ");
      ks.forEach((k, idx) => {
        const j = Math.floor(k / out.rows), i = k % out.rows;
        out.data[i * out.cols + j] = M.numel(val) === 1 ? val.data[0]! : val.data[idx]!;
      });
      return out;
    }
    if (argExprs.length !== 2) throw new RuntimeError("Only 1-D and 2-D indexing are supported");
    const ri = this.indexList(argExprs[0]!, base.rows, scope, base, 0, 2);
    const ci = this.indexList(argExprs[1]!, base.cols, scope, base, 1, 2);
    const rows = Math.max(base.rows, ...ri.map((i) => i + 1));
    const cols = Math.max(base.cols, ...ci.map((j) => j + 1));
    const out = M.matrix(rows, cols);
    for (let i = 0; i < base.rows; i++) for (let j = 0; j < base.cols; j++) out.data[i * cols + j] = base.data[i * base.cols + j]!;
    const scalarVal = M.numel(val) === 1;
    if (!scalarVal && !(val.rows === ri.length && val.cols === ci.length) && M.numel(val) !== ri.length * ci.length) {
      throw new RuntimeError("Unable to perform assignment because the sizes differ");
    }
    ri.forEach((i, a) => ci.forEach((j, b) => {
      out.data[i * cols + j] = scalarVal ? val.data[0]! : val.data[a * ci.length + b]!;
    }));
    return out;
  }

  /** Evaluate an index expression to zero-based positions. */
  private indexList(e: Expr, extent: number, scope: Map<string, Value>, target: Matrix, dim: number, ndims: number): number[] {
    if (e.kind === "colon") return Array.from({ length: extent }, (_, i) => i);
    const endValue = ndims === 1 ? M.numel(target) : dim === 0 ? target.rows : target.cols;
    const v = this.eval(e, scope, endValue);
    const m = toMat(v, "index");
    const ks: number[] = [];
    // Logical indexing: a mask of 0/1 the same size as the extent.
    const isLogicalMask = M.numel(m) === extent && Array.from(m.data).every((x) => x === 0 || x === 1) && M.numel(m) > 0 && (M.numel(m) > 1 || extent === 1) && isLogicalLike(m);
    if (isLogicalMask) {
      m.data.forEach((x, k) => { if (x === 1) ks.push(k); });
      return ks;
    }
    for (const x of m.data) {
      if (!Number.isInteger(x) || x < 1) throw new RuntimeError(`Index must be a positive integer, got ${x}`);
      ks.push(x - 1);
    }
    return ks;
  }

  eval(e: Expr, scope: Map<string, Value>, endValue?: number): Value {
    const vals = this.evalMulti(e, scope, 1, endValue);
    if (vals.length === 0) throw new RuntimeError("Expression produced no value");
    return vals[0]!;
  }

  /** Evaluate an expression that may yield several outputs (function calls). */
  evalMulti(e: Expr, scope: Map<string, Value>, nargout: number, endValue?: number): Value[] {
    switch (e.kind) {
      case "num": return [M.toMatrix(e.value)];
      case "str": return [e.value];
      case "colon": throw new RuntimeError("Unexpected ':'");
      case "end":
        if (endValue === undefined) throw new RuntimeError("'end' is only valid inside an index");
        return [M.toMatrix(endValue)];
      case "id": {
        const v = scope.get(e.name);
        if (v !== undefined) return [v];
        const f = this.lookupFunction(e.name);
        if (f) return f.call([], nargout, this);
        throw new RuntimeError(`Unrecognized function or variable '${e.name}'`);
      }
      case "handle": {
        const f = this.lookupFunction(e.name);
        if (!f) throw new RuntimeError(`Unrecognized function '${e.name}'`);
        return [f];
      }
      case "anon": {
        const captured = new Map(scope);
        const interp = this;
        return [{
          kind: "function",
          name: `(${e.params.join(",")})`,
          call(args, n) {
            const inner = new Map(captured);
            e.params.forEach((p, i) => { if (p !== "~" && i < args.length) inner.set(p, args[i]!); });
            return interp.evalMulti(e.body, inner, n);
          },
        }];
      }
      case "unary": {
        const v = this.eval(e.arg, scope, endValue);
        const m = toMat(v);
        if (e.op === "-") return [M.uminus(m)];
        if (e.op === "+") return [m];
        return [M.map(m, (x) => (x === 0 ? 1 : 0))];
      }
      case "postfix": return [M.transpose(toMat(this.eval(e.arg, scope, endValue)))];
      case "binary": {
        if (e.op === "&&" || e.op === "||") {
          const l = isTruthy(this.eval(e.left, scope, endValue));
          if (e.op === "&&" && !l) return [M.toMatrix(0)];
          if (e.op === "||" && l) return [M.toMatrix(1)];
          return [M.toMatrix(isTruthy(this.eval(e.right, scope, endValue)) ? 1 : 0)];
        }
        const l = this.eval(e.left, scope, endValue);
        const r = this.eval(e.right, scope, endValue);
        if (typeof l === "string" && typeof r === "string" && e.op === "==") return [M.toMatrix(l === r ? 1 : 0)];
        return [binaryOp(e.op, toMat(l), toMat(r))];
      }
      case "range": {
        const a = toNumber(this.eval(e.start, scope, endValue), "range start");
        const b = toNumber(this.eval(e.stop, scope, endValue), "range end");
        const s = e.step ? toNumber(this.eval(e.step, scope, endValue), "range step") : 1;
        return [M.colon(a, s, b)];
      }
      case "matrix": {
        const rows = e.rows.map((r) => {
          const parts = r.map((x) => this.eval(x, scope, endValue));
          if (parts.every((p) => typeof p === "string")) return parts.join("");
          return M.horzcat(...parts.map((p) => toMat(p)));
        });
        if (rows.every((r) => typeof r === "string")) return [rows.join("\n")];
        if (rows.length === 0) return [M.matrix(0, 0)];
        return [M.vertcat(...rows.map((r) => (typeof r === "string" ? toMat(r) : r)))];
      }
      case "field": {
        const base = this.eval(e.target, scope, endValue);
        if (!isStruct(base)) throw new RuntimeError(`Cannot access field '${e.name}' of a ${typeName(base)}`);
        const v = base.fields.get(e.name);
        if (v === undefined) throw new RuntimeError(`Unrecognized field name '${e.name}'`);
        return [v];
      }
      case "index": {
        // Function call?
        if (e.target.kind === "id" && !scope.has(e.target.name)) {
          const f = this.lookupFunction(e.target.name);
          if (!f) throw new RuntimeError(`Unrecognized function or variable '${e.target.name}'`);
          const args = e.args.map((a) => (a.kind === "colon" ? ":" : this.eval(a, scope)));
          return f.call(args, nargout, this);
        }
        const target = this.eval(e.target, scope, endValue);
        if (isFunction(target)) {
          const args = e.args.map((a) => this.eval(a, scope));
          return target.call(args, nargout, this);
        }
        if (typeof target === "string") {
          const m = toMat(target);
          const r = this.indexMatrix(m, e.args, scope);
          return [String.fromCharCode(...Array.from(r.data))];
        }
        if (!M.isMatrix(target)) throw new RuntimeError("Cannot index into a struct with ()");
        return [this.indexMatrix(target, e.args, scope)];
      }
    }
  }

  private indexMatrix(m: Matrix, args: Expr[], scope: Map<string, Value>): Matrix {
    if (args.length === 0) return m;
    if (args.length === 1) {
      const a = args[0]!;
      if (a.kind === "colon") return M.colvec(M.toVector(m));
      const ks = this.indexList(a, M.numel(m), scope, m, 0, 1);
      const idxVal = this.eval(a, scope, M.numel(m));
      const idxM = toMat(idxVal);
      const out = M.linearIndex(m, ks);
      // Shape follows the index when the source is a matrix, otherwise the source's orientation.
      if (M.isVector(m)) return m.rows === 1 ? M.rowvec(out.data) : M.colvec(out.data);
      return M.matrix(idxM.rows, idxM.cols, out.data.length === M.numel(idxM) ? out.data : out.data);
    }
    if (args.length !== 2) throw new RuntimeError("Only 1-D and 2-D indexing are supported");
    const ri = this.indexList(args[0]!, m.rows, scope, m, 0, 2);
    const ci = this.indexList(args[1]!, m.cols, scope, m, 1, 2);
    return M.index(m, ri, ci);
  }
}

function isLogicalLike(m: Matrix): boolean {
  return (m as Matrix & { logical?: boolean }).logical === true;
}

/** Mark a matrix as the result of a comparison so it can be used as a mask. */
export function logical(m: Matrix): Matrix {
  (m as Matrix & { logical?: boolean }).logical = true;
  return m;
}

function lvalueName(t: LValue): string {
  if (t.kind === "id") return t.name;
  const target = t.target;
  if (target.kind === "id") return target.name;
  if (target.kind === "field" && target.target.kind === "id") return target.target.name;
  throw new RuntimeError("Unsupported assignment target");
}

export function binaryOp(op: string, l: Matrix, r: Matrix): Matrix {
  switch (op) {
    case "+": return M.plus(l, r);
    case "-": return M.minus(l, r);
    case ".*": return M.times(l, r);
    case "./": return M.rdivide(l, r);
    case ".\\": return M.rdivide(r, l);
    case ".^": return M.power(l, r);
    case "*": return M.mtimes(l, r);
    case "/": return M.mrdivide(l, r);
    case "\\": return M.mldivide(l, r);
    case "^": return M.mpower(l, r);
    case "==": return logical(M.elementwise(l, r, (a, b) => (a === b ? 1 : 0)));
    case "~=": return logical(M.elementwise(l, r, (a, b) => (a !== b ? 1 : 0)));
    case "<": return logical(M.elementwise(l, r, (a, b) => (a < b ? 1 : 0)));
    case "<=": return logical(M.elementwise(l, r, (a, b) => (a <= b ? 1 : 0)));
    case ">": return logical(M.elementwise(l, r, (a, b) => (a > b ? 1 : 0)));
    case ">=": return logical(M.elementwise(l, r, (a, b) => (a >= b ? 1 : 0)));
    case "&": return logical(M.elementwise(l, r, (a, b) => (a !== 0 && b !== 0 ? 1 : 0)));
    case "|": return logical(M.elementwise(l, r, (a, b) => (a !== 0 || b !== 0 ? 1 : 0)));
  }
  throw new RuntimeError(`Unsupported operator '${op}'`);
}

export function emptyPlot(): PlotState {
  return { series: [], contour: null, title: "", xlabel: "", ylabel: "", grid: false, equal: false, legend: null, hold: false };
}
