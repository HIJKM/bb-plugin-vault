import { GRAPH_WORLD_RADIUS, type LayoutEdge } from "./graph-layout.ts";

// 청색 계열에서 먼 쪽은 밝게, 가까운 쪽은 진하게 표시하며 같은 문자열을 재사용한다.
export const GRAPH_DEPTH_COLORS: readonly string[] = [
  "#739ce8", "#6c97e7", "#6592e6", "#5f8ee5", "#5889e4", "#5285e3",
  "#4b80e2", "#457be1", "#3e77e0", "#3772df", "#316ddd", "#2a69dc",
  "#2464db", "#2361d5", "#225ece", "#205bc8", "#1f58c1",
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
