import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyAgentEntry,
  consumeAgentRoute,
  consumeGraphOpen,
  highlightPathsFor,
  mergeHighlightPaths,
  readAgentEntry,
  resetAgentEntry,
  shouldEnterVaultRoute,
  vaultNavigationFor,
  vaultPanelSubPath,
} from "./agent-entry.ts";
import type { PanelOpenRequest } from "./panel-open.ts";

function graph(nonce: string, paths: string[], vaultId = "notes"): PanelOpenRequest {
  return {
    threadId: "thr_1",
    action: "graph",
    vaultId,
    paths,
    title: "3D 그래프",
    nonce,
  };
}

function file(nonce: string, path = "folder/a.md", vaultId = "notes"): PanelOpenRequest {
  return {
    threadId: "thr_1",
    action: "file",
    vaultId,
    path,
    title: "a",
    nonce,
  };
}

describe("agent entry", () => {
  it("appends graph lights per vault and leaves them on a file open", () => {
    resetAgentEntry();
    assert.deepEqual(mergeHighlightPaths(["a.md"], ["c.md", "a.md"]), ["a.md", "c.md"]);
    applyAgentEntry(graph("n1", ["a.md", "b.md"]));
    applyAgentEntry(graph("n2", ["c.md", "a.md"]));
    applyAgentEntry(graph("n3", ["z.md"], "other"));
    assert.deepEqual(highlightPathsFor("notes"), ["a.md", "b.md", "c.md"]);
    assert.deepEqual(highlightPathsFor("other"), ["z.md"]);
    applyAgentEntry(graph("n4", []));
    assert.deepEqual(highlightPathsFor("notes"), ["a.md", "b.md", "c.md"]);
    assert.equal(readAgentEntry()?.action, "graph");
    applyAgentEntry(file("n5"));
    assert.equal(readAgentEntry()?.action, "file");
    assert.deepEqual(highlightPathsFor("notes"), ["a.md", "b.md", "c.md"]);
    applyAgentEntry(graph("n6", ["a.md", "b.md"]));
    assert.deepEqual(highlightPathsFor("notes"), ["a.md", "b.md", "c.md"]);
  });

  it("arms the fullscreen graph once, and a file open disarms it", () => {
    resetAgentEntry();
    applyAgentEntry(graph("n1", ["a.md"]));
    assert.equal(consumeGraphOpen("other"), false);
    assert.equal(consumeGraphOpen("notes"), true);
    assert.equal(consumeGraphOpen("notes"), false);
    applyAgentEntry(graph("n2", ["b.md"]));
    assert.deepEqual(consumeAgentRoute(), { action: "graph", vaultId: "notes", path: "" });
    applyAgentEntry(file("n3", "folder/a.md"));
    assert.equal(consumeGraphOpen("notes"), false);
    assert.deepEqual(consumeAgentRoute(), { action: "file", vaultId: "notes", path: "folder/a.md" });
    assert.equal(consumeAgentRoute(), null);
  });

  it("skips navigation when the vault screen is already showing that place", () => {
    resetAgentEntry();
    const notesGraph = applyAgentEntry(graph("n1", ["a.md"]));
    assert.equal(vaultPanelSubPath(notesGraph), "notes");
    assert.equal(shouldEnterVaultRoute("/plugins/vault/docs/notes", notesGraph), false);
    assert.equal(shouldEnterVaultRoute("/plugins/vault/docs/notes/folder/a.md", notesGraph), false);
    assert.equal(shouldEnterVaultRoute("/plugins/vault/docs/notes-extra", notesGraph), true);
    assert.equal(shouldEnterVaultRoute("/threads/thr_1", notesGraph), true);
    const encoded = "/plugins/vault/docs/notes/wiki/%EA%B2%A9%EC%9E%90.md";
    const hangul = applyAgentEntry(file("n2", "wiki/격자.md"));
    assert.equal(shouldEnterVaultRoute(encoded, hangul), false);
    assert.equal(vaultNavigationFor("/plugins/vault/docs/notes/wiki/other.md", hangul)?.subPath, "notes/wiki/격자.md");
    assert.equal(vaultNavigationFor(encoded, hangul), null);
  });
});
