import {
  Locate,
  Mountain,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  Spline,
  Trash2,
  Volume2,
  VolumeX,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { MAX_MU, MIN_MU, ROUTH_MU } from "@/lib/sim/cr3bp";
import { MISSIONS, missionById } from "@/lib/sim/missions";
import { POINT_COPY, SYSTEMS, systemById } from "@/lib/sim/systems";
import type { OrbitKind, MissionStatus } from "@/lib/sim/missions";
import type { EngineApi, HudSnapshot, PointId } from "@/lib/sim/types";

type Props = {
  hud: HudSnapshot;
  engine: EngineApi | null;
};

const POINTS: PointId[] = ["L1", "L2", "L3", "L4", "L5"];

export function Hud({ hud, engine }: Props) {
  const sys = systemById(hud.system);
  const mission = hud.selectedMission ? missionById(hud.selectedMission) : undefined;
  const copy = hud.selected ? POINT_COPY[hud.selected] : null;
  const logMin = Math.log10(MIN_MU);
  const logMax = Math.log10(MAX_MU);
  const logVal = (Math.log10(hud.mu) - logMin) / (logMax - logMin);
  const routhT = (Math.log10(ROUTH_MU) - logMin) / (logMax - logMin);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-3xl leading-none tracking-tight text-fg">
            Libration
          </p>
          <p className="mt-1 max-w-[18rem] text-xs text-muted text-pretty sm:text-sm">
            Missions at the five quiet points
          </p>
          {hud.hint ? (
            <p className="mt-2 hidden max-w-[22rem] text-xs text-muted animate-hint sm:block sm:text-sm">
              JWST orbits L2; SOHO holds L1. Pick a mission, or drag to throw a probe.
            </p>
          ) : null}
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Stat label="Probes" value={String(hud.probeCount)} />
            <Stat label="μ" value={formatMu(hud.mu)} />
          </div>
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium tracking-wide",
              hud.stable
                ? "border-border bg-surface/80 text-fg"
                : "border-border bg-elevated/80 text-muted",
            )}
          >
            {hud.stable ? "L4 / L5 stable" : "Trojans unbound"}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col justify-between gap-3 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 max-w-full">
            <div className="pointer-events-auto flex max-w-full flex-wrap gap-1">
              {SYSTEMS.map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  variant={hud.system === s.id ? "solid" : "ghost"}
                  className="h-9 rounded-full px-3 text-xs"
                  onClick={() => engine?.setSystem(s.id)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
            <div className="pointer-events-auto mt-2 flex max-w-[min(100%,42rem)] gap-1 overflow-x-auto pb-1">
              {MISSIONS.map((m) => (
                <Button
                  key={m.id}
                  size="sm"
                  variant={hud.selectedMission === m.id ? "solid" : "outline"}
                  className="h-11 shrink-0 rounded-full px-3 text-xs"
                  onClick={() => engine?.loadMission(m.id)}
                >
                  {m.name}
                </Button>
              ))}
            </div>
          </div>
          {mission || copy ? (
            <aside
              className={cn(
                "pointer-events-none hidden max-w-[18rem] rounded-[20px] border border-border",
                "bg-surface/80 p-4 shadow-[0_16px_60px_rgba(0,0,0,0.35)] lg:block",
              )}
            >
              {mission ? (
                <>
                  <p className="font-mono text-xs tabular-nums tracking-wider text-muted">
                    {mission.point} · {orbitLabel(mission.orbit)} · {statusLabel(mission.status)}
                  </p>
                  <p className="mt-1 font-display text-xl leading-tight text-fg">{mission.name}</p>
                  <p className="mt-1 text-xs text-muted">
                    {mission.agency} · {mission.years}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-fg/90 text-pretty">{mission.why}</p>
                  <p className="mt-3 text-xs leading-relaxed text-muted text-pretty">{mission.body}</p>
                </>
              ) : copy ? (
                <>
                  <p className="font-mono text-xs tabular-nums tracking-wider text-muted">
                    {copy.id}
                  </p>
                  <p className="mt-1 font-display text-xl leading-tight text-fg">{copy.title}</p>
                  <p className="mt-1 text-xs text-muted">{copy.seat}</p>
                  <p className="mt-3 text-sm leading-relaxed text-fg/90 text-pretty">{copy.body}</p>
                  <p className="mt-3 text-xs leading-relaxed text-muted text-pretty">{copy.use}</p>
                </>
              ) : null}
            </aside>
          ) : null}
        </div>

        <section
          className={cn(
            "pointer-events-auto mt-auto w-full max-w-3xl shrink-0 self-start rounded-[24px] border border-border",
            "bg-surface/85 p-2.5 shadow-[0_16px_60px_rgba(0,0,0,0.35)] sm:rounded-[28px] sm:p-4",
          )}
        >
          {mission ? (
            <p className="mb-2 truncate px-1 text-xs text-muted lg:hidden">
              <span className="font-mono text-fg">{mission.name}</span>
              <span>
                {" "}
                · {mission.point} · {orbitLabel(mission.orbit)}
              </span>
            </p>
          ) : copy ? (
            <p className="mb-2 truncate px-1 text-xs text-muted lg:hidden">
              <span className="font-mono text-fg">{copy.id}</span>
              <span> · {copy.title}</span>
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-1">
            {POINTS.map((id) => {
              const stable = (id === "L4" || id === "L5") && hud.stable;
              return (
                <Button
                  key={id}
                  size="sm"
                  variant={hud.selected === id && !hud.selectedMission ? "solid" : "outline"}
                  className="h-11 min-w-11 rounded-2xl px-3 font-mono text-xs"
                  onClick={() => engine?.dropAt(id)}
                >
                  {id}
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      stable ? "bg-fg" : "bg-muted/70",
                    )}
                    aria-hidden
                  />
                </Button>
              );
            })}
            <Button
              size="sm"
              variant="outline"
              className="h-11 rounded-2xl px-3 text-xs"
              onClick={() => engine?.dropTrojans()}
            >
              Trojans
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="hidden h-11 rounded-2xl px-3 text-xs sm:inline-flex"
              onClick={() => engine?.perturb()}
            >
              Perturb
            </Button>
          </div>

          <div className="mt-2 flex flex-col gap-2 sm:mt-3 sm:flex-row sm:items-center sm:gap-3">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center justify-between text-xs uppercase tracking-wider text-muted">
                Mass ratio μ
                <span className="font-mono normal-case tabular-nums text-fg/80">
                  {formatMu(hud.mu)}
                </span>
              </span>
              <div className="relative">
                <span
                  className="pointer-events-none absolute top-1/2 z-10 size-1.5 -translate-y-1/2 rounded-full bg-muted"
                  style={{ left: `${routhT * 100}%` }}
                  title="Routh limit"
                />
                <input
                  type="range"
                  aria-label="Mass ratio"
                  min={0}
                  max={1}
                  step={0.002}
                  value={logVal}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    const next = 10 ** (logMin + t * (logMax - logMin));
                    engine?.setMu(next);
                  }}
                  className="h-11 w-full cursor-pointer appearance-none bg-transparent"
                  suppressHydrationWarning
                />
              </div>
            </label>
            <label className="hidden min-w-[11rem] flex-col gap-1 sm:flex sm:w-44">
              <span className="flex items-center justify-between text-xs uppercase tracking-wider text-muted">
                Time
                <span className="font-mono normal-case tabular-nums text-fg/80">
                  {formatScale(hud.timeScale)}
                </span>
              </span>
              <input
                type="range"
                aria-label="Time scale"
                min={0.25}
                max={6}
                step={0.25}
                value={hud.timeScale}
                onChange={(e) => engine?.setTimeScale(Number(e.target.value))}
                className="h-11 w-full cursor-pointer appearance-none bg-transparent"
                suppressHydrationWarning
              />
            </label>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Button
              size="icon"
              variant="outline"
              aria-label={hud.paused ? "Play" : "Pause"}
              onClick={() => engine?.setPaused(!hud.paused)}
            >
              {hud.paused ? (
                <Play className="size-4 ml-0.5" />
              ) : (
                <Pause className="size-4" />
              )}
            </Button>
            <Button
              size="icon"
              variant={hud.frame === "inertial" ? "solid" : "outline"}
              aria-label="Toggle inertial frame"
              title={hud.frame === "rotating" ? "Rotating frame" : "Inertial frame"}
              onClick={() =>
                engine?.setFrame(hud.frame === "rotating" ? "inertial" : "rotating")
              }
            >
              <RotateCcw className="size-4" />
            </Button>
            <Button
              size="icon"
              variant={hud.potential ? "solid" : "outline"}
              aria-label="Effective potential"
              onClick={() => engine?.setPotential(!hud.potential)}
            >
              <Mountain className="size-4" />
            </Button>
            <Button
              size="icon"
              variant={hud.hills ? "solid" : "outline"}
              aria-label="Hill forbidden regions"
              onClick={() => engine?.setHills(!hud.hills)}
            >
              <Waves className="size-4" />
            </Button>
            <Button
              size="icon"
              variant={hud.trails ? "solid" : "outline"}
              aria-label="Toggle trails"
              onClick={() => engine?.setTrails(!hud.trails)}
            >
              <Spline className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="sm:hidden"
              aria-label="Perturb probes"
              onClick={() => engine?.perturb()}
            >
              <Shuffle className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              aria-label="Fit view"
              onClick={() => engine?.fit()}
            >
              <Locate className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              aria-label={hud.mute ? "Unmute" : "Mute"}
              onClick={() => engine?.setMute(!hud.mute)}
            >
              {hud.mute ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </Button>
            <p className="ml-1 hidden font-mono text-xs tabular-nums text-muted sm:block">
              {sys.pair} · {formatDays(hud.simDays)}
            </p>
            <Button
              className="ml-auto"
              variant="outline"
              aria-label="Clear probes"
              onClick={() => engine?.clear()}
            >
              <Trash2 className="size-4" />
              Clear
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/70 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="font-mono text-sm tabular-nums text-fg">{value}</p>
    </div>
  );
}

function formatMu(mu: number) {
  if (mu >= 0.1) return mu.toFixed(2);
  if (mu >= 0.01) return mu.toFixed(3);
  return mu.toExponential(2).replace("e", "×10^");
}

function formatScale(n: number) {
  const rounded = Math.round(n * 100) / 100;
  return `${rounded}×`;
}

function formatDays(n: number) {
  if (!Number.isFinite(n)) return "0 d";
  if (n < 1) return `${(n * 24).toFixed(1)} h`;
  if (n < 400) return `${n.toFixed(1)} d`;
  return `${(n / 365.25).toFixed(2)} yr`;
}

function orbitLabel(orbit: OrbitKind) {
  switch (orbit) {
    case "halo":
      return "Halo";
    case "lissajous":
      return "Lissajous";
    case "tadpole":
      return "Tadpole";
    case "nrho":
      return "NRHO";
    case "flyby":
      return "Flyby";
  }
}

function statusLabel(status: MissionStatus) {
  switch (status) {
    case "active":
      return "Active";
    case "complete":
      return "Complete";
    case "planned":
      return "Planned";
    case "en-route":
      return "En route";
  }
}
