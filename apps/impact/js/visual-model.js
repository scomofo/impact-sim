// A schematic highlight of the primary fireball's thermal-exposure extent.
// This is not a wildfire, melt, ejecta-reentry or atmospheric transport model.
const EARTH_RADIUS = 6_371_000;

export function visualEffectsProfile(result) {
  if (!result || result.regime !== 'crater') {
    // Giant melt proxies do not supply a spatial thermal field. Unavailable
    // visualization means unmodelled, not physically absent heating.
    return { thermalArc: 0, heat: 0, heatDuration: 0 };
  }

  // `burn` is the third-degree-burn exposure threshold radius. Preserve it
  // without a minimum visible size: enlarging it would invent exposed terrain.
  const reach = Math.max(0, result.burn ?? 0);
  const thermalArc = Math.min(Math.PI, reach / EARTH_RADIUS);
  return {
    thermalArc,
    heat: reach > 0 ? 0.3 : 0,
    heatDuration: 6, // playback visibility only; physical duration is in readouts
  };
}
