export const PANEL_OPEN_CHANNEL = "panel-open";
export const FILE_ACTION_ID = "file";
export const GRAPH_ACTION_ID = "graph";
export const VAULT_PANEL_PATH = "docs";
export const THREAD_VAULT_ACTION_ID = "vault";
export const MAX_HIGHLIGHT_PATHS = 40;

const KNOWN_EXT = /\.(md|markdown|html|htm|txt)$/iu;
const MARKDOWN_EXT = /\.(md|markdown)$/iu;

export type VaultChoice = { id: string; name: string };
export type VaultFileEntry = { kind: "file" | "directory"; path: string; name: string };

export type PanelOpenRequest =
  | {
      threadId: string;
      action: "file";
      vaultId: string;
      path: string;
      title: string;
      nonce: string;
    }
  | {
      threadId: string;
      action: "graph";
      vaultId: string;
      paths: string[];
      title: string;
      nonce: string;
    };

export type OpenDeps = {
  loadVaults: () => Promise<readonly VaultChoice[]>;
  listEntries: (vaultId: string) => Promise<readonly VaultFileEntry[]>;
  publish: (payload: PanelOpenRequest) => void;
  nonce?: () => string;
};

export type ToolText = string | { content: [{ type: "text"; text: string }]; isError: true };

type PathHit = { ok: true; path: string; name: string } | { ok: false; message: string };
type GraphHit = { ok: true; paths: string[] } | { ok: false; message: string };

export type OpenClaimStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function toolError(text: string): ToolText {
  return { content: [{ type: "text", text }], isError: true };
}

function fold(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en");
}

function basename(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? path : path.slice(cut + 1);
}

function stripKnownExt(path: string): string {
  return path.replace(KNOWN_EXT, "");
}

function isMarkdown(path: string): boolean {
  return MARKDOWN_EXT.test(path);
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

export function normalizeVaultPath(input: string): string | null {
  const decoded = input.normalize("NFC").trim().replaceAll("\\", "/").split("/").map(decodeSegment).join("/");
  const value = decoded.replace(/^\/+/u, "").replace(/\/+$/u, "").replace(/\/+/gu, "/");
  if (value === "") return null;
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === ".." || part.startsWith("."))) return null;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clipTitle(title: string): string {
  const trimmed = title.trim();
  const value = trimmed === "" ? "파일" : trimmed;
  return value.length > 80 ? value.slice(0, 80) : value;
}

export function fileTitle(path: string): string {
  return clipTitle(stripKnownExt(basename(path)));
}

