# Planetary Impact Simulator

Explore hypothetical impacts on an Earth-size planet with analytical assessment readouts and an optional cinematic 3D view. Scenarios range from atmospheric airbursts to planetary collisions.

The app estimates impact consequences. It does not forecast an asteroid's collision probability, casualties, evacuation zones or coastal inundation. Some extensions are explicitly labeled heuristics. See [model methods and validation](docs/MODEL.md) for sources, assumptions and known gaps.

## Run

Serve this directory over HTTP; no build step is needed:

```sh
python3 -m http.server 8742
```

Open http://localhost:8742. Three.js and Earth textures load from pinned CDN URLs. If the 3D module or graphics initialization fails, numerical controls, comparisons and report export remain available.

## Assess a scenario

- Choose a catalog event or enter exact diameter, speed, angle and density. Preset values survive slider rounding. Speed is before atmospheric entry; angle is above horizontal.
- Select target terrain and, for water impacts, water depth. Clicking the globe changes a visual marker; it does not look up terrain or population.
- Enter observer distance to inspect pressure, heat, shaking, ejecta and illustrative open-water amplitude where the model supports them.
- Expand model assumptions and the three-scenario diameter sensitivity comparison. Sensitivity samples are not confidence intervals.
- Export JSON to preserve exact inputs, model version, sources, assumptions and observer results. Compare up to four scenarios.
- Launch and scrub the 3D illustration. Animation time, sizes and wave fronts are cinematic, not geographical hazard boundaries.

Share an unmodified catalog preset with `?p=bennu`, `?p=ries`, `?p=theia`, etc. Custom input changes clear the preset URL; use JSON export to preserve custom scenarios.

Catalog values are illustrative rather than fitted historical reconstructions. When a reference crater diameter exists, the app shows it beside the calculated result so disagreement is visible. Updated source notes include Hiawatha's age, Nadir's inferred water depth and the time window of NASA's 2021 Bennu risk estimate.

## Development checks

Node 22.22.2+ or 24.15.0+ (supported LTS versions) is required only for development tests:

```sh
npm ci
npm run check
npm test
```

Tests include published calculation examples, conservation and boundary checks, a 3,840-scenario grid, DOM interactions, report exports and renderer-failure recovery. GitHub Actions runs the checks for pushes and pull requests. Browser visual review remains a separate gate; see [validation limits](docs/MODEL.md#verification-and-remaining-limits).

## Architecture

| File | Role |
| --- | --- |
| `js/physics.js` | Validated SI input boundary, entry, cratering, observer effects and collision scaling |
| `js/assessment.js` | Model provenance, assumptions, sensitivity samples and portable JSON reports |
| `js/app.js` | Calculation-first startup and optional 3D loading |
| `js/catalog.js` | Historical and hypothetical scenario assumptions |
| `js/ui.js` | Exact inputs, validation, readouts, comparisons and export |
| `js/main.js` | Optional Three.js scene, camera, launch/replay state |
| `js/effects.js` | Cinematic particles, waves, craters and debris effects |

The scientific baseline is [Collins, Melosh & Marcus (2005)](https://doi.org/10.1111/j.1945-5100.2005.tb00157.x), with [Collins et al. (2017)](https://doi.org/10.1111/maps.12873) informing airburst assumptions. Giant-impact scaling references [Leinhardt & Stewart (2012)](https://doi.org/10.1088/0004-637X/745/1/79) and [Genda et al. (2012)](https://arxiv.org/abs/1109.4330). This implementation's documented deviations and heuristics are part of the assessment, not hidden calibration.
