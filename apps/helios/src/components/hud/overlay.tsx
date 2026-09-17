import { Captions, Orbit, Pause, Play, Repeat, RotateCcw, Waves } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  BODY_ORDER,
  PLANETS,
  bodyPosition,
  formatDiameter,
  getBody,
  kindLabel,
  type BodyId,
} from "@/lib/solar/bodies";
import { keplerLive } from "@/lib/solar/kepler";
import { perturbLive } from "@/lib/solar/nbody";
import { resonanceLive } from "@/lib/solar/resonance";
import { sim } from "@/lib/solar/sim";
import { useHelios } from "@/lib/solar/store";
import { cn } from "@/lib/utils";

function useSimTime(ms = 100) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      if (now - last > ms) {
        setT(sim.time);
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ms]);
  return t;
}

function SimClock() {
  const t = useSimTime(120);
  return <span className="tabular-nums">{(t / 365.25).toFixed(2)} yr</span>;
}

function InfoPanel() {
  const focusedId = useHelios((s) => s.focusedId);
  const perturbed = useHelios((s) => s.perturbed);
  const resonance = useHelios((s) => s.resonance);
  const body = getBody(focusedId);
  const t = useSimTime(80);
  const live = body.id === "sun" ? null : keplerLive(body, t);
  const tug = perturbed && live ? perturbLive(body.id, live.radiusAu) : null;
  const lons: Partial<Record<BodyId, number>> = {};
  const scratch = { x: 0, y: 0, z: 0 };
  for (const p of PLANETS) {
    bodyPosition(p, t, scratch);
    lons[p.id] = Math.atan2(scratch.z, scratch.x);
  }
  const res = resonance ? resonanceLive(body.id, lons) : null;
  const hit = res?.hits[0];

  return (
    <section
      className="panel pointer-events-auto w-full max-w-sm p-4 md:w-80"
      aria-label={`${body.name} information`}
    >
      <p className="text-xs tracking-[0.22em] text-muted uppercase">{kindLabel(body.kind)}</p>
      <h2 className="font-display mt-1 text-3xl leading-tight font-medium tracking-tight text-balance italic">
        {body.name}
      </h2>
      <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">Distance</dt>
        <dd className="tabular-nums">
          {tug ? `${tug.radiusAu.toFixed(3)} AU` : live ? `${live.radiusAu.toFixed(3)} AU` : "—"}
        </dd>
        <dt className="text-muted">Diameter</dt>
        <dd className="tabular-nums">{formatDiameter(body.diameterKm)}</dd>
        <dt className="text-muted">Year</dt>
        <dd className="tabular-nums">{body.yearLabel}</dd>
        <dt className="text-muted">Day</dt>
        <dd className="tabular-nums">{body.dayLabel}</dd>
        <dt className="text-muted">Gravity</dt>
        <dd className="tabular-nums">{body.gravity}</dd>
        <dt className="text-muted">Moons</dt>
        <dd className="tabular-nums">{body.id === "sun" ? "—" : body.moonsCount}</dd>
      </dl>
      {res && (hit || body.id === "sun") ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs tracking-[0.2em] text-muted uppercase">Resonance</p>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
            {hit ? (
              <>
                <dt className="text-muted">Commensura</dt>
                <dd className="tabular-nums">{hit.pair.name}</dd>
                <dt className="text-muted">Period ratio</dt>
                <dd className="tabular-nums">{hit.ratio.toFixed(3)}</dd>
                <dt className="text-muted">Offset</dt>
                <dd className="tabular-nums">{hit.errorPct.toFixed(2)}%</dd>
                <dt className="text-muted">Synodic</dt>
                <dd className="tabular-nums">{hit.synodic.toFixed(2)} yr</dd>
                <dt className="text-muted">Conjunction</dt>
                <dd className="tabular-nums">{hit.ddeg.toFixed(1)}°</dd>
              </>
            ) : (
              <>
                <dt className="text-muted">Kirkwood</dt>
                <dd>3:1 · 5:2 · 2:1</dd>
                <dt className="text-muted">Jupiter–Saturn</dt>
                <dd className="tabular-nums">5 : 2</dd>
                <dt className="text-muted">Neptune–Pluto</dt>
                <dd className="tabular-nums">3 : 2</dd>
              </>
            )}
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            {hit
              ? hit.pair.blurb
              : "Integer period ratios lock tugs in place. Asteroids vanish at Jupiter’s Kirkwood gaps; Pluto is shepherded 3:2 with Neptune."}
          </p>
        </div>
      ) : live ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs tracking-[0.2em] text-muted uppercase">{perturbed ? "Perturbed" : "Kepler"}</p>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
            {tug ? (
              <>
                <dt className="text-muted">Δ vs Kepler</dt>
                <dd className="tabular-nums">
                  {tug.deltaAu >= 0 ? "+" : ""}
                  {tug.deltaAu.toFixed(4)} AU
                </dd>
                <dt className="text-muted">Main tug</dt>
                <dd>{tug.tug}</dd>
                <dt className="text-muted">Mass gain</dt>
                <dd className="tabular-nums">{tug.boost}×</dd>
              </>
            ) : (
              <>
                <dt className="text-muted">Eccentricity</dt>
                <dd className="tabular-nums">{live.eccentricity.toFixed(4)}</dd>
                <dt className="text-muted">Perihelion</dt>
                <dd className="tabular-nums">{live.perihelionAu.toFixed(3)} AU</dd>
                <dt className="text-muted">Aphelion</dt>
                <dd className="tabular-nums">{live.aphelionAu.toFixed(3)} AU</dd>
                <dt className="text-muted">Speed</dt>
                <dd className="tabular-nums">{live.speedRatio.toFixed(2)}× circ.</dd>
                <dt className="text-muted">P² / a³</dt>
                <dd className="tabular-nums">{live.thirdLaw.toFixed(3)}</dd>
              </>
            )}
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            {perturbed
              ? "N-body tugs + exaggerated Mercury GR. Ellipses precess; dashed path is the two-body Kepler orbit."
              : "I ellipse, Sun at a focus · II equal areas · III P² ∝ a³"}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-pretty text-muted">
          {perturbed
            ? "Every planet pulls on every other. The two-body ellipse is only the first approximation — Jupiter writes the rest."
            : body.summary}
        </p>
      )}
    </section>
  );
}

