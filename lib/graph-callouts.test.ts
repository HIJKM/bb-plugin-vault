import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { closestGraphCallouts, graphCalloutLeader, placeGraphCallout } from "./graph-callouts.ts";
import { projectGraphNode } from "./graph-layout.ts";

describe("closestGraphCallouts", () => {
  it("returns only the five closest notes in the supplied depth order", () => {
    const projected = [10, 50, 20, 40, 0, 30, 60].map((depth) => ({ depth, visible: true }));
    assert.deepEqual(closestGraphCallouts(projected, [4, 0, 2, 5, 3, 1, 6]), [6, 1, 3, 5, 2]);
  });

  it("skips hidden notes before counting the five closest visible notes", () => {
    const projected = Array.from({ length: 8 }, (_, depth) => ({ depth, visible: depth < 6 }));
    assert.deepEqual(closestGraphCallouts(projected, [0, 1, 2, 3, 4, 5, 6, 7]), [5, 4, 3, 2, 1]);
  });

  it("returns fewer labels when fewer than five notes are visible", () => {
    assert.deepEqual(closestGraphCallouts([], []), []);
    assert.deepEqual(closestGraphCallouts([
      { depth: -10, visible: true },
      { depth: 0, visible: false },
      { depth: 10, visible: true },
    ], [0, 1, 2]), [2, 0]);
    assert.deepEqual(closestGraphCallouts([{ depth: 10, visible: false }], [0]), []);
  });

  it("changes the five closest notes when camera rotation reverses their depths", () => {
    const nodes = [-180, -120, -60, 0, 60, 120, 180].map((z) => ({ x: 20, y: 20, z }));
    const camera = { orientation: { x: 0, y: 0, z: 0, w: 1 }, scale: 1, x: 0, y: 0 };
    const front = nodes.map((node) => projectGraphNode(node, camera, 800, 600));
    const back = nodes.map((node) => projectGraphNode(node, {
      ...camera, orientation: { x: 0, y: 1, z: 0, w: 0 },
    }, 800, 600));
    const frontOrder = nodes.map((_, index) => index).sort((a, b) => front[a].depth - front[b].depth);
    const backOrder = nodes.map((_, index) => index).sort((a, b) => back[a].depth - back[b].depth);
    assert.deepEqual(closestGraphCallouts(front, frontOrder), [6, 5, 4, 3, 2]);
    assert.deepEqual(closestGraphCallouts(back, backOrder), [0, 1, 2, 3, 4]);
  });

  it("does not mutate the projected notes or their existing depth order", () => {
    const projected = Object.freeze([
      Object.freeze({ depth: 20, visible: true }),
      Object.freeze({ depth: -10, visible: true }),
      Object.freeze({ depth: 10, visible: false }),
    ]);
    const order = Object.freeze([1, 2, 0]);
    const before = structuredClone({ projected, order });
    assert.deepEqual(closestGraphCallouts(projected, order), [0, 1]);
    assert.deepEqual({ projected, order }, before);
  });
});

describe("placeGraphCallout", () => {
  it("places a label above and to the right of its note when there is room", () => {
    assert.deepEqual(
      placeGraphCallout({ x: 100, y: 100 }, { width: 120, height: 40 }, { width: 390, height: 600 }),
      { x: 128, y: 32, width: 120, height: 40 },
    );
  });

  it("keeps labels inside mobile viewport margins at every corner", () => {
    for (const anchor of [{ x: 8, y: 8 }, { x: 382, y: 8 }, { x: 8, y: 592 }, { x: 382, y: 592 }]) {
      const rect = placeGraphCallout(anchor, { width: 120, height: 40 }, { width: 390, height: 600 });
      assert.ok(rect);
      assert.ok(rect.x >= 8 && rect.y >= 8);
      assert.ok(rect.x + rect.width <= 382 && rect.y + rect.height <= 592);
      assert.ok(anchor.x <= rect.x - 12 || anchor.x >= rect.x + rect.width + 12
        || anchor.y <= rect.y - 12 || anchor.y >= rect.y + rect.height + 12);
    }
  });

  it("uses another candidate when an existing label occupies the preferred spot", () => {
    const occupied = [{ x: 128, y: 32, width: 120, height: 40 }];
    const rect = placeGraphCallout({ x: 100, y: 100 }, { width: 120, height: 40 }, { width: 390, height: 600 }, occupied);
    assert.ok(rect);
    assert.ok(rect.x >= 252 || rect.x + rect.width <= 124 || rect.y >= 76 || rect.y + rect.height <= 28);
    assert.deepEqual(occupied, [{ x: 128, y: 32, width: 120, height: 40 }]);
  });

  it("allows a four-pixel gap between labels but avoids a three-pixel gap", () => {
    const anchor = { x: 100, y: 100 };
    const size = { width: 120, height: 40 };
    const viewport = { width: 390, height: 600 };
    const preferred = { x: 128, y: 32, width: 120, height: 40 };
    assert.deepEqual(placeGraphCallout(anchor, size, viewport, [{ x: 128, y: 0, width: 120, height: 28 }]), preferred);
    assert.notDeepEqual(placeGraphCallout(anchor, size, viewport, [{ x: 128, y: 0, width: 120, height: 29 }]), preferred);
  });

  it("returns no label when the viewport is full or the label would cover its note", () => {
    assert.equal(placeGraphCallout(
      { x: 100, y: 100 }, { width: 120, height: 40 }, { width: 390, height: 600 },
      [{ x: 0, y: 0, width: 390, height: 600 }],
    ), null);
    assert.equal(placeGraphCallout(
      { x: 50, y: 40 }, { width: 84, height: 64 }, { width: 100, height: 80 },
    ), null);
    assert.equal(placeGraphCallout(
      { x: 50, y: 40 }, { width: 120, height: 40 }, { width: 100, height: 80 },
    ), null);
  });

  it("honors the requested distance from the note", () => {
    assert.deepEqual(
      placeGraphCallout({ x: 100, y: 100 }, { width: 120, height: 40 }, { width: 390, height: 600 }, [], 12),
      { x: 112, y: 48, width: 120, height: 40 },
    );
  });

  it("avoids a label clamped within twelve pixels of the node", () => {
    assert.equal(placeGraphCallout(
      { x: 3, y: 40 }, { width: 84, height: 64 }, { width: 100, height: 80 },
    ), null);
  });
});

