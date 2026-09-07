import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { GraphEdge, GraphNode } from "@/lib/note-graph";
import {
  createGraphLayout,
  createGraphProjection,
  DEFAULT_GRAPH_CAMERA,
  GRAPH_MAX_STEPS,
  rotateGraphCamera,
  stepGraphLayout,
  type ProjectedGraphNode,
} from "@/lib/graph-layout";
import { countGraphConnections, graphDepthColor, GRAPH_DEPTH_COLORS } from "@/lib/graph-presentation";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
type Point = { x: number; y: number };
type Controls = {
  redraw: () => void;
  zoom: (factor: number) => void;
  reset: () => void;
  dismissInfo: () => void;
  openFile: () => void;
};

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
  const infoRef = useRef<HTMLDivElement>(null);
  const infoAnchorRef = useRef<Point | null>(null);
  const controlsRef = useRef<Controls | null>(null);
  const propsRef = useRef({ activePath, onOpen });
  propsRef.current = { activePath, onOpen };
  const helpId = useId();
  const [simplified, setSimplified] = useState(false);
  const [info, setInfo] = useState<(GraphNode & { connections: number }) | null>(null);

  function positionInfo() {
    const panel = infoRef.current;
    const wrap = wrapRef.current;
    const anchor = infoAnchorRef.current;
    if (panel === null || wrap === null || anchor === null) return;
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    const margin = 8;
    panel.style.maxHeight = `${Math.max(0, height - margin * 2)}px`;
    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;
    const right = anchor.x + 14;
    const leftSide = anchor.x - panelWidth - 14;
    let left = right;
    let top = anchor.y - panelHeight / 2;
    if (right + panelWidth > width - margin) {
      left = leftSide;
      if (leftSide < margin) {
        // 좁은 화면에서는 점 위·아래의 여백을 사용해 선택한 점을 가리지 않는다.
        left = anchor.x - panelWidth / 2;
        const above = anchor.y - panelHeight - 14;
        top = above >= margin ? above : anchor.y + 14;
      }
    }
    panel.style.left = `${clamp(left, margin, Math.max(margin, width - panelWidth - margin))}px`;
    panel.style.top = `${clamp(top, margin, Math.max(margin, height - panelHeight - margin))}px`;
  }

  useLayoutEffect(() => {
    if (info === null || infoRef.current === null || wrapRef.current === null) return;
    positionInfo();
    infoRef.current.focus({ preventScroll: true });
    const observer = new ResizeObserver(positionInfo);
    observer.observe(infoRef.current);
    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [info]);

  useEffect(() => {
    setInfo(null);
    infoAnchorRef.current = null;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (wrap === null || canvas === null || nodes.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    const layout = createGraphLayout(nodes, edges);
    const connections = countGraphConnections(layout.edges, nodes.length);
    const indices = new Map(nodes.map((node, index) => [node.path, index]));
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const edgeBudget = coarse ? 1800 : 4000;
    const labelBudget = coarse ? 24 : 48;
    const maxSteps = Math.min(GRAPH_MAX_STEPS, coarse ? 80 : 120);
    const frameInterval = coarse ? 1000 / 30 : 1000 / 60;
    const edgeStride = Math.max(1, Math.ceil(layout.edges.length / edgeBudget));
    setSimplified(edgeStride > 1);
    let camera = { ...DEFAULT_GRAPH_CAMERA };
    let width = 0;
    let height = 0;
    let dpr = 1;
    let quality = 1;
    let slowFrames = 0;
    let step = 0;
    let settledFrames = 0;
    let raf: number | null = null;
    let lastFrame = -Infinity;
    let disposed = false;
    let inViewport = true;
    let hover = -1;
    let selected = -1;
    let projected: ProjectedGraphNode[] = [];
    const order = nodes.map((_, index) => index);
    let focusKey = "";
    let focusedEdges: typeof layout.edges = [];
    const pointers = new Map<number, Point>();
    let drag: { id: number; start: Point; last: Point; moved: boolean; pan: boolean; hit: number } | null = null;
    let pinch: { distance: number; center: Point; scale: number; x: number; y: number } | null = null;
    let palette = { edge: "#888", ink: "#111", accent: "#4f46e5" };

    function canDraw() {
      return !disposed && !document.hidden && inViewport && width > 0 && height > 0;
    }
    function requestDraw() {
      if (raf === null && canDraw()) raf = window.requestAnimationFrame(paint);
    }
    function pause() {
      if (raf !== null) window.cancelAnimationFrame(raf);
      raf = null;
    }
    function readPalette() {
      const style = getComputedStyle(canvas!);
      const color = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
      palette = {
        edge: color("--border", "#888"),
        ink: color("--foreground", "#111"),
        accent: color("--primary", "#4f46e5"),
      };
      requestDraw();
    }
    function resize() {
      width = wrap!.clientWidth;
      height = wrap!.clientHeight;
      dpr = Math.min(coarse ? 1.5 : 2, window.devicePixelRatio || 1) * quality;
      canvas!.width = Math.max(1, Math.round(width * dpr));
      canvas!.height = Math.max(1, Math.round(height * dpr));
      requestDraw();
    }
    function radius(index: number) {
      return clamp(2 * projected[index].perspective * camera.scale ** 0.2, 1, 3.2);
    }
    function dismissInfo(restoreFocus = false) {
      if (selected < 0) return;
      selected = -1;
      infoAnchorRef.current = null;
      setInfo(null);
      if (restoreFocus) canvas!.focus({ preventScroll: true });
      requestDraw();
    }
    function selectInfo(index: number) {
      if (index < 0) { dismissInfo(); return; }
      if (index === selected) return;
      selected = index;
      infoAnchorRef.current = projected[index];
      setInfo({ ...nodes[index], connections: connections[index] });
      requestDraw();
    }
    function paint(time: number) {
      raf = null;
      if (!canDraw()) return;
      if (time - lastFrame < frameInterval - 1) {
        requestDraw();
        return;
      }
      lastFrame = time;
      const started = performance.now();
      // 조작 중에는 배치를 고정해 손가락 아래의 노트가 움직이지 않게 한다.
      if (step < maxSteps && pointers.size === 0 && selected < 0) {
        const movement = stepGraphLayout(layout, step++);
        settledFrames = movement < 0.08 ? settledFrames + 1 : 0;
        if (settledFrames >= 8) step = maxSteps;
      }
      const project = createGraphProjection(camera, width, height);
      projected = layout.nodes.map(project);
      if (selected >= 0) {
        infoAnchorRef.current = projected[selected];
        positionInfo();
      }
      order.sort((a, b) => projected[a].depth - projected[b].depth);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, width, height);
      const active = selected >= 0 ? selected : indices.get(propsRef.current.activePath) ?? -1;
      const nextFocusKey = `${active}:${hover}`;
      if (nextFocusKey !== focusKey) {
        focusKey = nextFocusKey;
        focusedEdges = layout.edges.filter(({ from, to }) => from === active || to === active || from === hover || to === hover);
      }
      function line(edge: (typeof layout.edges)[number]) {
        const from = projected[edge.from];
        const to = projected[edge.to];
        if ((from.x < 0 && to.x < 0) || (from.x > width && to.x > width)
          || (from.y < 0 && to.y < 0) || (from.y > height && to.y > height)) return;
        ctx!.moveTo(from.x, from.y);
        ctx!.lineTo(to.x, to.y);
      }
      ctx!.globalAlpha = 0.45;
      ctx!.strokeStyle = palette.edge;
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      for (let i = 0; i < layout.edges.length; i += edgeStride) line(layout.edges[i]);
      ctx!.stroke();
      ctx!.globalAlpha = 0.65;
      ctx!.strokeStyle = palette.accent;
      ctx!.beginPath();
      for (const edge of focusedEdges) line(edge);
      ctx!.stroke();
      for (const index of order) {
        const point = projected[index];
        if (!point.visible) continue;
        const focused = index === active || index === hover;
        ctx!.globalAlpha = focused ? 1 : clamp(point.perspective - 0.25, 0.5, 1);
        ctx!.fillStyle = graphDepthColor(point.depth);
        ctx!.beginPath();
        ctx!.arc(point.x, point.y, radius(index), 0, Math.PI * 2);
        ctx!.fill();
        if (focused) {
          ctx!.strokeStyle = palette.accent;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.arc(point.x, point.y, radius(index) + 1.5, 0, Math.PI * 2);
          ctx!.stroke();
        }
      }
      ctx!.globalAlpha = 1;
      ctx!.font = "12px ui-sans-serif, system-ui, sans-serif";
      ctx!.textBaseline = "middle";
      ctx!.fillStyle = palette.ink;
      const occupied = new Set<string>();
      let labels = 0;
      function label(index: number, priority = false) {
        if (index < 0 || !projected[index].visible || (!priority && labels >= labelBudget)) return;
        const point = projected[index];
        const name = nodes[index].name;
        const title = name.length > 28 ? `${name.slice(0, 27)}…` : name;
        const labelWidth = ctx!.measureText(title).width;
        const x = clamp(point.x + radius(index) + 5, 2, Math.max(2, width - labelWidth - 2));
        const y = clamp(point.y, 9, height - 9);
        const cells: string[] = [];
        for (let col = Math.floor(x / 60); col <= Math.floor((x + labelWidth) / 60); col++) {
          for (let row = Math.floor((y - 8) / 18); row <= Math.floor((y + 8) / 18); row++) cells.push(`${col}:${row}`);
        }
        if (!priority && cells.some((cell) => occupied.has(cell))) return;
        cells.forEach((cell) => occupied.add(cell));
        ctx!.fillText(title, x, y);
        labels++;
      }
      label(active, true);
      if (hover !== active) label(hover, true);
      // 가까운 노트부터 제한된 수의 이름만 그린다.
      for (let i = order.length - 1; i >= 0 && labels < labelBudget; i--) {
        const index = order[i];
        if (index !== active && index !== hover) label(index);
      }
      if (performance.now() - started > 20) slowFrames++;
      else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames >= 4 && quality > 0.65) {
        quality = 0.65;
        resize();
      }
      // 배치가 끝나면 RAF 자체를 멈추고 입력·크기·테마 변경 때만 다시 그린다.
      if (step < maxSteps && pointers.size === 0 && selected < 0) requestDraw();
    }

    function localPoint(event: { clientX: number; clientY: number }): Point {
      const rect = canvas!.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    function hit(point: Point) {
      // 겹친 노트는 가까운 쪽을 선택하고, 터치는 더 넓은 영역을 허용한다.
      for (let i = order.length - 1; i >= 0; i--) {
        const index = order[i];
        const node = projected[index];
        if (node?.visible && Math.hypot(node.x - point.x, node.y - point.y) <= Math.max(radius(index) + 3, coarse ? 22 : 12)) return index;
      }
      return -1;
    }
    function zoom(factor: number, point: Point = { x: width / 2, y: height / 2 }) {
      dismissInfo();
      const next = clamp(camera.scale * factor, 0.35, 4);
      const ratio = next / camera.scale;
      camera.x = point.x - width / 2 - (point.x - width / 2 - camera.x) * ratio;
      camera.y = point.y - height / 2 - (point.y - height / 2 - camera.y) * ratio;
      camera.scale = next;
      requestDraw();
    }
    function reset() {
      dismissInfo();
      camera = { ...DEFAULT_GRAPH_CAMERA };
      hover = -1;
      requestDraw();
    }
    function pinchPoints() {
      const [a, b] = [...pointers.values()];
      return { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    }
    function pointerDown(event: globalThis.PointerEvent) {
      if (event.button !== 0) return;
      event.stopPropagation();
      canvas!.focus({ preventScroll: true });
      canvas!.setPointerCapture(event.pointerId);
      const point = localPoint(event);
      pointers.set(event.pointerId, point);
      if (pointers.size >= 2) {
        dismissInfo();
        drag = null;
        pinch = pointers.size === 2 ? { ...pinchPoints(), scale: camera.scale, x: camera.x, y: camera.y } : null;
      } else {
        drag = { id: event.pointerId, start: point, last: point, moved: false, pan: event.shiftKey, hit: hit(point) };
      }
    }
    function pointerMove(event: globalThis.PointerEvent) {
      const point = localPoint(event);
      if (!pointers.has(event.pointerId)) {
        const next = hit(point);
        if (next !== hover) { hover = next; requestDraw(); }
        return;
      }
      pointers.set(event.pointerId, point);
      if (pointers.size === 2 && pinch !== null) {
        const current = pinchPoints();
        const next = clamp(pinch.scale * current.distance / pinch.distance, 0.35, 4);
        const ratio = next / pinch.scale;
        camera.scale = next;
        camera.x = current.center.x - width / 2 - (pinch.center.x - width / 2 - pinch.x) * ratio;
        camera.y = current.center.y - height / 2 - (pinch.center.y - height / 2 - pinch.y) * ratio;
        hover = -1;
        requestDraw();
        return;
      }
      if (drag === null || drag.id !== event.pointerId) return;
      if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) > 5) drag.moved = true;
      if (drag.moved) {
        dismissInfo();
        const dx = point.x - drag.last.x;
        const dy = point.y - drag.last.y;
        if (drag.pan) { camera.x += dx; camera.y += dy; }
        else rotateGraphCamera(camera, dx, dy);
        hover = -1;
        requestDraw();
      }
      drag.last = point;
    }
    function pointerEnd(event: globalThis.PointerEvent) {
      // pointerup 뒤의 lostpointercapture는 이미 끝낸 포인터를 다시 정리하지 않는다.
      if (!pointers.has(event.pointerId)) return;
      const point = localPoint(event);
      const clicked = event.type === "pointerup" && drag?.id === event.pointerId && !drag.moved
        && Math.hypot(point.x - drag.start.x, point.y - drag.start.y) <= 5 ? drag.hit : null;
      pointers.delete(event.pointerId);
      drag = null;
      pinch = null;
      if (pointers.size === 2) {
        pinch = { ...pinchPoints(), scale: camera.scale, x: camera.x, y: camera.y };
      } else if (pointers.size === 1) {
        const [id, remaining] = [...pointers.entries()][0];
        // 남은 손가락으로 회전을 이어가되 제스처 끝을 노트 탭으로 처리하지 않는다.
        drag = { id, start: remaining, last: remaining, moved: true, pan: false, hit: -1 };
      }
      if (canvas!.hasPointerCapture(event.pointerId)) canvas!.releasePointerCapture(event.pointerId);
      requestDraw();
      if (clicked !== null) selectInfo(clicked);
    }
    function pointerLeave() {
      if (hover !== -1) { hover = -1; requestDraw(); }
    }
    function wheel(event: globalThis.WheelEvent) {
      event.preventDefault();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
      zoom(Math.exp(clamp(-pixels * 0.002, -0.4, 0.4)), localPoint(event));
    }
    function keyDown(event: globalThis.KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      switch (event.key) {
        case "ArrowLeft": rotateGraphCamera(camera, -15, 0); break;
        case "ArrowRight": rotateGraphCamera(camera, 15, 0); break;
        case "ArrowUp": rotateGraphCamera(camera, 0, -15); break;
        case "ArrowDown": rotateGraphCamera(camera, 0, 15); break;
        case "+": case "=": zoom(1.2); break;
        case "-": zoom(1 / 1.2); break;
        case "Home": reset(); break;
        default: return;
      }
      event.preventDefault();
      event.stopPropagation();
      dismissInfo();
      requestDraw();
    }
    function outsidePointerDown(event: globalThis.PointerEvent) {
      if (selected >= 0 && event.target instanceof Node && event.target !== canvas && !infoRef.current?.contains(event.target)) dismissInfo();
    }
    function escapeInfo(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || selected < 0) return;
      event.preventDefault();
      event.stopPropagation();
      dismissInfo(true);
    }
    function visibilityChanged() {
      if (document.hidden) {
        drag = null;
        pinch = null;
        pointers.clear();
        pause();
      } else requestDraw();
    }

    controlsRef.current = {
      redraw: requestDraw, zoom, reset,
      dismissInfo: () => dismissInfo(true),
      openFile: () => {
        if (selected < 0) return;
        const path = nodes[selected].path;
        dismissInfo(true);
        propsRef.current.onOpen(path);
      },
    };
    resize();
    readPalette();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(wrap);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      if (inViewport) requestDraw(); else pause();
    });
    intersectionObserver.observe(canvas);
    const themeObserver = new MutationObserver(readPalette);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    colorScheme.addEventListener("change", readPalette);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", visibilityChanged);
    document.addEventListener("pointerdown", outsidePointerDown);
    document.addEventListener("keydown", escapeInfo);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerEnd);
    canvas.addEventListener("pointercancel", pointerEnd);
    canvas.addEventListener("lostpointercapture", pointerEnd);
    canvas.addEventListener("pointerleave", pointerLeave);
    canvas.addEventListener("keydown", keyDown);
    return () => {
      disposed = true;
      pause();
      controlsRef.current = null;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      themeObserver.disconnect();
      colorScheme.removeEventListener("change", readPalette);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibilityChanged);
      document.removeEventListener("pointerdown", outsidePointerDown);
      document.removeEventListener("keydown", escapeInfo);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerEnd);
      canvas.removeEventListener("pointercancel", pointerEnd);
      canvas.removeEventListener("lostpointercapture", pointerEnd);
      canvas.removeEventListener("pointerleave", pointerLeave);
      canvas.removeEventListener("keydown", keyDown);
    };
  }, [nodes, edges]);

  useEffect(() => { controlsRef.current?.redraw(); }, [activePath]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={wrapRef} className="relative min-h-0 min-w-0 flex-1 overscroll-none">
        {nodes.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">이 볼트에 노트가 없습니다.</p>
        ) : (
          <canvas
            ref={canvasRef}
            data-allow-pan
            aria-label="3D 노트 그래프"
            aria-describedby={helpId}
            tabIndex={0}
            className="absolute inset-0 block size-full cursor-grab touch-none outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring active:cursor-grabbing"
          />
        )}
        {info !== null && (
          <div
            ref={infoRef}
            role="dialog"
            aria-label="노트 정보"
            tabIndex={-1}
            style={{ width: "min(18rem, calc(100% - 16px))" }}
            className="absolute z-10 overflow-auto rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md outline-none"
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              event.stopPropagation();
              controlsRef.current?.dismissInfo();
            }}
          >
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 break-words text-sm font-medium">{info.name}</p>
              <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="노트 정보 닫기" onClick={() => controlsRef.current?.dismissInfo()}>×</Button>
            </div>
            <p className="mt-1 break-all text-xs text-muted-foreground">{info.path}</p>
            <p className="mt-2 text-xs text-muted-foreground">연결된 노트 {info.connections}개</p>
            <Button type="button" size="sm" className="mt-3 w-full" onClick={() => controlsRef.current?.openFile()}>파일 열기</Button>
          </div>
        )}
      </div>
      {nodes.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-3 py-2">
          <div className="min-w-0 flex-1 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p>3D · {nodes.length}개 노트{simplified ? " · 일부 연결선 표시" : ""}</p>
              <span className="inline-flex items-center gap-1" aria-label="거리 색상: 청색은 멀리, 주황색은 가까이">
                멀리
                <span className="inline-block h-1.5 w-12 rounded-full" style={{ background: `linear-gradient(to right, ${GRAPH_DEPTH_COLORS.join(", ")})` }} />
                가까이
              </span>
            </div>
            <p id={helpId} className="mt-1">드래그로 회전 · 두 손가락/휠로 확대 · 노트 탭으로 정보<span className="hidden sm:inline"> · Shift+드래그로 이동 · 방향키로 회전 · +/−로 확대·축소 · Home으로 초기화</span></p>
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" aria-label="축소" onClick={() => controlsRef.current?.zoom(1 / 1.2)}>−</Button>
            <Button type="button" variant="ghost" size="icon" aria-label="확대" onClick={() => controlsRef.current?.zoom(1.2)}>+</Button>
            <Button type="button" variant="ghost" size="sm" aria-label="시점 초기화" onClick={() => controlsRef.current?.reset()}>초기화</Button>
          </div>
        </div>
      )}
    </div>
  );
}
