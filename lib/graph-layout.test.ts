import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createGraphLayout,
  stepGraphLayout,
  GRAPH_MAX_STEPS,
  createGraphProjection,
  projectGraphNode,
} from "./graph-layout.ts";

describe("createGraphLayout", () => {
  it("indexes valid links once and merges repeated or reciprocal links", () => {
    const layout = createGraphLayout(
      [
        { path: "a.md", name: "A" },
        { path: "b.md", name: "B" },
        { path: "c.md", name: "C" },
      ],
      [
        { from: "b.md", to: "a.md" },
        { from: "a.md", to: "b.md" },
        { from: "b.md", to: "a.md" },
        { from: "b.md", to: "c.md" },
        { from: "a.md", to: "a.md" },
        { from: "missing.md", to: "b.md" },
        { from: "c.md", to: "missing.md" },
      ],
    );
    assert.deepEqual(layout.edges, [{ from: 1, to: 0 }, { from: 1, to: 2 }]);
  });

  it("keeps every note, including orphans, in a deterministic three-dimensional layout", () => {
    const notes = Array.from({ length: 1000 }, (_, index) => ({
      path: `note-${index}.md`,
      name: `Note ${index}`,
    }));
    const before = structuredClone(notes);
    const layout = createGraphLayout(notes, []);

    assert.deepEqual(layout.nodes.map(({ path, name }) => ({ path, name })), notes);
    assert.deepEqual(notes, before);
    assert.deepEqual(layout, createGraphLayout(notes, []));
    for (const axis of ["x", "y", "z"] as const) {
      assert.ok(layout.nodes.some((node) => node[axis] < -50));
      assert.ok(layout.nodes.some((node) => node[axis] > 50));
    }
    for (const node of layout.nodes) {
      assert.ok(Math.hypot(node.x, node.y, node.z) <= 220);
      assert.deepEqual([node.vx, node.vy, node.vz], [0, 0, 0]);
    }
  });
});

describe("stepGraphLayout", () => {
  it("settles a thousand-note graph in a bounded number of steps with finite positions", () => {
    const notes = Array.from({ length: 1200 }, (_, index) => ({
      path: `note-${index}.md`,
      name: `Note ${index}`,
    }));
    const layout = createGraphLayout(notes, notes.slice(1).map((note) => ({
      from: notes[0].path,
      to: note.path,
    })));
    let movement = 0;
    for (let iteration = 0; iteration < GRAPH_MAX_STEPS; iteration++) {
      movement = stepGraphLayout(layout, iteration);
      assert.ok(Number.isFinite(movement));
      for (const node of layout.nodes) {
        assert.ok(Number.isFinite(node.x + node.y + node.z + node.vx + node.vy + node.vz));
        assert.ok(Math.hypot(node.x, node.y, node.z) <= 220 + 1e-8);
      }
    }
    assert.ok(movement < 0.01);
    assert.deepEqual(layout.nodes.map((node) => node.path), notes.map((node) => node.path));
    const settled = structuredClone(layout);
    assert.equal(stepGraphLayout(layout, GRAPH_MAX_STEPS), 0);
    assert.deepEqual(layout, settled);
  });

  it("handles a fully linked 600-note vault without dropping notes or diverging", () => {
    const notes = Array.from({ length: 600 }, (_, index) => ({
      path: `note-${index}.md`,
      name: `Note ${index}`,
    }));
    const edges = notes.flatMap((note, from) => notes
      .filter((_, to) => from !== to)
      .map((other) => ({ from: note.path, to: other.path })));
    const layout = createGraphLayout(notes, edges);
    assert.equal(layout.edges.length, 179700);
    for (let iteration = 0; iteration < 80; iteration++) {
      assert.ok(Number.isFinite(stepGraphLayout(layout, iteration)));
    }
    assert.equal(layout.nodes.length, 600);
    for (const node of layout.nodes) {
      assert.ok(Number.isFinite(node.x + node.y + node.z));
      assert.ok(Math.hypot(node.x, node.y, node.z) <= 220 + 1e-8);
    }
  });

  it("keeps empty and single-note vaults still", () => {
    assert.equal(stepGraphLayout(createGraphLayout([], []), 0), 0);
    const layout = createGraphLayout([{ path: "only.md", name: "Only" }], []);
    for (let iteration = 0; iteration < GRAPH_MAX_STEPS; iteration++) {
      assert.equal(stepGraphLayout(layout, iteration), 0);
    }
    assert.deepEqual([layout.nodes[0].x, layout.nodes[0].y, layout.nodes[0].z], [0, 0, 0]);
  });

  it("pulls connected notes together without moving an orphan out of the graph", () => {
    const notes = [
      { path: "a.md", name: "A" },
      { path: "b.md", name: "B" },
      { path: "orphan.md", name: "Orphan" },
    ];
    const connected = createGraphLayout(notes, [{ from: "a.md", to: "b.md" }]);
    const unconnected = createGraphLayout(notes, []);
    const distance = (layout: typeof connected) => Math.hypot(
      layout.nodes[0].x - layout.nodes[1].x,
      layout.nodes[0].y - layout.nodes[1].y,
      layout.nodes[0].z - layout.nodes[1].z,
    );
    for (let iteration = 0; iteration < 80; iteration++) {
      stepGraphLayout(connected, iteration);
      stepGraphLayout(unconnected, iteration);
    }
    assert.ok(distance(connected) < distance(unconnected) * 0.8);
    assert.equal(connected.nodes[2].path, "orphan.md");
    assert.ok(Math.hypot(connected.nodes[2].x, connected.nodes[2].y, connected.nodes[2].z) <= 220);
  });
});

