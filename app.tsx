import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import {
  Markdown,
  definePluginApp,
  experimental_SourceCode as SourceCode,
  useBbNavigate,
  useRpc,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";

import { BrandIcon } from "@/components/BrandIcon";
import { GraphView } from "@/components/GraphView";
import { withPanelSplash } from "@/components/PanelSplash";
import { DocViewToggle, type DocViewMode } from "@/components/DocViewToggle";
import { DocumentEndSpace } from "@/components/DocumentEndSpace";
import { FrontmatterPanel } from "@/components/FrontmatterPanel";
import { ImagePreview } from "@/components/ImagePreview";
import { SettingsSection } from "@/components/SettingsSection";
import { Toolbar } from "@/components/Toolbar";
import { Button } from "@/components/ui/button";
import { Icon, preloadExtendedIcons } from "@/components/ui/icon";
import { useIsCompactViewport } from "@/components/ui/hooks/use-compact-viewport";
import { isImageFileName } from "@/lib/image-file";
import { cn } from "@/lib/utils";
import { publishVaults, rememberedVaults, subscribeVaults, type Vault } from "@/lib/vault-list";
import { parseFrontmatterFields, splitMarkdownFrontmatter, type FrontmatterField } from "@/lib/frontmatter";
import { listScrollKey, readListScroll, writeListScroll } from "@/lib/session-list-scroll";
import { readSessionRoute, writeSessionRoute } from "@/lib/session-route";
import { rewriteVaultMarkdown } from "@/lib/vault-markdown";
import type { GraphEdge, GraphNode } from "@/lib/note-graph";
import { parseVaultLinkHref } from "@/lib/wiki-links";
import type { rpcContract } from "./server";

const PANEL_PATH = "docs";
const LIST_WIDTH_KEY = "vault-list-width";
const LIST_WIDTH_DEFAULT = 320;
const LIST_WIDTH_MIN = 200;
const LIST_WIDTH_MAX = 560;
const LIST_WIDTH_STEP = 16;

function clampListWidth(width: number, max = LIST_WIDTH_MAX): number {
  const ceiling = Math.max(LIST_WIDTH_MIN, max);
  return Math.min(ceiling, Math.max(LIST_WIDTH_MIN, Math.round(width)));
}

function readStoredListWidth(): number {
  try {
    const parsed = Number(localStorage.getItem(LIST_WIDTH_KEY));
    if (!Number.isFinite(parsed)) return LIST_WIDTH_DEFAULT;
    return clampListWidth(parsed);
  } catch {
    return LIST_WIDTH_DEFAULT;
  }
}

function storeListWidth(width: number): void {
  try {
    localStorage.setItem(LIST_WIDTH_KEY, String(width));
  } catch {
    // ignore quota / private mode
  }
}

type DocEntry = {
  kind: "file" | "directory";
  path: string;
  name: string;
};

type VaultIndex = {
  entries: DocEntry[];
  rawArchive: Record<string, string>;
};

type DocBody =
  | {
      vaultId: string;
      path: string;
      name: string;
      content: string;
      kind: "markdown" | "html" | "text";
    }
  | {
      vaultId: string;
      path: string;
      name: string;
      url: string;
      kind: "image";
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
  return /\.(md|markdown|html|htm|txt)$/iu.test(path) || isImageFileName(path);
}

function fileLabel(pathOrName: string): string {
  const cut = pathOrName.lastIndexOf("/");
  const name = cut === -1 ? pathOrName : pathOrName.slice(cut + 1);
  return name.replace(/\.(md|markdown|html|htm|txt)$/iu, "");
}

const rememberedIndex: Record<string, VaultIndex> = {};

function nameRank(name: string): number {
  const n = name.trim().toLowerCase();
  if (n === "memex") return 0;
  if (n === "scratch") return 1;
  return 2;
}

function compareNames(a: string, b: string): number {
  const ranked = nameRank(a) - nameRank(b);
  if (ranked !== 0) return ranked;
  return a.localeCompare(b, "ko");
}

function relativePath(folder: string, path: string): string {
  if (folder === "") return path;
  const prefix = `${folder}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function matchesDocQuery(entry: DocEntry, needle: string): boolean {
  const name = entry.name.normalize("NFC").toLowerCase();
  const label = fileLabel(entry.name).normalize("NFC").toLowerCase();
  const base = fileLabel(relativePath("", entry.path)).normalize("NFC").toLowerCase();
  return name.includes(needle) || label.includes(needle) || base.includes(needle);
}

function filterDocs(
  entries: readonly DocEntry[],
  folder: string,
  query: string,
): DocEntry[] {
  const needle = query.trim().normalize("NFC").toLowerCase();
  if (needle === "") return childrenOf(entries, folder);
  const pool = childrenOf(entries, folder);
  const matched = pool.filter((entry) => matchesDocQuery(entry, needle));
  const folders = matched.filter((entry) => entry.kind === "directory").sort((a, b) => compareNames(a.name, b.name));
  const files = matched.filter((entry) => entry.kind === "file").sort((a, b) => compareNames(a.name, b.name));
  return [...folders, ...files];
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
  const folders = [...dirs.values()].sort((a, b) => compareNames(a.name, b.name));
  files.sort((a, b) => compareNames(a.name, b.name));
  return [...folders, ...files];
}

function DocsReaderPanel({ subPath }: PluginNavPanelProps) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const compact = useIsCompactViewport();
  const route = decodeRoute(subPath);
  const [listWidth, setListWidth] = useState(readStoredListWidth);
  const [resizing, setResizing] = useState(false);
  const resizeDrag = useRef<{ startX: number; startWidth: number; max: number } | null>(null);
  const listScrollerRef = useRef<HTMLDivElement>(null);

  const applyListWidth = useCallback((width: number, max?: number) => {
    const next = clampListWidth(width, max);
    setListWidth(next);
    storeListWidth(next);
    return next;
  }, []);

  function onResizePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const sidebar = event.currentTarget.parentElement;
    const panel = sidebar?.parentElement;
    const startWidth = sidebar?.getBoundingClientRect().width ?? listWidth;
    const max = panel ? panel.clientWidth - LIST_WIDTH_MIN : LIST_WIDTH_MAX;
    resizeDrag.current = { startX: event.clientX, startWidth, max };
    setResizing(true);
  }

  function onResizePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = resizeDrag.current;
    if (drag === null) return;
    applyListWidth(drag.startWidth + (event.clientX - drag.startX), drag.max);
  }

  function onResizePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (resizeDrag.current === null) return;
    resizeDrag.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      applyListWidth(listWidth - LIST_WIDTH_STEP);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      applyListWidth(listWidth + LIST_WIDTH_STEP);
    } else if (event.key === "Home") {
      event.preventDefault();
      applyListWidth(LIST_WIDTH_MIN);
    } else if (event.key === "End") {
      event.preventDefault();
      applyListWidth(LIST_WIDTH_MAX);
    }
  }

  const [vaults, setVaults] = useState<Vault[]>(() => rememberedVaults());
  const [indexByVault, setIndexByVault] = useState<Record<string, VaultIndex>>(() => ({
    ...rememberedIndex,
  }));
  const [query, setQuery] = useState("");
  const [filterFocusTick, setFilterFocusTick] = useState(0);
  const [doc, setDoc] = useState<DocBody | null>(null);
  const [loadingVaults, setLoadingVaults] = useState(() => rememberedVaults().length === 0);
  const [loadingIndex, setLoadingIndex] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [previewBaseUrl, setPreviewBaseUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<DocViewMode>("preview");
  const [graphOpen, setGraphOpen] = useState(false);
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);

  const vaultId = route.vaultId ?? vaults[0]?.id ?? null;
  const activePath = route.path;

  useEffect(() => {
    setViewMode("preview");
  }, [activePath]);

  useEffect(() => {
    void preloadExtendedIcons();
  }, []);

  useEffect(() => {
    setGraph(null);
    setGraphOpen(false);
  }, [vaultId]);

  useEffect(() => {
    if (!graphOpen || vaultId === null || graph !== null) return;
    let cancelled = false;
    setLoadingGraph(true);
    void rpc
      .call("graph", { vaultId })
      .then((result) => {
        if (!cancelled) setGraph({ nodes: result.nodes, edges: result.edges });
      })
      .catch((cause: unknown) => {
        if (!cancelled) toast.error(errorText(cause, "그래프를 만들지 못했습니다."));
      })
      .finally(() => {
        if (!cancelled) setLoadingGraph(false);
      });
    return () => {
      cancelled = true;
    };
  }, [graph, graphOpen, rpc, vaultId]);
  const viewingFile = activePath !== "" && isProbablyFile(activePath);
  const listFolder = viewingFile
    ? activePath.includes("/")
      ? activePath.slice(0, activePath.lastIndexOf("/"))
      : ""
    : activePath;
  const vaultIndex = vaultId === null ? undefined : indexByVault[vaultId];
  const index = vaultIndex?.entries ?? [];
  const rawArchive = vaultIndex?.rawArchive ?? {};
  const markdown = useMemo(() => {
    if (doc === null || doc.kind !== "markdown") {
      return { body: "", fields: [] as FrontmatterField[] };
    }
    const split = splitMarkdownFrontmatter(doc.content);
    return {
      body: rewriteVaultMarkdown(split.body, {
        entries: index,
        docPath: doc.path,
        previewBaseUrl,
      }),
      fields: split.frontmatter === null ? [] : parseFrontmatterFields(split.frontmatter),
    };
  }, [doc, index, previewBaseUrl]);
  const items = useMemo(() => childrenOf(index, listFolder), [index, listFolder]);
  const visibleItems = useMemo(
    () => filterDocs(index, listFolder, query),
    [index, listFolder, query],
  );
  const showList = !compact || !viewingFile;
  const folderScrollKey = listScrollKey(vaultId, listFolder);

  useLayoutEffect(() => {
    const el = listScrollerRef.current;
    if (el === null) return;
    if (query.trim() === "") el.scrollTop = readListScroll(folderScrollKey);
    return () => {
      if (query.trim() === "") writeListScroll(folderScrollKey, el.scrollTop);
    };
  }, [folderScrollKey, query, showList, visibleItems.length]);

  const goTo = useCallback(
    (nextVault: string, nextPath: string, replace = false) => {
      navigate.toPluginPanel(PANEL_PATH, {
        subPath: encodeRoute(nextVault, nextPath),
        replace,
      });
    },
    [navigate],
  );

  const onWikiClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (vaultId === null) return;
      const node = event.target;
      if (!(node instanceof Element)) return;
      const anchor = node.closest("a");
      if (anchor === null) return;
      const path = parseVaultLinkHref(anchor.getAttribute("href"));
      if (path === null) return;
      event.preventDefault();
      goTo(vaultId, path);
    },
    [goTo, vaultId],
  );

  useEffect(() => {
    if (vaultId === null) {
      setPreviewBaseUrl(null);
      return;
    }
    let cancelled = false;
    void rpc
      .call("previewRoot", { vaultId })
      .then((result) => {
        if (!cancelled) setPreviewBaseUrl(result.baseUrl);
      })
      .catch(() => {
        if (!cancelled) setPreviewBaseUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [rpc, vaultId]);

  useEffect(() => {
    const remembered = rememberedVaults();
    if (remembered.length > 0) {
      setVaults(remembered);
      setLoadingVaults(false);
    } else {
      setLoadingVaults(true);
    }
    let cancelled = false;
    void rpc
      .call("listVaults")
      .then((result) => {
        if (cancelled) return;
        publishVaults(result.vaults);
        setVaults(result.vaults);
      })
      .catch((cause: unknown) => {
        if (!cancelled) toast.error(errorText(cause, "볼트 목록을 읽지 못했습니다."));
      })
      .finally(() => {
        if (!cancelled) setLoadingVaults(false);
      });
    const unsub = subscribeVaults((next) => {
      setVaults(next);
      setIndexByVault((current) => {
        const keep: Record<string, VaultIndex> = {};
        for (const vault of next) {
          const listed = current[vault.id];
          if (listed !== undefined) keep[vault.id] = listed;
        }
        return keep;
      });
      for (const key of Object.keys(rememberedIndex)) {
        if (!next.some((vault) => vault.id === key)) delete rememberedIndex[key];
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [rpc]);

  useEffect(() => {
    if (vaults[0] === undefined) return;
    const known = route.vaultId !== null && vaults.some((vault) => vault.id === route.vaultId);
    if (known && route.vaultId !== null) {
      writeSessionRoute(encodeRoute(route.vaultId, route.path));
      return;
    }
    const last = decodeRoute(readSessionRoute());
    if (last.vaultId !== null && vaults.some((vault) => vault.id === last.vaultId)) {
      goTo(last.vaultId, last.path, true);
      return;
    }
    goTo(vaults[0].id, "", true);
  }, [goTo, route.path, route.vaultId, vaults]);

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
        const listed: VaultIndex = { entries: result.entries, rawArchive: result.rawArchive };
        rememberedIndex[vaultId] = listed;
        setIndexByVault((current) => ({ ...current, [vaultId]: listed }));
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
    const request = isImageFileName(activePath)
      ? rpc.call("previewImage", { vaultId, path: activePath }).then((result) => ({
          ...result,
          kind: "image" as const,
        }))
      : rpc.call("readDoc", { vaultId, path: activePath });
    void request
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

  const activeVault = vaults.find((vault) => vault.id === vaultId);
  const listPane = (
    <div
      className={cn("flex min-h-0 w-full flex-col", compact ? "" : "h-full border-r border-border")}
      onKeyDown={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          !event.shiftKey &&
          !event.altKey &&
          (event.key === "f" || event.key === "F")
        ) {
          event.preventDefault();
          setFilterFocusTick((tick) => tick + 1);
        }
      }}
    >
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
      <Toolbar
        folder={listFolder}
        rootLabel={activeVault?.name ?? "Vault"}
        onNavigate={(path) => {
          if (vaultId === null) return;
          goTo(vaultId, path);
        }}
        query={query}
        onQueryChange={setQuery}
        filterFocusTick={filterFocusTick}
        onOpenGraph={() => setGraphOpen(true)}
      />
      <div
        ref={listScrollerRef}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
        onScroll={(event) => {
          if (query.trim() !== "") return;
          writeListScroll(folderScrollKey, event.currentTarget.scrollTop);
        }}
      >
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
                  <Icon
                    name={
                      item.kind === "directory" ? "Folder" : isImageFileName(item.path) ? "File" : "FileText"
                    }
                    className="size-4 shrink-0"
                  />
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
          <span className="min-w-0 flex-1" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            aria-label="그래프 보기"
            onClick={() => setGraphOpen(true)}
          >
            <Icon name="GitBranch" className="size-3.5" />
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
            <div className="flex items-center gap-2">
              <h1 className="min-w-0 flex-1 truncate text-base font-medium">{fileLabel(doc.name)}</h1>
              {doc.kind === "markdown" || doc.kind === "html" ? (
                <DocViewToggle mode={viewMode} onChange={setViewMode} />
              ) : null}
            </div>
            {doc.kind === "markdown" && viewMode === "preview" ? (
              <FrontmatterPanel
                fields={markdown.fields}
                docPath={doc.path}
                index={index}
                vaultId={vaultId}
                rawByHash={rawArchive}
                onOpen={goTo}
              />
            ) : null}
          </div>
          {doc.kind === "image" ? (
            <ImagePreview url={doc.url} name={fileLabel(doc.name)} />
          ) : (
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
            {doc.kind === "html" && viewMode === "preview" ? (
              <iframe
                title={doc.name}
                sandbox=""
                srcDoc={doc.content}
                className="m-4 h-full min-h-[24rem] w-[calc(100%-2rem)] rounded-md border border-border bg-background"
              />
            ) : doc.kind === "markdown" && viewMode === "preview" ? (
              <div className="flex w-full justify-center px-4 pt-6 sm:px-8 sm:pt-8">
                <div className="w-full min-w-0 max-w-prose" onClickCapture={onWikiClick}>
                  <Markdown content={markdown.body} />
                </div>
              </div>
            ) : doc.kind === "markdown" || doc.kind === "html" || doc.kind === "text" ? (
              <div className="p-4">
                <SourceCode content={doc.content} path={doc.path} overflow="wrap" />
              </div>
            ) : (
              <pre className="whitespace-pre-wrap break-all p-4 font-mono text-sm leading-6">{doc.content}</pre>
            )}
            {!(doc.kind === "html" && viewMode === "preview") ? <DocumentEndSpace /> : null}
          </div>
          )}
        </>
      )}
    </div>
  );

  const showDetail = !compact || viewingFile;

  if (graphOpen) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setGraphOpen(false)}>
            <Icon name="ChevronLeft" className="size-4" />
            닫기
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium">그래프</h1>
        </div>
        {loadingGraph && graph === null ? (
          <p className="p-6 text-sm text-muted-foreground">그래프를 그리는 중…</p>
        ) : (
          <GraphView
            nodes={graph?.nodes ?? []}
            edges={graph?.edges ?? []}
            activePath={activePath}
            onOpen={(path) => {
              if (vaultId === null) return;
              setGraphOpen(false);
              goTo(vaultId, path);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 bg-background text-foreground", resizing ? "select-none" : "")}>
      {showList ? (
        compact ? (
          listPane
        ) : (
          <div className="relative flex min-h-0 max-w-[70%] shrink-0" style={{ width: listWidth }}>
            {listPane}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="사이드바 너비"
              aria-valuemin={LIST_WIDTH_MIN}
              aria-valuemax={LIST_WIDTH_MAX}
              aria-valuenow={listWidth}
              tabIndex={0}
              className={cn(
                "absolute inset-y-0 right-0 z-10 w-3 translate-x-1/2 cursor-col-resize touch-none",
                "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2",
                resizing ? "after:bg-primary" : "hover:after:bg-border",
              )}
              onPointerDown={onResizePointerDown}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              onPointerCancel={onResizePointerUp}
              onDoubleClick={() => applyListWidth(LIST_WIDTH_DEFAULT)}
              onKeyDown={onResizeKeyDown}
            />
          </div>
        )
      ) : null}
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
    component: withPanelSplash("Vault", <BrandIcon className="size-9" />, DocsReaderPanel),
  });

  app.slots.settingsSection({
    id: "vaults",
    title: "볼트",
    description: "패널에 보여줄 폴더를 넣고, 끌어다 놓아 순서를 바꿉니다.",
    component: SettingsSection,
  });
});
