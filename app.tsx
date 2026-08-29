import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Markdown,
  definePluginApp,
  useBbNavigate,
  useRpc,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { useIsCompactViewport } from "@/components/ui/hooks/use-compact-viewport";
import { cn } from "@/lib/utils";
import type { rpcContract } from "./server";

const PANEL_PATH = "docs";

type Vault = {
  id: string;
  name: string;
  hostId: string | null;
  rootPath: string;
};

type DocEntry = {
  kind: "file" | "directory";
  path: string;
  name: string;
};

type DocBody = {
  vaultId: string;
  path: string;
  name: string;
  content: string;
  kind: "markdown" | "html" | "text";
};

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
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

function encodeRoute(vaultId: string, path: string): string {
  // toPluginPanel encodes the URL itself; pass the raw Hangul path.
  if (path === "") return vaultId;
  return `${vaultId}/${path}`;
}

function decodeRoute(subPath: string): { vaultId: string | null; path: string } {
  const trimmed = subPath.replace(/^\/+/u, "").replace(/\/+$/u, "");
  if (trimmed === "") return { vaultId: null, path: "" };
  const parts = trimmed.split("/").map(decodeSegment);
  const vaultId = parts[0];
  if (vaultId === undefined || vaultId === "") return { vaultId: null, path: "" };
  return { vaultId, path: parts.slice(1).join("/") };
}

function isProbablyFile(path: string): boolean {
  return /\.(md|markdown|html|htm|txt)$/iu.test(path);
}

function fileLabel(pathOrName: string): string {
  const cut = pathOrName.lastIndexOf("/");
  const name = cut === -1 ? pathOrName : pathOrName.slice(cut + 1);
  return name.replace(/\.(md|markdown|html|htm|txt)$/iu, "");
}

let rememberedVaults: Vault[] = [];
const rememberedIndex: Record<string, DocEntry[]> = {};

function parentFolderOf(folder: string): string | null {
  if (folder === "") return null;
  const cut = folder.lastIndexOf("/");
  return cut === -1 ? "" : folder.slice(0, cut);
}

