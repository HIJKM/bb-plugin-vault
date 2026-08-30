const KEY = "bb-plugin-docs-reader:last-route:v1";
const MAX_BYTES = 8 * 1024;

let memory: string | undefined;

export function readSessionRoute(): string {
  if (memory !== undefined) return memory;
  try {
    const raw = sessionStorage.getItem(KEY);
    memory = raw ?? "";
    return memory;
  } catch {
    memory = "";
    return "";
  }
}

export function writeSessionRoute(subPath: string): void {
  memory = subPath;
  try {
    if (subPath === "") {
      sessionStorage.removeItem(KEY);
      return;
    }
    if (subPath.length > MAX_BYTES) return;
    sessionStorage.setItem(KEY, subPath);
  } catch {
    // memory only
  }
}
