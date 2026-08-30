import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

const vaultSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    hostId: z.string().nullable(),
    rootPath: z.string(),
  })
  .strict();

const entrySchema = z
  .object({
    kind: z.enum(["file", "directory"]),
    path: z.string(),
    name: z.string(),
  })
  .strict();

const vaultsOutput = z.object({ vaults: z.array(vaultSchema) }).strict();

export const rpcContract = defineRpcContract({
  listVaults: {
    input: z.null(),
    output: vaultsOutput,
  },
  addVault: {
    input: z
      .object({
        path: z.string().min(1),
        name: z.string().optional(),
      })
      .strict(),
    output: vaultsOutput,
  },
  removeVault: {
    input: z.object({ id: z.string().min(1) }).strict(),
    output: vaultsOutput,
  },
  reorderVaults: {
    input: z.object({ ids: z.array(z.string().min(1)).min(1) }).strict(),
    output: vaultsOutput,
  },
  listIndex: {
    input: z.object({ vaultId: z.string().min(1) }).strict(),
    output: z
      .object({
        vaultId: z.string(),
        entries: z.array(entrySchema),
      })
      .strict(),
  },
  readDoc: {
    input: z.object({ vaultId: z.string().min(1), path: z.string().min(1) }).strict(),
    output: z
      .object({
        vaultId: z.string(),
        path: z.string(),
        name: z.string(),
        content: z.string(),
        kind: z.enum(["markdown", "html", "text"]),
      })
      .strict(),
  },
});

const INDEX_TTL_MS = 60_000;

type CachedVaults = { at: number; vaults: z.infer<typeof vaultSchema>[] };
type CachedIndex = { at: number; entries: z.infer<typeof entrySchema>[] };

let vaultsCache: CachedVaults | null = null;
const indexCache = new Map<string, CachedIndex>();

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function basename(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? path : path.slice(cut + 1);
}

const DOC_EXT = /\.(md|markdown|html|htm|txt)$/iu;

function entryKind(kind: string): "file" | "directory" {
  return kind === "directory" ? "directory" : "file";
}

function displayName(path: string, kind: "file" | "directory"): string {
  const name = basename(path);
  if (kind === "directory") return name;
  return name.replace(DOC_EXT, "");
}

function isDocFile(path: string): boolean {
  return DOC_EXT.test(basename(path));
}

function docKind(path: string): "markdown" | "html" | "text" {
  const lower = path.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  return "text";
}

function unescapeRelative(path: string): string {
  let current = path;
  for (let i = 0; i < 3; i += 1) {
    if (!/%[0-9A-Fa-f]{2}/u.test(current)) break;
    try {
      const next = current
        .split("/")
        .map((segment) => {
          try {
            return decodeURIComponent(segment);
          } catch {
            return segment;
          }
        })
        .join("/");
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current.normalize("NFC");
}

function joinRoot(root: string, relative: string): string {
  const base = root.replace(/\/+$/u, "");
  const rest = unescapeRelative(relative).replace(/^\/+/u, "");
  return rest === "" ? base : `${base}/${rest}`;
}

function toRelative(root: string, listed: string): string {
  const base = root.replace(/\/+$/u, "");
  if (listed === base) return "";
  const prefix = `${base}/`;
  return listed.startsWith(prefix) ? listed.slice(prefix.length) : listed.replace(/^\/+/u, "");
}

function parseVaults(raw: unknown): z.infer<typeof vaultSchema>[] {
  const wrapped = asRecord(raw).vaults;
  const listed: unknown[] = Array.isArray(raw) ? raw : Array.isArray(wrapped) ? wrapped : [];
  return listed.flatMap((item: unknown) => {
    const parsed = vaultSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

type VaultRow = z.infer<typeof vaultSchema>;
type PluginDb = ReturnType<BbPluginApi["storage"]["database"]>;

function docsVaultDbCandidates(ownDbPath: string): string[] {
  return [
    ownDbPath === "" ? "" : join(dirname(ownDbPath), "..", "simple-notes", "data.db"),
    join(homedir(), ".bb", "plugins", "simple-notes", "data.db"),
  ].filter((path) => path !== "");
}

function readForeignVaults(dbPath: string): VaultRow[] {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = db
      .prepare("SELECT id, name, host_id, root_path FROM vaults ORDER BY created_at, name")
      .all() as Array<Record<string, unknown>>;
    return parseVaults(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        hostId: row.host_id ?? null,
        rootPath: row.root_path,
      })),
    );
  } finally {
    db.close();
  }
}

function compareVaultNames(a: string, b: string): number {
  const rank = (name: string): number => {
    const n = name.trim().toLowerCase();
    if (n === "memex") return 0;
    if (n === "scratch") return 1;
    return 2;
  };
  const ranked = rank(a) - rank(b);
  if (ranked !== 0) return ranked;
  return a.localeCompare(b, "ko");
}

function rowsFromPluginDb(db: PluginDb): VaultRow[] {
  const rows = db
    .prepare("SELECT id, name, host_id, root_path FROM vaults ORDER BY sort_order, name")
    .all() as Array<Record<string, unknown>>;
  return parseVaults(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      hostId: row.host_id ?? null,
      rootPath: row.root_path,
    })),
  );
}

