import { GRAPH_WORLD_RADIUS, type LayoutEdge } from "./graph-layout.ts";

// 먼 쪽의 청색부터 가까운 쪽의 주황색까지 같은 문자열을 재사용한다.
export const GRAPH_DEPTH_COLORS: readonly string[] = [
  "#477fe0", "#517ddd", "#5b7bd9", "#6579d6", "#7078d2", "#7a76cf",
  "#8474cb", "#8e72c8", "#9870c4", "#a071b4", "#a872a4", "#af7394",
  "#b77585", "#bf7675", "#c77765", "#ce7855", "#d67945",
];

export function graphDepthColor(depth: number): string {
  const normalized = Math.max(-1, Math.min(1, depth / GRAPH_WORLD_RADIUS));
  const index = Math.round((normalized + 1) * (GRAPH_DEPTH_COLORS.length - 1) / 2);
  return GRAPH_DEPTH_COLORS[index];
}

export function countGraphConnections(edges: readonly LayoutEdge[], nodeCount: number): Uint32Array {
  const counts = new Uint32Array(nodeCount);
  for (const edge of edges) {
    counts[edge.from]++;
    counts[edge.to]++;
  }
  return counts;
}
