// Reproducible, rendering-independent assessment/report layer.
import { computeImpact, observerReport, INPUT_LIMITS, EARTH, TARGETS, MT_TNT } from './physics.js';

export const MODEL_VERSION = '0.2.0';
export const SOURCES = [
  { id: 'collins2005', label: 'Collins, Melosh & Marcus (2005)',
    url: 'https://doi.org/10.1111/j.1945-5100.2005.tb00157.x' },
  { id: 'collins2017', label: 'Collins et al. (2017): airburst model limits',
    url: 'https://doi.org/10.1111/maps.12873' },
  { id: 'leinhardt2012', label: 'Leinhardt & Stewart (2012)',
    url: 'https://doi.org/10.1088/0004-637X/745/1/79' },
  { id: 'genda2012', label: 'Genda, Kokubo & Ida (2012)',
    url: 'https://arxiv.org/abs/1109.4330' },
];

export function modelNotes(res) {
  const notes = [];
  const add = (code, text) => notes.push({ code, text });
  if (res.regime === 'giant') {
    add('giant-scaling', 'Collision regime and remnant mass use simplified scaling; the transition from cratering is an application rule.');
    add('giant-heuristics', 'Disk mass, moon formation, melting, spin and synestia are illustrative heuristics, not hydrodynamic predictions.');
  } else {
    add('entry-model', 'Entry assumes a uniform sphere and a fixed atmosphere; ablation, individual fragments and variable strength are unresolved.');
    if (res.regime === 'airburst') {
      add('static-airburst', 'Blast treats all incoming kinetic energy as one stationary source at the burst altitude. Real energy deposition is spread along the trajectory.');
      add('airburst-thermal', 'Airburst thermal radiation and surviving fragment impacts are not calculated; unavailable does not mean absent.');
      if (res.burstAlt / Math.cbrt(res.blastEnergy / (MT_TNT / 1000)) > 550) {
        add('high-airburst', 'High scaled burst altitude: the simple blast fit is poorly constrained.');
      }
    } else {
      if (res.energySurf > 1e4 * MT_TNT) add('large-blast', 'Blast scaling is extrapolated at this yield and can overestimate pressure.');
      if (!res.groundEffectsSupported) add('low-ground-speed', 'Ground speed is below 1 km/s. Crater, rock melt, seismic and ejecta estimates are withheld outside the hypervelocity model.');
      else if (res.vSeafloor < 3000) add('slow-cratering', 'Low ground speed: strength and fragmentation may dominate; crater scaling is uncertain.');
      if (res.craterField) add('fragment-field', 'The fragment cloud is wider than the predicted transient crater. A single crater diameter is only indicative.');
      if (res.crater?.Dfr > 100000) add('basin-scaling', 'Large-basin morphology is extrapolated from crater scaling; the displayed depth and diameter are not a calibrated basin solution.');
      if (res.waterDepth > 0) add('marine-model', 'Water, seafloor and atmospheric energies are separate. Water-cavity growth, seafloor disturbance and wave propagation remain simplified.');
      if (res.tsunami) add('tsunami-heuristic', 'Tsunami amplitude assumes an unobstructed ocean of constant depth. Coastal run-up, inundation and intervening land are not modeled.');
    }
    add('regional-effects', 'Observer effects assume idealized surroundings. Terrain, shielding, weather, population exposure and global climate response are not calculated.');
    add('arrival-times', 'Arrival times are approximations; blast uses sound speed and can arrive earlier as a strong shock.');
  }
  if (res.angleDeg < 15) add('shallow-entry', 'Very shallow entry: the straight trajectory and flat atmosphere approximations become less reliable.');
  if (res.velocity < EARTH.escapeVel && res.regime !== 'giant') add('slow-entry', 'This incoming speed is below Earth escape speed; treat it as a hypothetical initial condition.');
  return notes;
}

export function diameterSensitivity(inputs, fraction = 0.1) {
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 0.5) {
    throw new RangeError('Sensitivity fraction must be greater than 0 and at most 0.5.');
  }
  // Three deterministic scenarios, NOT a confidence interval or extrema search.
  const [min, max] = INPUT_LIMITS.diameter;
  return [1 - fraction, 1, 1 + fraction].map((factor) => {
    const res = computeImpact({ ...inputs, diameter: Math.max(min, Math.min(max, inputs.diameter * factor)) });
    return { diameter: res.diameter, energyMt: res.energyMt, regime: res.regime,
      craterDiameter: res.crater?.Dfr ?? null, burstAltitude: res.burstAlt ?? null,
      giantOutcome: res.giant?.outcome ?? null };
  });
}

export function createAssessmentReport(inputs, distance, { event = null, createdAt = new Date().toISOString() } = {}) {
  const result = computeImpact(inputs);
  const observer = observerReport(result, distance);
  return {
    schemaVersion: 1, modelVersion: MODEL_VERSION, createdAt,
    purpose: 'Educational scenario assessment using analytical estimates and labeled heuristics.',
    units: 'SI: m, kg, s, m/s, J, Pa; angles in degrees from horizontal. Fields ending in Mt are megatons TNT.',
    inputs: result.inputs, observerDistance: distance,
    assumptions: { earth: { ...EARTH }, targetDensity: TARGETS[result.target].rho,
      geography: 'Homogeneous selected target. Map position is visual only; no elevation, bathymetry or population data are queried.',
      nullValues: 'Not calculated or outside model scope, not a zero effect.',
      tsunami: 'Amplitude above still water; not crest-to-trough wave height or coastal run-up.',
      animation: 'Cinematic time and sizes do not define assessment values.' },
    event: event ? { id: event.id, name: event.name, observedCraterKm: event.craterKm ?? null,
      sources: event.sources ?? [], note: 'Preset inputs are illustrative, not a fitted reconstruction.' } : null,
    result, observer, notes: modelNotes(result), sources: SOURCES,
    sensitivity: { method: 'Three diameter scenarios at -10%, nominal, +10%, clipped to application bounds; other inputs fixed. Not a confidence interval.',
      scenarios: diameterSensitivity(result.inputs) },
  };
}
