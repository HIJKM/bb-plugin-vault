import { useEffect, useRef, type PointerEvent } from "react";
import type { GraphEdge, GraphNode } from "@/lib/note-graph";

type SimNode = GraphNode & { x: number; y: number; vx: number; vy: number };

function color(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value === "" ? fallback : value;
}

function tick(nodes: SimNode[], edges: GraphEdge[], width: number, height: number): void {
  const cx = width / 2;
  const cy = height / 2;
  const count = nodes.length;
  const rest = Math.max(48, Math.min(120, 520 / Math.sqrt(Math.max(1, count))));
  const byPath = new Map(nodes.map((node) => [node.path, node]));

  for (let i = 0; i < count; i += 1) {
    const a = nodes[i]!;
    for (let j = i + 1; j < count; j += 1) {
      const b = nodes[j]!;
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let dist = Math.hypot(dx, dy) || 0.01;
      const force = 420 / dist;
      dx = (dx / dist) * force;
      dy = (dy / dist) * force;
      a.vx += dx;
      a.vy += dy;
      b.vx -= dx;
      b.vy -= dy;
    }
  }

  for (const edge of edges) {
    const a = byPath.get(edge.from);
    const b = byPath.get(edge.to);
    if (a === undefined || b === undefined) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 0.01;
    const pull = (dist - rest) * 0.018;
    const px = (dx / dist) * pull;
    const py = (dy / dist) * pull;
    a.vx += px;
    a.vy += py;
    b.vx -= px;
    b.vy -= py;
  }

  for (const node of nodes) {
    node.vx += (cx - node.x) * 0.008;
    node.vy += (cy - node.y) * 0.008;
    node.vx *= 0.82;
    node.vy *= 0.82;
    node.x += node.vx;
    node.y += node.vy;
  }
}

export function GraphView({
  nodes,
  edges,
  activePath,
  onOpen,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  activePath: string;
  onOpen: (path: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<SimNode[]>([]);
  const edgesRef = useRef(edges);
  const camRef = useRef({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{
    pointerId: number;
    mode: "pan" | "node";
    path?: string;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const activeRef = useRef(activePath);
  const onOpenRef = useRef(onOpen);
  activeRef.current = activePath;
  onOpenRef.current = onOpen;
  edgesRef.current = edges;

  useEffect(() => {
    const wrap = wrapRef.current;
    if (wrap === null) return;
    const width = Math.max(1, wrap.clientWidth);
    const height = Math.max(1, wrap.clientHeight);
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.32;
    simRef.current = nodes.map((node, index) => {
      const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
      return {
        ...node,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      };
    });
    camRef.current = { x: 0, y: 0, scale: 1 };
  }, [nodes]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (wrap === null || canvas === null) return;
    let frames = 0;
    let raf = 0;
    const maxFrames = Math.min(220, 80 + nodes.length);

    const paint = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, wrap.clientWidth);
      const height = Math.max(1, wrap.clientHeight);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      const ctx = canvas.getContext("2d");
      if (ctx === null) return;
      if (frames < maxFrames) {
        tick(simRef.current, edgesRef.current, width, height);
        frames += 1;
      }
      const cam = camRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(cam.x, cam.y);
      ctx.scale(cam.scale, cam.scale);
      const edgeColor = color("--border", "#8884");
      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = 1 / cam.scale;
      const byPath = new Map(simRef.current.map((node) => [node.path, node]));
      for (const edge of edgesRef.current) {
        const from = byPath.get(edge.from);
        const to = byPath.get(edge.to);
        if (from === undefined || to === undefined) continue;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
      const ink = color("--foreground", "#111");
      const muted = color("--muted-foreground", "#666");
      const accent = color("--primary", "#4f46e5");
      const showLabels = cam.scale >= 0.85 || simRef.current.length <= 48;
      ctx.font = `${Math.max(10, 12 / cam.scale)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = "top";
      for (const node of simRef.current) {
        const active = node.path === activeRef.current;
        ctx.beginPath();
        ctx.fillStyle = active ? accent : muted;
        ctx.arc(node.x, node.y, active ? 6.5 : 5, 0, Math.PI * 2);
        ctx.fill();
        if (showLabels || active) {
          ctx.fillStyle = ink;
          ctx.fillText(node.name, node.x + 8, node.y - 6);
        }
      }
      ctx.restore();
      raf = window.requestAnimationFrame(paint);
    };
    raf = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(raf);
  }, [nodes]);

  function worldPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvasRef.current?.getBoundingClientRect();
    const cam = camRef.current;
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    return {
      x: (clientX - left - cam.x) / cam.scale,
      y: (clientY - top - cam.y) / cam.scale,
    };
  }

  function hitNode(clientX: number, clientY: number): SimNode | null {
    const point = worldPoint(clientX, clientY);
    const threshold = 16 / camRef.current.scale;
    let best: SimNode | null = null;
    let bestDist = threshold;
    for (const node of simRef.current) {
      const dist = Math.hypot(node.x - point.x, node.y - point.y);
      if (dist <= bestDist) {
        best = node;
        bestDist = dist;
      }
    }
    return best;
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      pinchRef.current = { dist: Math.max(1, dist), scale: camRef.current.scale };
      dragRef.current = null;
      return;
    }
    const node = hitNode(event.clientX, event.clientY);
    dragRef.current = {
      pointerId: event.pointerId,
      mode: node === null ? "pan" : "node",
      path: node?.path,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (pointersRef.current.size === 2 && pinchRef.current !== null) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      const next = Math.min(3.2, Math.max(0.35, pinchRef.current.scale * (dist / pinchRef.current.dist)));
      camRef.current.scale = next;
      return;
    }
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    if (drag.mode === "pan") {
      camRef.current.x += dx;
      camRef.current.y += dy;
      return;
    }
    const node = simRef.current.find((item) => item.path === drag.path);
    if (node === undefined) return;
    node.x += dx / camRef.current.scale;
    node.y += dy / camRef.current.scale;
    node.vx = 0;
    node.vy = 0;
  }

  function onPointerUp(event: PointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (!drag.moved && drag.path !== undefined) onOpenRef.current(drag.path);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const onWheelNative = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const cam = camRef.current;
      const factor = event.deltaY < 0 ? 1.08 : 0.92;
      const next = Math.min(3.2, Math.max(0.35, cam.scale * factor));
      const rect = canvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const wx = (px - cam.x) / cam.scale;
      const wy = (py - cam.y) / cam.scale;
      cam.scale = next;
      cam.x = px - wx * next;
      cam.y = py - wy * next;
    };
    canvas.addEventListener("wheel", onWheelNative, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheelNative);
  }, [nodes]);

  return (
    <div ref={wrapRef} className="relative min-h-0 min-w-0 flex-1 touch-none overscroll-none">
      {nodes.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">이 볼트에 노트가 없습니다.</p>
      ) : (
        <canvas
          ref={canvasRef}
          data-allow-pan
          className="block size-full cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      )}
    </div>
  );
}
