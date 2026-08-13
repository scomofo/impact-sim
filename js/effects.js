// effects.js — visual effect systems for the impact sequence. Scene units:
// 1 unit = 1000 km (UNIT meters). Physics readouts are exact (physics.js);
// particle motion here runs on a cinematic time-lapse (TIMELAPSE real seconds
// of physics per displayed second) so planetary-scale ballistics read well.
import * as THREE from 'three';

export const UNIT = 1e6;      // meters per scene unit
export const TIMELAPSE = 80;  // physics seconds per sim second for particles

// SI velocity (m/s) -> scene units/s on the cinematic clock.
export const velToScene = (v) => (v / UNIT) * TIMELAPSE;
// Surface gravity on the cinematic clock (time² scaling), scene units/s².
export const G_SCENE = (9.81 / UNIT) * TIMELAPSE * TIMELAPSE;

// Shared soft-glow sprite texture.
let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

export function makeStarfield(count = 5000, radius = 3000) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(radius * (0.7 + 0.3 * Math.random()));
    pos.set([v.x, v.y, v.z], i * 3);
    const tint = 0.6 + 0.4 * Math.random();
    const warm = Math.random() < 0.25;
    col.set([tint, tint * (warm ? 0.92 : 0.97), tint * (warm ? 0.82 : 1)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.6, sizeAttenuation: false, vertexColors: true,
    transparent: true, opacity: 0.9, depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

export function makeAtmosphere(radius) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(0x4488ff) }, uPower: { value: 3.5 } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uPower;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(vNormal, vView)), uPower);
        gl_FragColor = vec4(uColor, rim * 0.9);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.03, 64, 48), mat);
}

// Additive fresnel shell for the global-heat look. The glow SWEEPS outward
// from uImpactDir: only regions the ignition front has passed (arc distance
// < uFrontArc) burn. Default uFrontArc = PI behaves as a uniform veil (used
// by the dust shell).
export function makeHeatShell(radius) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, side: THREE.FrontSide, depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(0xff5a1a) },
      uOpacity: { value: 0 },
      uImpactDir: { value: new THREE.Vector3(0, 0, 1) },
      uFrontArc: { value: Math.PI },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform vec3 uImpactDir;
      uniform float uFrontArc;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vDir;
      float hash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }
      float vnoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i), b = hash(i + vec3(1,0,0)), c = hash(i + vec3(0,1,0)), d = hash(i + vec3(1,1,0));
        float e = hash(i + vec3(0,0,1)), g = hash(i + vec3(1,0,1)), h = hash(i + vec3(0,1,1)), k = hash(i + vec3(1,1,1));
        return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y), mix(mix(e,g,f.x), mix(h,k,f.x), f.y), f.z);
      }
      void main() {
        if (uOpacity < 0.004) discard;
        float ang = acos(clamp(dot(vDir, uImpactDir), -1.0, 1.0));
        // Burned region: behind the front, brightest just behind the edge.
        float swept = 1.0 - smoothstep(uFrontArc - 0.35, uFrontArc, ang);
        if (swept < 0.004) discard;
        float edge = 1.0 + 1.6 * exp(-pow((uFrontArc - ang) / 0.18, 2.0));
        float mottle = 0.55 + 0.45 * vnoise(vDir * 26.0);
        float f = 0.35 + 0.65 * pow(1.0 - abs(dot(vNormal, vView)), 2.0);
        gl_FragColor = vec4(uColor * edge * mottle, f * uOpacity * swept);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.005, 64, 48), mat);
  mesh.visible = false;
  return mesh;
}

