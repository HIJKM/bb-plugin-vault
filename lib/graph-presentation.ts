import { GRAPH_WORLD_RADIUS, type LayoutEdge } from "./graph-layout.ts";

// 테마를 읽지 못할 때의 청색 램프. 화면에서는 graph-theme가 이 길이를 유지한 채 현재 테마색으로 바꾼다.
export const GRAPH_DEPTH_COLORS: readonly string[] = [
  "#739ce8", "#6c97e7", "#6592e6", "#5f8ee5", "#5889e4", "#5285e3",
  "#4b80e2", "#457be1", "#3e77e0", "#3772df", "#316ddd", "#2a69dc",
  "#2464db", "#2361d5", "#225ece", "#205bc8", "#1f58c1",
];

export const GRAPH_DEPTH_STEPS = GRAPH_DEPTH_COLORS.length;

export type GraphDepthAppearance = Readonly<{ color: string; opacity: number; blur: number }>;

function depthStyle(index: number, count: number): Pick<GraphDepthAppearance, "opacity" | "blur"> {
  const near = count <= 1 ? 1 : index / (count - 1);
  return {
    opacity: near <= 0.5 ? 0.18 + 0.74 * near : 0.55 + 0.9 * (near - 0.5),
    // 기본 반경 2px에서 사용하는 CSS px 값이며 가까운 1/3은 선명하게 유지한다.
    blur: near <= 0.5 ? 1.2 - 1.4 * near : Math.max(0, 0.5 - 3 * (near - 0.5)),
  };
}

export const GRAPH_DEPTH_APPEARANCES: readonly GraphDepthAppearance[] = GRAPH_DEPTH_COLORS.map((color, index) => ({
  color,
  ...depthStyle(index, GRAPH_DEPTH_COLORS.length),
}));

const sampleCache = new WeakMap<readonly string[], readonly GraphDepthAppearance[]>();

export function graphDepthSamples(colors: readonly string[] = GRAPH_DEPTH_COLORS): readonly GraphDepthAppearance[] {
  if (colors === GRAPH_DEPTH_COLORS) return GRAPH_DEPTH_APPEARANCES;
  const cached = sampleCache.get(colors);
  if (cached) return cached;
  const samples = colors.map((color, index) => ({ color, ...depthStyle(index, colors.length) }));
  sampleCache.set(colors, samples);
  return samples;
}

export function graphDepthAppearance(depth: number, colors: readonly string[] = GRAPH_DEPTH_COLORS): GraphDepthAppearance {
  const samples = graphDepthSamples(colors);
  const normalized = Math.max(-1, Math.min(1, depth / GRAPH_WORLD_RADIUS));
  const index = Math.round((normalized + 1) * (samples.length - 1) / 2);
  return samples[index];
}

export function graphDepthColor(depth: number): string {
  return graphDepthAppearance(depth).color;
}

export const GRAPH_EDGE_REVEAL_MS = 240;

export function graphSelectionReveal(elapsed: number, reducedMotion = false): {
  edgeProgress: number;
  showTooltip: boolean;
} {
  if (reducedMotion) return { edgeProgress: 1, showTooltip: true };
  const t = Math.max(0, Math.min(1, elapsed / GRAPH_EDGE_REVEAL_MS));
  return {
    edgeProgress: 1 - (1 - t) ** 3,
    showTooltip: t >= 1,
  };
}

export function countGraphConnections(edges: readonly LayoutEdge[], nodeCount: number): Uint32Array {
  const counts = new Uint32Array(nodeCount);
  for (const edge of edges) {
    counts[edge.from]++;
    counts[edge.to]++;
  }
  return counts;
}
