export type WikiMention = {
  target: string;
  alias: string | null;
};

const WIKI = /\[\[([^\]|#\n]+?)(?:#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/gu;

export function splitMarkdownFrontmatter(source: string): { frontmatter: string | null; body: string } {
  const match = source.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n/);
  if (match === null || match[1] === undefined) return { frontmatter: null, body: source };
  return { frontmatter: match[1], body: source.slice(match[0].length).replace(/^\r?\n+/u, "") };
}

function mentionsIn(text: string): WikiMention[] {
  const found: WikiMention[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(WIKI)) {
    const target = (match[1] ?? "").trim();
    if (target === "" || seen.has(target)) continue;
    seen.add(target);
    const alias = match[2]?.trim() ?? "";
    found.push({ target, alias: alias === "" ? null : alias });
  }
  return found;
}

function fieldBlock(frontmatter: string, field: string): string {
  const header = new RegExp(`^${field}:[ \t]*(.*)$`, "im");
  const found = header.exec(frontmatter);
  if (found === null || found.index === undefined) return "";
  const first = found[1] ?? "";
  const after = frontmatter.slice(found.index + found[0].length);
  const next = after.search(/^[A-Za-z0-9_-]+:/m);
  const rest = next === -1 ? after : after.slice(0, next);
  return `${first}\n${rest}`;
}

export function frontmatterWikiMentions(frontmatter: string, field: string): WikiMention[] {
  return mentionsIn(fieldBlock(frontmatter, field));
}

export function mentionLabel(mention: WikiMention): string {
  return mention.alias ?? mention.target;
}
