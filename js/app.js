// Calculations and UI load locally; the optional 3D view can fail independently.
import { computeImpact } from './physics.js';
import { initUI } from './ui.js';

let scene = null;
const handlers = {
  onChange(params) {
    const res = computeImpact(params);
    const radius = params.diameter / 2e6;
    ui.setForecast(res, Math.max(radius, 0.03) / radius);
  },
  onObserver: (r) => scene?.onObserver(r),
  onGroundZero: (lat, lon) => scene?.onGroundZero(lat, lon),
  onResetPlanet: () => scene?.onResetPlanet(),
  onTimeScale: (v) => scene?.onTimeScale(v),
  onScrub: (v) => scene?.onScrub(v),
  onPlayPause: () => scene?.onPlayPause(),
  onTrueScale: (v) => scene?.onTrueScale(v),
  onCinematic: () => scene?.onCinematic(),
};
// Preserve marker choices made while the optional renderer is loading.
let groundZero = null, observerDistance = 500000;
handlers.onGroundZero = (lat, lon) => { groundZero = [lat, lon]; scene?.onGroundZero(lat, lon); };
handlers.onObserver = (r) => { observerDistance = r; scene?.onObserver(r); };
const ui = initUI(handlers);
const status = document.getElementById('app-status');
const sceneControls = ['launch-btn', 'reset-btn', 'cinematic-btn', 'truescale-chk', 'time-slider'];
for (const id of sceneControls) document.getElementById(id).disabled = true;
status.textContent = 'Assessments ready · loading optional 3D view…';

// Keep the calculator usable even when a CDN request stalls instead of failing.
const loadingNotice = setTimeout(() => {
  status.textContent = '3D view is still loading. Calculations, comparisons and export are ready.';
}, 8000);
try {
  const { initScene } = await import('./main.js');
  scene = initScene(ui);
  scene.onObserver(observerDistance);
  if (groundZero) scene.onGroundZero(...groundZero);
  handlers.onLaunch = scene.onLaunch;
  for (const id of sceneControls) document.getElementById(id).disabled = false;
  ui.refreshControls();
  status.hidden = true;
} catch (error) {
  status.textContent = '3D view unavailable. Calculations, comparisons and export still work.';
  ui.setPhase('Assessment mode');
  // Rendering failures never replace or invalidate the computed assessment.
  document.getElementById('scene').replaceChildren();
  console.warn('Optional 3D view could not start:', error);
} finally {
  clearTimeout(loadingNotice);
}
