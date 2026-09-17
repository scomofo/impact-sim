import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import {
  BallCollider,
  CuboidCollider,
  CylinderCollider,
  Physics,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import { RigidBodyType } from "@dimforge/rapier3d-compat";
import {
  MOUSE,
  Plane,
  Raycaster,
  TOUCH,
  Vector2,
  Vector3,
  type Object3D,
} from "three";
import {
  SHAPE,
  TABLE_RADIUS,
  TABLE_TOP,
  type BodySpec,
  type ShapeKind,
  usePlayground,
} from "@/lib/playground/store";
import { playDrop, playImpact, unlockAudio } from "@/lib/playground/audio";

const SCENE_BG = "#0b0b0c";
const TABLE_COLOR = "#1a1a1d";
const RIM_COLOR = "#222226";
const RING_COLOR = "#2e2e32";

let spawnLockUntil = 0;
function lockSpawn() {
  spawnLockUntil = performance.now() + 120;
}
function canSpawn() {
  return performance.now() >= spawnLockUntil && !usePlayground.getState().grabbedId;
}

type OrbitHandle = { enabled: boolean };

function CameraRig() {
  const grabbedId = usePlayground((s) => s.grabbedId);
  const { gl } = useThree();

  useEffect(() => {
    const el = gl.domElement;
    const blockMenu = (event: Event) => event.preventDefault();
    el.addEventListener("contextmenu", blockMenu);
    return () => el.removeEventListener("contextmenu", blockMenu);
  }, [gl]);

  return (
    <OrbitControls
      makeDefault
      enabled={!grabbedId}
      enableDamping
      dampingFactor={0.08}
      enablePan
      minPolarAngle={0.22}
      maxPolarAngle={Math.PI / 2 - 0.06}
      minDistance={5}
      maxDistance={26}
      target={[0, 0.55, 0]}
      mouseButtons={{
        LEFT: MOUSE.ROTATE,
        MIDDLE: MOUSE.DOLLY,
        RIGHT: MOUSE.PAN,
      }}
      touches={{
        ONE: TOUCH.ROTATE,
        TWO: TOUCH.DOLLY_PAN,
      }}
    />
  );
}

function Lights() {
  return (
    <>
      <hemisphereLight args={["#e8e4dc", "#1a1c20", 0.72]} />
      <ambientLight intensity={0.22} />
      <directionalLight
        castShadow
        position={[10, 16, 8]}
        intensity={1.35}
        color="#f3efe6"
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.00035}
      />
      <directionalLight position={[-8, 6, -6]} intensity={0.28} color="#c9d2dc" />
    </>
  );
}

function Table() {
  const spawnAt = usePlayground((s) => s.spawnAt);
  const down = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    down.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || !down.current) return;
    const dx = event.clientX - down.current.x;
    const dy = event.clientY - down.current.y;
    down.current = null;
    if (dx * dx + dy * dy > 64) return;
    if (!canSpawn()) return;
    unlockAudio();
    playDrop();
    const lift = SHAPE[usePlayground.getState().kind].halfHeight * 2.4 + 0.4;
    spawnAt(event.point.x, event.point.y + lift, event.point.z);
  };

  return (
    <RigidBody type="fixed" colliders={false} friction={0.82} restitution={0.18}>
      <CylinderCollider args={[0.25, TABLE_RADIUS]} />
      <mesh
        castShadow
        receiveShadow
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS, 0.5, 64]} />
        <meshStandardMaterial color={TABLE_COLOR} roughness={0.88} metalness={0.04} />
      </mesh>
      <mesh position={[0, 0.22, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[TABLE_RADIUS + 0.04, 0.14, 10, 64]} />
        <meshStandardMaterial color={RIM_COLOR} roughness={0.9} metalness={0.05} />
      </mesh>
      {[2.2, 4.4, 6.6].map((radius) => (
        <mesh
          key={radius}
          position={[0, TABLE_TOP + 0.002, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[radius - 0.012, radius + 0.012, 72]} />
          <meshBasicMaterial color={RING_COLOR} transparent opacity={0.55} />
        </mesh>
      ))}
    </RigidBody>
  );
}

