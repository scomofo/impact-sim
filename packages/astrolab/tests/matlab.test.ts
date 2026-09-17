import { test } from "node:test";
import assert from "node:assert/strict";
import { createConsole, type PlotState } from "../src/index.ts";
import * as M from "../src/matrix.ts";

function run(src: string): { out: string; vars: Map<string, unknown>; plots: PlotState[] } {
  let out = "";
  const plots: PlotState[] = [];
  const c = createConsole({ print: (s) => (out += s), plot: (p) => plots.push(structuredClone({ ...p })) });
  c.run(src);
  return { out, vars: c.vars, plots };
}
const val = (vars: Map<string, unknown>, name: string): number[] => Array.from((vars.get(name) as M.Matrix).data);

test("matrix literals follow MATLAB whitespace rules", () => {
  const { vars } = run("a = [1 -2 3]; b = [1 - 2 3]; c = [1 -2]; d = [1, -2]; e = [a' a']; f = [1 2\n3 4];");
  assert.deepEqual(val(vars, "a"), [1, -2, 3]);
  assert.deepEqual(val(vars, "b"), [-1, 3]);
  assert.deepEqual(val(vars, "c"), [1, -2]);
  assert.deepEqual(val(vars, "d"), [1, -2]);
  assert.equal((vars.get("e") as M.Matrix).cols, 2);
  assert.deepEqual(M.toArray(vars.get("f") as M.Matrix), [[1, 2], [3, 4]]);
});

test("operators, precedence and transpose", () => {
  const { vars } = run("x = -2^2; y = 2^-1; z = [1 2 3].^2; A = [1 2; 3 4]; B = A'; C = A*B; D = A.*B; s = 1:3 + 1; t = (1:3)';");
  assert.deepEqual(val(vars, "x"), [-4]);
  assert.deepEqual(val(vars, "y"), [0.5]);
  assert.deepEqual(val(vars, "z"), [1, 4, 9]);
  assert.deepEqual(M.toArray(vars.get("C") as M.Matrix), [[5, 11], [11, 25]]);
  assert.deepEqual(M.toArray(vars.get("D") as M.Matrix), [[1, 6], [6, 16]]);
  assert.deepEqual(val(vars, "s"), [1, 2, 3, 4]);
  assert.equal((vars.get("t") as M.Matrix).rows, 3);
});

test("indexing with end, colon, logical masks and growth", () => {
  const { vars } = run(`
    v = 10:10:50;
    a = v(end); b = v(2:end-1); c = v(v > 25); v(7) = 70;
    A = magic3(); r = A(2,:); col = A(:,3); A(1,1) = 100; lin = A(:)';
    function m = magic3()
      m = [8 1 6; 3 5 7; 4 9 2];
    end
  `);
  assert.deepEqual(val(vars, "a"), [50]);
  assert.deepEqual(val(vars, "b"), [20, 30, 40]);
  assert.deepEqual(val(vars, "c"), [30, 40, 50]);
  assert.deepEqual(val(vars, "v"), [10, 20, 30, 40, 50, 0, 70]);
  assert.deepEqual(val(vars, "r"), [3, 5, 7]);
  assert.deepEqual(val(vars, "col"), [6, 7, 2]);
  assert.deepEqual(val(vars, "lin"), [100, 3, 4, 1, 5, 9, 6, 7, 2]);
});

test("control flow, functions and anonymous functions", () => {
  const { vars, out } = run(`
    total = 0;
    for k = 1:10
      if mod(k, 2) == 0, continue; end
      if k > 7, break, end
      total = total + k;
    end
    n = 0; while n < 5, n = n + 1; end
    sq = @(x) x.^2;
    f = @(a, b) a + b;
    r = sq(3) + f(1, 2);
    [q, w] = two(5);
    fprintf('%d %g\\n', q, w);
    function [a, b] = two(x)
      a = x * 2; b = x / 2;
    end
  `);
  assert.deepEqual(val(vars, "total"), [16]);
  assert.deepEqual(val(vars, "n"), [5]);
  assert.deepEqual(val(vars, "r"), [12]);
  assert.equal(out, "10 2.5\n");
});

test("display formatting and semicolon suppression", () => {
  const { out } = run("x = 2;\ny = x * 3\nz = [1 2; 3 4]\nx");
  assert.equal(out, "y =\n\n    6\nz =\n\n  1  2\n  3  4\nx =\n\n    2\n");
});

