// main.js — scene, impact sequence state machine, camera director.
// Scene scale: 1 unit = 1000 km. The physics readouts (physics.js) are real;
// the animation timeline is cinematic (approach compressed to seconds).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EARTH, computeImpact } from './physics.js';
import {
  UNIT, glowTexture, makeStarfield, makeAtmosphere, makeHeatShell,
  Flash, ShockWaves, Ejecta, DebrisRing, ChunkBurst, Trail,
} from './effects.js';
import { initUI } from './ui.js';

const R = EARTH.radius / UNIT; // planet radius in scene units (6.371)
const MIN_VISUAL = 0.03;       // minimum impactor visual radius (scene units)
const APPROACH_TIME = 5.5;     // seconds of cinematic approach

// --- renderer / scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.getElementById('scene').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 9000);
camera.position.set(0, 5, 19);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = R * 1.15;
controls.maxDistance = 600;

const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
sun.position.set(120, 40, 90);
scene.add(sun, new THREE.AmbientLight(0x223344, 0.5));
scene.add(makeStarfield());

// --- planet with paintable surface -----------------------------------------
const planetGroup = new THREE.Group();
scene.add(planetGroup);

const TEX_W = 2048, TEX_H = 1024;
const surfCanvas = document.createElement('canvas');
surfCanvas.width = TEX_W; surfCanvas.height = TEX_H;
const surfCtx = surfCanvas.getContext('2d', { willReadFrequently: true });
let cleanSurface = null; // ImageData snapshot for "reset planet"

