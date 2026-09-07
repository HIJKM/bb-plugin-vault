import { GRAPH_WORLD_RADIUS, type LayoutEdge } from "./graph-layout.ts";

// 먼 쪽의 청색부터 가까운 쪽의 주황색까지 같은 문자열을 재사용한다.
export const GRAPH_DEPTH_COLORS: readonly string[] = [
  "#477fe0", "#517ddd", "#5b7bd9", "#6579d6", "#7078d2", "#7a76cf",
  "#8474cb", "#8e72c8", "#9870c4", "#a071b4", "#a872a4", "#af7394",
  "#b77585", "#bf7675", "#c77765", "#ce7855", "#d67945",
];

export type GraphDepthAppearance = Readonly<{ color: string; opacity: number; blur: number }>;

export const GRAPH_DEPTH_APPEARANCES: readonly GraphDepthAppearance[] = GRAPH_DEPTH_COLORS.map((color, index) => {
  const near = index / (GRAPH_DEPTH_COLORS.length - 1);
  return {
    color,
    opacity: near <= 0.5 ? 0.18 + 0.74 * near : 0.55 + 0.9 * (near - 0.5),
    // 기본 반경 2px에서 사용하는 CSS px 값이며 가까운 1/3은 선명하게 유지한다.
    blur: near <= 0.5 ? 1.2 - 1.4 * near : Math.max(0, 0.5 - 3 * (near - 0.5)),
  };
});

export function graphDepthAppearance(depth: number): GraphDepthAppearance {
  const normalized = Math.max(-1, Math.min(1, depth / GRAPH_WORLD_RADIUS));
  const index = Math.round((normalized + 1) * (GRAPH_DEPTH_COLORS.length - 1) / 2);
  return GRAPH_DEPTH_APPEARANCES[index];
}

export function graphDepthColor(depth: number): string {
  return graphDepthAppearance(depth).color;
}

export function countGraphConnections(edges: readonly LayoutEdge[], nodeCount: number): Uint32Array {
  const counts = new Uint32Array(nodeCount);
  for (const edge of edges) {
    counts[edge.from]++;
    counts[edge.to]++;
  }
  return counts;
}