describe("graphCalloutLeader", () => {
  it("starts outside the node radius and ends at the closest label edge", () => {
    const anchor = { x: 100, y: 100 };
    const rect = { x: 150, y: 20, width: 120, height: 40 };
    const points = graphCalloutLeader(anchor, rect, 3);
    assert.ok(points);
    assert.equal(points.length, 3);
    assert.ok(Math.abs(Math.hypot(points[0].x - anchor.x, points[0].y - anchor.y) - 5) < 1e-8);
    assert.deepEqual(points[2], { x: 150, y: 52 });
    assert.ok(points[1].x < rect.x);
    assert.equal(points[1].y, points[2].y);
  });

  it("connects to the nearest edge from above, below, left, and right", () => {
    const rect = { x: 150, y: 150, width: 100, height: 80 };
    for (const [anchor, end] of [
      [{ x: 200, y: 100 }, { x: 200, y: 150 }],
      [{ x: 200, y: 300 }, { x: 200, y: 230 }],
      [{ x: 100, y: 180 }, { x: 150, y: 180 }],
      [{ x: 300, y: 180 }, { x: 250, y: 180 }],
      [{ x: 100, y: 100 }, { x: 150, y: 158 }],
      [{ x: 300, y: 300 }, { x: 250, y: 222 }],
    ]) {
      const points = graphCalloutLeader(anchor, rect);
      assert.ok(points);
      assert.equal(points.length, 3);
      assert.deepEqual(points[2], end);
      assert.ok(Math.abs(Math.hypot(points[0].x - anchor.x, points[0].y - anchor.y) - 2) < 1e-8);
      for (const point of points.slice(0, 2)) {
        assert.ok(point.x < 150 || point.x > 250 || point.y < 150 || point.y > 230);
      }
    }
  });

  it("omits the line when the note is inside the label or too close for its radius", () => {
    const rect = { x: 150, y: 150, width: 100, height: 80 };
    for (const anchor of [{ x: 200, y: 180 }, { x: 150, y: 150 }, { x: 250, y: 230 }]) {
      assert.equal(graphCalloutLeader(anchor, rect), null);
    }
    assert.equal(graphCalloutLeader({ x: 140, y: 180 }, rect, 12), null);
  });

  it("insets endpoints from rounded corners and uses the center of very short edges", () => {
    const top = graphCalloutLeader({ x: 152, y: 100 }, { x: 150, y: 150, width: 100, height: 80 });
    assert.ok(top);
    assert.deepEqual(top[2], { x: 158, y: 150 });
    const bottom = graphCalloutLeader({ x: 248, y: 300 }, { x: 150, y: 150, width: 100, height: 80 });
    assert.ok(bottom);
    assert.deepEqual(bottom[2], { x: 242, y: 230 });
    const shortEdge = graphCalloutLeader({ x: 100, y: 100 }, { x: 150, y: 150, width: 10, height: 10 });
    assert.ok(shortEdge);
    assert.deepEqual(shortEdge[2], { x: 150, y: 155 });
  });
});
