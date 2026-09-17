import { Html, Line, OrbitControls, Stars } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { Line2, LineGeometry, LineMaterial } from "three-stdlib";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  BODIES,
  PLANETS,
  aphelionPosition,
  bodyPosition,
  emptyFocusPosition,
  getBody,
  orbitPoints,
  perihelionPosition,
  spinRate,
  type Body,
  type BodyId,
  type MoonDef,
} from "@/lib/solar/bodies";
import { sim } from "@/lib/solar/sim";
import { useHelios } from "@/lib/solar/store";
import { cloudTexture, glowTexture, planetTexture, ringTexture } from "@/lib/solar/textures";
import {
  createCloudMaterial,
  createMoonMaterial,
  createPlanetMaterial,
} from "@/lib/solar/planet-material";

const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _sph = new THREE.Spherical();
const _world = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _sunWorld = new THREE.Vector3();
const _ringN = new THREE.Vector3();

function SimTicker() {
  useFrame((_, dt) => {
    const { paused, speed } = useHelios.getState();
    sim.tick(Math.min(dt, 0.1), speed, paused);
  }, -1);
  return null;
}

function SystemAnchor({ children }: { children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const focusedId = useHelios((s) => s.focusedId);
  const prevId = useRef<BodyId>(focusedId);
  const blend = useRef(1);

  useEffect(() => {
    if (focusedId !== prevId.current) blend.current = 0;
  }, [focusedId]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const d = Math.min(dt, 0.1);
    if (blend.current < 1) {
      blend.current = Math.min(1, blend.current + d / 1.15);
      if (blend.current >= 1) prevId.current = focusedId;
    }
    bodyPosition(getBody(prevId.current), sim.time, _from);
    bodyPosition(getBody(focusedId), sim.time, _to);
    const t = blend.current * blend.current * (3 - 2 * blend.current);
    _offset.lerpVectors(_from, _to, t);
    g.position.copy(_offset).negate();
  });

  return <group ref={group}>{children}</group>;
}

function CameraZoom() {
  const focusedId = useHelios((s) => s.focusedId);
  const { camera } = useThree();
  const animating = useRef(false);
  const targetR = useRef(getBody("sun").focusDistance);

  useEffect(() => {
    targetR.current = getBody(focusedId).focusDistance;
    animating.current = true;
  }, [focusedId]);

  useFrame((_, dt) => {
    if (!animating.current) return;
    const d = Math.min(dt, 0.1);
    _sph.setFromVector3(camera.position);
    const next = THREE.MathUtils.damp(_sph.radius, targetR.current, 2.4, d);
    _sph.radius = Math.max(2.4, next);
    camera.position.setFromSpherical(_sph);
    if (Math.abs(_sph.radius - targetR.current) < 0.08) animating.current = false;
  }, 1);

  return null;
}

const SUN_VERT = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  void main() {
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SUN_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vPos;
  varying vec3 vNormal;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  void main() {
    float n = 0.0;
    n += noise(vPos * 0.55 + vec3(uTime * 0.11, 0.0, uTime * 0.07));
    n += 0.5 * noise(vPos * 1.3 - vec3(uTime * 0.09));
    n += 0.25 * noise(vPos * 3.2 + uTime * 0.16);
    vec3 dark = vec3(0.78, 0.26, 0.04);
    vec3 mid = vec3(1.0, 0.58, 0.12);
    vec3 hot = vec3(1.0, 0.93, 0.62);
    vec3 col = mix(dark, mid, smoothstep(0.22, 0.62, n));
    col = mix(col, hot, smoothstep(0.55, 0.92, n));
    float rim = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.2);
    col += vec3(1.0, 0.7, 0.25) * rim * 0.25;
    gl_FragColor = vec4(col * (1.12 + n * 0.35), 1.0);
  }
