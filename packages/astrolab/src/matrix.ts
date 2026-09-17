/**
 * MATLAB-flavoured dense matrices. A `Matrix` is row-major with explicit
 * dimensions; vectors are matrices with one row or one column, exactly as in
 * MATLAB. Functions are named after their MATLAB counterparts.
 */

export interface Matrix {
  rows: number;
  cols: number;
  /** Row-major storage, length rows * cols. */
  data: Float64Array;
}

export type MatrixLike = Matrix | number | number[] | number[][];

export function matrix(rows: number, cols: number, data?: ArrayLike<number>): Matrix {
  const m: Matrix = { rows, cols, data: new Float64Array(rows * cols) };
  if (data) {
    if (data.length !== rows * cols) {
      throw new Error(`matrix: expected ${rows * cols} values, got ${data.length}`);
    }
    m.data.set(data);
  }
  return m;
}

export function isMatrix(v: unknown): v is Matrix {
  return (
    typeof v === "object" &&
    v !== null &&
    "rows" in v &&
    "cols" in v &&
    (v as Matrix).data instanceof Float64Array
  );
}

/** Convert a scalar, nested array or matrix into a `Matrix`. */
export function toMatrix(v: MatrixLike): Matrix {
  if (isMatrix(v)) return v;
  if (typeof v === "number") return matrix(1, 1, [v]);
  if (v.length === 0) return matrix(0, 0);
  if (typeof v[0] === "number") return matrix(1, v.length, v as number[]);
  const rows = v as number[][];
  const cols = rows[0]!.length;
  const out = matrix(rows.length, cols);
  rows.forEach((r, i) => {
    if (r.length !== cols) throw new Error("toMatrix: ragged rows");
    out.data.set(r, i * cols);
  });
  return out;
}

export function toArray(m: Matrix): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < m.rows; i++) {
    out.push(Array.from(m.data.subarray(i * m.cols, (i + 1) * m.cols)));
  }
  return out;
}

/** Flatten column-major, like MATLAB's `m(:)`. */
export function toVector(m: Matrix): number[] {
  const out: number[] = new Array(m.rows * m.cols);
  let k = 0;
  for (let j = 0; j < m.cols; j++) for (let i = 0; i < m.rows; i++) out[k++] = m.data[i * m.cols + j]!;
  return out;
}

export const rowvec = (v: ArrayLike<number>): Matrix => matrix(1, v.length, v);
export const colvec = (v: ArrayLike<number>): Matrix => matrix(v.length, 1, v);
export const isScalar = (m: Matrix): boolean => m.rows === 1 && m.cols === 1;
export const isVector = (m: Matrix): boolean => m.rows === 1 || m.cols === 1;
export const numel = (m: Matrix): number => m.rows * m.cols;
export const size = (m: Matrix): [number, number] => [m.rows, m.cols];
export const get = (m: Matrix, i: number, j: number): number => m.data[i * m.cols + j]!;
export function set(m: Matrix, i: number, j: number, v: number): void {
  m.data[i * m.cols + j] = v;
}
export function scalar(m: Matrix): number {
  if (!isScalar(m)) throw new Error(`expected scalar, got ${m.rows}x${m.cols}`);
  return m.data[0]!;
}

export function zeros(rows: number, cols = rows): Matrix {
  return matrix(rows, cols);
}
export function ones(rows: number, cols = rows): Matrix {
  const m = matrix(rows, cols);
  m.data.fill(1);
  return m;
}
export function eye(n: number): Matrix {
  const m = matrix(n, n);
  for (let i = 0; i < n; i++) m.data[i * n + i] = 1;
  return m;
}
export function diag(v: Matrix): Matrix {
  if (isVector(v)) {
    const n = numel(v);
    const m = matrix(n, n);
    for (let i = 0; i < n; i++) m.data[i * n + i] = v.data[i]!;
    return m;
  }
  const n = Math.min(v.rows, v.cols);
  const out = matrix(n, 1);
  for (let i = 0; i < n; i++) out.data[i] = get(v, i, i);
  return out;
}

/** `linspace(a, b, n)` — n evenly spaced points from a to b inclusive. */
export function linspace(a: number, b: number, n = 100): Matrix {
  const m = matrix(1, n);
  if (n === 1) {
    m.data[0] = b;
    return m;
  }
  for (let i = 0; i < n; i++) m.data[i] = a + ((b - a) * i) / (n - 1);
  return m;
}

/** MATLAB colon operator `a:step:b`, inclusive of b within tolerance. */
export function colon(a: number, step: number, b: number): Matrix {
  if (step === 0 || (step > 0 && a > b) || (step < 0 && a < b)) return matrix(1, 0);
  const n = Math.floor((b - a) / step + 1e-10) + 1;
  const m = matrix(1, n);
  for (let i = 0; i < n; i++) m.data[i] = a + i * step;
  return m;
}

