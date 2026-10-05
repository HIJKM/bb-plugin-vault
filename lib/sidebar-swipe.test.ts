import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { describe, it } from "node:test";

describe("sidebar swipe", () => {
  it("blocks the sidebar swipe only on the graph view", () => {
    const app = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");
    const splash = readFileSync(new URL("../components/PanelSplash.tsx", import.meta.url), "utf8");
    const graph = readFileSync(new URL("../components/GraphView.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(app, /data-no-sidebar-swipe/);
    assert.doesNotMatch(splash, /data-no-sidebar-swipe/);
    assert.match(
      graph,
      /<div data-no-sidebar-swipe="" className="flex min-h-0 min-w-0 flex-1 flex-col">/,
    );
  });
});
