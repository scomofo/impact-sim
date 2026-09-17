/** Generates the script for the station-keeping / orbit-maintenance tool. */

export interface StationSpec {
  regime: "leo" | "geo";
  years: number;
  mass: number;
  isp: number;
  /** Burn margin as a fraction. */
  margin: number;
  plot: "sawtooth" | "sweep" | "lifetime";
  // LEO
  alt: number;
  inc: number;
  area: number;
  cd: number;
  activity: "low" | "mean" | "high";
  /** Tolerated altitude drop before a reboost, km. */
  deadband: number;
  // GEO
  lon: number;
  /** Longitude box half-width, deg. */
  box: number;
  year: number;
  srpArea: number;
  cr: number;
  /** Inclination box, deg. */
  ibox: number;
}

export function stationScript(s: StationSpec): string {
  return s.regime === "leo" ? leoScript(s) : geoScript(s);
}

// Placeholder until the maintenance physics lands in astrolab (work in progress).
function leoScript(s: StationSpec): string {
  return `disp('Station-keeping tool (LEO, ${s.alt} km): maintenance physics is still being wired up.');\n`;
}

function geoScript(s: StationSpec): string {
  return `disp('Station-keeping tool (GEO, ${s.lon} deg): maintenance physics is still being wired up.');\n`;
}