`;

function Sun() {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: SUN_VERT,
        fragmentShader: SUN_FRAG,
      }),
    [],
  );
  const glow = useMemo(() => glowTexture(), []);
  const sun = BODIES.sun;
  const t = useRef(0);

  useFrame((_, dt) => {
    const { paused, speed } = useHelios.getState();
    if (!paused) t.current += Math.min(dt, 0.1) * Math.min(speed, 3);
    mat.uniforms.uTime.value = t.current;
    if (mesh.current) {
      mesh.current.rotation.y += spinRate(sun) * (paused ? 0 : Math.min(dt, 0.1) * Math.min(speed, 2));
      mesh.current.getWorldPosition(_sunWorld);
      sim.sunX = _sunWorld.x;
      sim.sunY = _sunWorld.y;
      sim.sunZ = _sunWorld.z;
    }
  });

  useEffect(
    () => () => {
      mat.dispose();
    },
    [mat],
  );

  return (
    <group>
      <mesh ref={mesh} material={mat}>
        <sphereGeometry args={[sun.radius, 64, 48]} />
      </mesh>
      <sprite scale={[11.5, 11.5, 1]}>
        <spriteMaterial
          map={glow}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          opacity={0.72}
        />
      </sprite>
      <sprite scale={[19, 19, 1]}>
        <spriteMaterial
          map={glow}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          opacity={0.22}
        />
      </sprite>
      <pointLight color="#ffd8a0" intensity={95} distance={260} decay={1.6} />
    </group>
  );
}

function Atmosphere({
  radius,
  color,
  strength = 0.55,
  scale = 1.16,
}: {
  radius: number;
  color: string;
  strength?: number;
  scale?: number;
}) {
  const mat = useMemo(() => {
    const c = new THREE.Color(color);
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: c },
        uSunPos: { value: new THREE.Vector3() },
        uAmt: { value: strength },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vN;
        varying vec3 vW;
        void main() {
          vN = normalize(mat3(modelMatrix) * normal);
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform vec3 uSunPos;
        uniform float uAmt;
        varying vec3 vN;
        varying vec3 vW;
        void main() {
          vec3 V = normalize(cameraPosition - vW);
          vec3 L = normalize(uSunPos - vW);
          float f = pow(1.0 - abs(dot(V, normalize(vN))), 2.4);
          float day = smoothstep(-0.25, 0.55, dot(normalize(vN), L));
          gl_FragColor = vec4(uColor, f * mix(0.12, uAmt, day));
        }
      `,
    });
  }, [color, strength]);

  useFrame(() => {
    mat.uniforms.uSunPos.value.set(sim.sunX, sim.sunY, sim.sunZ);
  });

  useEffect(
    () => () => {
      mat.dispose();
    },
    [mat],
  );

  return (
    <mesh material={mat} scale={scale}>
      <sphereGeometry args={[radius, 32, 24]} />
    </mesh>
  );
}

function Moon({ def }: { def: MoonDef }) {
  const ref = useRef<THREE.Group>(null);
  const mat = useMemo(() => createMoonMaterial(), []);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const a = (sim.time / def.periodDays) * Math.PI * 2;
    g.position.set(Math.cos(a) * def.orbitRadius, Math.sin(a) * 0.18, Math.sin(a) * def.orbitRadius);
    mat.uniforms.uSunPos.value.set(sim.sunX, sim.sunY, sim.sunZ);
  });
  useEffect(
    () => () => {
      mat.dispose();
    },
    [mat],
  );
  return (
    <group ref={ref}>
      <mesh material={mat}>
        <sphereGeometry args={[def.radius, 24, 18]} />
      </mesh>
    </group>
  );
}

function PlanetLabel({ body }: { body: Body }) {
  const ref = useRef<HTMLDivElement>(null);

  useFrame(({ camera }) => {
    const el = ref.current;
    if (!el) return;
    const { showLabels, focusedId } = useHelios.getState();
    const dist = camera.position.length();
    const close = dist < body.radius * 8;
    const on = showLabels && focusedId !== body.id && !close;
    el.style.opacity = on ? "1" : "0";
  });

  return (
    <Html center sprite pointerEvents="none" position={[0, body.radius + 0.7, 0]} zIndexRange={[8, 0]}>
      <div ref={ref} className="planet-label">
        {body.name}
      </div>
    </Html>
  );
}

function apparentScale(body: Body, camera: THREE.Camera, obj: THREE.Object3D): number {
  obj.getWorldPosition(_world);
  camera.getWorldPosition(_cam);
  const dist = Math.max(0.001, _cam.distanceTo(_world));
  const minR = dist * 0.028;
  return THREE.MathUtils.clamp(minR / body.radius, 1, 10);
}

function atmoScale(id: BodyId): number {
  if (id === "venus") return 1.3;
  if (id === "earth") return 1.14;
  if (id === "mars") return 1.07;
  return 1.1;
}

function atmoStrength(id: BodyId): number {
  if (id === "venus") return 0.92;
  if (id === "earth") return 0.58;
  if (id === "mars") return 0.26;
  return 0.42;
}

