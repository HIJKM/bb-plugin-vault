export function highlightedNodeIndices(
  nodes: readonly { path: string }[],
  paths: readonly string[],
): ReadonlySet<number> {
  const wanted = new Set(paths);
  const indices = new Set<number>();
  nodes.forEach((node, index) => {
    if (wanted.has(node.path)) indices.add(index);
  });
  return indices;
}

/** Flamingo. Brighter than the old pure red, and pinker. */
export const AGENT_MARK_COLOR = "#ff6b81";
const AGENT_MARK_RGB = "255, 107, 129";

/** Halo stays inside 8px. Nodes themselves are only 1–3.2px. */
export function agentMarkGlow(nodeRadius: number): {
  innerRadius: number;
  outerRadius: number;
  stops: readonly (readonly [number, string])[];
} {
  return {
    innerRadius: nodeRadius * 0.35,
    outerRadius: Math.max(8, nodeRadius * 2.5),
    stops: [
      [0, `rgba(${AGENT_MARK_RGB}, 0.9)`],
      [0.22, `rgba(${AGENT_MARK_RGB}, 0.28)`],
      [1, `rgba(${AGENT_MARK_RGB}, 0)`],
    ],
  };
}

export function graphNodeEmphasis(input: {
  index: number;
  selected: number;
  marked: boolean;
  focused: boolean;
  appearance: { color: string; opacity: number };
  selectedColor: string;
}): { color: string; alpha: number; ring: boolean; glow: boolean } {
  if (input.marked) {
    return { color: AGENT_MARK_COLOR, alpha: 1, ring: false, glow: true };
  }
  const dimmed = input.selected >= 0 && input.index !== input.selected;
  const emphasized = input.index === input.selected;
  const alphaBase = input.focused ? 1 : input.appearance.opacity;
  return {
    color: emphasized ? input.selectedColor : input.appearance.color,
    alpha: alphaBase * (dimmed ? 0.28 : 1),
    ring: input.focused,
    glow: false,
  };
}

export function graphLabelHidden(index: number, infoIndex: number, selected: number): boolean {
  if (index === infoIndex) return true;
  return selected >= 0 && index !== selected;
}
