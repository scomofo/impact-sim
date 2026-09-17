import * as THREE from "three";
import type { Body, BodyId } from "./bodies";
import { nightTexture } from "./textures";

const VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uNight;
  uniform sampler2D uClouds;
  uniform vec3 uSunPos;
  uniform vec3 uPlanetPos;
  uniform vec3 uAtmo;
  uniform vec3 uRingNormal;
  uniform float uTime;
  uniform float uHasNight;
  uniform float uHasClouds;
  uniform float uOcean;
  uniform float uBump;
  uniform float uBands;
  uniform float uFill;
  uniform float uAtmoAmt;
  uniform float uRingInner;
  uniform float uRingOuter;
  uniform float uHasRings;
  uniform float uRadius;

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float n = 0.0;
    n += 0.5 * noise(p);
    n += 0.25 * noise(p * 2.1);
    n += 0.125 * noise(p * 4.3);
    return n;
  }
  float luma(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 toSun = uSunPos - vWorld;
    vec3 L = normalize(toSun);
    vec3 albedo = texture2D(uMap, vUv).rgb;

    if (uBands > 0.01) {
      float y = vUv.y * 18.0 * uBands + uTime * 0.04;
      float warp = fbm(vec2(vUv.x * 6.0 + uTime * 0.02, vUv.y * 8.0));
      float band = 0.5 + 0.5 * sin(y * 6.28318 + warp * 4.0);
      albedo *= 0.88 + 0.22 * band;
      albedo += vec3(0.04, 0.02, 0.0) * (warp - 0.45) * uBands;
    }

    float h = luma(albedo);
    float hx = dFdx(h);
    float hy = dFdy(h);
    vec3 dpdx = dFdx(vWorld);
    vec3 dpdy = dFdy(vWorld);
    vec3 T = normalize(dpdx);
    vec3 B = normalize(cross(N, T));
    T = normalize(cross(B, N));
    vec3 Nb = normalize(N - (T * hx + B * hy) * uBump * 7.0);

    float ndl = dot(Nb, L);
    float wrap = clamp((ndl + 0.38) / 1.38, 0.0, 1.0);
    float day = smoothstep(-0.08, 0.42, ndl);
    float night = 1.0 - smoothstep(-0.12, 0.22, ndl);

    float ringShadow = 1.0;
    if (uHasRings > 0.5) {
      vec3 n = normalize(uRingNormal);
      float denom = dot(L, n);
      if (abs(denom) > 0.02) {
        vec3 rel = vWorld - uPlanetPos;
        float t = -dot(rel, n) / denom;
        if (t > 0.05 && t < length(toSun)) {
          vec3 hit = rel + L * t;
          float rad = length(hit - n * dot(hit, n));
          if (rad > uRingInner && rad < uRingOuter) {
            ringShadow = 0.22;
          }
        }
      }
    }

    vec3 diffuse = albedo * (0.07 + 0.93 * wrap * wrap) * ringShadow;
    diffuse = mix(albedo * 0.38, diffuse, 1.0 - uFill);

    float clouds = 0.0;
    if (uHasClouds > 0.5) {
      vec2 off = vec2(L.x, L.z) * 0.006;
      float shadow = texture2D(uClouds, vUv + off).a;
      diffuse *= 1.0 - shadow * 0.32 * day;
      clouds = texture2D(uClouds, vUv).a;
    }

    vec3 H = normalize(L + V);
    float oceanMask = (1.0 - smoothstep(0.22, 0.42, h)) * uOcean * (1.0 - clouds);
    float spec = pow(max(dot(Nb, H), 0.0), 52.0) * oceanMask * day * ringShadow;

    vec3 nightCol = vec3(0.0);
    if (uHasNight > 0.5) {
      nightCol = texture2D(uNight, vUv).rgb * night * (1.0 - clouds);
    }

    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.55);
    float limb = fres * uAtmoAmt * (0.28 + 0.72 * day);
    vec3 atmo = uAtmo * limb;

    vec3 col = diffuse + spec * vec3(0.82, 0.92, 1.0) + nightCol + atmo;
    col += albedo * uFill * 0.22;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const dummy = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
