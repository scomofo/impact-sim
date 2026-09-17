import { useEffect, useState, type ComponentType } from "react";
import { LoadingYard, Overlay } from "@/components/playground/overlay";

const scenePromise =
  typeof window === "undefined"
    ? null
    : import("@/components/playground/scene");

export function Playground() {
  const [Scene, setScene] = useState<ComponentType | null>(null);

  useEffect(() => {
    let active = true;
    if (!scenePromise) return;
    void scenePromise.then((mod) => {
      if (active) setScene(() => mod.PlaygroundScene);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="relative h-dvh min-h-dvh overflow-hidden bg-bg text-fg">
      <div className="absolute inset-0">{Scene ? <Scene /> : <LoadingYard />}</div>
      <Overlay />
    </main>
  );
}
