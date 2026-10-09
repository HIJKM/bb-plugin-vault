import { GRAPH_DEPTH_STEPS } from "./graph-presentation.ts";

export type Rgb = { r: number; g: number; b: number; a: number };

export type GraphThemeTokens = {
  canvas: string;
  node: string;
  highlight: string;
  ink: string;
  border: string;
  surface: string;
};

export type GraphThemePalette = {
  canvas: string;
  edge: string;
  ink: string;
  surface: string;
  depth: readonly string[];
  selected: string;
};

export const GRAPH_THEME_FALLBACK: GraphThemeTokens = {
  canvas: "#ffffff",
  node: "#111111",
  highlight: "#8b5cf6",
  ink: "#111111",
  border: "#888888",
  surface: "#ffffff",
};

const NODE_GAP = 28;
const HIGHLIGHT_GAP = 36;

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function channel(raw: string, unit: "byte" | "unit"): number {
  if (raw.endsWith("%")) return clampByte(parseFloat(raw) * 2.55);
  const value = Number(raw);
  return clampByte(unit === "unit" ? value * 255 : value);
}

function alpha(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 1;
  if (raw.endsWith("%")) return Math.min(1, Math.max(0, parseFloat(raw) / 100));
  return Math.min(1, Math.max(0, Number(raw)));
}

export function parseCssColor(input: string): Rgb | null {
  const value = input.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex) {
    const body = hex[1];
    const expanded = body.length <= 4
      ? body.split("").map((digit) => digit + digit).join("")
      : body;
    if (expanded.length !== 6 && expanded.length !== 8) return null;
    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
      a: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
    };
  }
  const rgb = /^rgba?\(\s*([0-9.]+%?)\s*[, ]\s*([0-9.]+%?)\s*[, ]\s*([0-9.]+%?)(?:\s*[,/]\s*([0-9.]+%?))?\s*\)$/.exec(value);
  if (rgb) {
    return { r: channel(rgb[1], "byte"), g: channel(rgb[2], "byte"), b: channel(rgb[3], "byte"), a: alpha(rgb[4]) };
  }
  const srgb = /^color\(\s*srgb\s+([0-9.]+%?)\s+([0-9.]+%?)\s+([0-9.]+%?)(?:\s*\/\s*([0-9.]+%?))?\s*\)$/.exec(value);
  if (srgb) {
    return { r: channel(srgb[1], "unit"), g: channel(srgb[2], "unit"), b: channel(srgb[3], "unit"), a: alpha(srgb[4]) };
  }
  return parseOklch(value);
}

function parseOklch(value: string): Rgb | null {
  const match = /^oklch\(\s*([0-9.]+%?)\s+([0-9.]+%?)\s+(none|[0-9.]+(?:deg|rad|grad|turn)?)(?:\s*\/\s*([0-9.]+%?))?\s*\)$/.exec(value);
  if (!match) return null;
  const lightness = match[1].endsWith("%") ? parseFloat(match[1]) / 100 : Number(match[1]);
  const chroma = match[2].endsWith("%") ? (parseFloat(match[2]) / 100) * 0.4 : Number(match[2]);
  const hue = match[3];
  const degrees = hue === "none" ? 0
    : hue.endsWith("rad") ? parseFloat(hue) * 180 / Math.PI
    : hue.endsWith("grad") ? parseFloat(hue) * 0.9
    : hue.endsWith("turn") ? parseFloat(hue) * 360
    : parseFloat(hue);
  if (![lightness, chroma, degrees].every(Number.isFinite)) return null;
  return oklchToRgb(lightness, chroma, degrees, alpha(match[4]));
}