function expandUserPath(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  return trimmed;
}

function resolveVaultPath(input: string): string {
  const expanded = expandUserPath(input);
  if (expanded === "" || !expanded.startsWith("/")) {
    throw new Error("절대 경로나 ~ 경로를 넣어야 합니다.");
  }
  if (!existsSync(expanded)) {
    throw new Error("이 폴더를 찾지 못했습니다.");
  }
  let st;
  try {
    st = statSync(expanded);
  } catch {
    throw new Error("이 폴더를 찾지 못했습니다.");
  }
  if (!st.isDirectory()) {
    throw new Error("폴더 경로를 넣어야 합니다.");
  }
  try {
    return realpathSync(expanded);
  } catch {
    return expanded.replace(/\/+$/u, "") || "/";
  }
}

function slugFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
  return slug === "" ? "vault" : slug;
}

function unusedVaultId(db: PluginDb, base: string): string {
  const taken = new Set(
    (db.prepare("SELECT id FROM vaults").all() as Array<{ id: string }>).map((row) => row.id),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const id = `${base}-${i}`;
    if (!taken.has(id)) return id;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function nextSortOrder(db: PluginDb): number {
  const row = db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM vaults").get() as { m: number };
  return Number(row.m) + 1;
}

function samePath(a: string, b: string): boolean {
  return a.replace(/\/+$/u, "") === b.replace(/\/+$/u, "");
}

function seedSortOrder(db: PluginDb): void {
  const rows = db
    .prepare("SELECT id, name, sort_order FROM vaults")
    .all() as Array<{ id: string; name: string; sort_order: number }>;
  if (rows.length <= 1) return;
  if (!rows.every((row) => Number(row.sort_order) === 0)) return;
  const sorted = [...rows].sort((a, b) => compareVaultNames(a.name, b.name));
  const update = db.prepare("UPDATE vaults SET sort_order = ? WHERE id = ?");
  sorted.forEach((row, index) => {
    update.run(index, row.id);
  });
}

export default async function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, [
    `CREATE TABLE IF NOT EXISTS vaults (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host_id TEXT,
      root_path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `ALTER TABLE vaults ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`,
  ]);

  const existing = rowsFromPluginDb(db);
  if (existing.length === 0) {
    const ownPath = typeof (db as { name?: unknown }).name === "string" ? (db as { name: string }).name : "";
    for (const candidate of docsVaultDbCandidates(ownPath)) {
      if (!existsSync(candidate)) continue;
      try {
        const imported = readForeignVaults(candidate);
        const insert = db.prepare(
          "INSERT OR IGNORE INTO vaults (id, name, host_id, root_path, created_at, sort_order) VALUES (?, ?, ?, ?, ?, 0)",
        );
        const now = Date.now();
        for (const vault of imported) {
          insert.run(vault.id, vault.name, vault.hostId, vault.rootPath, now);
        }
        break;
      } catch {
        // Keep looking; an empty Vault list is still valid.
      }
    }
  }
  seedSortOrder(db);

  function invalidateVaults(): void {
    vaultsCache = null;
  }

  async function loadVaults(force = false): Promise<VaultRow[]> {
    if (!force && vaultsCache !== null && Date.now() - vaultsCache.at < INDEX_TTL_MS) {
      return vaultsCache.vaults;
    }
    const vaults = rowsFromPluginDb(db);
    vaultsCache = { at: Date.now(), vaults };
    return vaults;
  }

  async function vaultById(vaultId: string): Promise<z.infer<typeof vaultSchema>> {
    const vaults = await loadVaults();
    const vault = vaults.find((item) => item.id === vaultId);
    if (vault === undefined) throw new Error(`Unknown vault: ${vaultId}`);
    return vault;
  }

  bb.rpc.register(rpcContract, {
    async listVaults() {
      return { vaults: await loadVaults() };
    },

    async addVault({ path, name }) {
      const rootPath = resolveVaultPath(path);
      const current = await loadVaults(true);
      if (current.some((vault) => samePath(vault.rootPath, rootPath))) {
        throw new Error("이미 추가한 경로입니다.");
      }
      const label = name?.trim() || basename(rootPath);
      const id = unusedVaultId(db, slugFromName(label));
      db.prepare(
        "INSERT INTO vaults (id, name, host_id, root_path, created_at, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(id, label, null, rootPath, Date.now(), nextSortOrder(db));
      invalidateVaults();
      return { vaults: await loadVaults(true) };
    },

    async removeVault({ id }) {
      const result = db.prepare("DELETE FROM vaults WHERE id = ?").run(id);
      if (Number(result.changes) === 0) {
        throw new Error("없는 볼트입니다.");
      }
      indexCache.delete(id);
      invalidateVaults();
      return { vaults: await loadVaults(true) };
    },

    async reorderVaults({ ids }) {
      const current = await loadVaults(true);
      const existingIds = new Set(current.map((vault) => vault.id));
      const unique = new Set(ids);
      if (unique.size !== ids.length || ids.length !== existingIds.size || ids.some((id) => !existingIds.has(id))) {
        throw new Error("볼트 순서가 올바르지 않습니다.");
      }
      const update = db.prepare("UPDATE vaults SET sort_order = ? WHERE id = ?");
      const apply = db.transaction((ordered: string[]) => {
        ordered.forEach((id, index) => {
          update.run(index, id);
        });
      });
      apply(ids);
      invalidateVaults();
      return { vaults: await loadVaults(true) };
    },

    async listIndex({ vaultId }) {
      const cached = indexCache.get(vaultId);
      if (cached !== undefined && Date.now() - cached.at < INDEX_TTL_MS) {
        return { vaultId, entries: cached.entries };
      }
      const vault = await vaultById(vaultId);
      const listed = await bb.sdk.files.listPaths({
        path: vault.rootPath,
        hostId: vault.hostId ?? undefined,
        includeFiles: true,
        includeDirectories: true,
        limit: 10_000,
      });
      const entries: z.infer<typeof entrySchema>[] = [];
      for (const row of listed.paths) {
        const relative = toRelative(vault.rootPath, row.path);
        if (relative === "" || relative.split("/").some((part) => part.startsWith("."))) continue;
        const kind = entryKind(row.kind);
        if (kind === "file" && !isDocFile(relative)) continue;
        entries.push({ kind, path: relative, name: displayName(relative, kind) });
      }
      indexCache.set(vaultId, { at: Date.now(), entries });
      return { vaultId, entries };
    },

    async readDoc({ vaultId, path }) {
      const vault = await vaultById(vaultId);
      const relative = unescapeRelative(path);
      const file = await bb.sdk.files.read({
        path: joinRoot(vault.rootPath, relative),
        rootPath: vault.rootPath,
        hostId: vault.hostId ?? undefined,
      });
      const content =
        file.contentEncoding === "base64"
          ? Buffer.from(file.content, "base64").toString("utf8")
          : file.content;
      return {
        vaultId,
        path: relative,
        name: displayName(relative, "file"),
        content,
        kind: docKind(relative),
      };
    },
  });
}
