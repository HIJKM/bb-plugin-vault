import type { GraphEdge, GraphNode } from "./note-graph.ts";

export const GRAPH_WORLD_RADIUS = 220;
export const GRAPH_MAX_STEPS = 160;
export const GRAPH_REPULSION_SAMPLES = 24;
export const GRAPH_SPRING_SAMPLES = 6000;

export type LayoutNode = GraphNode & {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
};

export type LayoutEdge = { from: number; to: number };
export type GraphLayout = { nodes: LayoutNode[]; edges: LayoutEdge[] };

export type Quaternion = { x: number; y: number; z: number; w: number };

export type GraphCamera = {
  orientation: Quaternion;
  scale: number;
  x: number;
  y: number;
};

export const DEFAULT_GRAPH_CAMERA: Readonly<GraphCamera> = {
  // 기존 yaw 0.35 → pitch -0.2 순서의 첫 화면을 유지한다.
  orientation: {
    x: Math.sin(-0.1) * Math.cos(0.175),
    y: Math.cos(-0.1) * Math.sin(0.175),
    z: Math.sin(-0.1) * Math.sin(0.175),
    w: Math.cos(-0.1) * Math.cos(0.175),
  },
  scale: 1,
  x: 0,
  y: 0,
};

export function rotateGraphCamera(camera: GraphCamera, dx: number, dy: number): void {
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return;
  const halfAngle = distance * 0.004;
  const axisScale = Math.sin(halfAngle) / distance;
  const deltaX = -dy * axisScale;
  const deltaY = dx * axisScale;
  const deltaW = Math.cos(halfAngle);
  const current = camera.orientation;
  // 화면 축의 회전을 현재 방향 앞에 합성해 기울어진 뒤에도 드래그 방향을 유지한다.
  const x = deltaW * current.x + deltaX * current.w + deltaY * current.z;
  const y = deltaW * current.y - deltaX * current.z + deltaY * current.w;
  const z = deltaW * current.z + deltaX * current.y - deltaY * current.x;
  const w = deltaW * current.w - deltaX * current.x - deltaY * current.y;
  const length = Math.hypot(x, y, z, w);
  // 얕게 복사한 기본 카메라의 orientation도 변경하지 않는다.
  camera.orientation = { x: x / length, y: y / length, z: z / length, w: w / length };
}

export type ProjectedGraphNode = {
  x: number;
  y: number;
  depth: number; // 클수록 카메라에 가까우므로 작은 값부터 그린다.
  scale: number; // world 좌표를 화면 픽셀로 바꾸는 최종 배율.
  perspective: number; // 화면 픽셀 기준 노드 크기에 적용할 원근 배율.
  visible: boolean;
};

export function createGraphProjection(camera: GraphCamera, width: number, height: number) {
  // 프레임마다 한 번 만들고 모든 노드에 재사용한다.
  const { x: qx, y: qy, z: qz, w: qw } = camera.orientation;
  const xx = qx * qx, yy = qy * qy, zz = qz * qz;
  const xy = qx * qy, xz = qx * qz, yz = qy * qz;
  const xw = qx * qw, yw = qy * qw, zw = qz * qw;
  const m00 = 1 - 2 * (yy + zz), m01 = 2 * (xy - zw), m02 = 2 * (xz + yw);
  const m10 = 2 * (xy + zw), m11 = 1 - 2 * (xx + zz), m12 = 2 * (yz - xw);
  const m20 = 2 * (xz - yw), m21 = 2 * (yz + xw), m22 = 1 - 2 * (xx + yy);
  const baseScale = Math.min(width, height) / (GRAPH_WORLD_RADIUS * 2.5) * camera.scale;
  const centerX = width / 2 + camera.x;
  const centerY = height / 2 + camera.y;
  const cameraDistance = GRAPH_WORLD_RADIUS * 4;

  return (node: Pick<LayoutNode, "x" | "y" | "z">): ProjectedGraphNode => {
    const rotatedX = node.x * m00 + node.y * m01 + node.z * m02;
    const rotatedY = node.x * m10 + node.y * m11 + node.z * m12;
    const depth = node.x * m20 + node.y * m21 + node.z * m22;
    const distance = cameraDistance - depth;
    const perspective = cameraDistance / Math.max(cameraDistance * 0.05, distance);
    const scale = baseScale * perspective;
    const x = centerX + rotatedX * scale;
    const y = centerY + rotatedY * scale;
    return {
      x,
      y,
      depth,
      scale,
      perspective,
      visible: width > 0 && height > 0 && distance > cameraDistance * 0.05
        && x >= -32 && x <= width + 32 && y >= -32 && y <= height + 32,
    };
  };
}

