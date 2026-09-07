export type CalloutPoint = { x: number; y: number };
export type CalloutRect = CalloutPoint & { width: number; height: number };

export const GRAPH_CALLOUT_LINE_MS = 200;
export const GRAPH_CALLOUT_LABEL_MS = 160;

export function graphCalloutReveal(elapsed: number, reducedMotion = false) {
  if (reducedMotion) return { lineProgress: 1, labelProgress: 1, done: true };
  const line = Math.max(0, Math.min(1, elapsed / GRAPH_CALLOUT_LINE_MS));
  const label = Math.max(0, Math.min(1, (elapsed - GRAPH_CALLOUT_LINE_MS) / GRAPH_CALLOUT_LABEL_MS));
  return {
    lineProgress: 1 - (1 - line) ** 3,
    labelProgress: 1 - (1 - label) ** 3,
    done: elapsed >= GRAPH_CALLOUT_LINE_MS + GRAPH_CALLOUT_LABEL_MS,
  };
}

export function graphCalloutPrefix(points: readonly CalloutPoint[], progress: number): readonly CalloutPoint[] {
  if (progress <= 0) return [];
  if (progress >= 1 || points.length < 2) return points;
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  if (total === 0) return points;
  let remaining = total * progress;
  const prefix = [points[0]];
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length <= remaining) {
      prefix.push(to);
      remaining -= length;
    } else {
      if (remaining > 0) prefix.push({
        x: from.x + (to.x - from.x) * remaining / length,
        y: from.y + (to.y - from.y) * remaining / length,
      });
      break;
    }
  }
  return prefix;
}

export function closestGraphCallouts(
  projected: readonly { depth: number; visible: boolean }[],
  order: readonly number[],
): number[] {
  const closest: number[] = [];
  for (let index = order.length - 1; index >= 0 && closest.length < 3; index--) {
    const nodeIndex = order[index];
    if (projected[nodeIndex].visible) closest.push(nodeIndex);
  }
  return closest;
}

export function placeGraphCallout(
  anchor: CalloutPoint,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  occupied: readonly CalloutRect[] = [],
  gap = 28,
): CalloutRect | null {
  const { width, height } = size;
  const maxX = viewport.width - width - 8;
  const maxY = viewport.height - height - 8;
  if (maxX < 8 || maxY < 8) return null;
  const right = anchor.x + gap;
  const left = anchor.x - gap - width;
  const above = anchor.y - gap - height;
  const below = anchor.y + gap;
  // 후보 수를 고정해 이름이 많아도 배치 탐색 비용이 늘어나지 않게 한다.
  const candidates = [
    [right, above], [right, below], [left, above], [left, below],
    [anchor.x - width / 2, above], [anchor.x - width / 2, below],
    [right, anchor.y - height / 2], [left, anchor.y - height / 2],
  ];
  for (const [candidateX, candidateY] of candidates) {
    const x = Math.max(8, Math.min(maxX, candidateX));
    const y = Math.max(8, Math.min(maxY, candidateY));
    if (anchor.x > x - 12 && anchor.x < x + width + 12
      && anchor.y > y - 12 && anchor.y < y + height + 12) continue;
    if (occupied.some((rect) => x < rect.x + rect.width + 4 && x + width + 4 > rect.x
      && y < rect.y + rect.height + 4 && y + height + 4 > rect.y)) continue;
    return { x, y, width, height };
  }
  return null;
}

export function graphCalloutLeader(
  anchor: CalloutPoint,
  rect: CalloutRect,
  radius = 0,
): readonly CalloutPoint[] | null {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  if (anchor.x >= rect.x && anchor.x <= right && anchor.y >= rect.y && anchor.y <= bottom) return null;
  const insetX = Math.min(8, rect.width / 2);
  const insetY = Math.min(8, rect.height / 2);
  // 둥근 모서리의 빈 부분 대신 가장자리의 직선 부분에 연결한다.
  const end = anchor.x < rect.x || anchor.x > right
    ? {
      x: anchor.x < rect.x ? rect.x : right,
      y: Math.max(rect.y + insetY, Math.min(bottom - insetY, anchor.y)),
    }
    : {
      x: Math.max(rect.x + insetX, Math.min(right - insetX, anchor.x)),
      y: anchor.y < rect.y ? rect.y : bottom,
    };
  const elbow = end.x === anchor.x
    ? { x: end.x, y: (anchor.y + end.y) / 2 }
    : { x: (anchor.x + end.x) / 2, y: end.y };
  const dx = elbow.x - anchor.x;
  const dy = elbow.y - anchor.y;
  const length = Math.hypot(dx, dy);
  const clearance = Math.max(0, radius) + 2;
  if (length <= clearance) return null;
  const start = { x: anchor.x + dx * clearance / length, y: anchor.y + dy * clearance / length };
  return [start, elbow, end];
}