function drawProceduralEarth(ctx) {
  const grad = ctx.createLinearGradient(0, 0, 0, TEX_H);
  grad.addColorStop(0, '#0d2f52');
  grad.addColorStop(0.5, '#134b7a');
  grad.addColorStop(1, '#0d2f52');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  // Blobby continents from overlapping random-walk discs.
  let seed = 42;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let c = 0; c < 26; c++) {
    let x = rand() * TEX_W, y = TEX_H * (0.18 + rand() * 0.64);
    const hue = 80 + rand() * 40, n = 40 + rand() * 110;
    for (let i = 0; i < n; i++) {
      const r = 8 + rand() * 34;
      ctx.fillStyle = `hsla(${hue - r}, ${30 + rand() * 25}%, ${26 + rand() * 16}%, 0.85)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      x = (x + (rand() - 0.5) * 55 + TEX_W) % TEX_W;
      y = Math.min(TEX_H * 0.88, Math.max(TEX_H * 0.12, y + (rand() - 0.5) * 42));
    }
  }
  // Polar caps.
  ctx.fillStyle = 'rgba(235,242,248,0.95)';
  ctx.fillRect(0, 0, TEX_W, TEX_H * 0.045);
  ctx.fillRect(0, TEX_H * 0.955, TEX_W, TEX_H * 0.045);
}
drawProceduralEarth(surfCtx);

const surfTex = new THREE.CanvasTexture(surfCanvas);
surfTex.colorSpace = THREE.SRGBColorSpace;
surfTex.anisotropy = 4;

// Displacement canvas gives large craters and basins real depth. 0.5 gray is
// neutral; darker digs in, brighter raises the rim. Relief is ~3x exaggerated
// so basin-scale scars read at planet view.
const DISP_W = 512, DISP_H = 256;
const dispCanvas = document.createElement('canvas');
dispCanvas.width = DISP_W; dispCanvas.height = DISP_H;
const dispCtx = dispCanvas.getContext('2d', { willReadFrequently: true });
dispCtx.fillStyle = '#808080';
dispCtx.fillRect(0, 0, DISP_W, DISP_H);
const dispTex = new THREE.CanvasTexture(dispCanvas);

const planetMat = new THREE.MeshPhongMaterial({
  map: surfTex, shininess: 8, specular: new THREE.Color(0x222833),
  emissive: new THREE.Color(0x000000),
  displacementMap: dispTex, displacementScale: 0.5, displacementBias: -0.25,
});
const planet = new THREE.Mesh(new THREE.SphereGeometry(R, 192, 128), planetMat);
planetGroup.add(planet);
const atmosphere = makeAtmosphere(R);
planetGroup.add(atmosphere);

// Real Earth textures come from the three.js repo via jsdelivr's GitHub endpoint
// (the npm package excludes examples/textures). CORS-clean, so canvas-safe.
const TEX_CDN = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/planets/';
new THREE.ImageLoader().setCrossOrigin('anonymous').load(
  TEX_CDN + 'earth_atmos_2048.jpg',
  (img) => {
    surfCtx.drawImage(img, 0, 0, TEX_W, TEX_H);
    cleanSurface = surfCtx.getImageData(0, 0, TEX_W, TEX_H);
    // Replay craters painted while the texture was still downloading.
    const replay = paintedCraters.splice(0);
    for (const c of replay) paintCrater(c.dir, c.arcRadius);
    surfTex.needsUpdate = true;
  },
  undefined,
  () => { cleanSurface = surfCtx.getImageData(0, 0, TEX_W, TEX_H); },
);
cleanSurface = surfCtx.getImageData(0, 0, TEX_W, TEX_H);

const texLoader = new THREE.TextureLoader();
planetMat.specularMap = texLoader.load(TEX_CDN + 'earth_specular_2048.jpg');
planetMat.normalMap = texLoader.load(TEX_CDN + 'earth_normal_2048.jpg');
planetMat.normalScale = new THREE.Vector2(0.6, 0.6);
planetMat.needsUpdate = true;

const cloudTex = texLoader.load(TEX_CDN + 'earth_clouds_1024.png');
cloudTex.colorSpace = THREE.SRGBColorSpace;
const clouds = new THREE.Mesh(
  new THREE.SphereGeometry(R * 1.006, 64, 48),
  new THREE.MeshLambertMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.75 }),
);
planetGroup.add(clouds);
planet.renderOrder = 0;
clouds.renderOrder = 1;
atmosphere.renderOrder = 2;

// Craters painted so far — replayed if the real Earth texture arrives late.
const paintedCraters = [];

// Depth relief for basin-scale craters (arc > ~2.3° so the 192-segment sphere
// can actually show it).
function paintRelief(localDir, arcRadius) {
  if (arcRadius < 0.04) return;
  const d = localDir.clone().normalize();
  const theta = Math.acos(THREE.MathUtils.clamp(d.y, -1, 1));
  let u = Math.atan2(d.z, -d.x) / (2 * Math.PI);
  u = ((u % 1) + 1) % 1;
  const px = u * DISP_W;
  const py = (theta / Math.PI) * DISP_H;
  const pr = Math.max(3, (arcRadius / Math.PI) * DISP_H);
  const stretch = 1 / Math.max(0.35, Math.sin(theta));
  for (const ox of [-DISP_W, 0, DISP_W]) {
    dispCtx.save();
    dispCtx.translate(px + ox, py);
    dispCtx.scale(stretch, 1);
    const g = dispCtx.createRadialGradient(0, 0, 0, 0, 0, pr);
    g.addColorStop(0, 'rgba(58,58,58,0.9)');    // bowl digs in
    g.addColorStop(0.72, 'rgba(110,110,110,0.55)');
    g.addColorStop(0.88, 'rgba(158,158,158,0.6)'); // raised rim
    g.addColorStop(1, 'rgba(128,128,128,0)');
    dispCtx.fillStyle = g;
    dispCtx.beginPath();
    dispCtx.arc(0, 0, pr, 0, Math.PI * 2);
    dispCtx.fill();
    dispCtx.restore();
  }
  dispTex.needsUpdate = true;
}

// Paint a crater at a planet-local direction. arcRadius in radians of surface arc.
function paintCrater(localDir, arcRadius) {
  paintedCraters.push({ dir: localDir.clone(), arcRadius });
  paintRelief(localDir, arcRadius);
  const d = localDir.clone().normalize();
  const theta = Math.acos(THREE.MathUtils.clamp(d.y, -1, 1));
  let u = Math.atan2(d.z, -d.x) / (2 * Math.PI);
  u = ((u % 1) + 1) % 1;
  const px = u * TEX_W;
  const py = (theta / Math.PI) * TEX_H;
  const pr = Math.max(3, (arcRadius / Math.PI) * TEX_H);
  // Latitude stretch so the splat stays round-ish away from the equator.
  const stretch = 1 / Math.max(0.35, Math.sin(theta));
  for (const ox of [-TEX_W, 0, TEX_W]) {
    surfCtx.save();
    surfCtx.translate(px + ox, py);
    surfCtx.scale(stretch, 1);
    let g = surfCtx.createRadialGradient(0, 0, 0, 0, 0, pr);
    g.addColorStop(0, 'rgba(28,20,14,0.95)');
    g.addColorStop(0.55, 'rgba(52,38,26,0.85)');
    g.addColorStop(0.8, 'rgba(92,72,52,0.55)');
    g.addColorStop(1, 'rgba(120,98,72,0)');
    surfCtx.fillStyle = g;
    surfCtx.beginPath();
    surfCtx.arc(0, 0, pr, 0, Math.PI * 2);
    surfCtx.fill();
    // Bright ejecta rim.
    surfCtx.strokeStyle = 'rgba(190,170,140,0.5)';
    surfCtx.lineWidth = Math.max(1.5, pr * 0.1);
    surfCtx.beginPath();
    surfCtx.arc(0, 0, pr * 0.85, 0, Math.PI * 2);
    surfCtx.stroke();
    surfCtx.restore();
  }
  surfTex.needsUpdate = true;
}

function resetSurface() {
  paintedCraters.length = 0;
  if (cleanSurface) surfCtx.putImageData(cleanSurface, 0, 0);
  else drawProceduralEarth(surfCtx);
  surfTex.needsUpdate = true;
  dispCtx.fillStyle = '#808080';
  dispCtx.fillRect(0, 0, DISP_W, DISP_H);
  dispTex.needsUpdate = true;
}

// --- impactor ---------------------------------------------------------------
function makeImpactorGeometry() {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + 0.22 * (
      Math.sin(v.x * 5.1 + 1.3) * Math.sin(v.y * 4.3 + 2.1) +
      0.5 * Math.sin(v.z * 8.7 + 0.5) * Math.sin(v.x * 7.9)
    ) * 0.5;
    v.multiplyScalar(n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
const impactorMat = new THREE.MeshStandardMaterial({
  color: 0x8a7a68, roughness: 0.95, flatShading: false,
  emissive: new THREE.Color(0xff4400), emissiveIntensity: 0,
});
const impactor = new THREE.Mesh(makeImpactorGeometry(), impactorMat);
impactor.visible = false;
scene.add(impactor);

// --- effect systems ---------------------------------------------------------
const flash = new Flash(scene);
const shock = new ShockWaves(planetGroup, R); // parented: waves ride the surface
const ejecta = new Ejecta(scene, R);
const ring = new DebrisRing(scene, R);
const chunks = new ChunkBurst(scene, R);
const trail = new Trail(scene);
const heatShell = makeHeatShell(R);
planetGroup.add(heatShell);
// Gray dust veil shell for climate-catastrophe impacts.
const dustShell = makeHeatShell(R * 1.045);
dustShell.material.uniforms.uColor.value.setHex(0x7d786c);
planetGroup.add(dustShell);

// Moon that accretes from the debris disk after moon-forming impacts.
const moonMat = new THREE.MeshPhongMaterial({
  color: 0xbcb8b2,
  emissive: new THREE.Color(0xff5522), // newly accreted = still molten; cools over time
  emissiveIntensity: 0,
});
texLoader.load(TEX_CDN + 'moon_1024.jpg', (t) => {
  t.colorSpace = THREE.SRGBColorSpace;
  moonMat.map = t;
  moonMat.color.setHex(0xffffff);
  moonMat.needsUpdate = true;
});
const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), moonMat);
moon.visible = false;
scene.add(moon);
const _moonPos = new THREE.Vector3();

// --- simulation state -------------------------------------------------------
const sim = {
  state: 'idle',       // idle | approach | impact
  t: 0,                // time within current state (sim seconds)
  effTime: 0,          // monotonically growing effects clock (sim seconds)
  secondaries: [],     // scheduled fallback-debris impacts {at, localDir, scale}
  antipodeAt: null,    // effTime when the seismic front converges at the antipode
  timeScale: 1,
  trueScale: false,
  result: null,        // physics result for the running launch
  impactLocal: new THREE.Vector3(0.3, 0.22, 0.93).normalize(), // planet-local impact dir
  observerR: 5e5,      // observer distance from ground zero, m
  runT0: 0,            // effTime when the current launch started
  launchParams: null,  // params of the current run, for scrub replay
  timelineEvents: [],
  phaseRestoreAt: null,
  phaseRestoreText: '',
  dustTarget: 0,
  replaySnapshot: null, // {surf, disp, craterCount} captured at launch
  lastScale: 1,
  heatFrontArc: 0,      // how far the ignition front has swept (radians)
  heatFrontSpeed: 0,
  moonForming: null,    // {at, growDur, finalR, orbitR, angle0, omega, ...}
  startWorld: new THREE.Vector3(),
  velDir: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  planetSpin: 0.004,
  emissiveHeat: 0,     // planet lava-glow level 0..1
  planetScale: 1,      // shrinks for disruption outcomes
  hitAndRun: null,     // {dir, speed} when the projectile escapes
  exaggeration: 1,
};

// --- surface markers (ground zero + observer), parented to the planet -------
function makeMarker(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0.9,
  }));
  s.scale.setScalar(size);
  planetGroup.add(s);
  return s;
}
const gzMarker = makeMarker(0xff7a2a, 0.45);
const obsMarker = makeMarker(0x4dd2ff, 0.38);

function updateMarkers() {
  gzMarker.position.copy(sim.impactLocal).multiplyScalar(R * 1.005);
  const helper = Math.abs(sim.impactLocal.y) > 0.9
    ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const axis = new THREE.Vector3().crossVectors(sim.impactLocal, helper).normalize();
  const q = new THREE.Quaternion().setFromAxisAngle(axis, sim.observerR / EARTH.radius);
  obsMarker.position.copy(sim.impactLocal).applyQuaternion(q).multiplyScalar(R * 1.005);
}

function impactorVisualRadius(diameter) {
  const trueR = (diameter / 2) / UNIT;
  if (sim.trueScale) return Math.max(trueR, 1e-5);
  return Math.max(trueR, MIN_VISUAL);
}

function currentImpactWorld() {
  return planetGroup.localToWorld(sim.impactLocal.clone().multiplyScalar(R));
}

const RUN_DURATION = 48; // sim-seconds of scrubbable timeline per run

function launch(params) {
  // Clear any prior run but keep painted craters.
  clearRun();
  // A fresh launch always plays, even if the user paused or scrubbed before.
  if (sim.timeScale === 0) {
    sim.timeScale = sim.lastScale || 1;
    ui.setTimeScale(sim.timeScale);
  }
  sim.result = computeImpact(params);
  const res = sim.result;
  sim.launchParams = { ...params };
  sim.runT0 = sim.effTime;
  sim.timelineEvents = [{ t: APPROACH_TIME, label: 'impact' }];
  // Snapshot the surface so backward scrubs can replay the run from clean state.
  sim.replaySnapshot = {
    surf: surfCtx.getImageData(0, 0, TEX_W, TEX_H),
    disp: dispCtx.getImageData(0, 0, DISP_W, DISP_H),
    craterCount: paintedCraters.length,
  };
  ui.setTimeline(RUN_DURATION, sim.timelineEvents);

  // Geometry of the approach, in world space at launch time.
  const Pw = currentImpactWorld();
  const N = Pw.clone().normalize();
  const up = Math.abs(N.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const T = new THREE.Vector3().crossVectors(up, N).normalize(); // surface tangent
  const a = THREE.MathUtils.degToRad(params.angleDeg);
  sim.velDir.copy(T).multiplyScalar(Math.cos(a)).addScaledVector(N, -Math.sin(a)).normalize();
  sim.tangent.copy(T);
  const dist = 26;
  sim.startWorld.copy(Pw).addScaledVector(sim.velDir, -dist);

  const vr = impactorVisualRadius(params.diameter);
  impactor.scale.setScalar(vr);
  sim.exaggeration = vr / Math.max((params.diameter / 2) / UNIT, 1e-12);
  impactor.visible = true;
  impactorMat.emissiveIntensity = 0;

  sim.state = 'approach';
  sim.t = 0;
  ui.setPhase('Incoming — trajectory locked');
  ui.setForecast(res, sim.exaggeration);
  camDirector.mode = 'auto';
  ui.setCamMode('auto');
}

function clearRun() {
  ejecta.clear(); ring.clear(); chunks.clear(); trail.clear(); flash.clear(); shock.clear();
  sim.secondaries = [];
  sim.antipodeAt = null;
  sim.moonForming = null;
  moon.visible = false;
  moon.scale.setScalar(0.001);
  heatShell.visible = false;
  heatShell.material.uniforms.uOpacity.value = 0;
  heatShell.material.uniforms.uFrontArc.value = 0;
  sim.heatFrontArc = 0;
  sim.heatFrontSpeed = 0;
  dustShell.visible = false;
  dustShell.material.uniforms.uOpacity.value = 0;
  sim.dustTarget = 0;
  sim.phaseRestoreAt = null;
  sun.intensity = 2.6;
  sim.emissiveHeat = 0;
  sim.planetScale = 1;
  sim.hitAndRun = null;
  planetGroup.scale.setScalar(1);
  planet.visible = true;
  atmosphere.visible = true;
  clouds.visible = true;
  clouds.material.opacity = 0.75;
  planetMat.emissive.setHex(0x000000);
  planetMat.emissiveIntensity = 1;
  impactor.visible = false;
}

function resetPlanet() {
  clearRun();
  resetSurface();
  sim.state = 'idle';
  sim.result = null;
  ui.setPhase('Standing by');
}

// Effect choreography at the moment of contact.
function onContact() {
  const res = sim.result;
  const now = sim.effTime;
  const Pw = currentImpactWorld();
  const Nw = Pw.clone().normalize();
  const logMt = Math.log10(Math.max(res.energyMt, 1e-3));
  const strength = THREE.MathUtils.clamp((logMt + 1) / 8, 0.06, 3);

  impactor.visible = res.regime !== 'giant' ? false : true;

  if (res.regime === 'airburst') {
    const alt = Math.max(0.05, ((res.burstAlt ?? 30000) / UNIT) * 4); // exaggerated altitude
    flash.trigger(Pw.clone().addScaledVector(Nw, alt), Math.max(0.15, strength * 0.5));
    shock.trigger(sim.impactLocal, [
      { speed: 0.03, maxArc: 0.06, width: 0.015, peak: 0.5, tail: 1.5 },
    ], now);
    ui.setPhase('Airburst — broke up in the atmosphere');
    return;
  }

  if (res.regime === 'crater') {
    flash.trigger(Pw, strength);

    // Three physical wave fronts, at their real relative order: fireball flash,
    // then the seismic ring racing ahead of the slower air blast.
    const reach = res.burn ?? res.crater.Dfr * 3;
    const burnArc = THREE.MathUtils.clamp(reach / EARTH.radius, 0.04, Math.PI);
    const fireArc = THREE.MathUtils.clamp((res.fireball ?? res.crater.Dfr) / EARTH.radius, 0.015, Math.PI);
    const quakeArc = THREE.MathUtils.clamp(burnArc * (2 + res.severity.level), 0.12, Math.PI);
    shock.trigger(sim.impactLocal, [
      { speed: fireArc / 1.1, maxArc: fireArc, width: Math.max(0.012, fireArc * 0.3), peak: 1.0, tail: 1.2 },
      { delay: 0.25, speed: quakeArc / 7, maxArc: quakeArc, width: 0.03 + 0.05 * (quakeArc / Math.PI), peak: 0.35, tail: 3 },
      { delay: 0.4, speed: burnArc / 14, maxArc: burnArc, width: Math.max(0.02, burnArc * 0.1), peak: 0.8, tail: 2.2 },
    ], now);

    // Ejecta curtain with physically-scaled launch speeds: v ~ sqrt(g * Rc),
    // fastest streaks capped at a fraction of the impact speed.
    const Rc = res.crater.Dtc / 2;
    const vScale = Math.sqrt(EARTH.g * Rc);
    const Dkm = res.crater.Dfr / 1000;
    ejecta.spawn(Pw, Nw, now, {
      count: Math.round(THREE.MathUtils.clamp(4000 + 9000 * Math.log10(Dkm + 1), 2500, 34000)),
      vMin: 0.4 * vScale,
      vMax: Math.min(8 * vScale, 0.4 * res.vSurface),
      spread: 0.85,
      curtainBias: 0.65,
      hotFrac: res.vSurface >= 12000 ? 0.55 : 0.25,
      sizeScale: THREE.MathUtils.clamp(0.6 + Dkm / 250, 0.6, 2.4),
      life: 18 + Math.min(22, Dkm / 15),
    });

    // Fallback debris: schedule secondary strikes around big craters.
    if (Dkm > 40) {
      const craterArc = (res.crater.Dfr / 2) / EARTH.radius;
      const n = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        sim.secondaries.push({
          at: now + 2.5 + Math.random() * 6,
          localDir: offsetOnSphere(sim.impactLocal, craterArc * (1.5 + Math.random() * 2.5)),
          scale: 0.2 + Math.random() * 0.35,
        });
      }
      sim.secondaries.sort((a, b) => a.at - b.at);
    }

    // Big quakes converge at the antipode.
    if (res.severity.level >= 4 && quakeArc >= Math.PI * 0.99) {
      sim.antipodeAt = now + 0.25 + Math.PI / (quakeArc / 7);
    }

    paintCrater(sim.impactLocal, (res.crater.Dfr / 2) / EARTH.radius);
    if (res.severity.level >= 2) {
      sim.emissiveHeat = Math.min(0.55, 0.18 * (res.severity.level - 1));
      // Firestorm front sweeps out from ground zero (~14 s to wrap).
      heatShell.material.uniforms.uImpactDir.value.copy(sim.impactLocal);
      sim.heatFrontSpeed = Math.PI / 14;
    }
    if (res.severity.level >= 3) sim.dustTarget = 0.18 + 0.09 * (res.severity.level - 3);
    ui.setPhase('Impact! Crater forming');
    updateTimelineEvents(now);
    return;
  }

  // Giant impact.
  const g = res.giant;
  flash.trigger(Pw, Math.min(3.2, 1.4 + g.gamma * 6));
  shock.trigger(sim.impactLocal, [
    { speed: 1.1, maxArc: Math.PI, width: 0.25, peak: 1.2, tail: 1.5 },
    { delay: 0.3, speed: Math.PI / 8, maxArc: Math.PI, width: 0.09, peak: 0.5, tail: 3 },
    { delay: 0.6, speed: Math.PI / 16, maxArc: Math.PI, width: 0.2, peak: 0.9, tail: 2.5 },
  ], now);
  sim.antipodeAt = now + 0.3 + Math.PI / (Math.PI / 8);

  // Mantle-scale ejecta: km/s launch speeds, a fraction escaping outright.
  ejecta.spawn(Pw, Nw, now, {
    count: 30000,
    vMin: 1500,
    vMax: EARTH.escapeVel * (0.7 + 0.6 * Math.min(1, g.QR / g.QStar + 0.3)),
    spread: 1.0,
    curtainBias: 0.5,
    hotFrac: 0.8,
    sizeScale: 3,
    life: 40,
  });
  paintCrater(sim.impactLocal, Math.min(1.2, 0.35 + g.gamma * 2));
  sim.emissiveHeat = g.magmaOcean ? 1 : 0.6;
  heatShell.material.uniforms.uImpactDir.value.copy(sim.impactLocal);
  sim.heatFrontSpeed = Math.PI / 7;   // mantle-melt front wraps in ~7 s

  const orbitNormal = new THREE.Vector3().crossVectors(sim.velDir, Nw).normalize();
  if (g.outcome === 'hit-and-run') {
    sim.hitAndRun = {
      dir: sim.velDir.clone().addScaledVector(Nw, 0.55).normalize(),
      speed: 3.2,
    };
    ejecta.spawn(Pw, sim.hitAndRun.dir, now, {
      count: 9000, vMin: 3000, vMax: 12000, spread: 0.35, curtainBias: 0.3,
      hotFrac: 0.9, sizeScale: 2.5, life: 30,
    });
    ui.setPhase('Hit and run — projectile survives and escapes');
  } else if (g.outcome === 'catastrophic disruption' || g.outcome === 'super-catastrophic') {
    chunks.trigger(sim.velDir);
    ring.trigger(Pw, orbitNormal);
    sim.planetScale = Math.max(0.25, Math.cbrt(Math.max(g.mlrFrac, 0.02)));
    atmosphere.visible = false;
    ui.setPhase(g.outcome === 'super-catastrophic'
      ? 'Super-catastrophic — planet destroyed'
      : 'Catastrophic disruption — planet shattered');
  } else {
    if (g.moonForming) {
      ring.trigger(Pw, orbitNormal);
      // The disk coalesces into a moon whose size follows the disk mass.
      sim.moonForming = {
        at: now + 16,
        growDur: 22,
        finalR: 1.737 * Math.cbrt(Math.min(g.diskMoons, 2)),
        orbitR: R * 3.2,
        angle0: Math.random() * Math.PI * 2,
        omega: (2 * Math.PI) / 50,
        started: false,
        done: false,
      };
      ui.setPhase('Giant impact — debris disk forming (a moon is born)');
    } else {
      ui.setPhase(`Giant impact — ${g.outcome}`);
    }
  }
  updateTimelineEvents(now);
}

// Push the contact-time-scheduled events onto the scrubber.
function updateTimelineEvents(contactTime) {
  const rel = (t) => t - sim.runT0;
  for (const s of sim.secondaries) {
    sim.timelineEvents.push({ t: rel(s.at), label: 'secondary' });
  }
  if (sim.antipodeAt !== null) {
    sim.timelineEvents.push({ t: rel(sim.antipodeAt), label: 'antipode' });
  }
  if (sim.moonForming) {
    sim.timelineEvents.push({ t: rel(sim.moonForming.at), label: 'moon' });
  }
  ui.setTimeline(RUN_DURATION, sim.timelineEvents);
}

// A point on the unit sphere at arc-distance `arc` from `dir`, random azimuth.
function offsetOnSphere(dir, arc) {
  const helper = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const axis = new THREE.Vector3().crossVectors(dir, helper).normalize();
  axis.applyAxisAngle(dir, Math.random() * Math.PI * 2);
  return dir.clone().applyAxisAngle(axis, arc).normalize();
}

// --- timeline scrubbing -----------------------------------------------------
// Forward: fast-forward the pure sim. Backward: restore the pre-launch surface
// snapshot and replay deterministically from launch.
function fastForward(delta) {
  const prevScale = sim.timeScale;
  sim.timeScale = 1;
  let left = delta;
  while (left > 1e-4) {
    const st = Math.min(0.1, left);
    advance(st);
    left -= st;
  }
  sim.timeScale = prevScale;
}

function scrubTo(tau) {
  if (!sim.launchParams) return;
  tau = THREE.MathUtils.clamp(tau, 0, RUN_DURATION);
  const cur = sim.effTime - sim.runT0;
  sim.timeScale = 0;                 // scrubbing pauses playback
  ui.setTimeScale(0);
  if (tau >= cur) {
    fastForward(tau - cur);
    return;
  }
  const snap = sim.replaySnapshot;
  if (snap) {
    surfCtx.putImageData(snap.surf, 0, 0);
    surfTex.needsUpdate = true;
    dispCtx.putImageData(snap.disp, 0, 0);
    dispTex.needsUpdate = true;
    paintedCraters.length = snap.craterCount;
  }
  launch(sim.launchParams);
  sim.timeScale = 0;
  fastForward(tau);
  ui.setTimeScale(0);
}

// --- camera director --------------------------------------------------------
const camDirector = {
  mode: 'auto',
  tmpPos: new THREE.Vector3(),
  tmpLook: new THREE.Vector3(),
  update(dt, wall) {
    if (this.mode !== 'auto') return;
    const k = 1 - Math.exp(-dt * 2.2);
    if (sim.state === 'idle') {
      const a = wall * 0.05;
      this.tmpPos.set(Math.sin(a) * 19, 5.5, Math.cos(a) * 19);
      this.tmpLook.set(0, 0, 0);
    } else if (sim.state === 'approach') {
      const back = sim.velDir.clone().multiplyScalar(-4.2);
      const side = sim.tangent.clone().multiplyScalar(2.2);
      this.tmpPos.copy(impactor.position).add(back).add(side).addScaledVector(impactor.position.clone().normalize(), 1.2);
      this.tmpLook.copy(currentImpactWorld());
    } else {
      const Pw = currentImpactWorld();
      // Pull back far enough to frame the new moon's orbit once it forms.
      const moonWide = sim.moonForming?.started ? 8.5 : 4.2;
      const wide = sim.result && (sim.result.regime === 'giant') ? moonWide : 2.5;
      const camDir = Pw.clone().normalize().addScaledVector(sim.tangent, 0.75).normalize();
      this.tmpPos.copy(camDir.multiplyScalar(R * wide));
      this.tmpLook.copy(Pw).multiplyScalar(sim.t > 8 ? 0 : 1); // drift to whole planet later
      if (sim.moonForming?.started) this.tmpLook.lerp(moon.position, 0.3); // keep the moon in frame
    }
    camera.position.lerp(this.tmpPos, k);
    controls.target.lerp(this.tmpLook, k);
  },
};
// OrbitControls 'start' fires on pointerdown/wheel — user takes the camera instantly.
controls.addEventListener('start', () => {
  const wasAuto = camDirector.mode === 'auto';
  camDirector.mode = 'free';
  ui.setCamMode('free');
  if (wasAuto && sim.state !== 'idle') ui.flashHint('free camera — cinematic cam resumes the auto view');
});

// --- UI wiring --------------------------------------------------------------
const ui = initUI({
  onChange(params) {
    // Always live-update the forecast — even mid-run the sliders describe the
    // NEXT launch, and the panel title says "forecast".
    const res = computeImpact(params);
    const vr = impactorVisualRadius(params.diameter);
    ui.setForecast(res, vr / Math.max((params.diameter / 2) / UNIT, 1e-12));
  },
  onLaunch(params) { launch(params); },
  onResetPlanet() { resetPlanet(); },
  onTimeScale(v) {
    sim.timeScale = v;
    if (v > 0) sim.lastScale = v;
  },
  onScrub(tau) { scrubTo(tau); },
  onPlayPause() {
    sim.timeScale = sim.timeScale === 0 ? (sim.lastScale || 1) : 0;
    ui.setTimeScale(sim.timeScale);
  },
  onTrueScale(v) {
    sim.trueScale = v;
    if (sim.result && impactor.visible) impactor.scale.setScalar(impactorVisualRadius(sim.result.diameter));
  },
  onCinematic() { camDirector.mode = 'auto'; ui.setCamMode('auto'); },
  onObserver(r) { sim.observerR = r; updateMarkers(); },
});
updateMarkers();

// Quick click (not a drag) on the planet moves ground zero while idle.
const raycaster = new THREE.Raycaster();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = (e.clientX - downAt.x) ** 2 + (e.clientY - downAt.y) ** 2 > 36;
  const slow = performance.now() - downAt.t > 350;
  downAt = null;
  if (moved || slow || sim.state !== 'idle') return;
  const ndc = new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(planet, false)[0];
  if (!hit) return;
  sim.impactLocal.copy(planetGroup.worldToLocal(hit.point.clone())).normalize();
  updateMarkers();
});

// --- main loop --------------------------------------------------------------
renderer.compile(scene, camera); // pre-compile shaders so the first impact doesn't hitch

const clock = new THREE.Clock();
let wall = 0;

function tick() {
  requestAnimationFrame(tick);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  advance(rawDt);
  wall += rawDt;
  camDirector.update(rawDt, wall);
  controls.update();
  if (sim.state !== 'idle') ui.setTimelineTime(sim.effTime - sim.runT0);
  renderer.render(scene, camera);
}

// Pure simulation step — no camera or rendering, so the scrubber can replay it.
function advance(rawDt) {
  const dt = rawDt * sim.timeScale;
  sim.effTime += dt;

  planetGroup.rotation.y += sim.planetSpin * dt;

  if (sim.state === 'approach') {
    sim.t += dt;
    const k = Math.min(1, sim.t / APPROACH_TIME);
    const eased = k * k * (0.4 + 0.6 * k); // accelerate in
    impactor.position.lerpVectors(sim.startWorld, currentImpactWorld(), eased);
    impactor.rotation.x += dt * 0.7;
    impactor.rotation.y += dt * 0.45;
    if (k > 0.72) impactorMat.emissiveIntensity = (k - 0.72) / 0.28 * 2.2;
    if (dt > 0 && k > 0.1 && Math.random() < 0.7) trail.emit(impactor.position);
    if (k >= 1) {
      sim.state = 'impact';
      sim.t = 0;
      onContact();
      ui.showResults(sim.result);
    }
  } else if (sim.state === 'impact') {
    sim.t += dt;
    // Ignition front sweeps outward from ground zero; the planet only glows
    // uniformly once the front has wrapped the globe.
    if (sim.emissiveHeat > 0) {
      sim.heatFrontArc = Math.min(Math.PI, sim.heatFrontArc + sim.heatFrontSpeed * dt);
      const frac = sim.heatFrontArc / Math.PI;
      const ramp = Math.min(1, sim.t / 4);
      const lvl = sim.emissiveHeat * ramp;
      const uni = lvl * frac ** 1.3;   // base-material glow follows the swept area
      planetMat.emissive.setRGB(uni, uni * 0.25, uni * 0.05);
      heatShell.material.uniforms.uFrontArc.value = sim.heatFrontArc;
      heatShell.material.uniforms.uOpacity.value = 0.55 * lvl;
      heatShell.visible = lvl > 0.02;
      if (sim.emissiveHeat > 0.3) {
        clouds.material.opacity = Math.max(0, clouds.material.opacity - dt * 0.12 * (0.3 + frac));
      }
    }
    if (sim.planetScale < 1) clouds.visible = false;
    // Disruption: planet shrinks to its largest remnant.
    if (sim.planetScale < 1) {
      const k = Math.min(1, sim.t / 6);
      planetGroup.scale.setScalar(1 - (1 - sim.planetScale) * k * k);
    }
    // Hit-and-run projectile escape.
    if (sim.hitAndRun) {
      impactor.position.addScaledVector(sim.hitAndRun.dir, sim.hitAndRun.speed * dt);
      impactorMat.emissiveIntensity = Math.max(0.2, 2.2 - sim.t * 0.4);
      if (dt > 0 && Math.random() < 0.5) trail.emit(impactor.position);
    } else if (sim.result?.regime === 'giant' && impactor.visible) {
      // Merging projectile sinks and fades.
      impactor.scale.multiplyScalar(1 - Math.min(0.9, dt * 1.4));
      impactor.position.lerp(currentImpactWorld(), Math.min(1, dt * 3));
      if (impactor.scale.x < 0.01) impactor.visible = false;
    }
  }

  // Scheduled events: fallback-debris secondaries and antipodal convergence.
  if (sim.secondaries.length && dt > 0) {
    while (sim.secondaries.length && sim.secondaries[0].at <= sim.effTime) {
      const s = sim.secondaries.shift();
      const p = planetGroup.localToWorld(s.localDir.clone().multiplyScalar(R));
      flash.trigger(p, 0.15 * s.scale + 0.05);
      ejecta.spawn(p, p.clone().normalize(), sim.effTime, {
        count: Math.round(1200 * s.scale), vMin: 80, vMax: 900 * s.scale,
        spread: 0.7, hotFrac: 0.4, sizeScale: 0.7, life: 10,
      });
      paintCrater(s.localDir, 0.004 + 0.01 * s.scale);
    }
  }
  if (sim.antipodeAt !== null && sim.effTime >= sim.antipodeAt && dt > 0) {
    sim.antipodeAt = null;
    const anti = sim.impactLocal.clone().negate();
    const p = planetGroup.localToWorld(anti.clone().multiplyScalar(R));
    flash.trigger(p, 0.9);
    ejecta.spawn(p, p.clone().normalize(), sim.effTime, {
      count: 4000, vMin: 150, vMax: 2000, spread: 1.1, hotFrac: 0.45, sizeScale: 1.2, life: 14,
    });
    sim.phaseRestoreAt = sim.effTime + 3.5;
    sim.phaseRestoreText = document.getElementById('phase-label').textContent;
    ui.setPhase('Seismic waves converge at the antipode');
  }

  if (sim.phaseRestoreAt !== null && sim.effTime >= sim.phaseRestoreAt) {
    ui.setPhase(sim.phaseRestoreText);
    sim.phaseRestoreAt = null;
  }

  // Dust veil: severe impacts loft a sun-dimming haze over ~15 s.
  if (sim.dustTarget > 0) {
    const cur = dustShell.material.uniforms.uOpacity.value;
    const next = cur + (sim.dustTarget - cur) * Math.min(1, dt * 0.09);
    dustShell.material.uniforms.uOpacity.value = next;
    dustShell.visible = next > 0.004;
    sun.intensity = 2.6 * (1 - 1.4 * next);
  }

  // Moon accretion: the disk drains into a growing moon on a slow orbit.
  if (sim.moonForming && sim.effTime >= sim.moonForming.at) {
    const m = sim.moonForming;
    if (!m.started) {
      m.started = true;
      moon.visible = true;
      ring.startAccretion(() => _moonPos);
      ui.setPhase('The debris disk coalesces — a new moon grows');
    }
    const k = Math.min(1, (sim.effTime - m.at) / m.growDur);
    const ease = k * k * (3 - 2 * k);
    moon.scale.setScalar(Math.max(0.001, m.finalR * ease));
    const ang = m.angle0 + (sim.effTime - m.at) * m.omega;
    _moonPos.set(0, 0, 0)
      .addScaledVector(ring.e1, Math.cos(ang) * m.orbitR)
      .addScaledVector(ring.e2, Math.sin(ang) * m.orbitR);
    moon.position.copy(_moonPos);
    moon.rotation.y = ang;
    moonMat.emissiveIntensity = 0.85 * Math.exp(-(sim.effTime - m.at) / 25) + 0.06;
    if (k >= 1 && !m.done) {
      m.done = true;
      ui.setPhase('A new moon settles into orbit');
    }
  }

  flash.update(dt);
  shock.setTime(sim.effTime);
  ejecta.setTime(sim.effTime);
  ring.update(dt);
  chunks.update(dt);
  trail.update(dt);
}
tick();

// Debug/test hook: lets tooling step sim time without relying on rAF.
window.__sim = { sim, advance, launch, resetPlanet, scrubTo, moon, camera };

function updatePixScale() {
  ejecta.setPixScale(window.innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
}
updatePixScale();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updatePixScale();
});
