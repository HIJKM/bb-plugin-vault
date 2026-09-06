import { extractWikiTargets, resolveWikiTarget, type WikiEntry } from "./wiki-links.ts";

export type GraphNode = {
  path: string;
  name: string;
};

export type GraphEdge = {
  from: string;
  to: string;
};

function displayName(path: string, name: string): string {
  const base = name.trim() === "" ? path.slice(path.lastIndexOf("/") + 1) : name;
  return base.replace(/\.(md|markdown)$/iu, "");
}

export function buildNoteGraph(
  notes: readonly { path: string; name: string; content: string }[],
  entries: readonly WikiEntry[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeSet = new Set(notes.map((note) => note.path));
  const nodes = notes.map((note) => ({ path: note.path, name: displayName(note.path, note.name) }));
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const note of notes) {
    for (const target of extractWikiTargets(note.content)) {
      const resolved = resolveWikiTarget(target, entries);
      if (resolved === null || resolved === note.path || !nodeSet.has(resolved)) continue;
      const key = `${note.path}\0${resolved}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: note.path, to: resolved });
    }
  }
  return { nodes, edges };
}
