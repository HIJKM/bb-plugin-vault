const CORNER_CURSOR_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><path d='M2 2.75H13.25V14' fill='none' stroke='#fff' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/><path d='M2 2.75H13.25V14' fill='none' stroke='#111' stroke-width='1.35' stroke-linecap='round' stroke-linejoin='round'/></svg>`;

/** Small ㄱ cursor. The hotspot is the bend, so the corner sits on the pointer. */
export const graphCornerCursor = `url("data:image/svg+xml,${encodeURIComponent(CORNER_CURSOR_SVG)}") 13 3, nesw-resize`;

export type GraphCornerDrag = {
  startX: number;
  startY: number;
  startWidth: number;
  startSplit: number;
  height: number;
};

/** Width follows the pointer. Split grows when the pointer moves up. */
export function graphCornerResize(
  drag: GraphCornerDrag,
  point: { x: number; y: number },
): { width: number; split: number } {
  return {
    width: drag.startWidth + (point.x - drag.startX),
    split:
      drag.height > 0 ? drag.startSplit - (point.y - drag.startY) / drag.height : drag.startSplit,
  };
}
