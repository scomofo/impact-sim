import { computeImpact, observerReport } from './physics.js';
import { MODEL_VERSION } from './assessment.js';

export const BENCHMARK_SOURCE = {
  label: 'Collins, Melosh & Marcus (2005), Table 6, p. 834; inputs on p. 833',
  url: 'https://doi.org/10.1111/j.1945-5100.2005.tb00157.x',
  paperUrl: 'https://adsabs.harvard.edu/pdf/2005M%26PS...40..817C#page=18',
};
const metric = (key, label, unit, reference, note = '') => ({ key, label, unit, reference, note });
export const BENCHMARKS = [
  { id: 'iron40', name: '40 m iron', inputs: { diameter: 40, density: 8000, velocity: 20000, angleDeg: 45, target: 'sedimentary' },
    metrics: [metric('energy', 'Surface energy', 'J', 1.3e16), metric('crater', 'Final crater diameter', 'm', 1200),
      metric('pressure', 'Peak overpressure', 'Pa', 400), metric('wind', 'Peak wind speed', 'm/s', 0.96),
      metric('thermal', 'Thermal exposure', 'J/m²', null, 'The paper reports no vapor fireball; a dash is not a numeric zero.')] },
  { id: 'rock1750', name: '1.75 km rock', inputs: { diameter: 1750, density: 2700, velocity: 20000, angleDeg: 45, target: 'crystalline' },
    metrics: [metric('energy', 'Surface energy', 'J', 1.5e21), metric('crater', 'Final crater diameter', 'm', 23700),
      metric('fireball', 'Fireball radius', 'm', 23000), metric('thermal', 'Thermal exposure', 'J/m²', 14.8e6),
      metric('pressure', 'Peak overpressure', 'Pa', 80000), metric('wind', 'Peak wind speed', 'm/s', 145),
      metric('ejecta', 'Ejecta thickness', 'm', 0.09, 'Known difference between the implemented equation and rounded table value.'),
      metric('arrival', 'Blast arrival', 's', 606)] },
  { id: 'rock18000', name: '18 km rock', inputs: { diameter: 18000, density: 2700, velocity: 20000, angleDeg: 45, target: 'crystalline' },
    metrics: [metric('energy', 'Surface energy', 'J', 1.65e24), metric('crater', 'Final crater diameter', 'm', 186000),
      metric('pressure', 'Peak overpressure', 'Pa', 7.7e6, 'Known large-yield discrepancy; blast scaling is extrapolated.'),
      metric('wind', 'Peak wind speed', 'm/s', 2220), metric('thermal', 'Thermal exposure', 'J/m²', null, 'Inside the modeled fireball; the paper supplies no numeric exposure.')] },
];

export function compareValue(actual, reference, tolerancePercent = 3) {
  if (!Number.isFinite(actual) || !Number.isFinite(reference)) return { difference: null, percentDifference: null, status: 'not-comparable' };
  const difference = actual - reference;
  const percentDifference = reference === 0 ? null : 100 * difference / Math.abs(reference);
  const within = reference === 0 ? actual === 0 : Math.abs(percentDifference) <= tolerancePercent;
  return { difference, percentDifference, status: within ? 'within-tolerance' : 'review' };
}

export function runBenchmarks({ calculate = computeImpact, observe = observerReport } = {}) {
  const cases = BENCHMARKS.map((example) => {
    let values = {}, error = null;
    try {
      const r = calculate(example.inputs), o = observe(r, 200000);
      values = { energy: r.energySurf, crater: r.crater?.Dfr, fireball: r.fireball,
        pressure: o.blast?.p, wind: o.blast?.wind, thermal: o.thermal?.exposure,
        ejecta: o.ejecta?.thickness, arrival: o.blast?.arrival };
    } catch (e) { error = e.message; }
    return { ...example, observerDistance: 200000, error,
      metrics: example.metrics.map((m) => {
        const actual = Number.isFinite(values[m.key]) ? values[m.key] : null;
        return { ...m, actual, ...compareValue(actual, m.reference) };
      }) };
  });
  return { modelVersion: MODEL_VERSION, benchmarkVersion: 1, source: BENCHMARK_SOURCE,
    tolerancePercent: 3, scope: 'Selected rounded outputs from one analytical model publication. Agreement is not independent empirical validation or an overall accuracy score.',
    cases };
}
