import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { graphLabelHidden, graphNodeEmphasis, highlightedNodeIndices } from "./graph-highlight.ts";
import {
  chooseVault,
  claimDirectiveOpen,
  filePanelTarget,
  graphPanelTarget,
  openVaultFile,
  openVaultGraph,
  panelOpenOptions,
  parsePanelOpenRequest,
  parseVaultFileAttributes,
  parseVaultGraphAttributes,
  releaseDirectiveOpen,
  resolveFilePath,
  resolveGraphPaths,
  vaultFileDirective,
  vaultGraphDirective,
} from "./panel-open.ts";

const vaults = [
  { id: "notes", name: "Notes" },
  { id: "docs", name: "Docs" },
];

const entries = [
  { kind: "file" as const, path: "Alpha.md", name: "Alpha" },
  { kind: "file" as const, path: "folder/Alpha.md", name: "Alpha" },
  { kind: "file" as const, path: "folder/Beta.md", name: "Beta" },
  { kind: "directory" as const, path: "folder", name: "folder" },
  { kind: "file" as const, path: "pic.png", name: "pic.png" },
  { kind: "file" as const, path: "plain.txt", name: "plain" },
];

describe("chooseVault", () => {
  it("uses the only vault when the id is omitted", () => {
    assert.deepEqual(chooseVault([{ id: "notes", name: "Notes" }], undefined), {
      ok: true,
      vault: { id: "notes", name: "Notes" },
    });
  });

  it("asks for an id when several vaults exist", () => {
    const result = chooseVault(vaults, undefined);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.message, /notes/);
    assert.match(result.message, /docs/);
  });

  it("matches an id and a unique name", () => {
    assert.deepEqual(chooseVault(vaults, "docs"), { ok: true, vault: vaults[1] });
    assert.deepEqual(chooseVault(vaults, "Notes"), { ok: true, vault: vaults[0] });
  });
});

describe("resolveFilePath", () => {
  it("resolves an exact path, a bare name, and a unique suffix", () => {
    assert.deepEqual(resolveFilePath(entries, "plain.txt"), {
      ok: true,
      path: "plain.txt",
      name: "plain",
    });
    assert.deepEqual(resolveFilePath(entries, "Beta"), {
      ok: true,
      path: "folder/Beta.md",
      name: "Beta",
    });
    assert.deepEqual(resolveFilePath(entries, "folder/Alpha"), {
      ok: true,
      path: "folder/Alpha.md",
      name: "Alpha",
    });
  });

  it("rejects traversal, folders, and ambiguous names", () => {
    assert.equal(resolveFilePath(entries, "../secret.md").ok, false);
    assert.equal(resolveFilePath(entries, "folder").ok, false);
    const ambiguous = resolveFilePath(entries, "Alpha");
    assert.equal(ambiguous.ok, false);
    if (ambiguous.ok) return;
    assert.match(ambiguous.message, /Alpha\.md/);
    assert.match(ambiguous.message, /folder\/Alpha\.md/);
  });
});

describe("resolveGraphPaths", () => {
  it("keeps markdown notes and rejects a file that is not a note", () => {
    const rejected = resolveGraphPaths(entries, ["Beta", "plain.txt"]);
    assert.equal(rejected.ok, false);
    assert.deepEqual(resolveGraphPaths(entries, []), { ok: true, paths: [] });
    assert.deepEqual(resolveGraphPaths(entries, ["Beta", "folder/Alpha.md", "Beta"]), {
      ok: true,
      paths: ["folder/Beta.md", "folder/Alpha.md"],
    });
  });
});

