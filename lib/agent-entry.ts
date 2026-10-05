import { VAULT_PANEL_PATH, type PanelOpenRequest } from "./panel-open.ts";

const VAULT_DOCS_MARKER = "/plugins/vault/docs";

export type AgentEntry =
  | {
      action: "file";
      threadId: string;
      vaultId: string;
      path: string;
      nonce: string;
    }
  | {
      action: "graph";
      threadId: string;
      vaultId: string;
      paths: readonly string[];
      nonce: string;
    };

export type AgentSnapshot = {
  entry: AgentEntry | null;
  lights: Readonly<Record<string, readonly string[]>>;
};

type PendingRoute = { action: "file" | "graph"; vaultId: string; path: string };

let entry: AgentEntry | null = null;
let armedVaultId: string | null = null;
let pendingRoute: PendingRoute | null = null;
const lights = new Map<string, readonly string[]>();
const listeners = new Set<() => void>();

function publish(): void {
  for (const listener of listeners) listener();
}

function decodeSegment(segment: string): string {
  let current = segment;
  for (let i = 0; i < 3; i += 1) {
    if (!/%[0-9A-Fa-f]{2}/u.test(current)) break;
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current.normalize("NFC");
}

function vaultDocsRest(pathname: string): string | null {
  const index = pathname.indexOf(VAULT_DOCS_MARKER);
  if (index === -1) return null;
  const rest = pathname.slice(index + VAULT_DOCS_MARKER.length).replace(/^\/+/u, "").replace(/\/+$/u, "");
  if (rest === "") return "";
  return rest.split("/").map(decodeSegment).join("/");
}

export function resetAgentEntry(): void {
  entry = null;
  armedVaultId = null;
  pendingRoute = null;
  lights.clear();
  publish();
}

export function readAgentEntry(): AgentEntry | null {
  return entry;
}

export function highlightPathsFor(vaultId: string): readonly string[] {
  return lights.get(vaultId) ?? [];
}

export function readAgentSnapshot(): AgentSnapshot {
  return { entry, lights: Object.fromEntries(lights) };
}

export function subscribeAgentEntry(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function mergeHighlightPaths(existing: readonly string[], incoming: readonly string[]): string[] {
  const seen = new Set(existing);
  const next = [...existing];
  for (const path of incoming) {
    if (seen.has(path)) continue;
    seen.add(path);
    next.push(path);
  }
  return next;
}

export function applyAgentEntry(request: PanelOpenRequest): AgentEntry {
  if (request.action === "file") {
    armedVaultId = null;
    pendingRoute = { action: "file", vaultId: request.vaultId, path: request.path };
    entry = {
      action: "file",
      threadId: request.threadId,
      vaultId: request.vaultId,
      path: request.path,
      nonce: request.nonce,
    };
    publish();
    return entry;
  }
  const merged = mergeHighlightPaths(lights.get(request.vaultId) ?? [], request.paths);
  lights.set(request.vaultId, merged);
  armedVaultId = request.vaultId;
  pendingRoute = { action: "graph", vaultId: request.vaultId, path: "" };
  entry = {
    action: "graph",
    threadId: request.threadId,
    vaultId: request.vaultId,
    paths: merged,
    nonce: request.nonce,
  };
  publish();
  return entry;
}

export function consumeAgentRoute(): PendingRoute | null {
  const next = pendingRoute;
  pendingRoute = null;
  return next;
}

export function consumeGraphOpen(vaultId: string | null): boolean {
  if (vaultId === null || armedVaultId !== vaultId) return false;
  armedVaultId = null;
  return true;
}

export function vaultPanelSubPath(next: AgentEntry): string {
  if (next.action === "graph" || next.path === "") return next.vaultId;
  return `${next.vaultId}/${next.path}`;
}

export function shouldEnterVaultRoute(pathname: string, next: AgentEntry): boolean {
  const rest = vaultDocsRest(pathname);
  if (rest === null) return true;
  if (next.action === "file") return rest !== vaultPanelSubPath(next);
  return !(rest === next.vaultId || rest.startsWith(`${next.vaultId}/`));
}

export function vaultNavigationFor(
  pathname: string,
  next: AgentEntry,
): { path: string; subPath: string } | null {
  if (!shouldEnterVaultRoute(pathname, next)) return null;
  return { path: VAULT_PANEL_PATH, subPath: vaultPanelSubPath(next) };
}