function Planet({ body }: { body: Body }) {
  const group = useRef<THREE.Group>(null);
  const visual = useRef<THREE.Group>(null);
  const globe = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const clouds = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Sprite>(null);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const map = useMemo(() => planetTexture(body.id as Exclude<BodyId, "sun">), [body.id]);
  const cloudsMap = useMemo(() => (body.clouds ? cloudTexture() : null), [body.clouds]);
  const halo = useMemo(() => glowTexture(), []);
  const ringMap = useMemo(() => {
    if (!body.rings) return null;
    return ringTexture(body.id === "saturn" ? "gold" : "ice");
  }, [body.rings, body.id]);
  const surface = useMemo(() => createPlanetMaterial(body, map, cloudsMap), [body, map, cloudsMap]);
  const cloudMat = useMemo(() => (cloudsMap ? createCloudMaterial(cloudsMap) : null), [cloudsMap]);
  const setFocused = useHelios((s) => s.setFocused);
  const segs = body.kind === "terrestrial" ? 48 : 64;
  const glowScale = body.radius * (body.kind === "terrestrial" ? 5.2 : 3.4);

  useFrame((state, dt) => {
    const g = group.current;
    const vis = visual.current;
    if (!g || !vis) return;
    bodyPosition(body, sim.time, pos);
    g.position.copy(pos);
    const s = apparentScale(body, state.camera, g);
    vis.scale.setScalar(s);
    const { paused, speed } = useHelios.getState();
    const spin = paused ? 0 : Math.min(dt, 0.1) * speed;
    if (globe.current) globe.current.rotation.y += spinRate(body) * spin;
    if (clouds.current) clouds.current.rotation.y += spinRate(body) * spin * 1.18;
    if (glow.current) {
      const gm = glow.current.material as THREE.SpriteMaterial;
      gm.opacity = THREE.MathUtils.clamp(0.14 + (s - 1) * 0.07, 0.12, 0.48);
    }
    const u = surface.uniforms;
    u.uSunPos.value.set(sim.sunX, sim.sunY, sim.sunZ);
    g.getWorldPosition(u.uPlanetPos.value);
    u.uFill.value = THREE.MathUtils.smoothstep(s, 1.05, 4);
    u.uTime.value += Math.min(dt, 0.1);
    if (body.rings && tilt.current) {
      _ringN.set(0, 1, 0).transformDirection(tilt.current.matrixWorld);
      u.uRingNormal.value.copy(_ringN);
    }
    if (cloudMat) {
      cloudMat.uniforms.uSunPos.value.set(sim.sunX, sim.sunY, sim.sunZ);
      cloudMat.uniforms.uFill.value = u.uFill.value;
    }
  });

  useEffect(
    () => () => {
      surface.dispose();
      cloudMat?.dispose();
    },
    [surface, cloudMat],
  );

  return (
    <group ref={group}>
      <group ref={visual}>
        <sprite ref={glow} scale={[glowScale, glowScale, 1]} renderOrder={-1}>
          <spriteMaterial
            map={halo}
            color={body.color}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            opacity={0.4}
          />
        </sprite>
        <group ref={tilt} rotation={[0, 0, body.tilt]}>
          <group ref={globe}>
            <mesh
              material={surface}
              renderOrder={4}
              onClick={(e) => {
                e.stopPropagation();
                setFocused(body.id);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                document.body.style.cursor = "auto";
              }}
            >
              <sphereGeometry args={[body.radius, segs, segs - 8]} />
            </mesh>
            {cloudMat ? (
              <mesh ref={clouds} scale={1.018} material={cloudMat}>
                <sphereGeometry args={[body.radius, 48, 32]} />
              </mesh>
            ) : null}
          </group>
          {body.rings && ringMap ? (
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[body.rings.inner, body.rings.outer, 96]} />
              <meshStandardMaterial
                map={ringMap}
                transparent
                side={THREE.DoubleSide}
                depthWrite={false}
                roughness={0.55}
                metalness={0.18}
              />
            </mesh>
          ) : null}
        </group>
        {body.atmosphere ? (
          <Atmosphere
            radius={body.radius}
            color={body.atmosphere}
            strength={atmoStrength(body.id)}
            scale={atmoScale(body.id)}
          />
        ) : null}
        {body.moons?.map((m) => (
          <Moon key={m.name} def={m} />
        ))}
        <PlanetLabel body={body} />
      </group>
    </group>
  );
}