test("ode45 with multiple outputs and struct options", () => {
  const { vars } = run(`
    [t, y] = ode45(@(t, y) [y(2); -y(1)], [0 pi], [0; 1], odeset('RelTol', 1e-8, 'AbsTol', 1e-10));
    yend = y(end, :);
    sol = ode45(@(t, y) -y, [0 1], 1);
    last = sol.y(end);
  `);
  const yend = val(vars, "yend");
  assert.ok(Math.abs(yend[0]!) < 1e-6 && Math.abs(yend[1]! + 1) < 1e-6);
  assert.ok(Math.abs(val(vars, "last")[0]! - Math.exp(-1)) < 1e-3);
});

test("astro builtins expose the toolbox", () => {
  const { vars, out } = run(`
    h = hohmann(R_earth + 300e3, 42164e3, mu_earth);
    dv = h.dv_total;
    [r, v] = kepler2cart([7000e3 0 0 0 0 0], mu_earth);
    speed = norm(v);
    el = cart2kepler(r, v, mu_earth);
    s = impact(100, 3000, 20e3, deg2rad(45));
    disp(class(s));
  `);
  assert.ok(Math.abs(val(vars, "dv")[0]! - 3893) < 5);
  assert.ok(Math.abs(val(vars, "speed")[0]! - Math.sqrt(3.986004418e14 / 7000e3)) < 1e-6);
  assert.ok(Math.abs(val(vars, "el")[0]! - 7000e3) < 1e-3);
  assert.equal(out, "struct\n");
});

test("plot commands accumulate state and respect hold", () => {
  const { plots } = run("x = linspace(0, 1, 5); plot(x, x.^2); hold on; plot(x, x, 'r--'); title('t'); xlabel('x');");
  const last = plots.at(-1)!;
  assert.equal(last.series.length, 2);
  assert.equal(last.series[1]!.style, "r--");
  assert.equal(last.title, "t");
  assert.equal(last.xlabel, "x");
});

test("hold on does not leak from one run into the next", () => {
  let plots: PlotState[] = [];
  const c = createConsole({ print: () => {}, plot: (p) => plots.push(structuredClone({ ...p })) });
  c.run("plot(1:3, [400 401 402]); hold on;");
  plots = [];
  c.run("plot(1:3, [1 2 3]);");
  assert.equal(plots.at(-1)!.series.length, 1);
  assert.deepEqual(plots.at(-1)!.series[0]!.y, [1, 2, 3]);
});

test("errors carry line numbers", () => {
  assert.throws(() => run("x = 1;\ny = undefined_thing + 1;"), /line 2|undefined_thing/);
  assert.throws(() => run("[1 2] + [1 2 3]"), /dimensions must agree/);
  assert.throws(() => run("x = 1\nfor k = 1:3"), /Parse error/);
});

test("strings and sprintf", () => {
  const { out, vars } = run(`
    name = 'Ceres';
    s = sprintf('%s: %.2f AU, %d bodies', name, 2.77, 3);
    fprintf('%d,', [1 2 3]); fprintf('\\n');
    u = upper(name);
  `);
  assert.equal(vars.get("s"), "Ceres: 2.77 AU, 3 bodies");
  assert.equal(vars.get("u"), "CERES");
  assert.equal(out, "1,2,3,\n");
});

test("porkchop, contour and ind2sub from the console", () => {
  const { vars, plots, out } = run(`
    jd_dep = linspace(juliandate(2020,6,1), juliandate(2020,9,30), 12);
    jd_arr = linspace(juliandate(2020,11,1), juliandate(2021,6,30), 14);
    p = porkchop('earth', 'mars', jd_dep, jd_arr);
    [zmin, k] = min(p.C3(:)); [i, j] = ind2sub(size(p.C3), k);
    contourf(jd_dep, jd_arr, p.C3, 5); hold on; plot(jd_dep(j), jd_arr(i), 'wo');
    fprintf('%s\\n', datestr(p.best_jd_dep));
  `);
  const C3 = vars.get("p") as { fields: Map<string, M.Matrix> };
  assert.equal(C3.fields.get("C3")!.rows, 14);
  assert.ok(val(vars, "zmin")[0]! < 20);
  const last = plots.at(-1)!;
  assert.ok(last.contour && last.contour.filled && last.contour.levels.length === 5);
  assert.equal(last.series.length, 1);
  assert.match(out, /^2020-0[78]-\d\d\n$/);
});