function oklchToRgb(lightness: number, chroma: number, hue: number, opacity: number): Rgb {
  const radians = hue * Math.PI / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
  const byte = (channel: number) => {
    const clamped = Math.min(1, Math.max(0, channel));
    const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return clampByte(encoded * 255);
  };
  return { r: byte(linear.r), g: byte(linear.g), b: byte(linear.b), a: opacity };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const byte = (value: number) => clampByte(value).toString(16).padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

export function mixRgb(from: Rgb, to: Rgb, t: number): Rgb {
  const clamped = Math.min(1, Math.max(0, t));
  const rest = 1 - clamped;
  return {
    r: clampByte(from.r * rest + to.r * clamped),
    g: clampByte(from.g * rest + to.g * clamped),
    b: clampByte(from.b * rest + to.b * clamped),
    a: 1,
  };
}

function gap(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function canvasColor(input: string, fallback: string): { css: string; rgb: Rgb } {
  const parsed = parseCssColor(input) ?? parseCssColor(fallback);
  const rgb = parsed ?? { r: 255, g: 255, b: 255, a: 1 };
  if (rgb.a < 1) {
    const opacity = Math.round(rgb.a * 1000) / 1000;
    return { css: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`, rgb };
  }
  return { css: rgbToHex(rgb), rgb };
}

// --border는 옅은 구분선이라 그래프 연결선으로 쓰면 모드가 바뀌어도 회색으로 남는다.
function themeEdge(canvas: Rgb, ink: Rgb, node: Rgb): Rgb {
  const light = canvas.r + canvas.g + canvas.b >= ink.r + ink.g + ink.b;
  const tint = mixRgb(ink, node, light ? 0.24 : 0.32);
  return mixRgb(canvas, tint, light ? 0.52 : 0.6);
}

function pickHighlight(node: Rgb, canvas: Rgb, highlight: Rgb | null, ink: Rgb): string {
  if (highlight && gap(highlight, node) >= HIGHLIGHT_GAP && gap(highlight, canvas) >= NODE_GAP) return rgbToHex(highlight);
  if (gap(ink, node) >= HIGHLIGHT_GAP && gap(ink, canvas) >= NODE_GAP) return rgbToHex(ink);
  return rgbToHex(mixRgb(node, { r: 255 - node.r, g: 255 - node.g, b: 255 - node.b, a: 1 }, 0.65));
}

export function graphThemePalette(tokens: GraphThemeTokens): GraphThemePalette {
  const canvas = canvasColor(tokens.canvas, GRAPH_THEME_FALLBACK.canvas);
  const ink = canvasColor(tokens.ink, GRAPH_THEME_FALLBACK.ink);
  const node = canvasColor(tokens.node, GRAPH_THEME_FALLBACK.node);
  const surface = canvasColor(tokens.surface, canvas.css);
  const highlight = parseCssColor(tokens.highlight);
  const near = gap(node.rgb, canvas.rgb) >= NODE_GAP ? node.rgb : ink.rgb;
  const far = mixRgb(canvas.rgb, near, 0.42);
  const depth = Array.from({ length: GRAPH_DEPTH_STEPS }, (_, index) => (
    rgbToHex(mixRgb(far, near, index / (GRAPH_DEPTH_STEPS - 1)))
  ));
  return {
    canvas: canvas.css,
    edge: rgbToHex(themeEdge(canvas.rgb, ink.rgb, near)),
    ink: ink.css,
    surface: surface.css,
    depth,
    selected: pickHighlight(near, canvas.rgb, highlight, ink.rgb),
  };
}

function browserColor(value: string, fallback: string): string {
  const computed = value.trim();
  if (parseCssColor(computed)) return computed;
  const ctx = document.createElement("canvas").getContext("2d");
  if (ctx === null) return fallback;
  ctx.fillStyle = "#010203";
  ctx.fillStyle = computed;
  return ctx.fillStyle === "#010203" ? fallback : ctx.fillStyle;
}

export function readGraphThemeTokens(host: HTMLElement): GraphThemeTokens {
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  host.appendChild(probe);
  const read = (expression: string, fallback: string) => {
    probe.style.color = expression;
    return browserColor(getComputedStyle(probe).color, fallback);
  };
  try {
    return {
      canvas: read("var(--background, #ffffff)", GRAPH_THEME_FALLBACK.canvas),
      node: read("var(--primary, #111111)", GRAPH_THEME_FALLBACK.node),
      highlight: read("var(--file-accent, var(--timeline-accent, var(--primary, #8b5cf6)))", GRAPH_THEME_FALLBACK.highlight),
      ink: read("var(--foreground, #111111)", GRAPH_THEME_FALLBACK.ink),
      border: read("var(--border, #888888)", GRAPH_THEME_FALLBACK.border),
      surface: read("var(--popover, var(--background, #ffffff))", GRAPH_THEME_FALLBACK.surface),
    };
  } finally {
    probe.remove();
  }
}
