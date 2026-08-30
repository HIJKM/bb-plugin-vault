export const VAULT_LINK_PREFIX = "#vault-link/";

const DOC_EXT = /\.(md|markdown)$/iu;
const WIKI_LINK =
  /(?<!!)\[\[([^\]|#\n]+?)(?:#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/gu;

export type WikiEntry = {
  kind: "file" | "directory";
  path: string;
  name: string;
};

function normalize(value: string): string {
  return value.normalize("NFC").trim().replaceAll("\\", "/").replace(/\/+/gu, "/");
}

function stripDocExt(value: string): string {
  return value.replace(DOC_EXT, "");
}

function basename(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? path : path.slice(cut + 1);
}

function pickShortest(hits: readonly WikiEntry[]): string | null {
  if (hits.length === 0) return null;
  const sorted = [...hits].sort((a, b) => {
    const byLen = a.path.length - b.path.length;
    if (byLen !== 0) return byLen;
    return a.path.localeCompare(b.path, "ko");
  });
  return sorted[0]?.path ?? null;
}

function pathMatches(path: string, target: string): boolean {
  const p = normalize(path);
  const t = target;
  if (p === t || p === `${t}.md` || p === `${t}.markdown`) return true;
  return stripDocExt(p) === t;
}

export function resolveWikiTarget(
  rawTarget: string,
  entries: readonly WikiEntry[],
): string | null {
  const target = stripDocExt(normalize(rawTarget));
  if (target === "" || target.includes("..")) return null;
  const files = entries.filter((entry) => entry.kind === "file");
  const dirs = entries.filter((entry) => entry.kind === "directory");

  if (target.includes("/")) {
    const fileHits = files.filter((entry) => pathMatches(entry.path, target));
    if (fileHits.length === 0) {
      const lower = target.toLowerCase();
      fileHits.push(
        ...files.filter((entry) => stripDocExt(normalize(entry.path)).toLowerCase() === lower),
      );
    }
    const filePath = pickShortest(fileHits);
    if (filePath !== null) return filePath;
    const dirHits = dirs.filter((entry) => normalize(entry.path) === target);
    return pickShortest(dirHits.length > 0 ? dirHits : dirs.filter((entry) => normalize(entry.path).toLowerCase() === target.toLowerCase()));
  }

  const lower = target.toLowerCase();
  const nameHits = files.filter((entry) => {
    const byName = stripDocExt(normalize(entry.name)).toLowerCase() === lower;
    const byBase = stripDocExt(normalize(basename(entry.path))).toLowerCase() === lower;
    return byName || byBase;
  });
  const filePath = pickShortest(nameHits);
  if (filePath !== null) return filePath;
  const dirHits = dirs.filter((entry) => normalize(entry.name).toLowerCase() === lower);
  return pickShortest(dirHits);
}

function escapeMdLabel(label: string): string {
  return label.replace(/[\\[\]]/gu, "\\$&");
}

export function rewriteWikiLinkText(text: string, entries: readonly WikiEntry[]): string {
  return text.replace(WIKI_LINK, (whole, target: string, alias?: string) => {
    const path = resolveWikiTarget(target, entries);
    if (path === null) return whole;
    const label = (alias ?? target).trim() || target.trim();
    return `[${escapeMdLabel(label)}](${VAULT_LINK_PREFIX}${encodeURIComponent(path)})`;
  });
}

function nextFence(source: string, from: number): { start: number; open: string } | null {
  const tick = source.indexOf("```", from);
  const tilde = source.indexOf("~~~", from);
  if (tick === -1 && tilde === -1) return null;
  if (tick === -1) return { start: tilde, open: "~~~" };
  if (tilde === -1) return { start: tick, open: "```" };
  return tick < tilde ? { start: tick, open: "```" } : { start: tilde, open: "~~~" };
}

/** Apply `rewrite` to markdown outside fenced and inline code. */
export function mapMarkdownPlain(source: string, rewrite: (plain: string) => string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const fence = nextFence(source, i);
    const tick = source.indexOf("`", i);
    const fenceStart = fence?.start ?? -1;
    let cut = n;
    if (fenceStart !== -1) cut = Math.min(cut, fenceStart);
    if (tick !== -1) cut = Math.min(cut, tick);
    if (cut > i) {
      out += rewrite(source.slice(i, cut));
      i = cut;
      continue;
    }
    if (fence !== null && fence.start === i) {
      const closer = "\n" + fence.open;
      const end = source.indexOf(closer, i + 3);
      if (end === -1) {
        out += source.slice(i);
        break;
      }
      let j = end + closer.length;
      while (j < n && source[j] !== "\n") j += 1;
      out += source.slice(i, j);
      i = j;
      continue;
    }
    let ticks = 1;
    while (i + ticks < n && source[i + ticks] === "`") ticks += 1;
    const close = source.indexOf("`".repeat(ticks), i + ticks);
    if (close === -1) {
      out += source.slice(i);
      break;
    }
    out += source.slice(i, close + ticks);
    i = close + ticks;
  }
  return out;
}

/** Rewrite Obsidian wiki links in markdown, leaving fenced/inline code alone. */
export function rewriteWikiLinks(source: string, entries: readonly WikiEntry[]): string {
  return mapMarkdownPlain(source, (text) => rewriteWikiLinkText(text, entries));
}

export function parseVaultLinkHref(href: string | null | undefined): string | null {
  if (href === null || href === undefined || href === "") return null;
  const hashIndex = href.indexOf("#");
  const hash = hashIndex === -1 ? href : href.slice(hashIndex);
  if (!hash.startsWith(VAULT_LINK_PREFIX)) return null;
  const encoded = hash.slice(VAULT_LINK_PREFIX.length);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded === "" ? null : encoded;
  }
}