function OrbitPaths() {
  const focusedId = useHelios((s) => s.focusedId);
  const showTrails = useHelios((s) => s.showTrails);
  const curves = useMemo(
    () => PLANETS.map((body) => ({ body, points: orbitPoints(body, 220) })),
    [],
  );
  if (!showTrails) return null;
  return (
    <group>
      {curves.map(({ body, points }) => {
        const focused = body.id === focusedId;
        return (
          <group key={body.id}>
            <Line
              points={points}
              color={body.color}
              lineWidth={focused ? 10 : 6}
              transparent
              opacity={focused ? 0.22 : 0.12}
              depthTest={false}
              depthWrite={false}
              frustumCulled={false}
            />
            <Line
              points={points}
              color={body.color}
              lineWidth={focused ? 2.8 : 1.8}
              transparent
              opacity={focused ? 0.95 : 0.7}
              depthTest={false}
              depthWrite={false}
              frustumCulled={false}
            />
          </group>
        );
      })}
    </group>
  );
}

function MotionTrail({ body }: { body: Body }) {
  const n = 80;
  const positions = useMemo(() => new Float32Array(n * 3), []);
  const colors = useMemo(() => {
    const c = new Float32Array(n * 3);
    const col = new THREE.Color(body.color);
    for (let i = 0; i < n; i++) {
      const t = Math.pow(i / (n - 1), 1.4);
      c[i * 3] = col.r * t;
      c[i * 3 + 1] = col.g * t;
      c[i * 3 + 2] = col.b * t;
    }
    return c;
  }, [body.color]);

  const line = useMemo(() => {
    const geom = new LineGeometry();
    geom.setPositions(positions);
    geom.setColors(colors);
    const mat = new LineMaterial({
      color: 0xffffff,
      vertexColors: true,
      linewidth: 2.6,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const l = new Line2(geom, mat);
    l.frustumCulled = false;
    return l;
  }, [positions, colors]);

  const tmp = useMemo(() => new THREE.Vector3(), []);
  const primed = useRef(false);
  const { size } = useThree();

  useFrame(() => {
    const mat = line.material as LineMaterial;
    mat.resolution.set(size.width, size.height);
    if (!useHelios.getState().showTrails) return;
    if (useHelios.getState().paused && primed.current) return;
    bodyPosition(body, sim.time, tmp);
    if (!primed.current) {
      for (let i = 0; i < n; i++) {
        positions[i * 3] = tmp.x;
        positions[i * 3 + 1] = tmp.y;
        positions[i * 3 + 2] = tmp.z;
      }
      primed.current = true;
    } else {
      positions.copyWithin(0, 3);
      positions[n * 3 - 3] = tmp.x;
      positions[n * 3 - 2] = tmp.y;
      positions[n * 3 - 1] = tmp.z;
    }
    const geom = line.geometry as LineGeometry;
    geom.setPositions(positions);
    line.computeLineDistances();
  });

  useEffect(
    () => () => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    },
    [line],
  );

  const visible = useHelios((s) => s.showTrails);
  return <primitive object={line} visible={visible} />;
}

function AsteroidBelt() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = 640;
  const seeded = useRef(false);

  useEffect(() => {
    const inst = mesh.current;
    if (!inst || seeded.current) return;
    seeded.current = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 33.2 + Math.random() * 5.4;
      dummy.position.set(Math.cos(a) * r, (Math.random() - 0.5) * 0.7, Math.sin(a) * r);
      dummy.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      dummy.scale.setScalar(0.018 + Math.random() * 0.055);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  }, [count]);

  useFrame((_, dt) => {
    const inst = mesh.current;
    if (!inst) return;
    const { paused, speed } = useHelios.getState();
    if (!paused) inst.rotation.y += Math.min(dt, 0.1) * speed * 0.012;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#8a8176" roughness={0.92} metalness={0.05} />
    </instancedMesh>
  );
}

function FocusHalo() {
  const mesh = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const body = getBody(useHelios.getState().focusedId);
    const r = Math.max(0.35, body.radius * 1.42);
    m.scale.setScalar(r);
  });

  return (
    <mesh ref={mesh} rotation={[Math.PI / 2, 0, 0]} renderOrder={2}>
      <ringGeometry args={[1, 1.028, 80]} />
      <meshBasicMaterial color="#c9d0da" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function CursorReset() {
  useEffect(
    () => () => {
      document.body.style.cursor = "auto";
    },
    [],
  );
  return null;
}

const SWEEP_STEPS = 22;
const _peri = new THREE.Vector3();
const _aph = new THREE.Vector3();
const _focus = new THREE.Vector3();
const _here = new THREE.Vector3();

function SweepWedge({ body }: { body: Body }) {
  const mesh = useRef<THREE.Mesh>(null);
  const positions = useMemo(() => new Float32Array((SWEEP_STEPS + 2) * 3), []);
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const verts = SWEEP_STEPS + 2;
    const index: number[] = [];
    for (let i = 1; i < verts - 1; i++) {
      index.push(0, i, i + 1);
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(index);
    return g;
  }, [positions]);

  useFrame(({ camera }) => {
    const m = mesh.current;
    if (!m) return;
    const close = camera.position.length() < Math.max(10, body.focusDistance * 1.6);
    m.visible = !close;
    if (close) return;
    const periodDays = body.periodYears * 365.25;
    const dt = periodDays / 10;
    const t = sim.time;
    positions[0] = 0;
    positions[1] = 0;
    positions[2] = 0;
    for (let i = 0; i <= SWEEP_STEPS; i++) {
      bodyPosition(body, t - dt + (dt * i) / SWEEP_STEPS, _here);
      const o = (i + 1) * 3;
      positions[o] = _here.x;
      positions[o + 1] = _here.y;
      positions[o + 2] = _here.z;
    }
    const attr = geom.getAttribute("position") as THREE.BufferAttribute;
    attr.needsUpdate = true;
  });

  useEffect(
    () => () => {
      geom.dispose();
    },
    [geom],
  );

  return (
    <mesh ref={mesh} geometry={geom} renderOrder={1}>
      <meshBasicMaterial
        color={body.color}
        transparent
        opacity={0.16}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function RadiusVector({ body }: { body: Body }) {
  const positions = useMemo(() => new Float32Array(6), []);
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [positions]);
  const line = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({
      color: body.color,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    const l = new THREE.Line(geom, mat);
    l.frustumCulled = false;
    return l;
  }, [geom, body.color]);

  useFrame(() => {
    bodyPosition(body, sim.time, _here);
    positions[3] = _here.x;
    positions[4] = _here.y;
    positions[5] = _here.z;
    (geom.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  });

  useEffect(
    () => () => {
      geom.dispose();
      (line.material as THREE.Material).dispose();
    },
    [geom, line],
  );

  return <primitive object={line} />;
}

function Apsides({ body }: { body: Body }) {
  perihelionPosition(body, _peri);
  aphelionPosition(body, _aph);
  emptyFocusPosition(body, _focus);
  const s = Math.max(0.12, body.radius * 0.22);
  return (
    <group>
      <mesh position={_peri.toArray()}>
        <octahedronGeometry args={[s, 0]} />
        <meshBasicMaterial color={body.color} />
      </mesh>
      <mesh position={_aph.toArray()}>
        <octahedronGeometry args={[s * 0.75, 0]} />
        <meshBasicMaterial color={body.color} transparent opacity={0.45} />
      </mesh>
      {body.eccentricity > 0.02 ? (
        <mesh position={_focus.toArray()}>
          <sphereGeometry args={[s * 0.55, 12, 8]} />
          <meshBasicMaterial color="#c9d0da" transparent opacity={0.4} />
        </mesh>
      ) : null}
    </group>
  );
}

function KeplerGuide() {
  const focusedId = useHelios((s) => s.focusedId);
  if (focusedId === "sun") return null;
  const body = getBody(focusedId);
  return (
    <group>
      <SweepWedge key={`sweep-${body.id}`} body={body} />
      <RadiusVector key={`radius-${body.id}`} body={body} />
      <Apsides key={`apsides-${body.id}`} body={body} />
    </group>
  );
}

export function Scene() {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  return (
    <>
      <SimTicker />
      <CursorReset />
      <color attach="background" args={["#06070b"]} />
      <ambientLight intensity={0.2} />
      <hemisphereLight args={["#9eb4d4", "#1a120c", 0.42]} />
      <Stars radius={280} depth={90} count={5000} factor={2.6} saturation={0.04} fade speed={0.12} />
      <SystemAnchor>
        <Sun />
        <OrbitPaths />
        {PLANETS.map((body) => (
          <MotionTrail key={`trail-${body.id}`} body={body} />
        ))}
        {PLANETS.map((body) => (
          <Planet key={body.id} body={body} />
        ))}
        <AsteroidBelt />
        <KeplerGuide />
      </SystemAnchor>
      <FocusHalo />
      <CameraZoom />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan={false}
        minDistance={2.6}
        maxDistance={220}
        zoomSpeed={0.75}
        rotateSpeed={0.72}
      />
    </>
  );
}