export function transpose(m: Matrix): Matrix {
  const out = matrix(m.cols, m.rows);
  for (let i = 0; i < m.rows; i++)
    for (let j = 0; j < m.cols; j++) out.data[j * m.rows + i] = m.data[i * m.cols + j]!;
  return out;
}

export function map(m: Matrix, f: (x: number, index: number) => number): Matrix {
  const out = matrix(m.rows, m.cols);
  for (let k = 0; k < m.data.length; k++) out.data[k] = f(m.data[k]!, k);
  return out;
}

/** Element-wise binary op with MATLAB scalar expansion (scalar op matrix). */
export function elementwise(a: Matrix, b: Matrix, f: (x: number, y: number) => number): Matrix {
  if (isScalar(a)) return map(b, (y) => f(a.data[0]!, y));
  if (isScalar(b)) return map(a, (x) => f(x, b.data[0]!));
  if (a.rows === b.rows && a.cols === b.cols) return map(a, (x, k) => f(x, b.data[k]!));
  // Implicit expansion of row/column vectors (MATLAB R2016b+ semantics).
  if ((a.rows === 1 || a.rows === b.rows) && (a.cols === 1 || a.cols === b.cols) ||
      (b.rows === 1 || b.rows === a.rows) && (b.cols === 1 || b.cols === a.cols)) {
    const rows = Math.max(a.rows, b.rows);
    const cols = Math.max(a.cols, b.cols);
    if ((a.rows !== 1 && a.rows !== rows) || (b.rows !== 1 && b.rows !== rows) ||
        (a.cols !== 1 && a.cols !== cols) || (b.cols !== 1 && b.cols !== cols)) {
      throw new Error(`Matrix dimensions must agree: ${a.rows}x${a.cols} vs ${b.rows}x${b.cols}`);
    }
    const out = matrix(rows, cols);
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const x = get(a, a.rows === 1 ? 0 : i, a.cols === 1 ? 0 : j);
        const y = get(b, b.rows === 1 ? 0 : i, b.cols === 1 ? 0 : j);
        out.data[i * cols + j] = f(x, y);
      }
    return out;
  }
  throw new Error(`Matrix dimensions must agree: ${a.rows}x${a.cols} vs ${b.rows}x${b.cols}`);
}

export const plus = (a: Matrix, b: Matrix): Matrix => elementwise(a, b, (x, y) => x + y);
export const minus = (a: Matrix, b: Matrix): Matrix => elementwise(a, b, (x, y) => x - y);
export const times = (a: Matrix, b: Matrix): Matrix => elementwise(a, b, (x, y) => x * y);
export const rdivide = (a: Matrix, b: Matrix): Matrix => elementwise(a, b, (x, y) => x / y);
export const power = (a: Matrix, b: Matrix): Matrix => elementwise(a, b, (x, y) => Math.pow(x, y));
export const uminus = (a: Matrix): Matrix => map(a, (x) => -x);

/** Matrix product `a * b` (scalars broadcast). */
export function mtimes(a: Matrix, b: Matrix): Matrix {
  if (isScalar(a) || isScalar(b)) return times(a, b);
  if (a.cols !== b.rows) {
    throw new Error(`Inner matrix dimensions must agree: ${a.rows}x${a.cols} * ${b.rows}x${b.cols}`);
  }
  const out = matrix(a.rows, b.cols);
  for (let i = 0; i < a.rows; i++)
    for (let k = 0; k < a.cols; k++) {
      const aik = a.data[i * a.cols + k]!;
      if (aik === 0) continue;
      for (let j = 0; j < b.cols; j++) out.data[i * b.cols + j] += aik * b.data[k * b.cols + j]!;
    }
  return out;
}

/** Matrix power `a ^ n` for square matrices and integer n (scalars use `Math.pow`). */
export function mpower(a: Matrix, b: Matrix): Matrix {
  if (isScalar(a) && isScalar(b)) return power(a, b);
  if (!isScalar(b) || a.rows !== a.cols) throw new Error("mpower: square matrix ^ integer only");
  let n = scalar(b);
  if (!Number.isInteger(n)) throw new Error("mpower: exponent must be an integer");
  let base = n < 0 ? inv(a) : a;
  n = Math.abs(n);
  let result = eye(a.rows);
  while (n > 0) {
    if (n & 1) result = mtimes(result, base);
    base = mtimes(base, base);
    n >>= 1;
  }
  return result;
}

export function dot(a: Matrix, b: Matrix): number {
  if (numel(a) !== numel(b)) throw new Error("dot: vectors must have the same length");
  let s = 0;
  for (let k = 0; k < a.data.length; k++) s += a.data[k]! * b.data[k]!;
  return s;
}