function childrenOf(entries: readonly DocEntry[], folder: string): DocEntry[] {
  const prefix = folder === "" ? "" : `${folder}/`;
  const dirs = new Map<string, DocEntry>();
  const files: DocEntry[] = [];
  for (const entry of entries) {
    if (entry.path === folder) continue;
    if (prefix !== "" && !entry.path.startsWith(prefix)) continue;
    const rest = prefix === "" ? entry.path : entry.path.slice(prefix.length);
    if (rest === "") continue;
    const slash = rest.indexOf("/");
    if (slash === -1) {
      if (entry.kind === "directory") dirs.set(entry.path, entry);
      else files.push(entry);
      continue;
    }
    const childPath = `${prefix}${rest.slice(0, slash)}`;
    if (!dirs.has(childPath)) {
      dirs.set(childPath, {
        kind: "directory",
        path: childPath,
        name: rest.slice(0, slash),
      });
    }
  }
  const folders = [...dirs.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  files.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return [...folders, ...files];
}

function DocsReaderPanel({ subPath }: PluginNavPanelProps) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const compact = useIsCompactViewport();
  const route = decodeRoute(subPath);

  const [vaults, setVaults] = useState<Vault[]>(() => rememberedVaults);
  const [indexByVault, setIndexByVault] = useState<Record<string, DocEntry[]>>(() => ({
    ...rememberedIndex,
  }));
  const [query, setQuery] = useState("");
  const [doc, setDoc] = useState<DocBody | null>(null);
  const [loadingVaults, setLoadingVaults] = useState(() => rememberedVaults.length === 0);
  const [loadingIndex, setLoadingIndex] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(false);

  const vaultId = route.vaultId ?? vaults[0]?.id ?? null;
  const activePath = route.path;
  const viewingFile = activePath !== "" && isProbablyFile(activePath);
  const listFolder = viewingFile
    ? activePath.includes("/")
      ? activePath.slice(0, activePath.lastIndexOf("/"))
      : ""
    : activePath;
  const parentFolder = parentFolderOf(listFolder);
  const index = vaultId === null ? [] : (indexByVault[vaultId] ?? []);
  const items = useMemo(() => childrenOf(index, listFolder), [index, listFolder]);
  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return items;
    return items.filter((item) => `${item.name} ${item.path}`.toLowerCase().includes(needle));
  }, [items, query]);

  const goTo = useCallback(
    (nextVault: string, nextPath: string, replace = false) => {
      navigate.toPluginPanel(PANEL_PATH, {
        subPath: encodeRoute(nextVault, nextPath),
        replace,
      });
    },
    [navigate],
  );

  useEffect(() => {
    if (rememberedVaults.length > 0) {
      setVaults(rememberedVaults);
      setLoadingVaults(false);
      return;
    }
    let cancelled = false;
    setLoadingVaults(true);
    void rpc
      .call("listVaults")
      .then((result) => {
        if (cancelled) return;
        rememberedVaults = result.vaults;
        setVaults(result.vaults);
      })
      .catch((cause: unknown) => {
        if (!cancelled) toast.error(errorText(cause, "볼트 목록을 읽지 못했습니다."));
      })
      .finally(() => {
        if (!cancelled) setLoadingVaults(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rpc]);

  useEffect(() => {
    if (route.vaultId === null && vaults[0] !== undefined) {
      goTo(vaults[0].id, "", true);
    }
  }, [goTo, route.vaultId, vaults]);

  useEffect(() => {
    if (vaultId === null) return;
    const cached = indexByVault[vaultId] ?? rememberedIndex[vaultId];
    if (cached !== undefined) {
      if (indexByVault[vaultId] === undefined) {
        setIndexByVault((current) => ({ ...current, [vaultId]: cached }));
      }
      return;
    }
    let cancelled = false;
    setLoadingIndex(true);
    void rpc
      .call("listIndex", { vaultId })
      .then((result) => {
        if (cancelled) return;
        rememberedIndex[vaultId] = result.entries;
        setIndexByVault((current) => ({ ...current, [vaultId]: result.entries }));
      })
      .catch((cause: unknown) => {
        if (!cancelled) toast.error(errorText(cause, "문서를 나열하지 못했습니다."));
      })
      .finally(() => {
        if (!cancelled) setLoadingIndex(false);
      });
    return () => {
      cancelled = true;
    };
  }, [indexByVault, rpc, vaultId]);

  useEffect(() => {
    if (vaultId === null || !viewingFile) {
      setDoc(null);
      setLoadingDoc(false);
      return;
    }
    let cancelled = false;
    setLoadingDoc(true);
    void rpc
      .call("readDoc", { vaultId, path: activePath })
      .then((result) => {
        if (!cancelled) setDoc(result);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        toast.error(errorText(cause, "문서를 열지 못했습니다."));
        setDoc(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingDoc(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activePath, rpc, vaultId, viewingFile]);

  const listPane = (
    <div className="flex min-h-0 w-full flex-col border-border md:w-80 md:shrink-0 md:border-r">
      <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-2">
        {vaults.map((vault) => {
          const selected = vault.id === vaultId;
          return (
            <button
              key={vault.id}
              type="button"
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1 text-xs",
                selected ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-state-hover",
              )}
              onClick={() => goTo(vault.id, "")}
            >
              {vault.name}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 border-b border-border p-3">
        {parentFolder !== null && vaultId !== null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 px-2"
            onClick={() => goTo(vaultId, parentFolder)}
            aria-label="상위 폴더"
          >
            <Icon name="ChevronLeft" className="size-4" />
            ..
          </Button>
        ) : null}
        <div className="relative min-w-0 flex-1">
          <Icon
            name="Search"
            className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이름 검색"
            className="pl-8"
            aria-label="문서 이름 검색"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        {loadingVaults || (loadingIndex && items.length === 0) ? (
          <p className="p-4 text-sm text-muted-foreground">불러오는 중…</p>
        ) : null}
        {!loadingIndex && visibleItems.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {query.trim() ? "검색과 맞는 이름이 없습니다." : "이 폴더가 비어 있습니다."}
          </p>
        ) : null}
        <ul className="p-1">
          {visibleItems.map((item) => {
            const selected = item.path === activePath;
            return (
              <li key={item.path}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full min-w-0 items-center gap-2 rounded-md px-3 py-2 text-left",
                    selected ? "bg-accent text-accent-foreground" : "hover:bg-state-hover",
                  )}
                  onClick={() => {
                    if (vaultId === null) return;
                    goTo(vaultId, item.path);
                  }}
                >
                  <Icon name="Folder" className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {item.kind === "file" ? fileLabel(item.name) : item.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );

  const detailPane = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {compact && viewingFile ? (
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (vaultId === null) return;
              goTo(vaultId, listFolder);
            }}
          >
            <Icon name="ChevronLeft" className="size-4" />
            목록
          </Button>
        </div>
      ) : null}
      {!viewingFile ? (
        <div
          className="flex flex-1 items-center justify-center p-6"
          role="status"
          aria-label="문서를 고르세요"
        >
          <Icon name="FolderOpen" className="size-10 text-muted-foreground opacity-40" />
        </div>
      ) : loadingDoc && doc === null ? (
        <p className="p-4 text-sm text-muted-foreground">여는 중…</p>
      ) : doc === null ? (
        <p className="p-4 text-sm text-muted-foreground">이 문서를 찾지 못했습니다.</p>
      ) : (
        <>
          <div className="border-b border-border px-4 py-3">
            <h1 className="truncate text-base font-medium">{fileLabel(doc.name)}</h1>
          </div>
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-4">
            {doc.kind === "html" ? (
              <iframe
                title={doc.name}
                sandbox=""
                srcDoc={doc.content}
                className="h-full min-h-[24rem] w-full rounded-md border border-border bg-background"
              />
            ) : doc.kind === "markdown" ? (
              <Markdown content={doc.content} />
            ) : (
              <pre className="whitespace-pre-wrap break-all font-mono text-sm leading-6">{doc.content}</pre>
            )}
          </div>
        </>
      )}
    </div>
  );

  const showList = !compact || !viewingFile;
  const showDetail = !compact || viewingFile;

  return (
    <div className="flex h-full min-h-0 bg-background text-foreground">
      {showList ? listPane : null}
      {showDetail ? detailPane : null}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "docs",
    title: "Vault",
    icon: "FileText",
    path: PANEL_PATH,
    component: DocsReaderPanel,
  });
});
