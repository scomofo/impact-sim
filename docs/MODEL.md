# Assessment model 0.2.0

This application estimates consequences for a specified hypothetical Earth impact. It does not calculate the probability of that impact, casualties, evacuation boundaries, or coastal inundation. The model is an analytical approximation with explicit heuristics; numerical precision is not physical certainty.

## Inputs and reproducibility

The calculation boundary rejects missing, nonnumeric, non-finite and out-of-range values. It accepts diameter 10 m–7,420 km, bulk density 500–8,000 kg/m³, incoming speed 5–72 km/s, angle 5–90° above horizontal, and water depth 0–11 km for water targets. These are **application bounds**, not scientific validation bounds. Speeds below Earth escape speed and shallow entries are labeled as special assumptions.

The numeric fields are authoritative. Sliders are conveniences; choosing a preset or changing angle must not round its diameter or speed. Selecting a new preset resets terrain and water depth. Editing a physical input removes the historical preset attribution and URL parameter. Observer distance is the great-circle range, bounded by the antipode.

JSON exports contain normalized SI inputs, model/schema versions, timestamp, constants, observer distance, outputs, sources, limitations and diameter sensitivity samples. `null` means unavailable, not zero. Map coordinates are omitted because they do not affect the homogeneous-target calculation. A named event's observed crater size is reported separately from the model result.

## Equation provenance