function DropCursor() {
  const ref = useRef<Object3D>(null);
  const { camera, pointer } = useThree();
  const plane = useMemo(() => new Plane(new Vector3(0, 1, 0), -TABLE_TOP), []);
  const hit = useMemo(() => new Vector3(), []);
  const raycaster = useMemo(() => new Raycaster(), []);
  const grabbedId = usePlayground((s) => s.grabbedId);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    if (grabbedId) {
      mesh.visible = false;
      return;
    }
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(plane, hit)) {
      const radial = Math.hypot(hit.x, hit.z);
      mesh.visible = radial <= TABLE_RADIUS - 0.15;
      mesh.position.set(hit.x, TABLE_TOP + 0.02, hit.z);
    } else {
      mesh.visible = false;
    }
  });

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.28, 0.36, 40]} />
      <meshBasicMaterial color="#c9cdc8" transparent opacity={0.55} />
    </mesh>
  );
}

function ShapeMesh({
  kind,
  scale,
  color,
  hovered,
  grabbed,
}: {
  kind: ShapeKind;
  scale: number;
  color: string;
  hovered: boolean;
  grabbed: boolean;
}) {
  const material = (
    <meshStandardMaterial
      color={color}
      roughness={0.36}
      metalness={0.14}
      emissive={grabbed || hovered ? "#2a2a24" : "#000000"}
      emissiveIntensity={grabbed ? 0.7 : hovered ? 0.35 : 0}
    />
  );

  if (kind === "sphere") {
    return (
      <mesh castShadow receiveShadow scale={scale}>
        <sphereGeometry args={[SHAPE.sphere.radius, 28, 20]} />
        {material}
      </mesh>
    );
  }
  if (kind === "box") {
    const s = SHAPE.box.half * 2;
    return (
      <mesh castShadow receiveShadow scale={scale}>
        <boxGeometry args={[s, s, s]} />
        {material}
      </mesh>
    );
  }
  return (
    <mesh castShadow receiveShadow scale={scale}>
      <cylinderGeometry
        args={[
          SHAPE.cylinder.radius,
          SHAPE.cylinder.radius,
          SHAPE.cylinder.halfHeight * 2,
          24,
        ]}
      />
      {material}
    </mesh>
  );
}

function ShapeCollider({
  kind,
  scale,
  restitution,
}: {
  kind: ShapeKind;
  scale: number;
  restitution: number;
}) {
  const friction = 0.56;
  if (kind === "sphere") {
    return (
      <BallCollider
        args={[SHAPE.sphere.radius * scale]}
        restitution={restitution}
        friction={friction}
      />
    );
  }
  if (kind === "box") {
    const h = SHAPE.box.half * scale;
    return <CuboidCollider args={[h, h, h]} restitution={restitution} friction={friction} />;
  }
  return (
    <CylinderCollider
      args={[SHAPE.cylinder.halfHeight * scale, SHAPE.cylinder.radius * scale]}
      restitution={restitution}
      friction={friction}
    />
  );
}