function defaultNonce(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function directiveSafe(value: string): boolean {
  return value !== "" && !/["{}\n\r|]/u.test(value);
}

export function chooseVault(
  vaults: readonly VaultChoice[],
  vaultId: string | undefined,
): { ok: true; vault: VaultChoice } | { ok: false; message: string } {
  if (vaults.length === 0) return { ok: false, message: "등록된 볼트가 없습니다." };
  const wanted = vaultId?.trim() ?? "";
  if (wanted === "") {
    if (vaults.length === 1) return { ok: true, vault: vaults[0]! };
    const list = vaults.map((vault) => `${vault.name} (${vault.id})`).join(", ");
    return { ok: false, message: `볼트가 여러 개입니다. vaultId를 지정하세요: ${list}` };
  }
  const byId = vaults.find((vault) => vault.id === wanted);
  if (byId !== undefined) return { ok: true, vault: byId };
  const byName = vaults.filter((vault) => fold(vault.name) === fold(wanted));
  if (byName.length === 1) return { ok: true, vault: byName[0]! };
  if (byName.length > 1) {
    return { ok: false, message: `같은 이름의 볼트가 여러 개입니다: ${byName.map((vault) => vault.id).join(", ")}` };
  }
  return { ok: false, message: `없는 볼트입니다: ${wanted}` };
}

function matchesFile(entry: VaultFileEntry, requested: string, insensitive: boolean): boolean {
  const path = insensitive ? fold(entry.path) : entry.path;
  const want = insensitive ? fold(requested) : requested;
  if (path === want) return true;
  const slashed = want.includes("/");
  if (slashed && (stripKnownExt(path) === want || path.endsWith(`/${want}`) || stripKnownExt(path).endsWith(`/${stripKnownExt(want)}`))) {
    return true;
  }
  if (!slashed) {
    const base = insensitive ? fold(stripKnownExt(basename(entry.path))) : stripKnownExt(basename(entry.path));
    const name = insensitive ? fold(entry.name) : entry.name;
    const bare = stripKnownExt(want);
    return base === bare || name === bare || name === want;
  }
  return false;
}

export function resolveFilePath(entries: readonly VaultFileEntry[], requested: string): PathHit {
  const path = normalizeVaultPath(requested);
  if (path === null) return { ok: false, message: "경로가 올바르지 않습니다." };
  const directory = entries.some(
    (entry) => entry.kind === "directory" && (entry.path === path || fold(entry.path) === fold(path)),
  );
  const files = entries.filter((entry) => entry.kind === "file");
  const sensitive = files.filter((entry) => matchesFile(entry, path, false));
  const hits = sensitive.length > 0 ? sensitive : files.filter((entry) => matchesFile(entry, path, true));
  if (hits.length > 1) {
    return { ok: false, message: `경로가 여러 개입니다: ${hits.map((entry) => entry.path).join(", ")}` };
  }
  if (hits.length === 0) {
    if (directory) return { ok: false, message: `폴더입니다. 파일을 지정하세요: ${path}` };
    return { ok: false, message: `파일을 찾지 못했습니다: ${path}` };
  }
  const hit = hits[0]!;
  return { ok: true, path: hit.path, name: hit.name };
}

export function resolveGraphPaths(entries: readonly VaultFileEntry[], requested: readonly string[]): GraphHit {
  if (requested.length > MAX_HIGHLIGHT_PATHS) {
    return { ok: false, message: `강조할 노트는 ${MAX_HIGHLIGHT_PATHS}개까지입니다.` };
  }
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const item of requested) {
    const hit = resolveFilePath(entries, item);
    if (!hit.ok) return hit;
    if (!isMarkdown(hit.path)) return { ok: false, message: `그래프 노트가 아닙니다: ${hit.path}` };
    if (seen.has(hit.path)) continue;
    seen.add(hit.path);
    paths.push(hit.path);
  }
  return { ok: true, paths };
}

export function vaultFileDirective(vaultId: string, path: string): string | null {
  if (!directiveSafe(vaultId) || !directiveSafe(path)) return null;
  return `::vault-file{vault="${vaultId}" path="${path}"}`;
}

export function vaultGraphDirective(vaultId: string, paths: readonly string[]): string | null {
  if (!directiveSafe(vaultId) || paths.some((path) => !directiveSafe(path))) return null;
  return `::vault-graph{vault="${vaultId}" paths="${paths.join("|")}"}`;
}

function readPaths(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_HIGHLIGHT_PATHS) return null;
  const paths: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const path = normalizeVaultPath(item);
    if (path === null) return null;
    paths.push(path);
  }
  return paths;
}

export function filePanelTarget(params: unknown): { vaultId: string; path: string } | null {
  if (!isRecord(params) || typeof params.vaultId !== "string" || typeof params.path !== "string") return null;
  const vaultId = params.vaultId.trim();
  const path = normalizeVaultPath(params.path);
  if (vaultId === "" || path === null) return null;
  return { vaultId, path };
}

export function graphPanelTarget(params: unknown): { vaultId: string; paths: string[] } | null {
  if (!isRecord(params) || typeof params.vaultId !== "string") return null;
  const vaultId = params.vaultId.trim();
  const paths = readPaths(params.paths);
  if (vaultId === "" || paths === null) return null;
  return { vaultId, paths };
}

export function parseVaultFileAttributes(
  attributes: Readonly<Record<string, string>>,
): { vaultId: string; path: string } | null {
  return filePanelTarget({ vaultId: attributes.vault ?? "", path: attributes.path ?? "" });
}

export function parseVaultGraphAttributes(
  attributes: Readonly<Record<string, string>>,
): { vaultId: string; paths: string[] } | null {
  const vaultId = (attributes.vault ?? "").trim();
  if (vaultId === "") return null;
  const raw = attributes.paths ?? "";
  if (raw.trim() === "") return { vaultId, paths: [] };
  return graphPanelTarget({ vaultId, paths: raw.split("|") });
}

export function parsePanelOpenRequest(value: unknown): PanelOpenRequest | null {
  if (!isRecord(value)) return null;
  const threadId = typeof value.threadId === "string" ? value.threadId.trim() : "";
  const vaultId = typeof value.vaultId === "string" ? value.vaultId.trim() : "";
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const nonce = typeof value.nonce === "string" ? value.nonce.trim() : "";
  if (threadId === "" || vaultId === "" || title === "" || title.length > 80 || nonce === "" || nonce.length > 80) {
    return null;
  }
  if (value.action === "file" && typeof value.path === "string") {
    const path = normalizeVaultPath(value.path);
    if (path === null) return null;
    return { threadId, action: "file", vaultId, path, title, nonce };
  }
  if (value.action === "graph") {
    const paths = readPaths(value.paths);
    if (paths === null) return null;
    return { threadId, action: "graph", vaultId, paths, title, nonce };
  }
  return null;
}