describe("panel contract", () => {
  it("round-trips a file open and a graph open", async () => {
    const published: unknown[] = [];
    const deps = {
      loadVaults: async () => [{ id: "notes", name: "Notes" }],
      listEntries: async () => entries,
      publish: (payload: unknown) => {
        published.push(payload);
      },
      nonce: () => "n1",
    };
    const file = await openVaultFile({ path: "Beta" }, { threadId: "thr_1" }, deps);
    assert.equal(typeof file, "string");
    assert.match(String(file), /::vault-file\{vault="notes" path="folder\/Beta\.md"\}/);
    assert.deepEqual(published[0], {
      threadId: "thr_1",
      action: "file",
      vaultId: "notes",
      path: "folder/Beta.md",
      title: "Beta",
      nonce: "n1",
    });

    const graph = await openVaultGraph({ paths: ["Beta"] }, { threadId: "thr_1" }, deps);
    assert.match(String(graph), /::vault-graph\{vault="notes" paths="folder\/Beta\.md"\}/);
    const request = parsePanelOpenRequest(published[1]);
    assert.deepEqual(request, {
      threadId: "thr_1",
      action: "graph",
      vaultId: "notes",
      paths: ["folder/Beta.md"],
      title: "그래프 · 1",
      nonce: "n1",
    });
    assert.deepEqual(panelOpenOptions(request!), {
      actionId: "graph",
      title: "그래프 · 1",
      params: { vaultId: "notes", paths: ["folder/Beta.md"] },
    });
  });

  it("does not publish when the thread or the path is missing", async () => {
    let publishes = 0;
    const deps = {
      loadVaults: async () => [{ id: "notes", name: "Notes" }],
      listEntries: async () => entries,
      publish: () => {
        publishes += 1;
      },
    };
    const missingThread = await openVaultFile({ path: "Beta" }, { threadId: "" }, deps);
    const missingPath = await openVaultFile({ path: "Nope" }, { threadId: "thr_1" }, deps);
    assert.equal(publishes, 0);
    assert.equal(typeof missingThread, "object");
    assert.equal(typeof missingPath, "object");
  });

  it("parses panel params and directive attributes", () => {
    assert.deepEqual(filePanelTarget({ vaultId: "notes", path: "folder/Beta.md" }), {
      vaultId: "notes",
      path: "folder/Beta.md",
    });
    assert.equal(filePanelTarget({ vaultId: "notes", path: "../x.md" }), null);
    assert.deepEqual(graphPanelTarget({ vaultId: "notes", paths: ["Beta.md"] }), {
      vaultId: "notes",
      paths: ["Beta.md"],
    });
    assert.deepEqual(parseVaultFileAttributes({ vault: "notes", path: "folder/Beta.md" }), {
      vaultId: "notes",
      path: "folder/Beta.md",
    });
    assert.deepEqual(parseVaultGraphAttributes({ vault: "notes", paths: "" }), {
      vaultId: "notes",
      paths: [],
    });
    assert.equal(vaultFileDirective('bad"id', "a.md"), null);
    assert.equal(vaultGraphDirective("notes", ["a.md"]), '::vault-graph{vault="notes" paths="a.md"}');
  });

  it("claims a directive open once", () => {
    const storage = new Map<string, string>();
    const box = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    };
    assert.equal(claimDirectiveOpen(box, "k"), true);
    assert.equal(claimDirectiveOpen(box, "k"), false);
    releaseDirectiveOpen(box, "k");
    assert.equal(claimDirectiveOpen(box, "k"), true);
  });
});

describe("graph highlight", () => {
  it("paints an agent mark bright red, with no ring and no forced label", () => {
    const nodes = [{ path: "a.md" }, { path: "b.md" }, { path: "c.md" }];
    assert.deepEqual([...highlightedNodeIndices(nodes, ["b.md", "missing.md", "b.md"])], [1]);
    const marked = graphNodeEmphasis({
      index: 1,
      selected: 0,
      marked: true,
      focused: true,
      appearance: { color: "#111", opacity: 0.4 },
      selectedColor: "#8b5cf6",
    });
    assert.deepEqual(marked, { color: "#ff4d4d", alpha: 1, ring: false, glow: true });
    const dimmed = graphNodeEmphasis({
      index: 2,
      selected: 0,
      marked: false,
      focused: false,
      appearance: { color: "#111", opacity: 0.4 },
      selectedColor: "#8b5cf6",
    });
    assert.equal(dimmed.alpha, 0.4 * 0.28);
    assert.equal(dimmed.glow, false);
    assert.equal(graphLabelHidden(1, -1, 0), true);
    assert.equal(graphLabelHidden(0, -1, 0), false);
  });
});
