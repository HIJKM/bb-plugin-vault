import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { propertiesUseSheet } from "./properties-layout.ts";

describe("properties layout", () => {
  it("rises from the bottom only on a narrow coarse pointer", () => {
    assert.equal(propertiesUseSheet({ compact: true, coarsePointer: true }), true);
    assert.equal(propertiesUseSheet({ compact: true, coarsePointer: false }), false);
    assert.equal(propertiesUseSheet({ compact: false, coarsePointer: true }), false);
    assert.equal(propertiesUseSheet({ compact: false, coarsePointer: false }), false);
  });

  it("docks flat on the desktop and keeps the rise on the phone", () => {
    const app = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");
    const panel = readFileSync(new URL("../components/FrontmatterPanel.tsx", import.meta.url), "utf8");
    const dock = panel.slice(panel.indexOf("export function PropertiesDock"));
    const dockBody = dock.slice(0, dock.indexOf("export function PropertiesSheet"));

    assert.match(app, /propertiesUseSheet\(\{ compact, coarsePointer \}\)/);
    assert.doesNotMatch(app, /contentWidth/);
    assert.doesNotMatch(app, /vault-properties-rail/);
    assert.match(app, /data-testid="vault-properties-dock"|<PropertiesDock/);
    assert.match(dockBody, /data-testid="vault-properties-dock"/);
    assert.match(dockBody, /max-h-\[66\.666%\]/);
    assert.match(dockBody, /border-t/);
    assert.match(dockBody, /aria-label="닫기"/);
    assert.doesNotMatch(dockBody, /transition/);
    assert.doesNotMatch(dockBody, /translate/);
    assert.match(panel, /data-testid="vault-properties-sheet"/);
    assert.match(panel, /translate-y-full/);
  });
});