export function panelOpenOptions(request: PanelOpenRequest): {
  actionId: string;
  title: string;
  params: { vaultId: string; path: string } | { vaultId: string; paths: string[] };
} {
  if (request.action === "file") {
    return {
      actionId: FILE_ACTION_ID,
      title: request.title,
      params: { vaultId: request.vaultId, path: request.path },
    };
  }
  return {
    actionId: GRAPH_ACTION_ID,
    title: request.title,
    params: { vaultId: request.vaultId, paths: request.paths },
  };
}

function successText(lines: string[], directive: string | null): string {
  const body = [...lines];
  if (directive === null) {
    body.push("경로에 지시문으로 보낼 수 없는 문자가 있어 채팅 지시문은 생략했습니다.");
  } else {
    body.push("답변에 다음 한 줄을 그대로 포함하세요.");
    body.push(directive);
  }
  return body.join("\n");
}

export async function openVaultFile(
  input: { vaultId?: string; path: string },
  ctx: { threadId: string },
  deps: OpenDeps,
): Promise<ToolText> {
  if (ctx.threadId.trim() === "") return toolError("이 호출에는 스레드가 없습니다.");
  let vaults: readonly VaultChoice[];
  try {
    vaults = await deps.loadVaults();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "볼트 목록을 읽지 못했습니다.";
    return toolError(message);
  }
  const chosen = chooseVault(vaults, input.vaultId);
  if (!chosen.ok) return toolError(chosen.message);
  let entries: readonly VaultFileEntry[];
  try {
    entries = await deps.listEntries(chosen.vault.id);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "볼트 목록을 읽지 못했습니다.";
    return toolError(message);
  }
  const file = resolveFilePath(entries, input.path);
  if (!file.ok) return toolError(file.message);
  const request: PanelOpenRequest = {
    threadId: ctx.threadId,
    action: "file",
    vaultId: chosen.vault.id,
    path: file.path,
    title: clipTitle(file.name),
    nonce: deps.nonce?.() ?? defaultNonce(),
  };
  deps.publish(request);
  return successText(
    [
      "오른쪽 패널의 Vault에서 파일을 열도록 요청했습니다.",
      "플러그인 전체 페이지로는 이동하지 않습니다.",
      `볼트: ${chosen.vault.name} (${chosen.vault.id})`,
      `파일: ${file.path}`,
    ],
    vaultFileDirective(chosen.vault.id, file.path),
  );
}

export async function openVaultGraph(
  input: { vaultId?: string; paths?: readonly string[] },
  ctx: { threadId: string },
  deps: OpenDeps,
): Promise<ToolText> {
  if (ctx.threadId.trim() === "") return toolError("이 호출에는 스레드가 없습니다.");
  let vaults: readonly VaultChoice[];
  try {
    vaults = await deps.loadVaults();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "볼트 목록을 읽지 못했습니다.";
    return toolError(message);
  }
  const chosen = chooseVault(vaults, input.vaultId);
  if (!chosen.ok) return toolError(chosen.message);
  let entries: readonly VaultFileEntry[];
  try {
    entries = await deps.listEntries(chosen.vault.id);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "볼트 목록을 읽지 못했습니다.";
    return toolError(message);
  }
  const notes = resolveGraphPaths(entries, input.paths ?? []);
  if (!notes.ok) return toolError(notes.message);
  const request: PanelOpenRequest = {
    threadId: ctx.threadId,
    action: "graph",
    vaultId: chosen.vault.id,
    paths: notes.paths,
    title: notes.paths.length === 0 ? "3D 그래프" : `그래프 · ${notes.paths.length}`,
    nonce: deps.nonce?.() ?? defaultNonce(),
  };
  deps.publish(request);
  const listed = notes.paths.length === 0 ? "강조 없음" : notes.paths.join(", ");
  return successText(
    [
      "오른쪽 패널의 Vault에서 3D 그래프를 열도록 요청했습니다.",
      "플러그인 전체 페이지로는 이동하지 않습니다.",
      "표시한 노트는 연결선 없이 밝은 붉은색으로 켜집니다.",
      "같은 볼트에서 다시 호출하면 그래프를 다시 그리지 않고 그 노드만 추가로 켭니다.",
      `볼트: ${chosen.vault.name} (${chosen.vault.id})`,
      `노트: ${listed}`,
    ],
    vaultGraphDirective(chosen.vault.id, notes.paths),
  );
}

export function claimDirectiveOpen(storage: OpenClaimStorage, key: string): boolean {
  try {
    if (storage.getItem(key) === "1") return false;
    storage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}

export function releaseDirectiveOpen(storage: OpenClaimStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Private mode can reject storage. The next mount may open the panel again.
  }
}
