export type HiddenListPrefs = {
  showHidden: boolean;
  names: readonly string[];
};

export function showHiddenFromStorage(stored: string | null): boolean {
  return stored === "1";
}

/** A bare file or folder name. Paths, `.`, and `..` are rejected. */
export function acceptHiddenName(input: string): string | null {
  const name = input.trim().normalize("NFC");
  if (name === "" || name === "." || name === "..") return null;
  if (/[\\/\u0000-\u001f]/.test(name)) return null;
  return name;
}

export function parseHiddenNames(raw: string | null): string[] {
  if (raw === null || raw === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (typeof item !== "string") continue;
    const name = acceptHiddenName(item);
    if (name === null || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/** True when any path segment is a dot name or an exact extra name. */
export function entryIsHidden(path: string, names: readonly string[]): boolean {
  const hidden = new Set(names.map((name) => name.normalize("NFC")));
  for (const part of path.normalize("NFC").split("/")) {
    if (part.startsWith(".") || hidden.has(part)) return true;
  }
  return false;
}

export function listedEntryVisible(path: string, prefs: HiddenListPrefs): boolean {
  if (prefs.showHidden) return true;
  return !entryIsHidden(path, prefs.names);
}
