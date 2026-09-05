// Translate physical results into restrained cinematic effect envelopes.
// Keeping this separate from Three.js makes the visual policy testable.
const EARTH_RADIUS = 6_371_000;

export function visualEffectsProfile(result) {
  if (!result || result.regime === 'airburst') {
    return { thermalArc: 0, heat: 0, heatDuration: 0, globalMelt: false, dust: 0 };
  }

  if (result.regime === 'giant') {
    return {
      thermalArc: Math.PI + 0.35,
      heat: result.giant?.magmaOcean ? 1 : 0.62,
      heatDuration: 48,
      globalMelt: true,
      dust: 0,
    };
  }

  // `burn` is a radial thermal-effects distance, not permission to tint the
  // entire planet. A small minimum keeps sub-pixel flashes legible while the
  // maximum prevents an empirical regional estimate becoming global fire.
  const reach = Math.max(0, result.burn ?? 0);
  const thermalArc = Math.min(Math.PI * 0.72, Math.max(0.012, reach / EARTH_RADIUS));
  const energyScale = Math.max(0, Math.log10(Math.max(result.energyMt ?? 0, 1e-6)) + 1) / 8;
  const heat = reach > 0 ? Math.min(0.58, 0.12 + energyScale * 0.5) : 0;
  const severity = result.severity?.level ?? 0;
  return {
    thermalArc,
    heat,
    heatDuration: 5 + 8 * Math.min(1, thermalArc / 0.5),
    globalMelt: false,
    dust: severity >= 3 ? 0.18 + 0.09 * (severity - 3) : 0,
  };
}
