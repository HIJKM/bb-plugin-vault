import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { describe, it } from "node:test";

import { graphCornerCursor, graphCornerResize, type GraphCornerDrag } from "./graph-corner.ts";

const drag: GraphCornerDrag = {
  startX: 100,
  startY: 200,
  startWidth: 320,
  startSplit: 0.5,
  height: 200,
};

describe("graph corner resize", () => {
  it("grows the graph to the right and upward, and shrinks it the other way", () => {
    assert.deepEqual(graphCornerResize(drag, { x: 140, y: 160 }), { width: 360, split: 0.7 });
    assert.deepEqual(graphCornerResize(drag, { x: 60, y: 240 }), { width: 280, split: 0.3 });
    assert.deepEqual(graphCornerResize(drag, { x: 100, y: 200 }), { width: 320, split: 0.5 });
  });

  it("keeps the height when the column has no measured height", () => {
    assert.equal(graphCornerResize({ ...drag, height: 0 }, { x: 80, y: 40 }).split, drag.startSplit);
  });

  const app = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");
  const graph = readFileSync(new URL("../components/GraphView.tsx", import.meta.url), "utf8");
  const handle = app.slice(app.indexOf('data-testid="vault-graph-corner"'), app.indexOf("사이드바 너비"));

  it("turns the pointer into a small ㄱ at the top-right, with no drawn handle", () => {
    assert.match(handle, /aria-label="그래프 크기"/);
    assert.match(handle, /absolute top-0 right-0/);
    assert.match(handle, /graphCornerCursor/);
    assert.doesNotMatch(handle, /<svg/);
    const encoded = graphCornerCursor.match(/data:image\/svg\+xml,([^"]+)/)?.[1];
    assert.ok(encoded);
    const svg = decodeURIComponent(encoded);
    assert.match(svg, /M2 2\.75H13\.25V14/);
    assert.match(svg, /stroke='#fff'/);
    assert.match(svg, /width='16'/);
    assert.match(graphCornerCursor, /\) 13 3, nesw-resize$/);
  });

  it("drags the corner on both axes and resets both on double-click", () => {
    const move = app.slice(app.indexOf("function onCornerPointerMove"), app.indexOf("function onCornerPointerUp"));
    assert.match(move, /applyListWidth/);
    assert.match(move, /applyGraphSplit/);
    assert.match(handle, /applyListWidth\(LIST_WIDTH_DEFAULT\)/);
    assert.match(handle, /applyGraphSplit\(GRAPH_SPLIT_DEFAULT\)/);
  });

  it("insets the peek chrome so the corner stays clear", () => {
    assert.match(graph, /onFullscreen \? "right-12" : "right-2"/);
  });
});