function Transport() {
  const paused = useHelios((s) => s.paused);
  const speed = useHelios((s) => s.speed);
  const showLabels = useHelios((s) => s.showLabels);
  const showTrails = useHelios((s) => s.showTrails);
  const perturbed = useHelios((s) => s.perturbed);
  const resonance = useHelios((s) => s.resonance);
  const togglePaused = useHelios((s) => s.togglePaused);
  const setSpeed = useHelios((s) => s.setSpeed);
  const toggleLabels = useHelios((s) => s.toggleLabels);
  const toggleTrails = useHelios((s) => s.toggleTrails);
  const togglePerturbed = useHelios((s) => s.togglePerturbed);
  const toggleResonance = useHelios((s) => s.toggleResonance);
  const resetView = useHelios((s) => s.resetView);

  return (
    <section className="panel pointer-events-auto w-full max-w-sm p-3 md:w-72" aria-label="Simulation controls">
      <div className="flex items-center gap-2">
        <Button
          variant="muted"
          size="icon"
          onClick={togglePaused}
          aria-pressed={paused}
          aria-label={paused ? "Resume simulation" : "Pause simulation"}
        >
          <span className="relative size-5">
            <Pause
              className={cn(
                "absolute inset-0 size-5 transition-[opacity,transform,filter] duration-[var(--motion-fast)] ease-[var(--ease-in-out)]",
                paused ? "scale-25 opacity-0 blur-sm" : "scale-100 opacity-100 blur-none",
              )}
            />
            <Play
              className={cn(
                "absolute inset-0 size-5 transition-[opacity,transform,filter] duration-[var(--motion-fast)] ease-[var(--ease-in-out)]",
                paused ? "ml-0.5 scale-100 opacity-100 blur-none" : "scale-25 opacity-0 blur-sm",
              )}
            />
          </span>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between px-1">
            <span className="text-xs tracking-[0.18em] text-muted uppercase">Speed</span>
            <span className="text-xs tabular-nums text-fg">{speed.toFixed(2)}×</span>
          </div>
          <Slider
            value={[speed]}
            min={0.25}
            max={16}
            step={0.25}
            onValueChange={(v) => setSpeed(v[0] ?? 1)}
            aria-label="Simulation speed"
          />
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <Button
          variant="muted"
          size="sm"
          className="flex-1"
          aria-pressed={showLabels}
          onClick={toggleLabels}
        >
          <Captions className="size-3.5" />
          Labels
        </Button>
        <Button
          variant="muted"
          size="sm"
          className="flex-1"
          aria-pressed={showTrails}
          onClick={toggleTrails}
        >
          <Orbit className="size-3.5" />
          Trails
        </Button>
      </div>
      <div className="mt-2 flex gap-2">
        <Button
          variant="muted"
          size="sm"
          className="flex-1"
          aria-pressed={perturbed}
          onClick={togglePerturbed}
        >
          <Waves className="size-3.5" />
          Perturb
        </Button>
        <Button
          variant="muted"
          size="sm"
          className="flex-1"
          aria-pressed={resonance}
          onClick={toggleResonance}
        >
          <Repeat className="size-3.5" />
          Resonant
        </Button>
        <Button variant="muted" size="sm" onClick={resetView} aria-label="Reset view to the Sun">
          <RotateCcw className="size-3.5" />
        </Button>
      </div>
    </section>
  );
}

