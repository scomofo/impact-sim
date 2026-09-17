# Orbital Suite

A suite of space, orbital-mechanics and impact simulation software. It merges four
previously separate projects into one workspace and adds a shared MATLAB-flavoured
numerical toolbox.

| App | Path | Stack | What it does |
| --- | --- | --- | --- |
| Impact Simulator | `apps/impact` | vanilla JS, no build | Analytical assessment of asteroid/comet impacts with an optional cinematic 3D view and published benchmarks. |
| Orbital Lab | `apps/lab` | TypeScript + Vite | MATLAB-syntax command window: matrices, `ode45`, Kepler, Lambert, Hohmann, CR3BP, impact scaling, plots, and a Lambert porkchop-plot tool. |
| Libration | `apps/libration` | React + canvas | Lagrange points and halo orbits in the circular restricted three-body problem (from *Apoapsis*). |
| Helios | `apps/helios` | React + three.js | 3D solar-system observatory with Keplerian and N-body propagation and resonance views. |
| Stackyard | `apps/stackyard` | React + three.js + Rapier | Rigid-body physics playground. |

| Package | Path | What it does |
| --- | --- | --- |
| astrolab | `packages/astrolab` | Zero-dependency TypeScript toolbox with MATLAB-style APIs: dense matrices, Dormand–Prince `ode45` with events, `fzero`/`fminsearch`/`polyfit`/`interp1`, orbital elements ↔ state vectors, Kepler's equation, Lambert, Hohmann and bi-elliptic transfers, CR3BP dynamics and Lagrange points, Collins-et-al. impact scaling, and the MATLAB-subset interpreter that powers Orbital Lab. |

## Run

```sh
npm ci            # installs every workspace
npm run build     # builds the four Vite apps into apps/*/dist
python3 -m http.server 8742   # then open http://localhost:8742
```

The landing page at the repository root links every app. Individual apps:

```sh
npm run dev:lab          # Orbital Lab on http://localhost:5173
npm run dev:libration
npm run dev:helios
npm run dev:stackyard
npm run dev:impact       # static server for the Impact Simulator
```

## Orbital Lab in one minute

```matlab
r1 = R_earth + 300e3; r2 = 42164e3;
h = hohmann(r1, r2, mu_earth)            % struct with dv1, dv2, dv_total, tof
[r, v] = kepler2cart([7000e3 0.01 deg2rad(51.6) 0 0 0], mu_earth);
[t, y] = ode45(twobody(mu_earth), [0 period(7000e3, mu_earth)], [r; v], odeset('RelTol', 1e-9));
plot(y(:,1), y(:,2)); axis equal; title('one orbit');
s = impact(140, 3000, 20e3, deg2rad(45)); fprintf('%.0f Mt\n', s.energy_Mt);
```

### Porkchop plots

The **Porkchop tool** button opens a form (bodies, departure and arrival date
ranges, grid size, quantity, direction) and generates a script you can edit:

```matlab
jd_dep = linspace(juliandate(2026, 9, 1), juliandate(2027, 1, 31), 80);
jd_arr = linspace(juliandate(2027, 4, 1), juliandate(2028, 2, 28), 80);
p = porkchop('earth', 'mars', jd_dep, jd_arr);   % C3, vinf_dep, vinf_arr, tof grids + best_*
contourf(jd_dep - jd_dep(1), jd_arr - jd_arr(1), p.C3, [8 10 12 15 20 30 60]);
```

Planet positions come from JPL's approximate Keplerian mean elements (valid
1800–2050, Standish); `ephemeris('mars', jd)` exposes them directly, and
`juliandate`, `jd2date` and `datestr` convert dates.

Type `help` in the console for the full function list. The interpreter supports
MATLAB's matrix literals (including whitespace-separated elements and `'`
transpose), `end` and logical indexing, `:` ranges, element-wise and matrix
operators, `if`/`for`/`while`, script-local `function` definitions, anonymous
functions, multiple return values, structs, `sprintf`/`fprintf`, and the
`plot`/`hold`/`axis`/`grid`/`legend` family. Complex numbers and cell arrays are
not supported.

## Development checks

Node 22.22.2+ or 24.15.0+ is required.

```sh
npm run check   # node --check for the impact app, tsc --noEmit for the rest
npm test        # impact model tests (63) and astrolab tests (31)
npm run build
```

GitHub Actions runs all three for pushes and pull requests.

## Provenance

- `apps/impact` is the original [impact-sim](https://github.com/scomofo/impact-sim) app, moved unchanged into the workspace. See its [README](apps/impact/README.md), [model methods](apps/impact/docs/MODEL.md) and [catalog provenance](apps/impact/docs/CATALOG.md).
- `apps/libration`, `apps/helios` and `apps/stackyard` carry the simulation code from the [Apoapsis](https://github.com/scomofo/Apoapsis), [Helios](https://github.com/scomofo/Helios) and [Stackyard](https://github.com/scomofo/Stackyard) repositories. Those repositories were generated inside an app-builder sandbox and bundled a large auth/database/PWA scaffold that the simulations never used; only the simulation, HUD and styling sources were kept, each wrapped in a plain Vite + React entry point.
- `packages/astrolab` follows the formulas in Curtis, *Orbital Mechanics for Engineering Students*; Bate, Mueller & White; Hairer, Nørsett & Wanner (Dormand–Prince); and Collins, Melosh & Marcus (2005) for impact scaling. Tests reproduce worked examples from those sources.
