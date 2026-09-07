import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGraphLayout, projectGraphNode } from "./graph-layout.ts";
import { countGraphConnections, graphDepthColor, GRAPH_DEPTH_COLORS } from "./graph-presentation.ts";

describe("graphDepthColor", () => {
  it("maps far, center, and near depths to distinct stable colors", () => {
    assert.equal(graphDepthColor(-220), "#477fe0");
    assert.equal(graphDepthColor(0), "#9870c4");
    assert.equal(graphDepthColor(220), "#d67945");
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
    assert.equal(graphDepthColor(front.depth), "#d67945");
    assert.equal(graphDepthColor(back.depth), "#477fe0");
    assert.deepEqual(note, { x: 0, y: 0, z: 220 });
  });

  it("clamps depths outside the graph to the near and far endpoint colors", () => {
    for (const depth of [-221, -10000, -Infinity]) {
      assert.equal(graphDepthColor(depth), "#477fe0");
    }
    for (const depth of [221, 10000, Infinity]) {
      assert.equal(graphDepthColor(depth), "#d67945");
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
