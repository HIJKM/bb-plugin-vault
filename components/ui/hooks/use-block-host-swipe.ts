import { useEffect, type RefObject } from "react";

const EDGE_PX = 40;

/**
 * Stop a left-edge horizontal swipe from opening the host sidebar drawer.
 * Vertical scrolling and swipes that start away from the leading edge still work.
 */
export function useBlockHostSwipe(
  rootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (event: TouchEvent) => {
      const root = rootRef.current;
      const touch = event.touches[0];
      const target = event.target;
      if (
        root === null ||
        touch === undefined ||
        !(target instanceof Node) ||
        !root.contains(target)
      ) {
        tracking = false;
        return;
      }
      const localX = touch.clientX - root.getBoundingClientRect().left;
      tracking = localX <= EDGE_PX || touch.clientX <= EDGE_PX;
      startX = touch.clientX;
      startY = touch.clientY;
    };

    const onMove = (event: TouchEvent) => {
      if (!tracking) return;
      const touch = event.touches[0];
      if (touch === undefined) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) < Math.abs(dy)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        tracking = false;
        return;
      }
      const root = rootRef.current;
      const target = event.target;
      if (root === null || !(target instanceof Node) || !root.contains(target)) {
        tracking = false;
        return;
      }
      const localX = event.clientX - root.getBoundingClientRect().left;
      tracking = localX <= EDGE_PX || event.clientX <= EDGE_PX;
      startX = event.clientX;
      startY = event.clientY;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!tracking || event.pointerType !== "touch") return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) < Math.abs(dy)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener("touchstart", onStart, { capture: true, passive: true });
    document.addEventListener("touchmove", onMove, { capture: true, passive: false });
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.addEventListener("pointermove", onPointerMove, { capture: true });
    return () => {
      document.removeEventListener("touchstart", onStart, true);
      document.removeEventListener("touchmove", onMove, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
    };
  }, [enabled, rootRef]);
}