Primary reference: [Collins, Melosh & Marcus (2005)](https://doi.org/10.1111/j.1945-5100.2005.tb00157.x), with an [accessible paper](https://adsabs.harvard.edu/pdf/2005M%26PS...40..817C).

| Implementation | Basis | Important implementation choice |
| --- | --- | --- |
| `simulateEntry` | Eqs. 8–18 | Fixed atmosphere and density-derived strength; 256-panel Simpson integration; no 1 km bypass |
| `craterResults`, `meltVolume` | Eqs. 21–30 | Uniform target; low-speed ground effects withheld below 1 km/s |
| `thermalAtDistance`, `burnRadius` | Eqs. 32–39, Table 1 | Fireball visibility includes the horizon; threshold radius found by bisection |
| `seismicMagnitude`, `seismicAtDistance` | Eqs. 40–42, Table 2 | Far-field epicentral angle remains **radians**, as defined in the paper |
| `ejectaAtDistance` | Eqs. 47, 49–52 | Ballistic travel on a spherical Earth; atmospheric suppression retained |
| `peakOverpressure`, `blastDamage` | Eqs. 54–59, Table 4 | Pressure-to-damage mapping corrected; labels describe possible consequences |
| Marine effects | Eq. 65 and marine-impact section | Post-entry dispersion width in drag; surface energy for blast/heat, seafloor energy for solid-ground effects |

### Airburst energy bookkeeping

The result separately exposes incoming, residual and deposited kinetic energy. `depositedEnergy + residualEnergy = energy`. The retained `burstEnergyMt` field is a legacy alias for **residual swarm kinetic energy**; it must not be used as blast yield.

The blast calculation now uses incoming kinetic energy as the idealized total yield of a stationary source at the computed burst altitude. This follows the static-source setup discussed by [Collins et al. (2017)](https://doi.org/10.1111/maps.12873). Their work also demonstrates limitations of this approximation. A moving source, ablation and trajectory-resolved deposition are not implemented. Arrival uses slant distance / 330 m/s, explicitly labeled approximate; a strong shock can arrive earlier.

### Ocean and near-field limits

`energySeafloor` and `waterDepositedEnergy` make the water energy budget inspectable. The 1 km/s cutoff is a software validity gate: withheld ground effects do **not** establish that the seabed is untouched. The water-cavity estimate is itself simplified.

Tsunami calculations are a separate, uncalibrated heuristic, not an EIEP prediction. The code returns amplitude above still water under constant-depth, unobstructed-ocean spreading. It withholds amplitude inside the cavity. It has no coastline, bathymetry, dispersion, wave-breaking, land barriers or run-up calculation. An observer marker cannot establish local coastal hazard.

### Giant impacts and visuals

Collision scaling is based on [Leinhardt & Stewart (2012)](https://doi.org/10.1088/0004-637X/745/1/79) and the [Genda et al. (2012) merger criterion](https://arxiv.org/abs/1109.4330). The simplified implementation is not an independently calibrated hydrodynamic model. The switch at mass ratio >0.01 or an unattenuated routing-crater diameter of one Earth radius is an application rule, evaluated independently of terrain.

Disk mass, moon formation, melt fraction, day length and synestia are heuristic illustrations. Disk mass is capped by mass outside the largest remnant; remnant, disk and other mass sum to the initial total. Perfect merging leaves no disk in this bookkeeping. The former ~1.75-lunar-mass Theia claim is not a validation target.

Color/severity levels are energy bands used to drive cinematic effects. They do not predict extinction, civilization loss or ocean boiling. The 3D view uses compressed time, exaggerated sizes and simplified choreography. Even after replaying a launch, assessment values describe that launch's initial conditions; repeated launches do not evolve the planet's physical input parameters.

## Verification and remaining limits

Run `npm ci`, `npm run check`, and `npm test` with Node 22.22.2+ or 24.15.0+ (supported LTS versions). The browser app itself has no npm/runtime dependency or build step; jsdom is for tests only.

Tests cover input validation, published examples, entry continuity, energy/mass accounting, marine coupling, blast thresholds, thermal horizon, antipodal distance, catalog reports, exact preset controls, export payloads, invalid-edit recovery and failed-renderer startup. A deterministic grid checks 3,840 combinations at five observer distances for finite outputs and physical bounds.

Reference comparisons use the **paper's** Table 6 inputs, not today's catalog reconstructions:

| Quantity | Published value | Model 0.2.0 | Check |
| --- | ---: | ---: | --- |
| 40 m iron: surface speed | ~10 km/s | 9.96 km/s | within 3% |
| 40 m iron: final crater | ~1.2 km | 1.18 km | within 3% |
| 40 m iron: pressure at 200 km | ~400 Pa | 408 Pa | within 3% |
| 1.75 km rock: final crater | ~23.7 km | 23.75 km | within 3% |
| 1.75 km rock: exposure at 200 km | ~14.8 MJ/m² | 14.83 MJ/m² | within 3% |
| 1.75 km rock: pressure at 200 km | ~80 kPa | 79.67 kPa | within 3% |
| 18 km rock: final crater | ~186 km | 185.59 km | within 3% |

These checks validate selected calculations, not the entire scientific model. Known discrepancies are not tuned away: the 1.75 km ejecta thickness is ~0.081 m versus the table's ~0.09 m; the 18 km pressure from the implemented equations is ~13.1 MPa versus the table's ~7.7 MPa. Large-yield blast output is flagged as extrapolated. Catalog fits can be much worse, including an airburst for some observed crater presets; measured and reconstructed crater definitions also differ.

The ±10% diameter comparison is three deterministic samples with all other inputs fixed. It is **not** a confidence interval, probabilistic forecast, or guaranteed minimum/maximum across a parameter range.

DOM tests do not verify WebGL rendering or CSS layout. Desktop/mobile visual review, live-CDN startup, launch/replay across regimes, and WebGL-unavailable behavior need a real browser before merge. The implementation session's browser blocked the local preview; renderer-import failure was verified with the DOM harness.

## Next scientific work

1. Add primary sources and explicit parameter ranges for every catalog preset; distinguish measured structure diameter from reconstructed original crater size.
2. Validate airburst pressure-distance curves against observations and implement a modern entry/energy-deposition model before claiming event reconstruction accuracy.
3. Replace the tsunami illustration with a validated bathymetric propagation model if coastal hazard is a product requirement.
4. Validate giant-impact regime boundaries and remnant predictions against numerical datasets; keep speculative disk/spin outcomes separate.
5. Add multivariate sensitivity with documented input distributions only when there is evidence to support those distributions.
