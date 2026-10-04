const KEY = "bb-plugin-vault:list-scroll:v1";
const MAX_BYTES = 8 * 1024;

let memory: Record<string, number> | undefined;

function load(): Record<string, number> {
  if (memory !== undefined) return memory;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null || raw === "") {
      memory = {};
      return memory;
    }
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      memory = {};
      return memory;
    }
    const next: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        next[id] = Math.round(value);
      }
    }
    memory = next;
    return memory;
  } catch {
    memory = {};
    return memory;
  }
}

function persist(map: Record<string, number>): void {
  memory = map;
  try {
    const json = JSON.stringify(map);
    if (json.length > MAX_BYTES) return;
    if (Object.keys(map).length === 0) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, json);
  } catch {
    // memory only
  }
}

export function listScrollKey(vaultId: string | null, folder: string): string {
  return `${vaultId ?? ""}:${folder}`;
}

export function readListScroll(id: string): number {
  return load()[id] ?? 0;
}

export function writeListScroll(id: string, top: number): void {
  const map = { ...load() };
  const next = Math.max(0, Math.round(top));
  if (next === 0) delete map[id];
  else map[id] = next;
  persist(map);
}
