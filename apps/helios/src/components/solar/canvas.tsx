import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { Scene } from "./scene";

export function SolarCanvas() {
  return (
    <div className="absolute inset-0 touch-none">
      <Canvas
        camera={{ position: [0, 34, 90], fov: 42, near: 0.12, far: 1200 }}
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
        onCreated={({ gl }) => {
          gl.setClearColor("#06070b", 1);
        }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
