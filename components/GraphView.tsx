import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  COARSE_POINTER_ICON_BUTTON_GROW_CLASS,
  COARSE_POINTER_META_TEXT_CLASS,
  COARSE_POINTER_TEXT_BASE_CLASS,
  COARSE_POINTER_TEXT_SM_CLASS,
} from "@/components/ui/coarse-pointer-sizing";
import { Icon } from "@/components/ui/icon";
import { useMediaQuery } from "@/components/ui/hooks/use-media-query";
import type { GraphEdge, GraphNode } from "@/lib/note-graph";
import { cn } from "@/lib/utils";
import {
  aimGraphCameraAt,
  createGraphLayout,
  createGraphProjection,
  DEFAULT_GRAPH_CAMERA,
  GRAPH_MAX_STEPS,
  quaternionFromTo,
  rotateGraphCamera,
  slerpQuaternion,
  stepGraphLayout,
  type ProjectedGraphNode,
  type Quaternion,
} from "@/lib/graph-layout";
import {
  countGraphConnections,
  graphDepthAppearance,
  graphSelectionReveal,
  GRAPH_DEPTH_APPEARANCES,
  GRAPH_DEPTH_COLORS,
  GRAPH_EDGE_REVEAL_MS,
} from "@/lib/graph-presentation";
import {
  closestGraphCallouts,
  graphCalloutLeader,
  graphCalloutPrefix,
  graphCalloutReveal,
  placeGraphCallout,
  type CalloutRect,
} from "@/lib/graph-callouts";
import { agentMarkGlow, graphLabelHidden, graphNodeEmphasis, highlightedNodeIndices } from "@/lib/graph-highlight";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const SELECTED_NODE_COLOR = "#8b5cf6";
const INFO_TRANSITION_MS = 180;
const FOCUS_MS = 560;
const MAX_GRAPH_ZOOM = 8;
const MIN_GRAPH_ZOOM = 0.35;
const ZOOM_MS = 220;
const SPIN_DECAY_MS = 140;
const GRAPH_HELP =
  "드래그로 회전 · 휠로 확대 · 노트 탭으로 정보 · Shift+드래그로 이동 · 방향키로 회전 · +/−로 확대 · Home으로 초기화";
type Point = { x: number; y: number };
type Controls = {
  redraw: () => void;
  zoom: (factor: number) => void;
  reset: () => void;
  dismissInfo: () => void;
  openFile: () => void;
  focusPath: (path: string) => void;
};

export function GraphHelp() {
  const coarse = useMediaQuery("(pointer: coarse)");
  const [open, setOpen] = useState(false);
  return (
    <div
      className="absolute right-2 bottom-1.5 z-20"
      onMouseEnter={() => {
        if (!coarse) setOpen(true);
      }}
      onMouseLeave={() => {
        if (!coarse) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label="사용법"
        aria-expanded={open}
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-state-hover hover:text-foreground",
          COARSE_POINTER_ICON_BUTTON_GROW_CLASS,
        )}
        onClick={() => {
          if (coarse) setOpen((value) => !value);
        }}
      >
        <Icon name="Info" className="size-3.5 max-md:pointer-coarse:size-4" />
      </button>
      {open ? (
        <p
          role="tooltip"
          className={cn(
            "absolute right-0 bottom-full z-20 mb-1 w-56 rounded-md border border-border bg-popover px-2 py-1.5 leading-snug text-popover-foreground shadow-md",
            COARSE_POINTER_META_TEXT_CLASS,
          )}
        >
          {GRAPH_HELP}
        </p>
      ) : null}
    </div>
  );
}