export function cross(a: Matrix, b: Matrix): Matrix {
  if (numel(a) !== 3 || numel(b) !== 3) throw new Error("cross: 3-element vectors required");
  const [a1, a2, a3] = a.data as unknown as [number, number, number];
  const [b1, b2, b3] = b.data as unknown as [number, number, number];
  const v = [a2 * b3 - a3 * b2, a3 * b1 - a1 * b3, a1 * b2 - a2 * b1];
  return a.rows === 1 ? rowvec(v) : colvec(v);
}

/** Euclidean norm for vectors, Frobenius norm for matrices (MATLAB `norm(v)`). */
export function norm(m: Matrix): number {
  let s = 0;
  for (const x of m.data) s += x * x;
  return Math.sqrt(s);
}

export function det(a: Matrix): number {
  if (a.rows !== a.cols) throw new Error("det: matrix must be square");
  const n = a.rows;
  const lu = Float64Array.from(a.data);
  let d = 1;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(lu[r * n + c]!) > Math.abs(lu[p * n + c]!)) p = r;
    if (lu[p * n + c] === 0) return 0;
    if (p !== c) {
      for (let j = 0; j < n; j++) {
        const t = lu[c * n + j]!;
        lu[c * n + j] = lu[p * n + j]!;
        lu[p * n + j] = t;
      }
      d = -d;
    }
    const piv = lu[c * n + c]!;
    d *= piv;
    for (let r = c + 1; r < n; r++) {
      const f = lu[r * n + c]! / piv;
      for (let j = c; j < n; j++) lu[r * n + j] -= f * lu[c * n + j]!;
    }
  }
  return d;
}

/** Solve `A x = B` by Gauss–Jordan elimination with partial pivoting (MATLAB `A \ B`). */
export function mldivide(a: Matrix, b: Matrix): Matrix {
  if (isScalar(a)) return rdivide(b, a);
  if (a.rows !== a.cols) return lstsq(a, b);
  if (b.rows !== a.rows) throw new Error("mldivide: row counts must agree");
  const n = a.rows;
  const w = b.cols;
  const aug = matrix(n, n + w);
  for (let i = 0; i < n; i++) {
    aug.data.set(a.data.subarray(i * n, (i + 1) * n), i * (n + w));
    aug.data.set(b.data.subarray(i * w, (i + 1) * w), i * (n + w) + n);
  }
  const W = n + w;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(aug.data[r * W + c]!) > Math.abs(aug.data[p * W + c]!)) p = r;
    if (Math.abs(aug.data[p * W + c]!) < 1e-14) throw new Error("Matrix is singular to working precision");
    if (p !== c)
      for (let j = 0; j < W; j++) {
        const t = aug.data[c * W + j]!;
        aug.data[c * W + j] = aug.data[p * W + j]!;
        aug.data[p * W + j] = t;
      }
    const piv = aug.data[c * W + c]!;
    for (let j = 0; j < W; j++) aug.data[c * W + j] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = aug.data[r * W + c]!;
      if (f === 0) continue;
      for (let j = 0; j < W; j++) aug.data[r * W + j] -= f * aug.data[c * W + j]!;
    }
  }
  const x = matrix(n, w);
  for (let i = 0; i < n; i++) x.data.set(aug.data.subarray(i * W + n, i * W + W), i * w);
  return x;
}

/** Least-squares solution of an over/under-determined system via normal equations. */
export function lstsq(a: Matrix, b: Matrix): Matrix {
  const at = transpose(a);
  return mldivide(mtimes(at, a), mtimes(at, b));
}

export function inv(a: Matrix): Matrix {
  if (a.rows !== a.cols) throw new Error("inv: matrix must be square");
  return mldivide(a, eye(a.rows));
}

/** `B / A` = `(A' \ B')'`. */
export function mrdivide(b: Matrix, a: Matrix): Matrix {
  if (isScalar(a)) return rdivide(b, a);
  return transpose(mldivide(transpose(a), transpose(b)));
}

/** Column-wise reduction like MATLAB's `sum`, `mean`, `max`: vectors reduce to a scalar. */
function reduceColumns(m: Matrix, f: (col: number[]) => number): Matrix {
  if (isVector(m) || numel(m) === 0) return matrix(1, 1, [f(Array.from(m.data))]);
  const out = matrix(1, m.cols);
  for (let j = 0; j < m.cols; j++) {
    const col: number[] = [];
    for (let i = 0; i < m.rows; i++) col.push(get(m, i, j));
    out.data[j] = f(col);
  }
  return out;
}