dummy.needsUpdate = true;

export type PlanetMat = THREE.ShaderMaterial;

export function createPlanetMaterial(body: Body, map: THREE.Texture, clouds: THREE.Texture | null): PlanetMat {
  const night = body.id === "earth" ? nightTexture() : dummy;
  const atmo = new THREE.Color(body.atmosphere ?? body.color);
  const isGas = body.kind === "gas-giant" || body.kind === "ice-giant";
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uNight: { value: night },
      uClouds: { value: clouds ?? dummy },
      uSunPos: { value: new THREE.Vector3() },
      uPlanetPos: { value: new THREE.Vector3() },
      uAtmo: { value: atmo },
      uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
      uTime: { value: 0 },
      uHasNight: { value: body.id === "earth" ? 1 : 0 },
      uHasClouds: { value: clouds ? 1 : 0 },
      uOcean: { value: body.id === "earth" ? 1 : 0 },
      uBump: { value: bumpFor(body.id) },
      uBands: { value: isGas ? (body.kind === "gas-giant" ? 1 : 0.45) : 0 },
      uFill: { value: 0.35 },
      uAtmoAmt: { value: body.atmosphere ? atmoAmt(body.id) : 0.08 },
      uRingInner: { value: body.rings ? body.rings.inner : 0 },
      uRingOuter: { value: body.rings ? body.rings.outer : 0 },
      uHasRings: { value: body.rings ? 1 : 0 },
      uRadius: { value: body.radius },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}

function bumpFor(id: BodyId): number {
  if (id === "mercury" || id === "mars") return 1;
  if (id === "earth") return 0.35;
  if (id === "venus") return 0.15;
  return 0.22;
}

function atmoAmt(id: BodyId): number {
  if (id === "venus") return 0.95;
  if (id === "earth") return 0.62;
  if (id === "mars") return 0.28;
  if (id === "jupiter" || id === "saturn") return 0.4;
  return 0.48;
}

export function createCloudMaterial(map: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uSunPos: { value: new THREE.Vector3() },
      uFill: { value: 0.2 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uSunPos;
      uniform float uFill;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        vec3 N = normalize(vNormal);
        vec3 L = normalize(uSunPos - vWorld);
        float a = texture2D(uMap, vUv).a;
        float wrap = clamp((dot(N, L) + 0.4) / 1.4, 0.0, 1.0);
        vec3 col = vec3(0.93, 0.96, 1.0) * mix(0.2 + 0.8 * wrap, 0.55, uFill);
        gl_FragColor = vec4(col, a * 0.72);
      }
    `,
  });
}

export function createMoonMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunPos: { value: new THREE.Vector3() },
      uFill: { value: 0.3 },
      uTime: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunPos;
      uniform float uFill;
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p); vec2 f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
      }
      void main() {
        vec3 N = normalize(vNormal);
        vec3 L = normalize(uSunPos - vWorld);
        float n = noise(vUv * 28.0) * 0.55 + noise(vUv * 64.0) * 0.45;
        float crater = pow(max(0.0, 0.55 - noise(vUv * 40.0)), 2.0);
        vec3 albedo = mix(vec3(0.42, 0.41, 0.38), vec3(0.62, 0.6, 0.56), n);
        albedo *= 1.0 - crater * 0.45;
        float h = dot(albedo, vec3(0.33));
        vec3 Nb = normalize(N - vec3(dFdx(h), dFdy(h), 0.0) * 8.0);
        float wrap = clamp((dot(Nb, L) + 0.32) / 1.32, 0.0, 1.0);
        vec3 col = albedo * mix(0.12 + 0.88 * wrap * wrap, 0.42, uFill);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}