export function projectGraphNode(
  node: Pick<LayoutNode, "x" | "y" | "z">,
  camera: GraphCamera,
  width: number,
  height: number,
): ProjectedGraphNode {
  return createGraphProjection(camera, width, height)(node);
}

export function createGraphLayout(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): GraphLayout {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const radius = nodes.length > 1 ? GRAPH_WORLD_RADIUS * 0.78 : 0;
  const indices = new Map(nodes.map((node, index) => [node.path, index]));
  const indexedEdges: LayoutEdge[] = [];
  const seen = new Set<number>();
  for (const edge of edges) {
    const from = indices.get(edge.from);
    const to = indices.get(edge.to);
    if (from === undefined || to === undefined || from === to) continue;
    const key = from < to ? from * nodes.length + to : to * nodes.length + from;
    if (seen.has(key)) continue;
    seen.add(key);
    indexedEdges.push({ from, to });
  }
  return {
    nodes: nodes.map((node, index) => {
      const y = 1 - (2 * (index + 0.5)) / nodes.length;
      const ring = Math.sqrt(1 - y * y);
      const angle = index * goldenAngle;
      return {
        ...node,
        x: Math.cos(angle) * ring * radius,
        y: y * radius,
        z: Math.sin(angle) * ring * radius,
        vx: 0,
        vy: 0,
        vz: 0,
      };
    }),
    edges: indexedEdges,
  };
}

export function stepGraphLayout(layout: GraphLayout, iteration: number): number {
  const { nodes, edges } = layout;
  if (nodes.length === 0 || iteration >= GRAPH_MAX_STEPS) return 0;
  const cooling = (1 - Math.max(0, iteration) / GRAPH_MAX_STEPS) ** 2;
  const samples = Math.min(GRAPH_REPULSION_SAMPLES, nodes.length - 1);
  const repulsion = (6 * Math.min(nodes.length, 64)) / Math.max(1, samples);

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    node.vx -= node.x * 0.005;
    node.vy -= node.y * 0.005;
    node.vz -= node.z * 0.005;
    // 전체 쌍 대신 균등 간격의 노드를 교대로 살펴 프레임 비용을 제한한다.
    for (let sample = 0; sample < samples; sample++) {
      const offset = 1 + (Math.floor(sample * (nodes.length - 1) / samples) + iteration * 13) % (nodes.length - 1);
      const other = nodes[(index + offset) % nodes.length];
      const dx = node.x - other.x;
      const dy = node.y - other.y;
      const dz = node.z - other.z;
      const force = repulsion / (dx * dx + dy * dy + dz * dz + 36);
      node.vx += dx * force;
      node.vy += dy * force;
      node.vz += dz * force;
    }
  }

  // 매우 촘촘한 그래프도 한 프레임에 모든 선의 힘을 계산하지 않는다.
  const springSamples = Math.min(edges.length, GRAPH_SPRING_SAMPLES);
  for (let sample = 0; sample < springSamples; sample++) {
    const edgeIndex = (Math.floor(sample * edges.length / springSamples) + iteration * 13) % edges.length;
    const edge = edges[edgeIndex];
    const from = nodes[edge.from];
    const to = nodes[edge.to];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const force = 0.012 * (distance - 50) / distance;
    from.vx += dx * force;
    from.vy += dy * force;
    from.vz += dz * force;
    to.vx -= dx * force;
    to.vy -= dy * force;
    to.vz -= dz * force;
  }

  let maxMovement = 0;
  for (const node of nodes) {
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy + node.vz * node.vz);
    const damping = Math.min(0.7, 4 / (speed || 1)) * cooling;
    node.vx *= damping;
    node.vy *= damping;
    node.vz *= damping;
    node.x += node.vx;
    node.y += node.vy;
    node.z += node.vz;
    const radius = Math.sqrt(node.x * node.x + node.y * node.y + node.z * node.z);
    if (radius > GRAPH_WORLD_RADIUS) {
      const ratio = GRAPH_WORLD_RADIUS / radius;
      node.x *= ratio;
      node.y *= ratio;
      node.z *= ratio;
    }
    maxMovement = Math.max(maxMovement, speed * damping);
  }
  return maxMovement;
}
