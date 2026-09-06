import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildNoteGraph } from "./note-graph.ts";
import { extractWikiTargets } from "./wiki-links.ts";

describe("extractWikiTargets", () => {
  it("reads wiki targets and aliases, and skips code", () => {
    const source = [
      "See [[Alpha]] and [[Folder/Beta|B]].",
      "",
      "```",
      "[[Gamma]]",
      "```",
      "",
      "Inline `[[Delta]]` stays put.",
      "Embed ![[Epsilon]] is not a graph edge.",
    ].join("\n");
    assert.deepEqual(extractWikiTargets(source), ["Alpha", "Folder/Beta"]);
  });
});

describe("buildNoteGraph", () => {
  it("connects notes by resolved wiki links and keeps orphans", () => {
    const notes = [
      { path: "Alpha.md", name: "Alpha.md", content: "[[Beta]] [[Missing]] [[Alpha]]" },
      { path: "Beta.md", name: "Beta.md", content: "no links" },
      { path: "Gamma.md", name: "Gamma.md", content: "" },
    ];
    const entries = notes.map((note) => ({
      kind: "file" as const,
      path: note.path,
      name: note.name,
    }));
    const graph = buildNoteGraph(notes, entries);
    assert.deepEqual(
      graph.nodes.map((node) => node.path),
      ["Alpha.md", "Beta.md", "Gamma.md"],
    );
    assert.deepEqual(graph.edges, [{ from: "Alpha.md", to: "Beta.md" }]);
  });
});
