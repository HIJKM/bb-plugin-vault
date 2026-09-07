import { useEffect, useState, type ComponentType, type ReactNode } from "react";

export function PanelSplash({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const [phase, setPhase] = useState<"enter" | "hold" | "reveal" | "done">("enter");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("done");
      return;
    }
    const enter = window.requestAnimationFrame(() => setPhase("hold"));
    const reveal = window.setTimeout(() => setPhase("reveal"), 280);
    const done = window.setTimeout(() => setPhase("done"), 560);
    return () => {
      window.cancelAnimationFrame(enter);
      window.clearTimeout(reveal);
      window.clearTimeout(done);
    };
  }, []);

  return (
    <div data-no-sidebar-swipe="" className="relative h-full min-h-0">
      <div
        className={
          phase === "enter" || phase === "hold"
            ? "h-full min-h-0 opacity-0"
            : "h-full min-h-0 opacity-100 transition-opacity duration-300 ease-out motion-reduce:transition-none"
        }
      >
        {children}
      </div>
      {phase !== "done" ? (
        <div
          aria-hidden
          className={
            "pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center bg-background " +
            (phase === "reveal"
              ? "opacity-0 transition-opacity duration-300 ease-out"
              : "opacity-100")
          }
        >
          <div
            className={
              "flex size-14 items-center justify-center text-foreground transition-transform duration-300 ease-out motion-reduce:transition-none " +
              (phase === "enter" ? "scale-90" : phase === "hold" ? "scale-100" : "scale-110")
            }
          >
            {icon}
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
        </div>
      ) : null}
    </div>
  );
}

export function withPanelSplash<P extends object>(
  title: string,
  icon: ReactNode,
  Component: ComponentType<P>,
): ComponentType<P> {
  function Splashed(props: P) {
    return (
      <PanelSplash title={title} icon={icon}>
        <Component {...props} />
      </PanelSplash>
    );
  }
  Splashed.displayName = `withPanelSplash(${Component.displayName ?? Component.name ?? title})`;
  return Splashed;
}
