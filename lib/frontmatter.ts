export type FrontmatterItem =
  | { kind: "text"; text: string }
  | { kind: "wiki"; target: string; alias: string | null };

export type FrontmatterField = {
  key: string;
  items: FrontmatterItem[];
};

const WIKI_ONLY = /^\[\[([^\]|#\n]+?)(?:#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]$/u;

export function splitMarkdownFrontmatter(source: string): { frontmatter: string | null; body: string } {
  const match = source.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n/);
  if (match === null || match[1] === undefined) return { frontmatter: null, body: source };
  return { frontmatter: match[1], body: source.slice(match[0].length).replace(/^\r?\n+/u, "") };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function partToItem(part: string): FrontmatterItem | null {
  const raw = unquote(part);
  if (raw === "" || raw === "[]") return null;
  const wiki = WIKI_ONLY.exec(raw);
  if (wiki !== null && wiki[1] !== undefined) {
    const alias = wiki[2]?.trim() ?? "";
    return { kind: "wiki", target: wiki[1].trim(), alias: alias === "" ? null : alias };
  }
  return { kind: "text", text: raw };
}

function parseFlowList(raw: string): string[] {
  let s = raw.trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const parts: string[] = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /[\s,]/u.test(s[i] ?? "")) i += 1;
    if (i >= s.length) break;
    if (s.startsWith("[[", i)) {
      const end = s.indexOf("]]", i);
      if (end === -1) {
        parts.push(s.slice(i).trim());
        break;
      }
      parts.push(s.slice(i, end + 2));
      i = end + 2;
      continue;
    }
    const quote = s[i];
    if (quote === '"' || quote === "'") {
      const end = s.indexOf(quote, i + 1);
      if (end === -1) {
        parts.push(s.slice(i));
        break;
      }
      parts.push(s.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    const comma = s.indexOf(",", i);
    const chunk = (comma === -1 ? s.slice(i) : s.slice(i, comma)).trim();
    if (chunk !== "") parts.push(chunk);
    if (comma === -1) break;
    i = comma + 1;
  }
  return parts;
}

function chunksToItems(chunks: readonly string[]): FrontmatterItem[] {
  const items: FrontmatterItem[] = [];
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (trimmed === "" || trimmed === "[]") continue;
    const parts = trimmed.startsWith("[") ? parseFlowList(trimmed) : [trimmed];
    for (const part of parts) {
      const item = partToItem(part);
      if (item !== null) items.push(item);
    }
  }
  return items;
}

export function parseFrontmatterFields(frontmatter: string): FrontmatterField[] {
  const fields: FrontmatterField[] = [];
  let current: { key: string; chunks: string[] } | null = null;

  const flush = (): void => {
    if (current === null) return;
    const items = chunksToItems(current.chunks);
    if (items.length > 0) fields.push({ key: current.key, items });
    current = null;
  };

  for (const line of frontmatter.split(/\r?\n/u)) {
    const keyed = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/u.exec(line);
    if (keyed !== null && keyed[1] !== undefined) {
      flush();
      current = { key: keyed[1], chunks: [] };
      const rest = (keyed[2] ?? "").trim();
      if (rest !== "") current.chunks.push(rest);
      continue;
    }
    if (current === null) continue;
    const bullet = /^\s+-\s+(.*)$/u.exec(line);
    if (bullet !== null) {
      current.chunks.push((bullet[1] ?? "").trim());
      continue;
    }
    if (/^\s+\S/u.test(line)) current.chunks.push(line.trim());
  }
  flush();
  return fields;
}

const FIELD_LABELS: Record<string, string> = {
  title: "제목",
  type: "유형",
  status: "상태",
  tags: "태그",
  created: "만든 날",
  updated: "고친 날",
  sources: "출처",
  related: "관련",
  raw: "원본",
};

export function frontmatterFieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

export function itemLabel(item: FrontmatterItem): string {
  if (item.kind === "text") return item.text;
  return item.alias ?? item.target;
}
