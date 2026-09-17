// Calculations and UI load locally; the optional 3D view can fail independently.
import { computeImpact } from './physics.js';
import { initUI } from './ui.js';

export async function startApp({ loadScene = () => import('./main.js') } = {}) {
  let scene = null;
  let failed = false;
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
  const sceneControls = ['launch-btn', 'reset-btn', 'cinematic-btn', 'truescale-chk', 'time-slider', 'play-btn', 'scrub-slider'];
  for (const id of sceneControls) document.getElementById(id).disabled = true;
  status.textContent = 'Assessments ready · loading optional 3D view…';

  // Keep the calculator usable even when a CDN request stalls instead of failing.
  const loadingNotice = setTimeout(() => {
    status.textContent = '3D view is still loading. Calculations, comparisons and export are ready.';
  }, 8000);
  function failScene(error) {
    if (failed) return;
    failed = true;
    const previous = scene;
    scene = null;
    handlers.onLaunch = null;
    for (const id of sceneControls) document.getElementById(id).disabled = true;
    ui.hideTimeline();
    ui.setPhase('Assessment mode');
    status.hidden = false;
    status.textContent = '3D view unavailable. Calculations, comparisons and export still work. Reload the page to retry 3D.';
    document.getElementById('scene').replaceChildren();
    try { previous?.dispose?.(); } catch (cleanupError) {
      console.warn('3D cleanup failed:', cleanupError);
    }
    console.warn('Optional 3D view could not continue:', error);
  }

  try {
    const { initScene } = await loadScene();
    scene = initScene(ui, { onFailure: failScene });
    if (failed) { scene?.dispose?.(); scene = null; return ui; }
    scene.onObserver(observerDistance);
    if (groundZero) scene.onGroundZero(...groundZero);
    handlers.onLaunch = scene.onLaunch;
    for (const id of sceneControls) document.getElementById(id).disabled = false;
    ui.refreshControls();
    status.hidden = true;
  } catch (error) {
    failScene(error);
  } finally {
    clearTimeout(loadingNotice);
  }

  return ui;
}