function DynamicBody({ spec }: { spec: BodySpec }) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const grabbed = useRef(false);
  const plane = useMemo(() => new Plane(), []);
  const hit = useMemo(() => new Vector3(), []);
  const offset = useMemo(() => new Vector3(), []);
  const last = useMemo(() => new Vector3(), []);
  const vel = useMemo(() => new Vector3(), []);
  const ndc = useMemo(() => new Vector2(), []);
  const raycaster = useMemo(() => new Raycaster(), []);
  const camDir = useMemo(() => new Vector3(), []);
  const { camera, gl, controls } = useThree();
  const restitution = usePlayground((s) => s.restitution);
  const remove = usePlayground((s) => s.remove);
  const setGrabbedId = usePlayground((s) => s.setGrabbedId);
  const isGrabbed = usePlayground((s) => s.grabbedId === spec.id);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const n = body.numColliders();
    for (let i = 0; i < n; i += 1) {
      body.collider(i).setRestitution(restitution);
    }
  }, [restitution]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!grabbed.current) return;
      const rect = gl.domElement.getBoundingClientRect();
      ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };
    const onUp = () => {
      if (!grabbed.current) return;
      grabbed.current = false;
      lockSpawn();
      const body = bodyRef.current;
      if (body) {
        body.setBodyType(RigidBodyType.Dynamic, true);
        const speed = vel.length();
        if (speed > 16) vel.multiplyScalar(16 / speed);
        body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);
      }
      setGrabbedId(null);
      gl.domElement.style.cursor = hovered ? "grab" : "default";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [gl, hovered, ndc, setGrabbedId, vel]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;
    const t = body.translation();
    if (t.y < -10) {
      remove(spec.id);
      return;
    }
    if (!grabbed.current) return;
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    const minY = TABLE_TOP + SHAPE[spec.kind].halfHeight * spec.scale + 0.02;
    const x = hit.x - offset.x;
    const y = Math.max(minY, hit.y - offset.y);
    const z = hit.z - offset.z;
    const dt = Math.min(Math.max(delta, 1 / 120), 0.1);
    vel.set(x - last.x, y - last.y, z - last.z).multiplyScalar(1 / dt);
    last.set(x, y, z);
    if (usePlayground.getState().paused) {
      body.setTranslation({ x, y, z }, true);
    } else {
      body.setNextKinematicTranslation({ x, y, z });
    }
  });

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const body = bodyRef.current;
    if (!body) return;
    unlockAudio();
    grabbed.current = true;
    setGrabbedId(spec.id);
    const orbit = controls as OrbitHandle | null;
    if (orbit) orbit.enabled = false;
    gl.domElement.style.cursor = "grabbing";
    const t = body.translation();
    last.set(t.x, t.y, t.z);
    vel.set(0, 0, 0);
    camera.getWorldDirection(camDir);
    plane.setFromNormalAndCoplanarPoint(camDir.negate(), event.point);
    offset.copy(event.point).sub(last);
    offset.y -= 0.28;
    const rect = gl.domElement.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    body.setBodyType(RigidBodyType.KinematicPositionBased, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  };

  return (
    <RigidBody
      ref={bodyRef}
      colliders={false}
      position={spec.position}
      rotation={spec.rotation}
      linearDamping={0.18}
      angularDamping={0.28}
      ccd
      canSleep
      userData={{ role: "dynamic", id: spec.id }}
      onCollisionEnter={(payload) => {
        const a = payload.target.rigidBody?.linvel();
        const b = payload.other.rigidBody?.linvel();
        if (!a) return;
        const dx = a.x - (b?.x ?? 0);
        const dy = a.y - (b?.y ?? 0);
        const dz = a.z - (b?.z ?? 0);
        const speed = Math.hypot(dx, dy, dz);
        if (speed > 1.6) playImpact(speed);
      }}
    >
      <ShapeCollider kind={spec.kind} scale={spec.scale} restitution={restitution} />
      <group
        onPointerDown={onPointerDown}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          if (!grabbed.current) gl.domElement.style.cursor = "grab";
        }}
        onPointerOut={() => {
          setHovered(false);
          if (!grabbed.current) gl.domElement.style.cursor = "default";
        }}
      >
        <ShapeMesh
          kind={spec.kind}
          scale={spec.scale}
          color={spec.color}
          hovered={hovered}
          grabbed={isGrabbed}
        />
      </group>
    </RigidBody>
  );
}

function Bodies() {
  const bodies = usePlayground((s) => s.bodies);
  return (
    <>
      {bodies.map((spec) => (
        <DynamicBody key={spec.id} spec={spec} />
      ))}
    </>
  );
}

function World() {
  const gravity = usePlayground((s) => s.gravity);
  const paused = usePlayground((s) => s.paused);

  return (
    <Physics
      gravity={[0, -gravity, 0]}
      timeStep={1 / 60}
      interpolate
      paused={paused}
      numSolverIterations={8}
      numInternalPgsIterations={2}
    >
      <Table />
      <Bodies />
      <DropCursor />
    </Physics>
  );
}

export function PlaygroundScene() {
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: [11.2, 7.4, 12.4], fov: 40, near: 0.1, far: 80 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      className="h-full w-full touch-none"
      onPointerDown={() => unlockAudio()}
    >
      <color attach="background" args={[SCENE_BG]} />
      <fog attach="fog" args={[SCENE_BG, 18, 44]} />
      <Lights />
      <Suspense fallback={null}>
        <World />
      </Suspense>
      <ContactShadows
        position={[0, TABLE_TOP + 0.001, 0]}
        opacity={0.42}
        scale={22}
        blur={2.2}
        far={8}
      />
      <CameraRig />
    </Canvas>
  );
}
