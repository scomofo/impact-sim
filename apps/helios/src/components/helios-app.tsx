import { useEffect } from "react";
import { Overlay } from "@/components/hud/overlay";
import { Orrery2D } from "@/components/solar/orrery-2d";
import { hydrateHeliosPrefs, useHelios } from "@/lib/solar/store";

export function HeliosApp() {
  useEffect(() => {
    hydrateHeliosPrefs();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      useHelios.setState({ paused: true });
    }
    const w = window as Window & { __helios?: { getState: typeof useHelios.getState } };
    w.__helios = { getState: useHelios.getState };
    return () => {
      delete w.__helios;
    };
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <Orrery2D />
      <Overlay />
    </main>
  );
}
