import { useEffect, type RefObject } from "react";

/**
 * The host drawer opens on a horizontal pan. Cancel that gesture as soon as a
 * touch inside this panel is more horizontal than vertical, and never wait for
 * an edge threshold — iOS reports a wide layout viewport so "compact" is not
 * a reliable gate.
 */
export function useBlockHostSwipe(rootRef: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let locked: "h" | "v" | null = null;

    const allowsOwnPan = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      let el: Element | null = target;
      while (el !== null && el !== rootRef.current) {
        if (el.hasAttribute("data-allow-pan")) return true;
        el = el.parentElement;
      }
      return false;
    };

    const begin = (clientX: number, clientY: number, target: EventTarget | null) => {
      const root = rootRef.current;
      if (
        root === null ||
        !(target instanceof Node) ||
        !root.contains(target) ||
        allowsOwnPan(target)
      ) {
        tracking = false;
        locked = null;
        return;
      }
      tracking = true;
      locked = null;
      startX = clientX;
      startY = clientY;
    };

    const move = (event: Event, clientX: number, clientY: number) => {
      if (!tracking) return;
      const dx = clientX - startX;
      const dy = clientY - startY;
      if (locked === null && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        locked = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
      }
      if (locked !== "h") return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch === undefined) return;
      begin(touch.clientX, touch.clientY, event.target);
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch === undefined) return;
      move(event, touch.clientX, touch.clientY);
    };
    const onTouchEnd = () => {
      tracking = false;
      locked = null;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        tracking = false;
        return;
      }
      begin(event.clientX, event.clientY, event.target);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      move(event, event.clientX, event.clientY);
    };

    const opts: AddEventListenerOptions = { capture: true, passive: false };
    window.addEventListener("touchstart", onTouchStart, opts);
    window.addEventListener("touchmove", onTouchMove, opts);
    window.addEventListener("touchend", onTouchEnd, true);
    window.addEventListener("touchcancel", onTouchEnd, true);
    window.addEventListener("pointerdown", onPointerDown, opts);
    window.addEventListener("pointermove", onPointerMove, opts);
    return () => {
      window.removeEventListener("touchstart", onTouchStart, true);
      window.removeEventListener("touchmove", onTouchMove, true);
      window.removeEventListener("touchend", onTouchEnd, true);
      window.removeEventListener("touchcancel", onTouchEnd, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
    };
  }, [enabled, rootRef]);
}
