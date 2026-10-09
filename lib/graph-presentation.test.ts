import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGraphLayout, projectGraphNode } from "./graph-layout.ts";
import {
  countGraphConnections,
  graphDepthAppearance,
  graphDepthColor,
  graphSelectionReveal,
  GRAPH_DEPTH_APPEARANCES,
  GRAPH_DEPTH_COLORS,
  GRAPH_EDGE_REVEAL_MS,
} from "./graph-presentation.ts";

describe("graphDepthAppearance", () => {
  it("makes far notes faint and soft while keeping near notes opaque and crisp", () => {
    assert.deepEqual(graphDepthAppearance(-220), { color: "#739ce8", opacity: 0.18, blur: 1.2 });
    assert.deepEqual(graphDepthAppearance(0), { color: "#3e77e0", opacity: 0.55, blur: 0.5 });
    assert.deepEqual(graphDepthAppearance(220), { color: "#1f58c1", opacity: 1, blur: 0 });
  });

  it("steadily increases opacity and reduces blur across every depth bucket", () => {
    let previous = graphDepthAppearance(-220);
    for (let depth = -220; depth <= 220; depth++) {
      const appearance = graphDepthAppearance(depth);
      assert.ok(appearance.opacity >= 0.18 && appearance.opacity <= 1);
      assert.ok(appearance.blur >= 0 && appearance.blur <= 1.2);
      assert.ok(appearance.opacity >= previous.opacity);
      assert.ok(appearance.blur <= previous.blur);
      if (depth >= 74) assert.equal(appearance.blur, 0);
      assert.equal(appearance.color, graphDepthColor(depth));
      previous = appearance;
    }
    assert.deepEqual(GRAPH_DEPTH_APPEARANCES.map(({ color }) => color), GRAPH_DEPTH_COLORS);
  });

  it("reuses profiles within a bucket and clamps out-of-range depths", () => {
    assert.strictEqual(graphDepthAppearance(-1), graphDepthAppearance(1));
    assert.strictEqual(graphDepthAppearance(0), graphDepthAppearance(0));
    for (const depth of [-221, -10000, -Infinity]) {
      assert.strictEqual(graphDepthAppearance(depth), graphDepthAppearance(-220));
    }
    for (const depth of [221, 10000, Infinity]) {
      assert.strictEqual(graphDepthAppearance(depth), graphDepthAppearance(220));
    }
  });

  it("keeps the depth profile when a theme ramp replaces the fallback blues", () => {
    const ramp = ["#112233", "#224466", "#336699", "#4488aa", "#55aabb", "#66ccdd", "#77ddee", "#88eeff", "#99ddff", "#aabbcc", "#bbccdd", "#ccddee", "#ddeeff", "#eef6ff", "#f7fbff", "#ffffff", "#8839ef"];
    const far = graphDepthAppearance(-220, ramp);
    const near = graphDepthAppearance(220, ramp);
    assert.equal(far.color, ramp[0]);
    assert.equal(far.opacity, graphDepthAppearance(-220).opacity);
    assert.equal(far.blur, graphDepthAppearance(-220).blur);
    assert.equal(near.color, ramp[16]);
    assert.equal(near.opacity, 1);
    assert.strictEqual(graphDepthAppearance(220, ramp), near);
    assert.notEqual(far.color, graphDepthAppearance(-220).color);
  });

  it("softens the same note when camera rotation moves it from front to back", () => {
    const note = { x: 0, y: 0, z: 220 };
    const camera = { orientation: { x: 0, y: 0, z: 0, w: 1 }, scale: 1, x: 0, y: 0 };
    const front = graphDepthAppearance(projectGraphNode(note, camera, 800, 600).depth);
    const back = graphDepthAppearance(projectGraphNode(note, {
      ...camera, orientation: { x: 0, y: 1, z: 0, w: 0 },
    }, 800, 600).depth);
    assert.ok(front.opacity > back.opacity);
    assert.ok(front.blur < back.blur);
    assert.notEqual(front.color, back.color);
    assert.deepEqual(note, { x: 0, y: 0, z: 220 });
  });
});