export const sum = (m: Matrix): Matrix => reduceColumns(m, (c) => c.reduce((s, x) => s + x, 0));
export const prod = (m: Matrix): Matrix => reduceColumns(m, (c) => c.reduce((s, x) => s * x, 1));
export const mean = (m: Matrix): Matrix => reduceColumns(m, (c) => c.reduce((s, x) => s + x, 0) / c.length);
export const max = (m: Matrix): Matrix => reduceColumns(m, (c) => Math.max(...c));
export const min = (m: Matrix): Matrix => reduceColumns(m, (c) => Math.min(...c));
export const std = (m: Matrix): Matrix =>
  reduceColumns(m, (c) => {
    if (c.length < 2) return 0;
    const mu = c.reduce((s, x) => s + x, 0) / c.length;
    return Math.sqrt(c.reduce((s, x) => s + (x - mu) ** 2, 0) / (c.length - 1));
  });

export function cumsum(m: Matrix): Matrix {
  const out = map(m, (x) => x);
  if (isVector(m)) {
    for (let k = 1; k < out.data.length; k++) out.data[k] += out.data[k - 1]!;
    return out;
  }
  for (let j = 0; j < m.cols; j++)
    for (let i = 1; i < m.rows; i++) out.data[i * m.cols + j] += out.data[(i - 1) * m.cols + j]!;
  return out;
}

export function horzcat(...ms: Matrix[]): Matrix {
  const parts = ms.filter((m) => numel(m) > 0);
  if (parts.length === 0) return matrix(0, 0);
  const rows = parts[0]!.rows;
  if (parts.some((m) => m.rows !== rows)) throw new Error("horzcat: row counts must agree");
  const cols = parts.reduce((s, m) => s + m.cols, 0);
  const out = matrix(rows, cols);
  for (let i = 0; i < rows; i++) {
    let off = i * cols;
    for (const m of parts) {
      out.data.set(m.data.subarray(i * m.cols, (i + 1) * m.cols), off);
      off += m.cols;
    }
  }
  return out;
}

export function vertcat(...ms: Matrix[]): Matrix {
  const parts = ms.filter((m) => numel(m) > 0);
  if (parts.length === 0) return matrix(0, 0);
  const cols = parts[0]!.cols;
  if (parts.some((m) => m.cols !== cols)) throw new Error("vertcat: column counts must agree");
  const rows = parts.reduce((s, m) => s + m.rows, 0);
  const out = matrix(rows, cols);
  let off = 0;
  for (const m of parts) {
    out.data.set(m.data, off);
    off += m.data.length;
  }
  return out;
}

/** Extract rows/cols by zero-based index arrays (`null` = all, like `:`). */
export function index(m: Matrix, rows: number[] | null, cols: number[] | null): Matrix {
  const ri = rows ?? Array.from({ length: m.rows }, (_, i) => i);
  const ci = cols ?? Array.from({ length: m.cols }, (_, j) => j);
  const out = matrix(ri.length, ci.length);
  ri.forEach((i, a) => {
    if (i < 0 || i >= m.rows) throw new Error(`Index exceeds matrix dimensions (row ${i + 1} of ${m.rows})`);
    ci.forEach((j, b) => {
      if (j < 0 || j >= m.cols) throw new Error(`Index exceeds matrix dimensions (column ${j + 1} of ${m.cols})`);
      out.data[a * ci.length + b] = m.data[i * m.cols + j]!;
    });
  });
  return out;
}

/** Linear (column-major) indexing, `m(k)`; zero-based. */
export function linearIndex(m: Matrix, ks: number[]): Matrix {
  const vals = ks.map((k) => {
    if (k < 0 || k >= numel(m)) throw new Error(`Index exceeds number of elements (${k + 1} of ${numel(m)})`);
    const j = Math.floor(k / m.rows);
    const i = k % m.rows;
    return m.data[i * m.cols + j]!;
  });
  return m.rows === 1 || (m.cols !== 1 && ks.length !== numel(m)) ? rowvec(vals) : colvec(vals);
}

/** Pretty-print in MATLAB's short format. */
export function format(m: Matrix, digits = 4): string {
  if (numel(m) === 0) return "[]";
  const fmt = (x: number): string => {
    if (Number.isInteger(x) && Math.abs(x) < 1e9) return String(x);
    const a = Math.abs(x);
    if (a !== 0 && (a >= 1e5 || a < 1e-3)) return x.toExponential(digits);
    return x.toFixed(digits);
  };
  if (isScalar(m)) return fmt(m.data[0]!);
  const cells = toArray(m).map((r) => r.map(fmt));
  const width = Math.max(...cells.flat().map((s) => s.length));
  return cells.map((r) => "  " + r.map((s) => s.padStart(width)).join("  ")).join("\n");
}
