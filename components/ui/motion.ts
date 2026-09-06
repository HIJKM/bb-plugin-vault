/**
 * Shared hover-motion heuristic for primitives, so the whole UI speaks one
 * timing language instead of ad-hoc per-component transitions:
 *
 * - CONTROL_HOVER_TRANSITION — interactive controls (buttons, icon buttons):
 *   color, fill, and press scale ease over 200ms both ways so hover does not
 *   snap on and off.
 * - LIST_HOVER_TRANSITION — dense list/menu rows (menu items, list rows): no
 *   transition at all (instant both ways), so the highlight tracks the pointer
 *   and arrow keys exactly, with no lag during fast navigation.
 *
 * Reach for one of these rather than a bare `transition-colors` on anything with
 * a hover/active state.
 */
export const CONTROL_HOVER_TRANSITION =
  "transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-200 ease-out motion-reduce:transition-none";

export const LIST_HOVER_TRANSITION = "transition-none";
