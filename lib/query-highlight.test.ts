import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { queryBoldSpans } from "./query-highlight.ts";

describe("queryBoldSpans", () => {
  it("bolds every contiguous match and keeps the original letters", () => {
    assert.deepEqual(queryBoldSpans("Wow wow", "WOW"), [
      { text: "Wow", match: true },
      { text: " ", match: false },
      { text: "wow", match: true },
    ]);
    assert.deepEqual(queryBoldSpans("wsdkfjsodfjsew", "wow"), [
      { text: "wsdkfjsodfjsew", match: false },
    ]);
    assert.deepEqual(queryBoldSpans("notes", "   "), [
      { text: "notes", match: false },
    ]);
  });

  it("marks the displayed list name with strong.font-bold", () => {
    const app = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");
    assert.match(app, /boldQuery\(item\.kind === "file" \? fileLabel\(item\.name\) : item\.name, query\)/);
    assert.match(app, /<strong key=\{index\} className="font-bold">/);
  });
});
