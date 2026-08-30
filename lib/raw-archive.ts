export const RAW_ARCHIVE_RELATIVE = "automation/raw-archive.jsonl";

const RAW_HASH = /^[0-9a-f]{64}$/iu;
const TIMESTAMP_PREFIX = /^\d{8}-\d{6}-/u;

export function isRawHash(value: string): boolean {
  return RAW_HASH.test(value.trim());
}

function safeArchivePath(value: string): string | null {
  const path = value.trim().replaceAll("\\", "/").normalize("NFC");
  if (path === "" || path.startsWith("/")) return null;
  const parts = path.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return null;
  return path;
}

export function parseRawArchiveJsonl(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      continue;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const rec = parsed as Record<string, unknown>;
    const hash = typeof rec.hash === "string" ? rec.hash.trim().toLowerCase() : "";
    const path = typeof rec.path === "string" ? safeArchivePath(rec.path) : null;
    if (!isRawHash(hash) || path === null) continue;
    map[hash] = path;
  }
  return map;
}

export function rawArchiveLabel(path: string): string {
  const cut = path.lastIndexOf("/");
  const name = (cut === -1 ? path : path.slice(cut + 1)).replace(/\.(md|markdown)$/iu, "");
  return name.replace(TIMESTAMP_PREFIX, "");
}
