import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createGraphLayout,
  stepGraphLayout,
  GRAPH_MAX_STEPS,
  createGraphProjection,
  projectGraphNode,
  rotateGraphCamera,
  aimGraphCameraAt,
  slerpQuaternion,
  DEFAULT_GRAPH_CAMERA,
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
  const camera = { orientation: { x: 0, y: 0, z: 0, w: 1 }, scale: 1, x: 0, y: 0 };

  it("preserves the initial view from the previous yaw and pitch camera", () => {
    const projected = projectGraphNode({ x: 100, y: 50, z: 75 }, DEFAULT_GRAPH_CAMERA, 800, 600);
    assert.ok(Math.abs(projected.x - 534.4290372376008) < 1e-8);
    assert.ok(Math.abs(projected.y - 363.12567257293495) < 1e-8);
    assert.ok(Math.abs(projected.depth - 25.508850389867064) < 1e-8);
  });

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
    const rotated = projectGraphNode(point, {
      ...camera, orientation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
    }, 800, 600);
    assert.ok(Math.abs(rotated.x - 400) < 1e-8);
    assert.ok(Math.abs(rotated.depth + 100) < 1e-8);
    const pitched = projectGraphNode({ x: 0, y: 100, z: 0 }, {
      ...camera, orientation: { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 },
    }, 800, 600);
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
      for (const drag of [0, 125, 250, 375]) {
        const rotatedCamera = { ...camera };
        rotateGraphCamera(rotatedCamera, drag, drag / 2);
        const project = createGraphProjection(rotatedCamera, width, height);
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

describe("rotateGraphCamera", () => {
  it("keeps horizontal dragging aligned to the screen after a 90-degree tilt", () => {
    const camera = { orientation: { x: 0, y: 0, z: 0, w: 1 }, scale: 1, x: 0, y: 0 };
    rotateGraphCamera(camera, 0, Math.PI / (2 * 0.008));
    const frontNote = { x: 0, y: -100, z: 0 };
    const before = projectGraphNode(frontNote, camera, 800, 600);
    assert.ok(Math.abs(before.x - 400) < 1e-8);
    assert.ok(Math.abs(before.y - 300) < 1e-8);
    assert.ok(Math.abs(before.depth - 100) < 1e-8);
    rotateGraphCamera(camera, 20, 0);
    const after = projectGraphNode(frontNote, camera, 800, 600);
    assert.ok(after.x > before.x);
    assert.ok(Math.abs(after.y - before.y) < 1e-8);
    assert.ok(after.depth < before.depth);
  });

  it("moves front-facing notes downward when dragging down", () => {
    const camera = { orientation: { x: 0, y: 0, z: 0, w: 1 }, scale: 1, x: 0, y: 0 };
    rotateGraphCamera(camera, 0, 20);
    const projected = projectGraphNode({ x: 0, y: 0, z: 100 }, camera, 800, 600);
    assert.ok(projected.y > 300);
    assert.ok(Math.abs(projected.x - 400) < 1e-8);
  });

  it("continues through both poles during repeated vertical dragging", () => {
    const camera = { orientation: { x: 0, y: 0, z: 0, w: 1 }, scale: 1, x: 0, y: 0 };
    const frontNote = { x: 0, y: 0, z: 100 };
    const sixtyDegrees = Math.PI / (3 * 0.008);
    for (let step = 1; step <= 6; step++) {
      rotateGraphCamera(camera, 0, sixtyDegrees);
      const projected = projectGraphNode(frontNote, camera, 800, 600);
      if (step === 2) assert.ok(projected.depth < 0);
      if (step === 4) assert.ok(projected.y < 300);
      if (step === 6) {
        assert.ok(Math.abs(projected.depth - 100) < 1e-8);
        assert.ok(Math.abs(projected.y - 300) < 1e-8);
      }
    }
  });

  it("makes diagonal rotation independent of pointer event batching", () => {
    const singleDrag = { ...DEFAULT_GRAPH_CAMERA };
    const splitDrag = { ...DEFAULT_GRAPH_CAMERA };
    rotateGraphCamera(singleDrag, 120, 80);
    for (let step = 0; step < 8; step++) rotateGraphCamera(splitDrag, 15, 10);
    const note = { x: 100, y: 50, z: 75 };
    const single = projectGraphNode(note, singleDrag, 800, 600);
    const split = projectGraphNode(note, splitDrag, 800, 600);
    for (const axis of ["x", "y", "depth"] as const) {
      assert.ok(Math.abs(single[axis] - split[axis]) < 1e-8);
    }
  });

  it("restores the current view when a drag is reversed", () => {
    const camera = { ...DEFAULT_GRAPH_CAMERA, scale: 2, x: 30, y: -15 };
    const before = structuredClone(camera);
    rotateGraphCamera(camera, 43, -71);
    rotateGraphCamera(camera, -43, 71);
    for (const axis of ["x", "y", "z", "w"] as const) {
      assert.ok(Math.abs(camera.orientation[axis] - before.orientation[axis]) < 1e-12);
    }
    assert.equal(camera.scale, 2);
    assert.equal(camera.x, 30);
    assert.equal(camera.y, -15);
  });

  it("keeps the default orientation unchanged and treats zero movement as a no-op", () => {
    const original = structuredClone(DEFAULT_GRAPH_CAMERA);
    const camera = { ...DEFAULT_GRAPH_CAMERA };
    rotateGraphCamera(camera, 0, 0);
    assert.strictEqual(camera.orientation, DEFAULT_GRAPH_CAMERA.orientation);
    rotateGraphCamera(camera, 12, 7);
    assert.notStrictEqual(camera.orientation, DEFAULT_GRAPH_CAMERA.orientation);
    assert.deepEqual(DEFAULT_GRAPH_CAMERA, original);
  });

  it("stays normalized after twenty thousand rotations without changing note positions", () => {
    const camera = { ...DEFAULT_GRAPH_CAMERA };
    for (let step = 0; step < 20000; step++) {
      rotateGraphCamera(camera, Math.sin(step) * 5, Math.cos(step * 0.7) * 5);
    }
    const { x, y, z, w } = camera.orientation;
    assert.ok(Math.abs(Math.hypot(x, y, z, w) - 1) < 1e-12);
    const note = { x: 100, y: 50, z: 75 };
    const before = { ...note };
    const projected = projectGraphNode(note, camera, 800, 600);
    const rotatedX = (projected.x - 400) / projected.scale;
    const rotatedY = (projected.y - 300) / projected.scale;
    assert.ok(Math.abs(Math.hypot(rotatedX, rotatedY, projected.depth) - Math.hypot(100, 50, 75)) < 1e-8);
    assert.deepEqual(note, before);
  });
});

describe("aimGraphCameraAt", () => {
  it("brings the target note to the front without moving other camera fields", () => {
    const camera = { orientation: { x: 0, y: 0, z: 0, w: 1 }, scale: 1.5, x: 12, y: -8 };
    const note = { x: 100, y: 40, z: -30 };
    const behind = { x: -100, y: -40, z: 30 };
    aimGraphCameraAt(camera, note);
    const front = projectGraphNode(note, camera, 800, 600);
    const back = projectGraphNode(behind, camera, 800, 600);
    assert.ok(front.depth > 80);
    assert.ok(front.depth > back.depth);
    assert.ok(Math.abs(front.x - 412) < 1e-6);
    assert.ok(Math.abs(front.y - 292) < 1e-6);
    assert.equal(camera.scale, 1.5);
    assert.equal(camera.x, 12);
    assert.equal(camera.y, -8);
  });

  it("is a no-op at the origin so a single note does not spin", () => {
    const camera = { ...DEFAULT_GRAPH_CAMERA };
    const original = structuredClone(camera);
    aimGraphCameraAt(camera, { x: 0, y: 0, z: 0 });
    assert.deepEqual(camera, original);
  });
});

describe("slerpQuaternion", () => {
  it("returns the start, the end, and a midpoint that still faces the note", () => {
    const start = { x: 0, y: 0, z: 0, w: 1 };
    const camera = { orientation: { ...start }, scale: 1, x: 0, y: 0 };
    aimGraphCameraAt(camera, { x: 0, y: 100, z: 0 });
    const end = camera.orientation;
    const mid = { orientation: slerpQuaternion(start, end, 0.5), scale: 1, x: 0, y: 0 };
    const note = { x: 0, y: 100, z: 0 };
    assert.deepEqual(slerpQuaternion(start, end, 0), start);
    const finish = slerpQuaternion(start, end, 1);
    for (const axis of ["x", "y", "z", "w"] as const) {
      assert.ok(Math.abs(finish[axis] - end[axis]) < 1e-12);
    }
    const startDepth = projectGraphNode(note, { orientation: start, scale: 1, x: 0, y: 0 }, 800, 600).depth;
    const midDepth = projectGraphNode(note, mid, 800, 600).depth;
    const endDepth = projectGraphNode(note, camera, 800, 600).depth;
    assert.ok(midDepth > startDepth);
    assert.ok(endDepth > midDepth);
  });
});
