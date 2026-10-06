import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { phoneMetrics, stackedLayout } from "./vault-chrome.ts";

describe("vault chrome", () => {
  it("keeps the narrow phone stack and gives a narrow desktop its own branch", () => {
    assert.equal(stackedLayout({ device: "phone", viewport: "narrow" }), true);
    assert.equal(stackedLayout({ device: "desktop", viewport: "narrow" }), true);
    assert.equal(stackedLayout({ device: "desktop", viewport: "medium" }), false);
    assert.equal(stackedLayout({ device: "desktop", viewport: "wide" }), false);
    assert.equal(stackedLayout({ device: "phone", viewport: "medium" }), false);
    assert.equal(stackedLayout({ device: "phone", viewport: "wide" }), false);
    assert.equal(stackedLayout({ device: "tablet", viewport: "narrow" }), false);
    assert.equal(stackedLayout({ device: "tablet", viewport: "wide" }), false);
  });

  it("grows type only on a narrow phone", () => {
    assert.equal(phoneMetrics({ device: "phone", viewport: "narrow" }), true);
    assert.equal(phoneMetrics({ device: "phone", viewport: "medium" }), false);
    assert.equal(phoneMetrics({ device: "phone", viewport: "wide" }), false);
    assert.equal(phoneMetrics({ device: "desktop", viewport: "narrow" }), false);
    assert.equal(phoneMetrics({ device: "tablet", viewport: "narrow" }), false);
  });

  it("does not decide the reader from window width or a coarse pointer", () => {
    const app = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");
    const graph = readFileSync(new URL("../components/GraphView.tsx", import.meta.url), "utf8");
    assert.match(app, /stackedLayout\(chrome\)/);
    assert.match(app, /phoneMetrics\(chrome\)/);
    assert.match(app, /data-phone-metrics=/);
    assert.match(graph, /hitTarget === "large"/);
    assert.doesNotMatch(app, /useIsCompactViewport|COMPACT_VIEWPORT|isCompactViewport/);
    assert.doesNotMatch(`${app}\n${graph}`, /\(pointer: coarse\)|\(max-width: 767px\)/);
  });
});