// Impact flash: additive sprite + point light with an exponential-decay envelope.
export class Flash {
  constructor(scene) {
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xfff2d0, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.light = new THREE.PointLight(0xffe0b0, 0, 200, 1.2);
    this.sprite.visible = false;
    this.t = Infinity;
    this.strength = 1;
    scene.add(this.sprite, this.light);
  }
  trigger(position, strength) {
    this.sprite.position.copy(position);
    this.light.position.copy(position).multiplyScalar(1.06);
    this.strength = strength;
    this.t = 0;
    this.sprite.visible = true;
  }
  update(dt) {
    if (!this.sprite.visible) return;
    this.t += dt;
    const s = this.strength;
    const env = this.t < 0.15 ? this.t / 0.15 : Math.exp(-(this.t - 0.15) * (2.2 / Math.sqrt(s)));
    this.sprite.scale.setScalar(Math.max(0.001, (0.6 + 2.2 * s) * (0.4 + 0.6 * env)));
    this.sprite.material.opacity = env;
    this.light.intensity = 60 * s * env;
    if (env < 0.01 && this.t > 0.5) { this.sprite.visible = false; this.light.intensity = 0; }
  }
  clear() {
    this.sprite.visible = false;
    this.light.intensity = 0;
    this.t = Infinity;
  }
}

// ---------------------------------------------------------------------------
// ShockWaves: up to three simultaneous wave fronts hugging the planet — a
// fireball flash-front, a fast seismic ring, and a slower air-blast ring.
// The shell shader draws each as a sharp leading edge with a long turbulent
// tail. Everything is a pure function of the sim clock, so pause/scrub work.
// ---------------------------------------------------------------------------
const MAX_FRONTS = 3;

export class ShockWaves {
  constructor(parent, planetRadius) {
    this.mat = new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: {
        uImpactDir: { value: new THREE.Vector3(0, 0, 1) },
        // per front: x = arc radius, y = width, z = opacity, w = tail length mult
        uFronts: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
        uColors: {
          value: [new THREE.Color(0xfff0c8), new THREE.Color(0x9fc8ff), new THREE.Color(0xff9440)],
        },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uImpactDir;
        uniform vec4 uFronts[${MAX_FRONTS}];
        uniform vec3 uColors[${MAX_FRONTS}];
        varying vec3 vDir;
        float hash(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        }
        float vnoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i), b = hash(i + vec3(1,0,0)), c = hash(i + vec3(0,1,0)), d = hash(i + vec3(1,1,0));
          float e = hash(i + vec3(0,0,1)), g = hash(i + vec3(1,0,1)), h = hash(i + vec3(0,1,1)), k = hash(i + vec3(1,1,1));
          return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y), mix(mix(e,g,f.x), mix(h,k,f.x), f.y), f.z);
        }
        void main() {
          vec3 dir = normalize(vDir);
          float ang = acos(clamp(dot(dir, uImpactDir), -1.0, 1.0));
          vec3 acc = vec3(0.0);
          for (int i = 0; i < ${MAX_FRONTS}; i++) {
            vec4 f = uFronts[i];
            if (f.z < 0.004) continue;
            float d = ang - f.x;
            float lead = exp(-pow(max(d, 0.0) / (f.y * 0.35), 2.0));
            float tail = exp(-pow(max(-d, 0.0) / (f.y * f.w), 1.3)) * 0.55;
            float band = max(lead, tail);
            band *= mix(0.7, 1.2, vnoise(dir * 42.0 + float(i) * 7.31));
            acc += uColors[i] * band * f.z;
          }
          if (max(acc.r, max(acc.g, acc.b)) < 0.005) discard;
          gl_FragColor = vec4(acc, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(planetRadius * 1.004, 96, 64), this.mat);
    this.mesh.visible = false;
    this.fronts = [];   // {delay, speed rad/s, maxArc, width, peak, tail}
    this.t0 = -1;
    parent.add(this.mesh);
  }
  // fronts: array of up to 3 descriptors; t0 = sim time of contact.
  trigger(impactDirLocal, fronts, t0) {
    this.mat.uniforms.uImpactDir.value.copy(impactDirLocal).normalize();
    this.fronts = fronts.slice(0, MAX_FRONTS);
    this.t0 = t0;
    this.mesh.visible = true;
  }
  setTime(t) {
    if (this.t0 < 0) return;
    let anyLive = false;
    for (let i = 0; i < MAX_FRONTS; i++) {
      const u = this.mat.uniforms.uFronts.value[i];
      const f = this.fronts[i];
      if (!f) { u.set(0, 1, 0, 1); continue; }
      const tf = t - this.t0 - (f.delay ?? 0);
      if (tf <= 0) { u.set(0, 1, 0, 1); continue; }
      const radius = f.speed * tf;
      const life = radius / (f.maxArc + f.width * 3);
      const fade = Math.max(0, 1 - life) ** 1.2;
      if (fade > 0.004) anyLive = true;
      u.set(Math.min(radius, f.maxArc + f.width * 3), f.width, f.peak * fade, f.tail ?? 1.8);
    }
    this.mesh.visible = anyLive;
  }
  clear() {
    this.t0 = -1;
    this.fronts = [];
    this.mesh.visible = false;
  }
}

