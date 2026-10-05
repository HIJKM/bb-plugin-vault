import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  COARSE_POINTER_HEADER_BAR_CLASS,
  COARSE_POINTER_HEADER_TITLE_CLASS,
  COARSE_POINTER_ICON_BUTTON_GROW_CLASS,
  COARSE_POINTER_MARKDOWN_BODY_CLASS,
  COARSE_POINTER_TREE_ROW_SIZE_CLASS,
} from "../components/ui/coarse-pointer-sizing.ts";

function widthOnlySize(source: string): string | undefined {
  return source
    .split(/\s+/)
    .find((token) => /^max-md:(?!pointer-coarse:)(?:text-|h-|w-|size-)/.test(token));
}

describe("reader type", () => {
  it("keeps the file tree small on a fine pointer and grows it only when narrow and coarse", () => {
    assert.equal(widthOnlySize(COARSE_POINTER_TREE_ROW_SIZE_CLASS), undefined);
    assert.match(COARSE_POINTER_TREE_ROW_SIZE_CLASS, /(^|\s)h-6(\s|$)/);
    assert.match(COARSE_POINTER_TREE_ROW_SIZE_CLASS, /(^|\s)text-\[13px\](\s|$)/);
    assert.match(COARSE_POINTER_TREE_ROW_SIZE_CLASS, /max-md:pointer-coarse:h-\[1\.875rem\]/);
    assert.match(COARSE_POINTER_TREE_ROW_SIZE_CLASS, /max-md:pointer-coarse:text-sm/);
    assert.doesNotMatch(COARSE_POINTER_TREE_ROW_SIZE_CLASS, /pointer-coarse:text-base/);
    assert.doesNotMatch(COARSE_POINTER_TREE_ROW_SIZE_CLASS, /pointer-coarse:h-9/);
  });

  it("matches Codes phone header chrome: 2.5rem bar, 13px type, 2rem buttons", () => {
    assert.match(COARSE_POINTER_HEADER_BAR_CLASS, /(?:^|\s)h-9(?:\s|$)/);
    assert.match(COARSE_POINTER_HEADER_BAR_CLASS, /max-md:pointer-coarse:h-10/);
    assert.doesNotMatch(COARSE_POINTER_HEADER_BAR_CLASS, /h-11/);
    assert.match(COARSE_POINTER_HEADER_TITLE_CLASS, /text-sm/);
    assert.match(COARSE_POINTER_HEADER_TITLE_CLASS, /max-md:pointer-coarse:text-\[0\.8125rem\]/);
    assert.match(COARSE_POINTER_ICON_BUTTON_GROW_CLASS, /max-md:pointer-coarse:size-8/);
    assert.match(COARSE_POINTER_ICON_BUTTON_GROW_CLASS, /max-md:pointer-coarse:\[&_svg\]:size-4/);
    assert.doesNotMatch(COARSE_POINTER_ICON_BUTTON_GROW_CLASS, /size-5/);
  });

  it("overrides the host markdown size only for a narrow coarse pointer", () => {
    assert.equal(widthOnlySize(COARSE_POINTER_MARKDOWN_BODY_CLASS), undefined);
    assert.match(
      COARSE_POINTER_MARKDOWN_BODY_CLASS,
      /max-md:pointer-coarse:\[&_\[data-markdown-preview\]\]:text-base!/,
    );
    assert.match(COARSE_POINTER_MARKDOWN_BODY_CLASS, /\[data-markdown-preview\]_h1\]:text-lg!/);
    assert.doesNotMatch(COARSE_POINTER_MARKDOWN_BODY_CLASS, /text-xl!/);
    assert.doesNotMatch(COARSE_POINTER_MARKDOWN_BODY_CLASS, /(^|\s)text-base(\s|$)/);
  });

  it("uses those classes on the reader", () => {
    const app = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");
    assert.match(app, /COARSE_POINTER_TREE_ROW_SIZE_CLASS/);
    assert.match(app, /COARSE_POINTER_MARKDOWN_BODY_CLASS/);
    assert.equal(widthOnlySize(app), undefined);
  });
});