describe("graphDepthColor", () => {
  it("maps far, center, and near depths to light through deep blue shades", () => {
    assert.equal(graphDepthColor(-220), "#739ce8");
    assert.equal(graphDepthColor(0), "#3e77e0");
    assert.equal(graphDepthColor(220), "#1f58c1");
    assert.equal(graphDepthColor(-1), graphDepthColor(1));
    assert.ok(GRAPH_DEPTH_COLORS.includes(graphDepthColor(125)));
  });

  it("reverses a note's depth color when the camera rotates by 180 degrees", () => {
    const note = { x: 0, y: 0, z: 220 };
    const camera = { orientation: { x: 0, y: 0, z: 0, w: 1 }, scale: 1, x: 0, y: 0 };
    const front = projectGraphNode(note, camera, 800, 600);
    const back = projectGraphNode(note, {
      ...camera, orientation: { x: 0, y: 1, z: 0, w: 0 },
    }, 800, 600);
    assert.equal(graphDepthColor(front.depth), "#1f58c1");
    assert.equal(graphDepthColor(back.depth), "#739ce8");
    assert.deepEqual(note, { x: 0, y: 0, z: 220 });
  });

  it("clamps depths outside the graph to the near and far endpoint colors", () => {
    for (const depth of [-221, -10000, -Infinity]) {
      assert.equal(graphDepthColor(depth), "#739ce8");
    }
    for (const depth of [221, 10000, Infinity]) {
      assert.equal(graphDepthColor(depth), "#1f58c1");
    }
    assert.equal(graphDepthColor(-0), graphDepthColor(0));
  });
});

describe("countGraphConnections", () => {
  it("returns zero counts for empty graphs and notes without links", () => {
    assert.deepEqual(countGraphConnections([], 0), new Uint32Array(0));
    assert.deepEqual(countGraphConnections([], 3), new Uint32Array([0, 0, 0]));
  });

  it("counts adjacent notes after layout deduplication and preserves isolated notes", () => {
    const layout = createGraphLayout(
      ["A", "B", "C", "Isolated"].map((name) => ({ path: `${name}.md`, name })),
      [
        { from: "A.md", to: "B.md" },
        { from: "B.md", to: "A.md" },
        { from: "A.md", to: "B.md" },
        { from: "C.md", to: "B.md" },
        { from: "B.md", to: "B.md" },
        { from: "C.md", to: "Missing.md" },
      ],
    );
    const before = structuredClone(layout.edges);
    assert.deepEqual(countGraphConnections(layout.edges, layout.nodes.length), new Uint32Array([1, 2, 1, 0]));
    assert.deepEqual(layout.edges, before);
  });
});

describe("graphSelectionReveal", () => {
  it("grows connection edges for 240ms before the tooltip may appear", () => {
    assert.equal(GRAPH_EDGE_REVEAL_MS, 240);
    assert.deepEqual(graphSelectionReveal(0), { edgeProgress: 0, showTooltip: false });
    const mid = graphSelectionReveal(120);
    assert.ok(mid.edgeProgress > 0 && mid.edgeProgress < 1);
    assert.equal(mid.showTooltip, false);
    assert.deepEqual(graphSelectionReveal(240), { edgeProgress: 1, showTooltip: true });
    assert.deepEqual(graphSelectionReveal(10000), { edgeProgress: 1, showTooltip: true });
  });

  it("keeps the tooltip hidden until the last millisecond of the edge grow", () => {
    assert.equal(graphSelectionReveal(-50).showTooltip, false);
    assert.equal(graphSelectionReveal(239).showTooltip, false);
    assert.ok(graphSelectionReveal(239).edgeProgress < 1);
  });

  it("shows edges and tooltip immediately when motion is reduced", () => {
    for (const elapsed of [-50, 0, 80, 239]) {
      assert.deepEqual(graphSelectionReveal(elapsed, true), { edgeProgress: 1, showTooltip: true });
    }
  });
});
