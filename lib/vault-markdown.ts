import { isImageFileName } from "./image-file";
import { joinPreviewUrl } from "./preview-url";
import {
  mapMarkdownPlain,
  resolveWikiTarget,
  rewriteWikiLinkText,
  type WikiEntry,
} from "./wiki-links";

const WIKI_EMBED = /!\[\[([^\]|#\n]+?)(?:#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/gu;
const MD_IMAGE =
  /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/gu;

function parentDir(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

function basename(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? path : path.slice(cut + 1);
}

function isRemoteHref(href: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:/iu.test(href) ||
    href.startsWith("//") ||
    href.startsWith("#") ||
    href.startsWith("/api/")
  );
}

/** Resolve a markdown href against the current document, staying inside the vault. */
export function resolveVaultRelative(docPath: string, href: string): string | null {
  const raw = href.trim().replaceAll("\\", "/");
  if (raw === "" || isRemoteHref(raw)) return null;
  const fromRoot = raw.startsWith("/");
  const start = fromRoot ? "" : parentDir(docPath);
  const joined = fromRoot ? raw.replace(/^\/+/u, "") : start === "" ? raw.replace(/^\.\//u, "") : `${start}/${raw}`;
  const out: string[] = [];
  for (const part of joined.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
}

function sizeLikeAlias(part: string): boolean {
  return /^\d+$/u.test(part) || /^(center|left|right)$/iu.test(part);
}

function embedAlt(target: string, alias: string | undefined): string {
  if (alias !== undefined) {
    const parts = alias
      .split("|")
      .map((part) => part.trim())
      .filter((part) => part !== "" && !sizeLikeAlias(part));
    if (parts.length > 0) return parts.join(" ");
  }
  return basename(target);
}

function imageMarkdown(alt: string, url: string): string {
  const safe = alt.replace(/\[/gu, "\\[").replace(/\]/gu, "\\]");
  return `![${safe}](${url})`;
}

function rewriteWikiEmbeds(
  text: string,
  entries: readonly WikiEntry[],
  previewBaseUrl: string,
): string {
  return text.replace(WIKI_EMBED, (whole, target: string, alias?: string) => {
    const path = resolveWikiTarget(target, entries);
    if (path === null || !isImageFileName(path)) return whole;
    return imageMarkdown(embedAlt(target, alias), joinPreviewUrl(previewBaseUrl, path));
  });
}

function rewriteMarkdownImages(text: string, docPath: string, previewBaseUrl: string): string {
  return text.replace(MD_IMAGE, (whole, alt: string, href: string) => {
    if (isRemoteHref(href)) return whole;
    const path = resolveVaultRelative(docPath, href);
    if (path === null || !isImageFileName(path)) return whole;
    return imageMarkdown(alt, joinPreviewUrl(previewBaseUrl, path));
  });
}

export function rewriteVaultMarkdown(
  source: string,
  options: {
    entries: readonly WikiEntry[];
    docPath: string;
    previewBaseUrl: string | null;
  },
): string {
  const { entries, docPath, previewBaseUrl } = options;
  return mapMarkdownPlain(source, (plain) => {
    let text = plain;
    if (previewBaseUrl !== null) {
      text = rewriteWikiEmbeds(text, entries, previewBaseUrl);
    }
    text = rewriteWikiLinkText(text, entries);
    if (previewBaseUrl !== null) {
      text = rewriteMarkdownImages(text, docPath, previewBaseUrl);
    }
    return text;
  });
}
