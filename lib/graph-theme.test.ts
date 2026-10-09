import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GRAPH_DEPTH_STEPS } from "./graph-presentation.ts";
import { graphThemePalette, mixRgb, parseCssColor, rgbToHex } from "./graph-theme.ts";

function distance(a: string, b: string): number {
  const left = parseCssColor(a);
  const right = parseCssColor(b);
  assert.ok(left && right);
  return Math.hypot(left.r - right.r, left.g - right.g, left.b - right.b);
}

describe("parseCssColor", () => {
  it("reads hex, rgb, and srgb forms", () => {
    assert.deepEqual(parseCssColor("#8839ef"), { r: 136, g: 57, b: 239, a: 1 });
    assert.deepEqual(parseCssColor("#fff"), { r: 255, g: 255, b: 255, a: 1 });
    assert.equal(rgbToHex(parseCssColor("rgb(30, 102, 245)")!), "#1e66f5");
    assert.equal(rgbToHex(parseCssColor("rgb(100% 0% 0%)")!), "#ff0000");
    assert.equal(parseCssColor("rgba(76, 79, 105, 0.2)")?.a, 0.2);
    assert.equal(rgbToHex(parseCssColor("color(srgb 1 0 0)")!), "#ff0000");
    assert.equal(rgbToHex(parseCssColor("oklch(1 0 0)")!), "#ffffff");
    assert.equal(rgbToHex(parseCssColor("oklch(0 0 0)")!), "#000000");
    assert.equal(rgbToHex(parseCssColor("oklch(100% 0 0)")!), "#ffffff");
    const latteBorder = parseCssColor("oklch(0.884634 0.0109597 279.352)");
    const mochaBorder = parseCssColor("oklch(0.366207 0.0327175 281.682)");
    assert.ok(latteBorder && mochaBorder);
    assert.ok(latteBorder.r + latteBorder.g + latteBorder.b > mochaBorder.r + mochaBorder.g + mochaBorder.b + 200);
    assert.equal(parseCssColor("var(--primary)"), null);
    assert.equal(parseCssColor(""), null);
  });
});

describe("graphThemePalette", () => {
  it("follows a light and dark theme instead of the fixed blue and violet", () => {
    const light = graphThemePalette({
      canvas: "#eff1f5",
      node: "#8839ef",
      highlight: "#1e66f5",
      ink: "#4c4f69",
      border: "rgba(76, 79, 105, 0.2)",
      surface: "rgb(239, 241, 245)",
    });
    const dark = graphThemePalette({
      canvas: "#1e1e2e",
      node: "rgb(203, 166, 247)",
      highlight: "#89b4fa",
      ink: "#cdd6f4",
      border: "#45475a",
      surface: "#1e1e2e",
    });
    assert.equal(light.depth.length, GRAPH_DEPTH_STEPS);
    assert.equal(light.depth.at(-1), "#8839ef");
    assert.equal(dark.depth.at(-1), "#cba6f7");
    assert.equal(light.selected, "#1e66f5");
    assert.equal(dark.selected, "#89b4fa");
    assert.equal(light.canvas, "#eff1f5");
    assert.equal(dark.canvas, "#1e1e2e");
    assert.equal(light.surface, "#eff1f5");
    assert.notEqual(light.edge, dark.edge);
    assert.notEqual(light.edge, "#888888");
    assert.ok(distance(light.edge, light.canvas) > 40);
    assert.ok(distance(dark.edge, dark.canvas) > 40);
    const lightEdge = parseCssColor(light.edge)!;
    const darkEdge = parseCssColor(dark.edge)!;
    const lightCanvas = parseCssColor(light.canvas)!;
    const darkCanvas = parseCssColor(dark.canvas)!;
    assert.ok(lightEdge.r + lightEdge.g + lightEdge.b < lightCanvas.r + lightCanvas.g + lightCanvas.b);
    assert.ok(darkEdge.r + darkEdge.g + darkEdge.b > darkCanvas.r + darkCanvas.g + darkCanvas.b);
    assert.equal(dark.ink, "#cdd6f4");
    assert.ok(distance(light.depth[0], light.canvas) < distance(light.depth.at(-1)!, light.canvas));
    assert.ok(distance(dark.depth[0], dark.canvas) < distance(dark.depth.at(-1)!, dark.canvas));
    assert.notEqual(light.depth[0], dark.depth[0]);
    assert.notEqual(light.selected, "#8b5cf6");
    assert.notEqual(dark.depth.at(-1), "#1f58c1");
    assert.notEqual(light.depth[0], "#739ce8");
  });

  it("follows an oklch theme's light and dark modes", () => {
    const light = graphThemePalette({
      canvas: "oklch(1 0 0)",
      node: "oklch(0.27 0 0)",
      highlight: "oklch(0.45 0.2 250)",
      ink: "oklch(0.3211 0 0)",
      border: "",
      surface: "",
    });
    const dark = graphThemePalette({
      canvas: "oklch(0.195 0 0)",
      node: "oklch(0.82 0 0)",
      highlight: "oklch(0.75 0.12 250)",
      ink: "oklch(0.81 0 0)",
      border: "",
      surface: "",
    });
    assert.equal(light.canvas, "#ffffff");
    assert.notEqual(light.canvas, dark.canvas);
    assert.notEqual(light.depth.at(-1), dark.depth.at(-1));
    assert.notEqual(light.edge, dark.edge);
    assert.notEqual(light.selected, dark.selected);
    assert.ok(distance(dark.canvas, "#ffffff") > 80);
  });

  it("uses ink for the selection when the highlight is the same color as the nodes", () => {
    const nord = graphThemePalette({
      canvas: "#2e3440",
      node: "#88c0d0",
      highlight: "#88c0d0",
      ink: "#d8dee9",
      border: "#4c566a",
      surface: "#2e3440",
    });
    assert.equal(nord.depth.at(-1), "#88c0d0");
    assert.equal(nord.selected, "#d8dee9");
    assert.notEqual(nord.selected, nord.depth.at(-1));
  });

  it("falls back when a token cannot be parsed", () => {
    const palette = graphThemePalette({
      canvas: "var(--canvas)",
      node: "var(--primary)",
      highlight: "",
      ink: "",
      border: "",
      surface: "",
    });
    assert.equal(palette.canvas, "#ffffff");
    assert.equal(palette.depth.at(-1), "#111111");
    assert.notEqual(palette.edge, palette.canvas);
    assert.equal(palette.surface, "#ffffff");
    assert.notEqual(palette.selected, "#111111");
    assert.equal(mixRgb({ r: 0, g: 0, b: 0, a: 1 }, { r: 10, g: 0, b: 0, a: 1 }, 0).r, 0);
    assert.equal(mixRgb({ r: 0, g: 0, b: 0, a: 1 }, { r: 10, g: 0, b: 0, a: 1 }, 1).r, 10);
  });
});
