import { useEffect, useRef, useState } from "react";
import { Box, Circle, Cylinder, Pause, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  MAX_BODIES,
  type ShapeKind,
  usePlayground,
} from "@/lib/playground/store";
import { playDrop, unlockAudio } from "@/lib/playground/audio";

const SHAPES: { kind: ShapeKind; label: string; icon: typeof Circle }[] = [
  { kind: "sphere", label: "Sphere", icon: Circle },
  { kind: "box", label: "Box", icon: Box },
  { kind: "cylinder", label: "Cylinder", icon: Cylinder },
];

export function Overlay() {
  const kind = usePlayground((s) => s.kind);
  const gravity = usePlayground((s) => s.gravity);
  const restitution = usePlayground((s) => s.restitution);
  const paused = usePlayground((s) => s.paused);
  const count = usePlayground((s) => s.bodies.length);
  const setKind = usePlayground((s) => s.setKind);
  const setGravity = usePlayground((s) => s.setGravity);
  const setRestitution = usePlayground((s) => s.setRestitution);
  const setPaused = usePlayground((s) => s.setPaused);
  const dropSelected = usePlayground((s) => s.dropSelected);
  const clear = usePlayground((s) => s.clear);
  const holdRef = useRef<number | null>(null);
  const [slidersReady, setSlidersReady] = useState(false);

  useEffect(() => {
    setSlidersReady(true);
  }, []);

  const drop = () => {
    unlockAudio();
    playDrop();
    dropSelected();
  };

  const startHold = () => {
    drop();
    stopHold();
    holdRef.current = window.setInterval(drop, 170);
  };

  const stopHold = () => {
    if (holdRef.current != null) {
      window.clearInterval(holdRef.current);
      holdRef.current = null;
    }
  };

  useEffect(() => () => stopHold(), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.isContentEditable)) {
        return;
      }
      if (event.code === "Digit1") setKind("sphere");
      else if (event.code === "Digit2") setKind("box");
      else if (event.code === "Digit3") setKind("cylinder");
      else if (event.code === "Space") {
        event.preventDefault();
        drop();
      } else if (event.code === "KeyP") {
        setPaused(!usePlayground.getState().paused);
      } else if (event.code === "KeyC" || event.code === "Delete") {
        clear();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clear, setKind, setPaused]);

  const full = count >= MAX_BODIES;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 sm:p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="pointer-events-auto max-w-64">
          <p className="font-display text-2xl leading-tight tracking-display text-balance text-fg sm:text-3xl">
            Stackyard
          </p>
          <p className="mt-1 text-sm leading-snug text-pretty text-muted">
            Drop, stack, and topple.
          </p>
        </div>
        <div className="pointer-events-auto rounded-3xl bg-surface px-3 py-2 shadow-border">
          <p className="text-xs font-medium uppercase tracking-widest text-subtle">
            Bodies
          </p>
          <p className="font-mono text-lg tabular-nums leading-tight text-fg">
            {count}
            <span className="text-muted">/{MAX_BODIES}</span>
          </p>
        </div>
      </header>

      <div className="pointer-events-auto mx-auto flex w-full max-w-3xl flex-col gap-2 pb-[env(safe-area-inset-bottom)]">
        <p className="hidden px-1 text-center text-xs text-subtle sm:block">
          Click the table to drop · Drag a body to throw · Right-drag or two-finger look
        </p>
        <p className="px-1 text-center text-xs text-subtle sm:hidden">
          Tap to drop · Drag to throw · Two-finger look
        </p>

        <div className="rounded-3xl bg-surface p-2 shadow-border">
          <div className="flex items-center gap-1">
            {SHAPES.map((shape) => {
              const Icon = shape.icon;
              const selected = kind === shape.kind;
              return (
                <Button
                  key={shape.kind}
                  type="button"
                  variant={selected ? "selected" : "quiet"}
                  size="toolbar"
                  aria-pressed={selected}
                  aria-label={shape.label}
                  onClick={() => setKind(shape.kind)}
                >
                  <Icon />
                  <span className="hidden sm:inline">{shape.label}</span>
                </Button>
              );
            })}

            <div className="ml-auto flex items-center gap-1">
              <Button
                type="button"
                variant="default"
                size="toolbar"
                disabled={full}
                onPointerDown={startHold}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                onPointerCancel={stopHold}
              >
                Drop
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={paused ? "Resume" : "Pause"}
                onClick={() => setPaused(!paused)}
              >
                {paused ? <Play /> : <Pause />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Clear the yard"
                onClick={() => clear()}
              >
                <Trash2 />
              </Button>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-3 rounded-2xl bg-bg px-3 py-1.5">
            <label className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-xs font-medium text-muted">
                Gravity
              </span>
              {slidersReady ? (
                <Slider
                  min={0}
                  max={20}
                  step={0.1}
                  value={[gravity]}
                  onValueChange={([value]) => setGravity(value ?? 0)}
                  aria-label="Gravity"
                />
              ) : (
                <div className="h-11 flex-1" />
              )}
              <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-fg">
                {gravity.toFixed(1)}
              </span>
            </label>
            <label className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-xs font-medium text-muted">
                Bounce
              </span>
              {slidersReady ? (
                <Slider
                  min={0}
                  max={0.92}
                  step={0.01}
                  value={[restitution]}
                  onValueChange={([value]) => setRestitution(value ?? 0)}
                  aria-label="Restitution"
                />
              ) : (
                <div className="h-11 flex-1" />
              )}
              <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-fg">
                {restitution.toFixed(2)}
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoadingYard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center bg-bg px-6 text-center",
        className,
      )}
    >
      <p className="font-display text-4xl tracking-display text-fg">Stackyard</p>
      <p className="mt-2 text-sm text-muted">Warming the table…</p>
    </div>
  );
}