// ---------------------------------------------------------------------------
// Ejecta: stateless GPU particle system. Attributes are written once at spawn;
// the vertex shader evaluates closed-form ballistics from the sim clock, so
// 50k+ particles cost nothing per frame and pause/scrub for free. Two
// populations: hot glowing melt (additive) and cold dark debris (normal).
// ---------------------------------------------------------------------------
class EjectaPool {
  constructor(parent, planetRadius, capacity, hot) {
    this.capacity = capacity;
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
    this.aVel = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
    this.aBirth = new THREE.BufferAttribute(new Float32Array(capacity).fill(-1e9), 1);
    this.aLife = new THREE.BufferAttribute(new Float32Array(capacity).fill(1), 1);
    this.aSize = new THREE.BufferAttribute(new Float32Array(capacity), 1);
    this.aSeed = new THREE.BufferAttribute(new Float32Array(capacity), 1);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aVel', this.aVel);
    geo.setAttribute('aBirth', this.aBirth);
    geo.setAttribute('aLife', this.aLife);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aSeed', this.aSeed);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: hot ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uGravity: { value: G_SCENE },
        uPlanetR: { value: planetRadius },
        uPixScale: { value: 700 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime, uGravity, uPlanetR, uPixScale;
        attribute vec3 aVel;
        attribute float aBirth, aLife, aSize, aSeed;
        varying float vAge, vSeed;
        void main() {
          float t = uTime - aBirth;
          vAge = clamp(t / aLife, 0.0, 1.0);
          vSeed = aSeed;
          vec3 up = normalize(position);
          vec3 p = position + aVel * t - 0.5 * uGravity * t * t * up;
          bool dead = t < 0.0 || t > aLife || (t > 0.4 && length(p) < uPlanetR * 0.999);
          if (dead) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp(aSize * uPixScale / -mv.z, 1.0, 48.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: hot ? /* glsl */ `
        varying float vAge, vSeed;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d2 = dot(c, c);
          if (d2 > 0.25) discard;
          float soft = smoothstep(0.25, 0.02, d2);
          float k = clamp(vAge * (1.1 + 0.5 * vSeed), 0.0, 1.0);
          vec3 hotC = vec3(1.0, 0.93, 0.78), ember = vec3(1.0, 0.36, 0.06), late = vec3(0.32, 0.07, 0.02);
          vec3 col = mix(mix(hotC, ember, smoothstep(0.0, 0.3, k)), late, smoothstep(0.3, 0.92, k));
          float a = soft * (1.0 - smoothstep(0.7, 1.0, vAge));
          gl_FragColor = vec4(col * (1.6 - k), a);
        }` : /* glsl */ `
        varying float vAge, vSeed;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d2 = dot(c, c);
          if (d2 > 0.25) discard;
          float soft = smoothstep(0.25, 0.06, d2);
          float g = 0.16 + 0.12 * vSeed;
          float a = soft * 0.85 * (1.0 - smoothstep(0.65, 1.0, vAge));
          gl_FragColor = vec4(g, g * 0.9, g * 0.82, a);
        }`,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    parent.add(this.points);
  }
  // Write a burst starting at the ring cursor. All vectors precomputed by caller.
  write(origin, dirs, speeds, sizes, lives, seeds, now) {
    const n = dirs.length;
    for (let k = 0; k < n; k++) {
      const i = (this.cursor + k) % this.capacity, j = i * 3;
      this.aPos.array[j] = origin.x; this.aPos.array[j + 1] = origin.y; this.aPos.array[j + 2] = origin.z;
      this.aVel.array[j] = dirs[k].x * speeds[k];
      this.aVel.array[j + 1] = dirs[k].y * speeds[k];
      this.aVel.array[j + 2] = dirs[k].z * speeds[k];
      this.aBirth.array[i] = now;
      this.aLife.array[i] = lives[k];
      this.aSize.array[i] = sizes[k];
      this.aSeed.array[i] = seeds[k];
    }
    this.cursor = (this.cursor + n) % this.capacity;
    for (const a of [this.aPos, this.aVel, this.aBirth, this.aLife, this.aSize, this.aSeed]) {
      a.needsUpdate = true;   // one upload on the spawn frame only
    }
  }
  setTime(t) { this.mat.uniforms.uTime.value = t; }
  setPixScale(v) { this.mat.uniforms.uPixScale.value = v; }
  clear() {
    this.aBirth.array.fill(-1e9);
    this.aBirth.needsUpdate = true;
  }
}

const _dir = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _axis = new THREE.Vector3();

export class Ejecta {
  constructor(parent, planetRadius, capacity = 60000) {
    this.planetRadius = planetRadius;
    this.hot = new EjectaPool(parent, planetRadius, Math.floor(capacity * 0.55), true);
    this.cold = new EjectaPool(parent, planetRadius, Math.floor(capacity * 0.45), false);
  }
  /**
   * Spawn an ejecta curtain.
   * vMin/vMax are SI m/s launch speeds (converted to the cinematic clock here);
   * spread is cone half-angle (rad) around the surface normal; curtainBias
   * pulls samples toward the cone edge (the classic inverted-lampshade look).
   */
  spawn(origin, normal, now, {
    count = 8000, vMin = 300, vMax = 3000, spread = 0.9,
    curtainBias = 0.65, hotFrac = 0.55, sizeScale = 1, life = 26,
  } = {}) {
    const n = _dir.copy(normal).normalize();
    const helper = Math.abs(n.x) > 0.9 ? _t1.set(0, 1, 0) : _t1.set(1, 0, 0);
    const t1 = _t2.crossVectors(n, helper).normalize().clone();
    const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
    const nn = n.clone();
    const mk = (m) => {
      const dirs = [], speeds = [], sizes = [], lives = [], seeds = [];
      for (let k = 0; k < m; k++) {
        let cosT = 1 - Math.random() * (1 - Math.cos(spread));
        if (curtainBias > 0) {
          const edge = Math.cos(spread * (0.8 + 0.15 * Math.random()));
          cosT = THREE.MathUtils.lerp(cosT, edge, curtainBias);
        }
        const sinT = Math.sqrt(1 - cosT * cosT);
        const phi = Math.random() * Math.PI * 2;
        dirs.push(new THREE.Vector3()
          .addScaledVector(t1, sinT * Math.cos(phi))
          .addScaledVector(t2, sinT * Math.sin(phi))
          .addScaledVector(nn, cosT));
        const v = vMin + (vMax - vMin) * Math.random() ** 2.2; // slow bulk, few escapers
        speeds.push(velToScene(v));
        sizes.push((0.02 + 0.05 * Math.random() ** 2) * sizeScale);
        lives.push(life * (0.5 + Math.random()));
        seeds.push(Math.random());
      }
      return { dirs, speeds, sizes, lives, seeds };
    };
    const hotN = Math.round(count * hotFrac);
    const h = mk(hotN);
    this.hot.write(origin, h.dirs, h.speeds, h.sizes, h.lives, h.seeds, now);
    const c = mk(count - hotN);
    this.cold.write(origin, c.dirs, c.speeds, c.sizes, c.lives, c.seeds, now);
  }
  setTime(t) { this.hot.setTime(t); this.cold.setTime(t); }
  setPixScale(v) { this.hot.setPixScale(v); this.cold.setPixScale(v); }
  clear() { this.hot.clear(); this.cold.clear(); }
}

// Debris disk for giant impacts: particles ejected near the impact site relax
// into an orbiting ring in the impact plane.
export class DebrisRing {
  constructor(scene, planetRadius, count = 7000) {
    this.planetRadius = planetRadius;
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.pos.fill(1e6);
    // Per-particle parameters, allocated once and re-randomized per trigger.
    this.data = Array.from({ length: count }, () => ({
      r: 0, phi: 0, omega: 0, y: 0, settle: 1, t: 0, start: new THREE.Vector3(),
      dead: false, drainAt: Infinity,
    }));
    this.accretion = null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo = geo;
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.06, map: glowTexture(), vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85,
    }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.active = false;
    scene.add(this.points);
  }
  trigger(origin, planeNormal) {
    const R = this.planetRadius;
    this.accretion = null;
    this.n = planeNormal.clone().normalize();
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(this.n.dot(u)) > 0.9) u.set(0, 1, 0);
    this.e1 = new THREE.Vector3().crossVectors(this.n, u).normalize();
    this.e2 = new THREE.Vector3().crossVectors(this.n, this.e1).normalize();
    const startPhi = Math.atan2(origin.dot(this.e2), origin.dot(this.e1));
    for (let i = 0; i < this.count; i++) {
      const d = this.data[i];
      d.dead = false;
      d.drainAt = Infinity;
      d.r = R * (1.7 + 1.6 * Math.random() ** 1.4);
      d.phi = startPhi + (Math.random() - 0.5) * 0.7;
      d.omega = 0.55 / Math.sqrt(d.r / R);
      d.y = (Math.random() - 0.5) * 0.35 * R;
      d.settle = 6 + Math.random() * 14;
      d.t = 0;
      d.start.copy(origin).addScaledVector(_dir.randomDirection(), 0.3 * R);
      const j = i * 3;
      if (Math.random() < 0.6) {
        this.col[j] = 1; this.col[j + 1] = 0.5 + 0.3 * Math.random(); this.col[j + 2] = 0.15;
      } else {
        const g = 0.4 + 0.3 * Math.random();
        this.col[j] = g; this.col[j + 1] = g * 0.9; this.col[j + 2] = g * 0.8;
      }
    }
    this.geo.attributes.color.needsUpdate = true;
    this.t = 0;
    this.active = true;
    this.points.visible = true;
  }
  // Begin draining ring particles into a growing moon. getTarget() must return
  // the moon's current world position (a caller-owned scratch vector).
  startAccretion(getTarget) {
    this.accretion = { t: 0, getTarget };
    for (const d of this.data) d.drainAt = 4 + Math.random() * 18;
  }
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const acc = this.accretion;
    if (acc) acc.t += dt;
    const moonPos = acc ? acc.getTarget() : null;
    let anyAlive = false;
    for (let i = 0; i < this.count; i++) {
      const d = this.data[i];
      if (d.dead) continue;
      anyAlive = true;
      d.t += dt;
      d.phi += d.omega * dt;
      const k = Math.min(1, d.t / d.settle);
      const ease = k * k * (3 - 2 * k);
      const flat = 1 - 0.85 * ease;
      // Scratch-vector math only — zero allocations in this loop.
      _t1.set(0, 0, 0)
        .addScaledVector(this.e1, Math.cos(d.phi) * d.r)
        .addScaledVector(this.e2, Math.sin(d.phi) * d.r)
        .addScaledVector(this.n, d.y * flat);
      _t2.copy(d.start).lerp(_t1, ease);
      const j = i * 3;
      // Staggered drain: each particle spirals into the moon over ~1.5 s.
      if (moonPos && acc.t > d.drainAt) {
        const dk = Math.min(1, (acc.t - d.drainAt) / 1.5);
        _t2.lerp(moonPos, dk * dk);
        if (dk >= 1) {
          d.dead = true;
          this.pos[j] = 1e6; this.pos[j + 1] = 1e6; this.pos[j + 2] = 1e6;
          continue;
        }
      }
      this.pos[j] = _t2.x; this.pos[j + 1] = _t2.y; this.pos[j + 2] = _t2.z;
      if (this.col[j] === 1 && this.t > 20 && Math.random() < 0.01) {
        const g = 0.45 + 0.2 * Math.random();
        this.col[j] = g; this.col[j + 1] = g * 0.9; this.col[j + 2] = g * 0.8;
        this.geo.attributes.color.needsUpdate = true;
      }
    }
    if (!anyAlive) {
      this.active = false;
      this.points.visible = false;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
  clear() {
    this.active = false;
    this.points.visible = false;
    this.pos.fill(1e6);
    this.geo.attributes.position.needsUpdate = true;
  }
}

// Planet-shattering chunk burst for catastrophic disruption outcomes.
export class ChunkBurst {
  constructor(scene, planetRadius, count = 90) {
    this.count = count;
    this.planetRadius = planetRadius;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    this.mat = new THREE.MeshStandardMaterial({
      color: 0x53412f, emissive: 0xff4400, emissiveIntensity: 1.2,
      roughness: 0.9, flatShading: true,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, count);
    this.mesh.visible = false;
    this.data = [];
    this.dummy = new THREE.Object3D();
    this.active = false;
    scene.add(this.mesh);
  }
  trigger(impactDir) {
    const R = this.planetRadius;
    this.data.length = 0;
    for (let i = 0; i < this.count; i++) {
      const dir = new THREE.Vector3().randomDirection();
      dir.addScaledVector(impactDir, -0.6).normalize();
      this.data.push({
        pos: dir.clone().multiplyScalar(R * (0.3 + 0.6 * Math.random())),
        vel: dir.clone().multiplyScalar(R * (0.06 + 0.16 * Math.random())),
        rot: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(1.5),
        scale: R * (0.05 + 0.17 * Math.random() ** 2),
        angle: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      });
    }
    this.t = 0;
    this.active = true;
    this.mesh.visible = true;
  }
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    for (let i = 0; i < this.count; i++) {
      const d = this.data[i];
      d.pos.addScaledVector(d.vel, dt);
      d.angle.x += d.rot.x * dt; d.angle.y += d.rot.y * dt; d.angle.z += d.rot.z * dt;
      this.dummy.position.copy(d.pos);
      this.dummy.rotation.copy(d.angle);
      this.dummy.scale.setScalar(d.scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mat.emissiveIntensity = Math.max(0.05, 1.2 * Math.exp(-this.t / 25));
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() {
    this.active = false;
    this.mesh.visible = false;
    this.mat.emissiveIntensity = 1.2;
  }
}

// Fading trail behind the incoming impactor.
export class Trail {
  constructor(scene, capacity = 160) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity).fill(Infinity);
    this.head = 0;
    this.liveCount = 0;
    this.pos.fill(1e6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo = geo;
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.09, map: glowTexture(), vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(position) {
    const j = this.head * 3;
    if (!(this.age[this.head] < Infinity)) this.liveCount++;
    this.pos[j] = position.x; this.pos[j + 1] = position.y; this.pos[j + 2] = position.z;
    this.age[this.head] = 0;
    this.head = (this.head + 1) % this.capacity;
    this.geo.attributes.position.needsUpdate = true;
  }
  update(dt) {
    if (this.liveCount === 0) return;   // nothing alive — skip all uploads
    const life = 1.4;
    let dirtyPos = false;
    for (let i = 0; i < this.capacity; i++) {
      if (!(this.age[i] < Infinity)) continue;
      this.age[i] += dt;
      const k = Math.max(0, 1 - this.age[i] / life);
      const j = i * 3;
      if (k <= 0) {
        this.age[i] = Infinity;
        this.liveCount--;
        this.pos[j] = 1e6; this.pos[j + 1] = 1e6; this.pos[j + 2] = 1e6;
        dirtyPos = true;
      }
      this.col[j] = k; this.col[j + 1] = k * 0.75; this.col[j + 2] = k * 0.45;
    }
    if (dirtyPos) this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
  clear() {
    this.age.fill(Infinity);
    this.liveCount = 0;
    this.pos.fill(1e6);
    this.geo.attributes.position.needsUpdate = true;
  }
}