function PlanetPicker() {
  const focusedId = useHelios((s) => s.focusedId);
  const setFocused = useHelios((s) => s.setFocused);
  return (
    <nav
      className="pointer-events-auto max-w-full overflow-x-auto md:overflow-visible"
      aria-label="Focus a world"
    >
      <ul className="flex w-max gap-1.5 px-1 md:w-auto md:flex-wrap md:justify-center">
        {BODY_ORDER.map((id) => {
          const body = getBody(id);
          const active = id === focusedId;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => setFocused(id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex h-11 items-center gap-2 rounded-md px-2.5 text-xs whitespace-nowrap transition-[background-color,color] duration-[var(--motion-quick)] ease-[var(--ease-out)]",
                  active ? "bg-fg text-bg" : "bg-surface/80 text-fg hover:bg-fg/10",
                )}
              >
                <span
                  className="relative size-3.5 shrink-0 rounded-full"
                  style={{
                    background: `radial-gradient(circle at 32% 28%, color-mix(in oklab, white 55%, ${body.color}), ${body.color} 62%, color-mix(in oklab, black 45%, ${body.color}))`,
                    boxShadow: `0 0 10px color-mix(in oklab, ${body.color} 55%, transparent)`,
                  }}
                  aria-hidden
                />
                {body.name}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Overlay() {
  const hasInteracted = useHelios((s) => s.hasInteracted);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const {
        togglePaused,
        toggleLabels,
        toggleTrails,
        togglePerturbed,
        toggleResonance,
        resetView,
        setSpeed,
        setFocused,
        speed,
      } = useHelios.getState();
      const k = e.key.toLowerCase();
      if (k === " " || k === "k") {
        e.preventDefault();
        togglePaused();
      } else if (k === "l") toggleLabels();
      else if (k === "t") toggleTrails();
      else if (k === "p") togglePerturbed();
      else if (k === "m") toggleResonance();
      else if (k === "r" || k === "escape") resetView();
      else if (k === "[") setSpeed(Math.max(0.25, speed - 0.25));
      else if (k === "]") setSpeed(Math.min(16, speed + 0.25));
      else if (/^[0-8]$/.test(k)) {
        const id = BODY_ORDER[Number(k)] as BodyId | undefined;
        if (id) setFocused(id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 md:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl leading-none tracking-tight italic md:text-4xl">Helios</h1>
            <p className="mt-1 text-xs tracking-widest text-muted uppercase">Observatory</p>
          </div>
          <div className="hidden text-right text-xs text-muted md:block">
            <p className="tracking-[0.18em] uppercase">Elapsed</p>
            <p className="mt-1 text-fg">
              <SimClock />
            </p>
          </div>
        </div>
        <div className="flex justify-start md:justify-center">
          <PlanetPicker />
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <InfoPanel />
        <div className="flex flex-col items-stretch gap-2 md:items-end">
          {!hasInteracted ? (
            <p className="hidden px-1 text-xs tracking-wide text-muted md:block">
              Drag to orbit · Mercury for the ellipse · space pauses
            </p>
          ) : null}
          <Transport />
        </div>
      </div>
    </div>
  );
}
