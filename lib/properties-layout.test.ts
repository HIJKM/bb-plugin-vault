import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { PROPERTIES_SHEET_BELOW_PX, propertiesUseSheet } from "./properties-layout.ts";

describe("properties layout", () => {
  it("uses a bottom sheet when the content column is at or under 640px", () => {
    assert.equal(PROPERTIES_SHEET_BELOW_PX, 640);
    assert.equal(propertiesUseSheet(640), true);
    assert.equal(propertiesUseSheet(639), true);
    assert.equal(propertiesUseSheet(641), false);
    assert.equal(propertiesUseSheet(1200), false);
  });

  it("does not treat an unmeasured column as narrow", () => {
    assert.equal(propertiesUseSheet(0), false);
    assert.equal(propertiesUseSheet(Number.NaN), false);
    assert.equal(propertiesUseSheet(Number.POSITIVE_INFINITY), false);
  });

  it("measures the document column and closes the sheet with an X", () => {
    const app = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");
    const panel = readFileSync(new URL("../components/FrontmatterPanel.tsx", import.meta.url), "utf8");
    assert.match(app, /propertiesUseSheet\(contentWidth\)/);
    assert.match(app, /detailRef\.current/);
    assert.match(app, /clientWidth/);
    assert.doesNotMatch(app, /propertiesUseSheet\(\s*compact/);
    assert.doesNotMatch(app, /propertiesUseSheet\(\s*window/);
    assert.match(panel, /data-testid="vault-properties-sheet"/);
    assert.match(panel, /aria-label="닫기"/);
    assert.match(panel, /name="X"/);
    assert.match(panel, /translate-y-full/);
  });
});