export function GraphView({
  nodes,
  edges,
  activePath,
  onOpen,
  onFullscreen,
  variant = "full",
  highlightPaths = [],
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  activePath: string;
  onOpen: (path: string) => void;
  onFullscreen?: () => void;
  variant?: "full" | "local";
  highlightPaths?: readonly string[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const infoLeaderRef = useRef<SVGPolylineElement>(null);
  const infoRectRef = useRef<CalloutRect | null>(null);
  const infoAnchorRef = useRef<(Point & { radius: number }) | null>(null);
  const infoExitRef = useRef<((afterClose: () => void) => void) | null>(null);
  const infoExitingRef = useRef(false);
  const infoFocusRef = useRef(false);
  const controlsRef = useRef<Controls | null>(null);
  const propsRef = useRef({
    activePath,
    onOpen,
    local: variant === "local",
    mini: onFullscreen !== undefined,
    highlightPaths,
  });
  propsRef.current = {
    activePath,
    onOpen,
    local: variant === "local",
    mini: onFullscreen !== undefined,
    highlightPaths,
  };
  const helpId = useId();
  const [info, setInfo] = useState<(GraphNode & { connections: number; color: string }) | null>(null);

  function positionInfo() {
    if (infoExitingRef.current) return;
    const panel = infoRef.current;
    const wrap = wrapRef.current;
    const anchor = infoAnchorRef.current;
    if (panel === null || wrap === null || anchor === null) return;
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    const margin = 8;
    panel.style.maxHeight = `${Math.max(0, height - margin * 2)}px`;
    const panelWidth = panel.offsetWidth;
    let panelHeight = panel.offsetHeight;
    let rect = placeGraphCallout(anchor, { width: panelWidth, height: panelHeight }, { width, height }, [], 40);
    if (rect === null) {
      // 낮은 화면에서는 정보를 스크롤하게 해 점과 연결선이 가려지지 않게 한다.
      const availableHeight = Math.max(anchor.y - margin, height - margin - anchor.y) - 20;
      panel.style.maxHeight = `${Math.max(0, Math.min(height - margin * 2, availableHeight))}px`;
      panelHeight = panel.offsetHeight;
      rect = placeGraphCallout(anchor, { width: panelWidth, height: panelHeight }, { width, height }, [], 20);
    }
    rect ??= {
      x: clamp(anchor.x - panelWidth / 2, margin, Math.max(margin, width - panelWidth - margin)),
      y: clamp(anchor.y + 40, margin, Math.max(margin, height - panelHeight - margin)),
      width: panelWidth,
      height: panelHeight,
    };
    panel.style.left = `${rect.x}px`;
    panel.style.top = `${rect.y}px`;
    infoRectRef.current = rect;
    const leader = graphCalloutLeader(anchor, rect, anchor.radius);
    infoLeaderRef.current?.setAttribute("points", leader?.map(({ x, y }) => `${x},${y}`).join(" ") ?? "");
    const end = leader?.[leader.length - 1];
    panel.style.transformOrigin = end ? `${end.x - rect.x}px ${end.y - rect.y}px` : "center";
  }

  useLayoutEffect(() => {
    if (info === null || infoRef.current === null || wrapRef.current === null) return;
    const panel = infoRef.current;
    const line = infoLeaderRef.current;
    let disposed = false;
    let exiting = false;
    let exited = false;
    let afterClose: (() => void) | undefined;
    let lineAnimation: Animation | undefined;
    let panelAnimation: Animation | undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const update = () => { positionInfo(); controlsRef.current?.redraw(); };
    infoExitingRef.current = false;
    update();
    panel.style.opacity = "0";
    panel.style.transform = "none";
    panel.style.pointerEvents = "none";
    panel.inert = true;
    if (line) {
      line.style.opacity = "0";
      line.style.strokeDashoffset = "0";
    }
    function showPanel() {
      if (disposed || exiting) return;
      const finish = () => {
        if (disposed || exiting) return;
        panel.style.opacity = "1";
        if (panel.hasAttribute("data-passive")) {
          panel.style.pointerEvents = "none";
          panel.inert = true;
        } else {
          panel.style.pointerEvents = "auto";
          panel.inert = false;
          if (infoFocusRef.current) panel.focus({ preventScroll: true });
        }
        if (line) line.style.opacity = "1";
        panelAnimation?.cancel();
        lineAnimation?.cancel();
      };
      if (reducedMotion) { finish(); return; }
      const options: KeyframeAnimationOptions = {
        duration: INFO_TRANSITION_MS, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards",
      };
      if (line) lineAnimation = line.animate([{ opacity: 0 }, { opacity: 1 }], options);
      panelAnimation = panel.animate([{ opacity: 0 }, { opacity: 1 }], options);
      panelAnimation.onfinish = finish;
    }
    showPanel();
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    observer.observe(wrapRef.current);
    function exit(complete: () => void) {
      if (disposed) return;
      if (exited) { complete(); return; }
      afterClose = complete;
      if (exiting) return;
      exiting = true;
      infoExitingRef.current = true;
      observer.disconnect();
      // 진입 도중 닫아도 현재 모습에서 이어져 깜빡이거나 커지지 않게 한다.
      const current = getComputedStyle(panel);
      const opacity = current.opacity;
      const transform = current.transform;
      const lineStyle = line ? getComputedStyle(line) : null;
      const lineOpacity = lineStyle?.opacity ?? "0";
      const dashoffset = lineStyle?.strokeDashoffset ?? "0";
      lineAnimation?.cancel();
      panelAnimation?.cancel();
      panel.style.opacity = opacity;
      panel.style.transform = transform;
      panel.style.pointerEvents = "none";
      if (panel.contains(document.activeElement)) canvasRef.current?.focus({ preventScroll: true });
      panel.inert = true;
      if (line) {
        line.style.opacity = lineOpacity;
        line.style.strokeDashoffset = dashoffset;
      }
      const finish = () => {
        if (disposed) return;
        panel.style.opacity = "0";
        panel.style.transform = "none";
        if (line) line.style.opacity = "0";
        lineAnimation?.cancel();
        panelAnimation?.cancel();
        exited = true;
        const complete = afterClose;
        afterClose = undefined;
        complete?.();
      };
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { finish(); return; }
      const options: KeyframeAnimationOptions = {
        duration: INFO_TRANSITION_MS, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards",
      };
      if (line) lineAnimation = line.animate([{ opacity: lineOpacity }, { opacity: 0 }], options);
      panelAnimation = panel.animate([
        { opacity }, { opacity: 0 },
      ], options);
      panelAnimation.onfinish = finish;
    }
    infoExitRef.current = exit;
    return () => {
      disposed = true;
      afterClose = undefined;
      lineAnimation?.cancel();
      panelAnimation?.cancel();
      observer.disconnect();
      if (infoExitRef.current === exit) {
        infoExitRef.current = null;
        infoExitingRef.current = false;
      }
    };
  }, [info]);

  useEffect(() => {
    setInfo(null);
    infoAnchorRef.current = null;
    infoRectRef.current = null;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (wrap === null || canvas === null || nodes.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    const layout = createGraphLayout(nodes, edges);
    const connections = countGraphConnections(layout.edges, nodes.length);
    const indices = new Map(nodes.map((node, index) => [node.path, index]));
    // 작은 점 이미지를 한 번 만들어 재사용해 매 프레임 흐림 필터를 계산하지 않는다.
    const depthSprites = new Map<string, { image: HTMLCanvasElement; size: number }>();
    for (const { color, blur } of GRAPH_DEPTH_APPEARANCES) {
      if (blur === 0) continue;
      const outerRadius = 2 + blur * 2;
      const image = document.createElement("canvas");
      image.width = image.height = Math.ceil((outerRadius + 1) * 4);
      const sprite = image.getContext("2d");
      if (sprite === null) continue;
      const size = image.width / 2;
      sprite.setTransform(2, 0, 0, 2, image.width / 2, image.height / 2);
      const gradient = sprite.createRadialGradient(0, 0, 2 - blur, 0, 0, outerRadius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1 / 3, `${color}80`);
      gradient.addColorStop(1, `${color}00`);
      sprite.fillStyle = gradient;
      sprite.fillRect(-size / 2, -size / 2, size, size);
      depthSprites.set(color, { image, size });
    }
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const edgeBudget = coarse ? 1800 : 4000;
    const maxSteps = Math.min(GRAPH_MAX_STEPS, coarse ? 80 : 120);
    const frameInterval = coarse ? 1000 / 30 : 1000 / 60;
    const edgeStride = Math.max(1, Math.ceil(layout.edges.length / edgeBudget));
    let camera = { ...DEFAULT_GRAPH_CAMERA };
    let focusIndex = -1;
    let focusFrom: Quaternion | null = null;
    let focusStarted = -1;
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
    let hoverStarted = 0;
    let hoverEdges: typeof layout.edges = [];
    let selected = -1;
    let selectedStarted = 0;
    let pinLayout = false;
    let infoDelay: ReturnType<typeof setTimeout> | null = null;
    let infoIndex = -1;
    let projected: ProjectedGraphNode[] = [];
    const labelText = new Map<number, { title: string; width: number }>();
    const labelStarts = new Map<number, number>();
    const order = nodes.map((_, index) => index);
    let focusedNode = -2;
    let focusedEdges: typeof layout.edges = [];
    const pointers = new Map<number, Point>();
    let drag: { id: number; start: Point; last: Point; moved: boolean; pan: boolean; hit: number } | null = null;
    let spin: { vx: number; vy: number; pan: boolean } | null = null;
    let lastPointerTime = 0;
    let zoomAnim: {
      from: number;
      to: number;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      started: number;
    } | null = null;
    let pinch: { distance: number; center: Point; scale: number; x: number; y: number } | null = null;
    let palette = { edge: "#888", ink: "#111", surface: "#fff" };

    function interruptFocus() {
      focusFrom = null;
    }
    function focusPath(path: string) {
      const index = indices.get(path) ?? -1;
      if (index < 0) {
        focusIndex = -1;
        focusFrom = null;
        if (selected >= 0 || infoIndex >= 0) selectInfo(-1);
        requestDraw();
        return;
      }
      focusIndex = index;
      focusFrom = { ...camera.orientation };
      focusStarted = performance.now();
      if (motionPreference.matches) {
        aimGraphCameraAt(camera, layout.nodes[index]);
        focusFrom = null;
      }
      if (selected !== index || infoIndex !== index) selectInfo(index, false);
      requestDraw();
    }
    function applyFocus(time: number) {
      if (focusIndex < 0 || focusFrom === null) return false;
      const node = layout.nodes[focusIndex];
      const length = Math.hypot(node.x, node.y, node.z);
      if (length < 1e-6) {
        focusFrom = null;
        return false;
      }
      const t = clamp((time - focusStarted) / FOCUS_MS, 0, 1);
      const eased = 1 - (1 - t) ** 3;
      camera.orientation = slerpQuaternion(
        focusFrom,
        quaternionFromTo(
          { x: node.x / length, y: node.y / length, z: node.z / length },
          { x: 0, y: 0, z: 1 },
        ),
        eased,
      );
      if (t >= 1) {
        focusFrom = null;
        return false;
      }
      return true;
    }
    function canDraw() {
      return !disposed && !document.hidden && inViewport && width > 0 && height > 0;
    }
    function requestDraw() {
      if (raf === null && canDraw()) raf = window.requestAnimationFrame(paint);
    }
    function setHover(next: number) {
      if (next === hover) return;
      hover = next;
      hoverStarted = performance.now();
      hoverEdges = next < 0 ? [] : layout.edges.filter(({ from, to }) => from === next || to === next);
      requestDraw();
    }
    function pause() {
      if (raf !== null) window.cancelAnimationFrame(raf);
      raf = null;
      labelStarts.clear();
      hover = -1;
      hoverEdges = [];
    }
    function readPalette() {
      const style = getComputedStyle(canvas!);
      const color = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
      palette = {
        edge: color("--border", "#888"),
        ink: color("--foreground", "#111"),
        surface: color("--popover", color("--background", "#fff")),
      };
      requestDraw();
    }
    function resize() {
      setHover(-1);
      width = wrap!.clientWidth;
      height = wrap!.clientHeight;
      labelText.clear();
      dpr = Math.min(coarse ? 1.5 : 2, window.devicePixelRatio || 1) * quality;
      canvas!.width = Math.max(1, Math.round(width * dpr));
      canvas!.height = Math.max(1, Math.round(height * dpr));
      requestDraw();
    }
    function radius(index: number) {
      return clamp(2 * projected[index].perspective * camera.scale ** 0.2, 1, 3.2);
    }
    function clearInfoDelay() {
      if (infoDelay === null) return;
      clearTimeout(infoDelay);
      infoDelay = null;
    }
    function dismissInfo(restoreFocus = false) {
      clearInfoDelay();
      if (infoIndex < 0 && infoExitRef.current === null) return;
      infoIndex = -1;
      if (restoreFocus) canvas!.focus({ preventScroll: true });
      const close = () => {
        if (disposed) return;
        infoAnchorRef.current = null;
        infoRectRef.current = null;
        setInfo(null);
        requestDraw();
      };
      if (infoExitRef.current) infoExitRef.current(close);
      else close();
      requestDraw();
    }
    function selectInfo(index: number, stealFocus = true) {
      // 빈 공간을 탭할 때만 선택을 해제해 원래 파일 강조로 돌아간다.
      if (index < 0) {
        selected = -1;
        pinLayout = false;
        dismissInfo();
        requestDraw();
        return;
      }
      pinLayout = stealFocus;
      if (index === infoIndex) return;
      clearInfoDelay();
      selected = index;
      infoIndex = index;
      selectedStarted = performance.now();
      focusedNode = index;
      focusedEdges = layout.edges.filter(({ from, to }) => from === index || to === index);
      infoFocusRef.current = stealFocus;
      if (infoExitRef.current) {
        infoExitRef.current(() => {
          if (disposed) return;
          infoAnchorRef.current = null;
          infoRectRef.current = null;
          setInfo(null);
        });
      }
      const wait = motionPreference.matches || focusedEdges.length === 0 ? 0 : GRAPH_EDGE_REVEAL_MS;
      infoDelay = setTimeout(() => {
        infoDelay = null;
        if (disposed || selected !== index || infoIndex !== index) return;
        const point = projected[index];
        if (point) infoAnchorRef.current = { ...point, radius: radius(index) };
        setInfo({ ...nodes[index], connections: connections[index], color: SELECTED_NODE_COLOR });
        requestDraw();
      }, wait);
      requestDraw();
    }
    function paint(time: number) {
      raf = null;
      if (!canDraw()) return;
      if (time - lastFrame < frameInterval - 1) {
        requestDraw();
        return;
      }
      const elapsed = lastFrame < 0 ? 16 : time - lastFrame;
      lastFrame = time;
      const focusing = applyFocus(time);
      const zooming = applyZoomAnim(time);
      const coasting = applySpin(elapsed);
      const gliding = pointers.size > 0 || coasting;
      const started = performance.now();
      // 조작 중에는 배치를 고정해 손가락 아래의 노트가 움직이지 않게 한다.
      if (step < maxSteps && pointers.size === 0 && (!pinLayout || propsRef.current.local)) {
        const movement = stepGraphLayout(layout, step++);
        settledFrames = movement < 0.08 ? settledFrames + 1 : 0;
        if (settledFrames >= 8) step = maxSteps;
      }
      const project = createGraphProjection(camera, width, height);
      projected = layout.nodes.map(project);
      if (infoIndex >= 0 && !infoExitingRef.current) {
        infoAnchorRef.current = { ...projected[infoIndex], radius: radius(infoIndex) };
        positionInfo();
      }
      order.sort((a, b) => projected[a].depth - projected[b].depth);
      const closest = closestGraphCallouts(projected, order);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, width, height);
      const active = selected >= 0 ? selected : indices.get(propsRef.current.activePath) ?? -1;
      const highlights = highlightedNodeIndices(nodes, propsRef.current.highlightPaths);
      if (selected !== focusedNode) {
        focusedNode = selected;
        focusedEdges = selected < 0 ? [] : layout.edges.filter(({ from, to }) => from === selected || to === selected);
      }
      function line(edge: (typeof layout.edges)[number], origin = edge.from, progress = 1) {
        const from = projected[origin];
        const to = projected[origin === edge.from ? edge.to : edge.from];
        if ((from.x < 0 && to.x < 0) || (from.x > width && to.x > width)
          || (from.y < 0 && to.y < 0) || (from.y > height && to.y > height)) return;
        ctx!.moveTo(from.x, from.y);
        ctx!.lineTo(from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress);
      }
      ctx!.globalAlpha = selected >= 0 ? 0.12 : 0.45;
      ctx!.strokeStyle = palette.edge;
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      for (let i = 0; i < layout.edges.length; i += edgeStride) line(layout.edges[i]);
      ctx!.stroke();
      const selection = graphSelectionReveal(time - selectedStarted, motionPreference.matches);
      const selectedAnimating = selected >= 0 && focusedEdges.length > 0 && !selection.showTooltip;
      if (selected >= 0 && focusedEdges.length > 0) {
        ctx!.globalAlpha = 0.65;
        ctx!.strokeStyle = GRAPH_DEPTH_COLORS[8];
        ctx!.beginPath();
        for (const edge of focusedEdges) line(edge, selected, selection.edgeProgress);
        ctx!.stroke();
      }
      const hoverProgress = hover < 0 || motionPreference.matches ? 1 : clamp((time - hoverStarted) / GRAPH_EDGE_REVEAL_MS, 0, 1);
      const hoverAnimating = hoverEdges.length > 0 && hoverProgress < 1;
      if (hoverEdges.length > 0 && hover !== selected) {
        // 기존 선택 간선은 유지하고 hover한 점에서 이웃 쪽으로 강조를 덧그린다.
        const progress = 1 - (1 - hoverProgress) ** 3;
        ctx!.globalAlpha = 0.65;
        ctx!.beginPath();
        for (const edge of hoverEdges) line(edge, hover, progress);
        ctx!.stroke();
      }
      for (const index of order) {
        const point = projected[index];
        if (!point.visible) continue;
        const appearance = graphDepthAppearance(point.depth);
        const emphasis = graphNodeEmphasis({
          index,
          selected,
          marked: highlights.has(index),
          focused: index === active || index === hover || closest.includes(index),
          appearance,
          selectedColor: SELECTED_NODE_COLOR,
        });
        if (emphasis.glow) {
          const nodeRadius = radius(index);
          const glow = agentMarkGlow(nodeRadius);
          const gradient = ctx!.createRadialGradient(
            point.x,
            point.y,
            glow.innerRadius,
            point.x,
            point.y,
            glow.outerRadius,
          );
          for (const [offset, color] of glow.stops) gradient.addColorStop(offset, color);
          ctx!.globalAlpha = 1;
          ctx!.fillStyle = gradient;
          ctx!.beginPath();
          ctx!.arc(point.x, point.y, glow.outerRadius, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.fillStyle = emphasis.color;
          ctx!.beginPath();
          ctx!.arc(point.x, point.y, Math.max(nodeRadius, 2.4), 0, Math.PI * 2);
          ctx!.fill();
          continue;
        }
        const color = emphasis.color;
        const sprite = emphasis.ring ? undefined : depthSprites.get(appearance.color);
        ctx!.globalAlpha = emphasis.alpha;
        if (sprite) {
          const size = sprite.size * radius(index) / 2;
          ctx!.drawImage(sprite.image, point.x - size / 2, point.y - size / 2, size, size);
        } else {
          ctx!.fillStyle = color;
          ctx!.beginPath();
          ctx!.arc(point.x, point.y, radius(index), 0, Math.PI * 2);
          ctx!.fill();
        }
        if (emphasis.ring) {
          ctx!.strokeStyle = color;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.arc(point.x, point.y, radius(index) + 1.5, 0, Math.PI * 2);
          ctx!.stroke();
        }
      }
      ctx!.globalAlpha = 1;
      ctx!.font = "12px ui-sans-serif, system-ui, sans-serif";
      ctx!.textBaseline = "middle";
      const occupied: CalloutRect[] = infoRectRef.current ? [infoRectRef.current] : [];
      const shownLabels = new Set<number>();
      let labelsAnimating = false;
      function label(index: number) {
        if (graphLabelHidden(index, infoIndex, selected)) return;
        const point = projected[index];
        let text = labelText.get(index);
        if (!text) {
          const name = nodes[index].name;
          const maxWidth = Math.min(coarse ? 140 : 180, width - 28);
          if (maxWidth <= 0) return;
          let length = Math.min(name.length, 28);
          let title = name.slice(0, length) + (length < name.length ? "…" : "");
          let textWidth = ctx!.measureText(title).width;
          while (textWidth > maxWidth && length > 0) {
            title = `${name.slice(0, --length)}…`;
            textWidth = ctx!.measureText(title).width;
          }
          if (textWidth > maxWidth) return;
          text = { title, width: Math.ceil(textWidth) + 12 };
          labelText.set(index, text);
        }
        const rect = placeGraphCallout(point, { width: text.width, height: 22 }, { width, height }, occupied, coarse ? 22 : 28);
        if (rect === null) return;
        const leader = graphCalloutLeader(point, rect, radius(index));
        if (leader === null) return;
        occupied.push(rect);
        shownLabels.add(index);
        if (!labelStarts.has(index)) labelStarts.set(index, time);
        const reveal = graphCalloutReveal(time - labelStarts.get(index)!, motionPreference.matches);
        if (!reveal.done) labelsAnimating = true;
        const appearance = graphDepthAppearance(point.depth);
        const opacity = index === active || index === hover ? 1 : appearance.opacity;
        const visibleLeader = graphCalloutPrefix(leader, reveal.lineProgress);
        ctx!.strokeStyle = appearance.color;
        ctx!.lineWidth = 1;
        if (visibleLeader.length > 1) {
          ctx!.globalAlpha = opacity * 0.7;
          ctx!.beginPath();
          ctx!.moveTo(visibleLeader[0].x, visibleLeader[0].y);
          for (let i = 1; i < visibleLeader.length; i++) ctx!.lineTo(visibleLeader[i].x, visibleLeader[i].y);
          ctx!.stroke();
        }
        if (reveal.labelProgress === 0) return;
        const end = leader[leader.length - 1];
        const scale = 0.94 + 0.06 * reveal.labelProgress;
        ctx!.save();
        ctx!.translate(end.x, end.y);
        ctx!.scale(scale, scale);
        ctx!.translate(-end.x, -end.y);
        ctx!.globalAlpha = opacity * reveal.labelProgress;
        ctx!.fillStyle = palette.surface;
        ctx!.beginPath();
        ctx!.roundRect(rect.x, rect.y, rect.width, rect.height, 4);
        ctx!.fill();
        ctx!.globalAlpha = opacity * reveal.labelProgress * 0.45;
        ctx!.stroke();
        ctx!.globalAlpha = opacity * reveal.labelProgress;
        ctx!.fillStyle = palette.ink;
        ctx!.fillText(text.title, rect.x + 6, rect.y + rect.height / 2);
        ctx!.restore();
      }
      // 드래그·관성 중에는 이름표를 생략해 프레임이 밀리지 않게 한다.
      if (!gliding) {
        for (const index of closest) label(index);
        for (const index of labelStarts.keys()) {
          if (!shownLabels.has(index)) labelStarts.delete(index);
        }
      }
      if (performance.now() - started > 20) slowFrames++;
      else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames >= 4 && quality > 0.65) {
        quality = 0.65;
        resize();
      }
      // 배치와 짧은 등장 효과가 끝나면 RAF 자체를 멈춘다.
      if (focusing || zooming || coasting || selectedAnimating || hoverAnimating || labelsAnimating || (step < maxSteps && pointers.size === 0 && (!pinLayout || propsRef.current.local))) requestDraw();
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
    function placeZoom(scale: number, point: Point) {
      const next = clamp(scale, MIN_GRAPH_ZOOM, MAX_GRAPH_ZOOM);
      const ratio = camera.scale === 0 ? 1 : next / camera.scale;
      camera.x = point.x - width / 2 - (point.x - width / 2 - camera.x) * ratio;
      camera.y = point.y - height / 2 - (point.y - height / 2 - camera.y) * ratio;
      camera.scale = next;
    }
    function zoom(factor: number, point: Point = { x: width / 2, y: height / 2 }, animate = false) {
      interruptFocus();
      infoFocusRef.current = false;
      spin = null;
      setHover(-1);
      const base = zoomAnim?.to ?? camera.scale;
      const target = clamp(base * factor, MIN_GRAPH_ZOOM, MAX_GRAPH_ZOOM);
      if (!animate || motionPreference.matches || target === camera.scale) {
        zoomAnim = null;
        placeZoom(target, point);
        requestDraw();
        return;
      }
      const ratio = camera.scale === 0 ? 1 : target / camera.scale;
      zoomAnim = {
        from: camera.scale,
        to: target,
        fromX: camera.x,
        fromY: camera.y,
        toX: point.x - width / 2 - (point.x - width / 2 - camera.x) * ratio,
        toY: point.y - height / 2 - (point.y - height / 2 - camera.y) * ratio,
        started: performance.now(),
      };
      requestDraw();
    }
    function applyZoomAnim(time: number) {
      if (zoomAnim === null) return false;
      const t = clamp((time - zoomAnim.started) / ZOOM_MS, 0, 1);
      const eased = 1 - (1 - t) ** 3;
      camera.scale = zoomAnim.from + (zoomAnim.to - zoomAnim.from) * eased;
      camera.x = zoomAnim.fromX + (zoomAnim.toX - zoomAnim.fromX) * eased;
      camera.y = zoomAnim.fromY + (zoomAnim.toY - zoomAnim.fromY) * eased;
      if (t >= 1) {
        zoomAnim = null;
        return false;
      }
      return true;
    }
    function applySpin(elapsed: number) {
      if (spin === null || pointers.size > 0) return false;
      const dt = Math.min(32, Math.max(0, elapsed));
      if (spin.pan) {
        camera.x += spin.vx * dt;
        camera.y += spin.vy * dt;
      } else {
        rotateGraphCamera(camera, spin.vx * dt, spin.vy * dt);
      }
      const decay = Math.exp(-dt / SPIN_DECAY_MS);
      spin.vx *= decay;
      spin.vy *= decay;
      if (Math.hypot(spin.vx, spin.vy) < 0.02) {
        spin = null;
        return false;
      }
      return true;
    }
    function reset() {
      interruptFocus();
      infoFocusRef.current = false;
      zoomAnim = null;
      spin = null;
      camera = { ...DEFAULT_GRAPH_CAMERA };
      setHover(-1);
      requestDraw();
    }
    function pinchPoints() {
      const [a, b] = [...pointers.values()];
      return { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    }
    function pointerDown(event: globalThis.PointerEvent) {
      if (event.button !== 0) return;
      event.stopPropagation();
      // 진입 효과 도중 다시 조작하면 툴팁이 캔버스 초점을 가져가지 않는다.
      infoFocusRef.current = false;
      canvas!.focus({ preventScroll: true });
      canvas!.setPointerCapture(event.pointerId);
      spin = null;
      zoomAnim = null;
      lastPointerTime = performance.now();
      const point = localPoint(event);
      pointers.set(event.pointerId, point);
      if (pointers.size >= 2) {
        setHover(-1);
        drag = null;
        pinch = pointers.size === 2 ? { ...pinchPoints(), scale: camera.scale, x: camera.x, y: camera.y } : null;
      } else {
        drag = { id: event.pointerId, start: point, last: point, moved: false, pan: event.shiftKey, hit: hit(point) };
      }
    }
    function pointerMove(event: globalThis.PointerEvent) {
      const point = localPoint(event);
      if (!pointers.has(event.pointerId)) {
        setHover(hit(point));
        return;
      }
      pointers.set(event.pointerId, point);
      if (pointers.size === 2 && pinch !== null) {
        const current = pinchPoints();
        const next = clamp(pinch.scale * current.distance / pinch.distance, 0.35, MAX_GRAPH_ZOOM);
        const ratio = next / pinch.scale;
        interruptFocus();
        camera.scale = next;
        camera.x = current.center.x - width / 2 - (pinch.center.x - width / 2 - pinch.x) * ratio;
        camera.y = current.center.y - height / 2 - (pinch.center.y - height / 2 - pinch.y) * ratio;
        setHover(-1);
        requestDraw();
        return;
      }
      if (drag === null || drag.id !== event.pointerId) return;
      if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) > 5) drag.moved = true;
      if (drag.moved) {
        const dx = point.x - drag.last.x;
        const dy = point.y - drag.last.y;
        interruptFocus();
        zoomAnim = null;
        if (drag.pan) { camera.x += dx; camera.y += dy; }
        else rotateGraphCamera(camera, dx, dy);
        const now = performance.now();
        const stepMs = Math.max(8, now - lastPointerTime);
        lastPointerTime = now;
        const vx = dx / stepMs;
        const vy = dy / stepMs;
        spin = {
          vx: spin === null ? vx : spin.vx * 0.45 + vx * 0.55,
          vy: spin === null ? vy : spin.vy * 0.45 + vy * 0.55,
          pan: drag.pan,
        };
        setHover(-1);
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
      const coast = drag?.moved === true && performance.now() - lastPointerTime < 80;
      pointers.delete(event.pointerId);
      drag = null;
      if (!coast) spin = null;
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
      if (clicked !== null) {
        if (propsRef.current.local) {
          if (clicked >= 0) propsRef.current.onOpen(nodes[clicked].path);
        } else {
          selectInfo(clicked);
          if (propsRef.current.mini && clicked >= 0) propsRef.current.onOpen(nodes[clicked].path);
        }
      }
    }
    function pointerLeave() {
      setHover(-1);
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
        case "+": case "=": zoom(1.2, { x: width / 2, y: height / 2 }, true); break;
        case "-": zoom(1 / 1.2, { x: width / 2, y: height / 2 }, true); break;
        case "Home": reset(); break;
        default: return;
      }
      event.preventDefault();
      event.stopPropagation();
      spin = null;
      interruptFocus();
      infoFocusRef.current = false;
      setHover(-1);
      requestDraw();
    }
    function escapeInfo(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || (infoIndex < 0 && infoExitRef.current === null)) return;
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
      redraw: requestDraw,
      zoom: (factor) => zoom(factor, { x: width / 2, y: height / 2 }, true),
      reset,
      focusPath,
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
    focusPath(propsRef.current.activePath);
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
    motionPreference.addEventListener("change", requestDraw);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", visibilityChanged);
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
      if (infoDelay !== null) clearTimeout(infoDelay);
      pause();
      controlsRef.current = null;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      themeObserver.disconnect();
      colorScheme.removeEventListener("change", readPalette);
      motionPreference.removeEventListener("change", requestDraw);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibilityChanged);
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

  useEffect(() => { controlsRef.current?.focusPath(activePath); }, [activePath]);
  const highlightKey = highlightPaths.join("\0");
  useEffect(() => { controlsRef.current?.redraw(); }, [highlightKey]);

  return (
    <div data-no-sidebar-swipe="" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={wrapRef} className="relative min-h-0 min-w-0 flex-1 overscroll-none">
        {nodes.length === 0 ? (
          <p className={cn("p-6 text-muted-foreground", COARSE_POINTER_TEXT_BASE_CLASS)}>이 볼트에 노트가 없습니다.</p>
        ) : (
          <canvas
            ref={canvasRef}
            data-allow-pan
            aria-label={variant === "local" ? "로컬 그래프" : "3D 노트 그래프"}
            aria-describedby={helpId}
            tabIndex={0}
            className="absolute inset-0 block size-full cursor-grab touch-none outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring active:cursor-grabbing"
          />
        )}
        {info !== null && (
          <svg className="pointer-events-none absolute inset-0 z-10 size-full overflow-hidden" aria-hidden="true">
            <polyline ref={infoLeaderRef} pathLength={1} strokeDasharray={1} strokeDashoffset={1} fill="none" stroke={info.color} strokeOpacity={0.7} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {nodes.length > 0 && variant !== "local" ? (
          <>
            {onFullscreen ? (
              <div className="pointer-events-none absolute bottom-2 left-2 z-20">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn("pointer-events-auto size-6", COARSE_POINTER_ICON_BUTTON_GROW_CLASS)}
                  aria-label="그래프 전체화면"
                  onClick={onFullscreen}
                >
                  <Icon name="Maximize2" className="size-3.5 max-md:pointer-coarse:size-4" />
                </Button>
              </div>
            ) : null}
            <div className={cn("pointer-events-none absolute top-2 right-2 z-20 flex items-center gap-2 text-muted-foreground", COARSE_POINTER_META_TEXT_CLASS)}>
              <div className="pointer-events-auto flex items-center">
                <Button type="button" variant="ghost" size="icon" className={cn("size-6", COARSE_POINTER_ICON_BUTTON_GROW_CLASS)} aria-label="확대" onClick={() => controlsRef.current?.zoom(1.2)}>+</Button>
                <Button type="button" variant="ghost" size="icon" className={cn("size-6", COARSE_POINTER_ICON_BUTTON_GROW_CLASS)} aria-label="축소" onClick={() => controlsRef.current?.zoom(1 / 1.2)}>−</Button>
              </div>
              <span>{nodes.length}개</span>
              <span className="inline-flex items-center gap-1" aria-label="Far is pale blue, near is deep blue">
                far
                <span className="inline-block h-1.5 w-10 rounded-full" style={{ background: `linear-gradient(to right, ${GRAPH_DEPTH_COLORS.join(", ")})` }} />
                near
              </span>
            </div>
            <p id={helpId} className="pointer-events-none absolute h-px w-px overflow-hidden whitespace-nowrap">
              {GRAPH_HELP}
            </p>
            <GraphHelp />
          </>
        ) : null}
        {info !== null && (
          onFullscreen ? (
            <div
              ref={infoRef}
              data-passive=""
              aria-label={info.name}
              style={{ width: "max-content", maxWidth: "min(180px, calc(100% - 16px))", opacity: 0, pointerEvents: "none" }}
              className={cn(
                "absolute z-10 flex h-[22px] items-center overflow-hidden text-ellipsis whitespace-nowrap rounded border border-foreground/40 bg-popover px-1.5 text-popover-foreground max-md:pointer-coarse:h-8",
                COARSE_POINTER_TEXT_SM_CLASS,
              )}
            >
              {info.name}
            </div>
          ) : (
            <div
              ref={infoRef}
              role="dialog"
              aria-label="노트 정보"
              tabIndex={-1}
              style={{ width: "min(15rem, calc(100% - 16px))", maxWidth: "calc(100% - 16px)", borderColor: `${info.color}73`, opacity: 0, pointerEvents: "none" }}
              className="absolute z-10 overflow-auto rounded border bg-popover p-2 text-popover-foreground shadow-sm outline-none"
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                event.stopPropagation();
                controlsRef.current?.dismissInfo();
              }}
            >
              <div className="flex items-start gap-2">
                <p className={cn("min-w-0 flex-1 break-words font-medium", COARSE_POINTER_TEXT_SM_CLASS)}>{info.name}</p>
                <Button type="button" variant="ghost" size="icon" className={cn("size-6 shrink-0", COARSE_POINTER_ICON_BUTTON_GROW_CLASS)} aria-label="노트 정보 닫기" onClick={() => controlsRef.current?.dismissInfo()}>×</Button>
              </div>
              <p className={cn("mt-1 break-all text-muted-foreground", COARSE_POINTER_META_TEXT_CLASS)}>{info.path}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className={cn("text-muted-foreground", COARSE_POINTER_META_TEXT_CLASS)}>연결된 노트 {info.connections}개</p>
                {variant === "local" ? null : (
                  <Button type="button" variant="ghost" size="sm" className={cn("h-7 shrink-0 px-2 max-md:pointer-coarse:h-9", COARSE_POINTER_TEXT_SM_CLASS)} style={{ color: info.color }} onClick={() => controlsRef.current?.openFile()}>파일 열기</Button>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
