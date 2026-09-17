import { useEffect, useRef, useState } from "react";
import { createEngine } from "@/lib/sim/engine";
import type { EngineApi, HudSnapshot } from "@/lib/sim/types";
import { Hud } from "./hud";

const INITIAL: HudSnapshot = {
  paused: false,
  timeScale: 1,
  frame: "rotating",
  potential: false,
  hills: false,
  trails: true,
  mute: false,
  system: "sun-earth",
  mu: 3.0034e-6,
  stable: true,
  probeCount: 0,
  selected: "L2",
  selectedMission: "jwst",
  jacobi: null,
  hint: true,
  simDays: 0,
};

export function Simulator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EngineApi | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL);
  const [engine, setEngine] = useState<EngineApi | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const api = createEngine(canvas, setHud);
    engineRef.current = api;
    setEngine(api);
    api.start();
    setHud(api.snapshot());
    const id = window.setInterval(() => {
      const live = engineRef.current;
      if (live) setHud(live.snapshot());
    }, 120);
    return () => {
      window.clearInterval(id);
      api.destroy();
      engineRef.current = null;
      setEngine(null);
    };
  }, []);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full touch-none cursor-crosshair"
        aria-label="Lagrange point missions"
      />
      <Hud hud={hud} engine={engine} />
    </div>
  );
}