describe("graph projection", () => {
  const camera = { yaw: 0, pitch: 0, scale: 1, x: 0, y: 0 };

  it("centers the world and makes nearer notes larger", () => {
    const project = createGraphProjection(camera, 800, 600);
    const center = project({ x: 0, y: 0, z: 0 });
    assert.equal(center.x, 400);
    assert.equal(center.y, 300);
    assert.equal(center.depth, 0);
    assert.equal(center.visible, true);
    const near = project({ x: 100, y: 0, z: 100 });
    const far = project({ x: 100, y: 0, z: -100 });
    assert.ok(near.x > far.x);
    assert.ok(near.scale > far.scale);
    assert.ok(near.perspective > far.perspective);
    assert.deepEqual(projectGraphNode({ x: 0, y: 0, z: 0 }, camera, 800, 600), center);
  });

  it("rotates around the world center and applies pixel pan and camera zoom", () => {
    const point = { x: 100, y: 0, z: 0 };
    const rotated = projectGraphNode(point, { ...camera, yaw: Math.PI / 2 }, 800, 600);
    assert.ok(Math.abs(rotated.x - 400) < 1e-8);
    assert.ok(Math.abs(rotated.depth + 100) < 1e-8);
    const pitched = projectGraphNode({ x: 0, y: 100, z: 0 }, { ...camera, pitch: Math.PI / 2 }, 800, 600);
    assert.ok(Math.abs(pitched.y - 300) < 1e-8);
    assert.ok(Math.abs(pitched.depth - 100) < 1e-8);
    const original = projectGraphNode(point, camera, 800, 600);
    const zoomed = projectGraphNode(point, { ...camera, scale: 2, x: 20, y: -10 }, 800, 600);
    assert.ok(Math.abs((zoomed.x - 420) - (original.x - 400) * 2) < 1e-8);
    assert.equal(zoomed.y, 290);
  });

  it("clips behind-camera and offscreen notes while returning finite coordinates", () => {
    for (const z of [880, 1000]) {
      const projected = projectGraphNode({ x: 100, y: 100, z }, camera, 390, 640);
      assert.equal(projected.visible, false);
      assert.ok(Number.isFinite(projected.x + projected.y + projected.scale));
    }
    assert.equal(projectGraphNode({ x: 0, y: 0, z: 0 }, { ...camera, x: 1000 }, 390, 640).visible, false);
    assert.equal(projectGraphNode({ x: 0, y: 0, z: 0 }, camera, 0, 0).visible, false);
  });

  it("fits the whole world on both mobile and desktop across camera rotations", () => {
    const layout = createGraphLayout(Array.from({ length: 1000 }, (_, index) => ({
      path: `${index}.md`, name: `${index}`,
    })), []);
    for (const [width, height] of [[390, 640], [1280, 720]]) {
      for (const yaw of [0, 1, 2, 3]) {
        const project = createGraphProjection({ ...camera, yaw, pitch: yaw / 2 }, width, height);
        for (const node of layout.nodes) {
          const outerNode = { x: node.x / 0.78, y: node.y / 0.78, z: node.z / 0.78 };
          const projected = project(outerNode);
          assert.equal(projected.visible, true);
          assert.ok(projected.x >= 0 && projected.x <= width);
          assert.ok(projected.y >= 0 && projected.y <= height);
        }
      }
    }
  });
});
