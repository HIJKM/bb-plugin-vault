export type FilterScope = "folder" | "all";

const KEY = "vault-filter-scope";

export function readFilterScope(): FilterScope {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "folder" || raw === "all") return raw;
  } catch {
    // ignore quota / private mode
  }
  return "all";
}

export function storeFilterScope(scope: FilterScope): void {
  try {
    localStorage.setItem(KEY, scope);
  } catch {
    // ignore quota / private mode
  }
}
