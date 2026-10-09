import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  acceptHiddenName,
  listedEntryVisible,
  parseHiddenNames,
  showHiddenFromStorage,
} from "./hidden-files.ts";

const hide = { showHidden: false, names: [] as const };

describe("hidden vault names", () => {
  it("hides dot files and dot folders until show-hidden is on", () => {
    assert.equal(listedEntryVisible(".obsidian", hide), false);
    assert.equal(listedEntryVisible(".obsidian/workspace.json", hide), false);
    assert.equal(listedEntryVisible("notes/.draft.md", hide), false);
    assert.equal(listedEntryVisible("notes/readme.md", hide), true);
    assert.equal(
      listedEntryVisible(".obsidian", { showHidden: true, names: ["notes"] }),
      true,
    );
    assert.equal(
      listedEntryVisible("notes/readme.md", { showHidden: true, names: ["readme.md"] }),
      true,
    );
  });

  it("hides an extra name on any path segment, exact and NFC", () => {
    const names = ["readme.md", "Archive", "café"];
    assert.equal(listedEntryVisible("readme.md", { showHidden: false, names }), false);
    assert.equal(listedEntryVisible("Archive/note.md", { showHidden: false, names }), false);
    assert.equal(listedEntryVisible("notes/readme.md.bak", { showHidden: false, names }), true);
    assert.equal(listedEntryVisible("notes/Readme.md", { showHidden: false, names }), true);
    assert.equal(listedEntryVisible("caf\u00e9/note.md", { showHidden: false, names: ["cafe\u0301"] }), false);
  });

  it("keeps only a bare file or folder name", () => {
    assert.equal(acceptHiddenName("  drafts  "), "drafts");
    assert.equal(acceptHiddenName("cafe\u0301"), "caf\u00e9");
    assert.equal(acceptHiddenName(""), null);
    assert.equal(acceptHiddenName("   "), null);
    assert.equal(acceptHiddenName("."), null);
    assert.equal(acceptHiddenName(".."), null);
    assert.equal(acceptHiddenName("a/b"), null);
    assert.equal(acceptHiddenName("a\\b"), null);
    assert.deepEqual(
      parseHiddenNames('[1, "ok", "ok", ".", "a/b", "  box  "]'),
      ["ok", "box"],
    );
    assert.deepEqual(parseHiddenNames(null), []);
    assert.deepEqual(parseHiddenNames("nope"), []);
    assert.equal(showHiddenFromStorage(null), false);
    assert.equal(showHiddenFromStorage("0"), false);
    assert.equal(showHiddenFromStorage("1"), true);
  });

  it("lists hidden entries for the tree and leaves them out of the graph", () => {
    const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    const graph = server.slice(server.indexOf("async graph"), server.indexOf("async listIndex"));
    const listIndex = server.slice(server.indexOf("async listIndex"), server.indexOf("async readDoc"));
    assert.match(listIndex, /includeHidden: true/);
    assert.doesNotMatch(graph, /includeHidden/);
    assert.match(server, /listEntries: async \(vaultId\) => listVaultEntries\(await vaultById\(vaultId\)\)/);
  });

  it("opens the folder filter from the right edge at a fixed width", () => {
    const toolbar = readFileSync(new URL("../components/Toolbar.tsx", import.meta.url), "utf8");
    const shell = toolbar.indexOf("data-testid={SEARCH_SHELL}");
    const path = toolbar.indexOf("<PathBar");
    const hidden = toolbar.indexOf('data-testid="vault-show-hidden"');
    assert.ok(shell > hidden && hidden > path);
    assert.match(toolbar, /max-w-full min-w-0 shrink-0 overflow-hidden transition-\[width\] duration-200 ease-out/);
    assert.match(toolbar, /showSearch \? "w-80" : "w-7 in-data-\[phone-metrics\]:w-8"/);
    assert.match(toolbar, /absolute top-0 right-0/);
    assert.doesNotMatch(toolbar, /(?<!max-)w-full|w-\[min\(|max-w-xs|calc\(100%/);
    assert.doesNotMatch(toolbar, /vault-search-popover/);
    assert.doesNotMatch(toolbar, /createPortal/);
  });

  it("puts the show-hidden toggle on the toolbar and in settings", () => {
    const toolbar = readFileSync(new URL("../components/Toolbar.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");
    const settings = readFileSync(new URL("../components/HiddenFilesSettings.tsx", import.meta.url), "utf8");
    assert.match(toolbar, /data-testid="vault-show-hidden"/);
    assert.match(toolbar, /aria-label="숨김 파일 표시"/);
    assert.match(app, /listedEntryVisible/);
    assert.match(app, /id: "hidden-files"/);
    assert.match(settings, /aria-label="숨길 이름"/);
  });

  it("places the peek fullscreen button at the bottom left", () => {
    const graph = readFileSync(new URL("../components/GraphView.tsx", import.meta.url), "utf8");
    const button = graph.slice(graph.indexOf("onFullscreen ? ("), graph.indexOf("그래프 전체화면"));
    assert.match(button, /bottom-2 left-2/);
    assert.doesNotMatch(button, /top-2 left-2/);
  });

  it("draws the vault mark as a quartz point with facet holes", () => {
    const svg = readFileSync(new URL("../assets/icon.svg", import.meta.url), "utf8");
    const brand = readFileSync(new URL("../components/BrandIcon.tsx", import.meta.url), "utf8");
    const data = (source: string) => [...source.matchAll(/\bd="([^"]+)"/g)].map((match) => match[1]);
    const paths = data(svg);
    assert.deepEqual(data(brand), paths);
    assert.equal(paths.length, 1);
    const path = paths[0];
    assert.match(path, /^[MLHVZ0-9.\s-]+$/);
    assert.equal((path.match(/M/g) ?? []).length, 3);
    assert.match(svg, /fill="#000"/);
    assert.match(svg, /fill-rule="evenodd"/);
    assert.match(brand, /fill="currentColor"/);
    assert.match(brand, /fillRule="evenodd"/);
    assert.doesNotMatch(svg, /stroke/);
    assert.doesNotMatch(brand, /stroke/);
  });
});
