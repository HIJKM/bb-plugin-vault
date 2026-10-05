import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import {
  Markdown,
  definePluginApp,
  experimental_SourceCode as SourceCode,
  useBbNavigate,
  useRpc,
  type PluginAppSlots,
  type PluginNavPanelProps,
  type PluginThreadPanelProps,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";

import { BrandIcon } from "@/components/BrandIcon";
import { GraphView } from "@/components/GraphView";
import { PanelOpenBridge } from "@/components/PanelOpenBridge";
import { withPanelSplash } from "@/components/PanelSplash";
import { useAgentSnapshot } from "@/components/use-agent-entry";
import { VaultFileDirective, VaultGraphDirective } from "@/components/VaultDirective";
import { DocViewToggle, type DocViewMode } from "@/components/DocViewToggle";
import { DocumentEndSpace } from "@/components/DocumentEndSpace";
import { FrontmatterPanel, readFrontmatterOpen, storeFrontmatterOpen } from "@/components/FrontmatterPanel";
import { ImagePreview } from "@/components/ImagePreview";
import { SettingsSection } from "@/components/SettingsSection";
import { Toolbar } from "@/components/Toolbar";
import { Button } from "@/components/ui/button";
import { Icon, preloadExtendedIcons } from "@/components/ui/icon";
import { useIsCompactViewport } from "@/components/ui/hooks/use-compact-viewport";
import { consumeAgentRoute, consumeGraphOpen } from "@/lib/agent-entry";
import { isImageFileName } from "@/lib/image-file";
import { cn } from "@/lib/utils";
import { publishVaults, rememberedVaults, subscribeVaults, type Vault } from "@/lib/vault-list";
import { parseFrontmatterFields, splitMarkdownFrontmatter, type FrontmatterField } from "@/lib/frontmatter";
import { listScrollKey, readListScroll, writeListScroll } from "@/lib/session-list-scroll";
import { THREAD_VAULT_ACTION_ID } from "@/lib/panel-open";
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
const LIST_COLLAPSED_KEY = "vault-list-collapsed";
const GRAPH_SPLIT_KEY = "vault-graph-split";
const GRAPH_SPLIT_DEFAULT = 0.55;
const GRAPH_SPLIT_MIN = 0.2;
const GRAPH_SPLIT_MAX = 0.8;
const GRAPH_SPLIT_STEP = 0.04;
const PANEL_WIDTH_MOTION =
  "transition-[width] duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none";
const EMPTY_HIGHLIGHTS: readonly string[] = [];

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

function clampGraphSplit(split: number): number {
  return Math.min(GRAPH_SPLIT_MAX, Math.max(GRAPH_SPLIT_MIN, Math.round(split * 1000) / 1000));
}

function readStoredGraphSplit(): number {
  try {
    const parsed = Number(localStorage.getItem(GRAPH_SPLIT_KEY));
    if (!Number.isFinite(parsed)) return GRAPH_SPLIT_DEFAULT;
    return clampGraphSplit(parsed);
  } catch {
    return GRAPH_SPLIT_DEFAULT;
  }
}

function storeGraphSplit(split: number): void {
  try {
    localStorage.setItem(GRAPH_SPLIT_KEY, String(split));
  } catch {
    // ignore quota / private mode
  }
}

function readListCollapsed(): boolean {
  try {
    return localStorage.getItem(LIST_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function storeListCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(LIST_COLLAPSED_KEY, collapsed ? "1" : "0");
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

const TREE_INDENT = 16;
const TREE_BASE = 8;
const TREE_GUIDE_X = 7;

type TreeRow = {
  entry: DocEntry;
  depth: number;
};

function visibleTreeRows(
  entries: readonly DocEntry[],
  expanded: ReadonlySet<string>,
  query: string,
): TreeRow[] {
  const needle = query.trim().normalize("NFC").toLowerCase();
  const rows: TreeRow[] = [];

  function walk(folder: string, depth: number): boolean {
    let any = false;
    for (const child of childrenOf(entries, folder)) {
      if (child.kind === "directory") {
        const start = rows.length;
        rows.push({ entry: child, depth });
        const open = needle !== "" || expanded.has(child.path);
        const childHit = open ? walk(child.path, depth + 1) : false;
        const selfHit = needle === "" || matchesDocQuery(child, needle);
        if (needle !== "" && !selfHit && !childHit) {
          rows.splice(start);
          continue;
        }
        any = true;
        continue;
      }
      if (needle !== "" && !matchesDocQuery(child, needle)) continue;
      rows.push({ entry: child, depth });
      any = true;
    }
    return any;
  }

  walk("", 0);
  return rows;
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

function DocsReaderPanel({
  subPath,
  onRoute,
}: PluginNavPanelProps & { onRoute?: (subPath: string) => void }) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const compact = useIsCompactViewport();
  const route = decodeRoute(subPath);
  const [listWidth, setListWidth] = useState(readStoredListWidth);
  const [listCollapsed, setListCollapsed] = useState(readListCollapsed);
  const [graphSplit, setGraphSplit] = useState(readStoredGraphSplit);
  const [resizing, setResizing] = useState(false);
  const resizeDrag = useRef<{ startX: number; startWidth: number; max: number } | null>(null);
  const graphSplitDrag = useRef<{ startY: number; startSplit: number; height: number } | null>(null);
  const listScrollerRef = useRef<HTMLDivElement>(null);

  const applyListWidth = useCallback((width: number, max?: number) => {
    const next = clampListWidth(width, max);
    setListWidth(next);
    storeListWidth(next);
    return next;
  }, []);

  const applyGraphSplit = useCallback((split: number) => {
    const next = clampGraphSplit(split);
    setGraphSplit(next);
    storeGraphSplit(next);
    return next;
  }, []);

  const collapseList = useCallback((collapsed: boolean) => {
    setListCollapsed(collapsed);
    storeListCollapsed(collapsed);
  }, []);

  function onResizePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const card = event.currentTarget.parentElement;
    const panel = card?.parentElement?.parentElement;
    const startWidth = card?.getBoundingClientRect().width ?? listWidth;
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

  function onGraphSplitPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const column = event.currentTarget.parentElement;
    const height = column?.getBoundingClientRect().height ?? 0;
    graphSplitDrag.current = { startY: event.clientY, startSplit: graphSplit, height };
    setResizing(true);
  }

  function onGraphSplitPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = graphSplitDrag.current;
    if (drag === null || drag.height <= 0) return;
    applyGraphSplit(drag.startSplit - (event.clientY - drag.startY) / drag.height);
  }

  function onGraphSplitPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (graphSplitDrag.current === null) return;
    graphSplitDrag.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onGraphSplitKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      applyGraphSplit(graphSplit + GRAPH_SPLIT_STEP);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      applyGraphSplit(graphSplit - GRAPH_SPLIT_STEP);
    } else if (event.key === "Home") {
      event.preventDefault();
      applyGraphSplit(GRAPH_SPLIT_MIN);
    } else if (event.key === "End") {
      event.preventDefault();
      applyGraphSplit(GRAPH_SPLIT_MAX);
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
  const [graphPeek, setGraphPeek] = useState(true);
  const [propsOpen, setPropsOpen] = useState(readFrontmatterOpen);
  const [expandedFolders, setExpandedFolders] = useState<ReadonlySet<string>>(() => new Set());
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const agent = useAgentSnapshot();
  const loadedVaultRef = useRef<string | null>(null);
  const appliedNonceRef = useRef("");

  const vaultId = route.vaultId ?? vaults[0]?.id ?? null;
  const activePath = route.path;
  const highlightPaths = vaultId === null ? EMPTY_HIGHLIGHTS : agent.lights[vaultId] ?? EMPTY_HIGHLIGHTS;

  useEffect(() => {
    setViewMode("preview");
  }, [activePath]);

  useEffect(() => {
    void preloadExtendedIcons();
  }, []);

  useEffect(() => {
    const pending = consumeAgentRoute();
    if (pending?.action === "file") {
      appliedNonceRef.current = agent.entry?.nonce ?? appliedNonceRef.current;
      setGraphOpen(false);
      goToRef.current(pending.vaultId, pending.path);
      return;
    }
    if (pending?.action === "graph" && pending.vaultId !== vaultId) {
      goToRef.current(pending.vaultId, "");
      return;
    }
    const switchedVault = loadedVaultRef.current !== vaultId;
    if (switchedVault) {
      loadedVaultRef.current = vaultId;
      setGraph(null);
    }
    const current = agent.entry;
    if (current?.action === "graph" && current.vaultId === vaultId) {
      const fresh = consumeGraphOpen(vaultId);
      if (fresh || (!switchedVault && current.nonce !== appliedNonceRef.current)) {
        appliedNonceRef.current = current.nonce;
        setGraphOpen(true);
        return;
      }
      if (switchedVault) setGraphOpen(false);
      return;
    }
    if (current?.action === "file" && current.vaultId === vaultId && current.nonce !== appliedNonceRef.current) {
      appliedNonceRef.current = current.nonce;
      setGraphOpen(false);
      return;
    }
    if (switchedVault) setGraphOpen(false);
  }, [agent.entry, vaultId]);

  useEffect(() => {
    if ((!graphOpen && !graphPeek) || vaultId === null || graph !== null) return;
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
  }, [graph, graphOpen, graphPeek, rpc, vaultId]);
  const viewingFile = activePath !== "" && isProbablyFile(activePath);
  const openFilePath = viewingFile ? activePath : "";
  const routeFolder = viewingFile
    ? activePath.includes("/")
      ? activePath.slice(0, activePath.lastIndexOf("/"))
      : ""
    : activePath;
  const listFolder = routeFolder;
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
  const treeRows = useMemo(
    () => visibleTreeRows(index, expandedFolders, query),
    [expandedFolders, index, query],
  );
  const showList = !compact || !viewingFile;

  useEffect(() => {
    setExpandedFolders(new Set());
  }, [vaultId]);

  function toggleFolder(path: string) {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  const folderScrollKey = listScrollKey(vaultId, "");

  useLayoutEffect(() => {
    const el = listScrollerRef.current;
    if (el === null) return;
    if (query.trim() === "") el.scrollTop = readListScroll(folderScrollKey);
    return () => {
      if (query.trim() === "") writeListScroll(folderScrollKey, el.scrollTop);
    };
  }, [folderScrollKey, query, showList, treeRows.length]);

  useEffect(() => {
    if (activePath === "") return;
    listScrollerRef.current
      ?.querySelector(`[data-vault-path="${CSS.escape(activePath)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activePath]);

  const goTo = useCallback(
    (nextVault: string, nextPath: string, replace = false) => {
      const encoded = encodeRoute(nextVault, nextPath);
      if (onRoute !== undefined) {
        onRoute(encoded);
        return;
      }
      navigate.toPluginPanel(PANEL_PATH, {
        subPath: encoded,
        replace,
      });
    },
    [navigate, onRoute],
  );
  const goToRef = useRef(goTo);
  goToRef.current = goTo;

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
      className="flex h-full min-h-0 w-full flex-col"
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
      <Toolbar
        rootLabel={activeVault?.name ?? "Vault"}
        query={query}
        onQueryChange={setQuery}
        filterFocusTick={filterFocusTick}
        graphOpen={graphPeek}
        onToggleGraph={compact ? undefined : () => setGraphPeek((open) => !open)}
        vaults={vaults}
        vaultId={vaultId}
        onSelectVault={(id) => goTo(id, "")}
        className={compact ? undefined : "pr-9"}
      />
      <div
        ref={listScrollerRef}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
        onScroll={(event) => {
          if (query.trim() !== "") return;
          writeListScroll(folderScrollKey, event.currentTarget.scrollTop);
        }}
      >
        {loadingVaults || (loadingIndex && index.length === 0) ? (
          <p className="p-4 text-sm text-muted-foreground">불러오는 중…</p>
        ) : null}
        {!loadingIndex && treeRows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {query.trim() ? "검색과 맞는 이름이 없습니다." : "이 볼트가 비어 있습니다."}
          </p>
        ) : null}
        <ul className="py-1" role="tree">
          {treeRows.map((row) => {
            const item = row.entry;
            const selected = item.path === activePath;
            const expanded = item.kind === "directory" && (query.trim() !== "" || expandedFolders.has(item.path));
            return (
              <li key={item.path} role="none">
                <button
                  type="button"
                  role="treeitem"
                  aria-selected={selected}
                  aria-expanded={item.kind === "directory" ? expanded : undefined}
                  data-vault-path={item.path}
                  title={item.path}
                  style={{ paddingLeft: TREE_BASE + row.depth * TREE_INDENT }}
                  className={cn(
                    "relative flex h-6 w-full min-w-0 items-center gap-1.5 pr-2 text-left text-[13px]",
                    selected ? "bg-accent text-accent-foreground" : "hover:bg-state-hover",
                  )}
                  onClick={() => {
                    if (item.kind === "directory") {
                      toggleFolder(item.path);
                      return;
                    }
                    if (vaultId === null) return;
                    goTo(vaultId, item.path);
                  }}
                >
                  {row.depth > 0
                    ? Array.from({ length: row.depth }, (_, level) => (
                        <span
                          key={level}
                          aria-hidden
                          className="pointer-events-none absolute top-0 bottom-0 w-px bg-border"
                          style={{ left: TREE_BASE + level * TREE_INDENT + TREE_GUIDE_X }}
                        />
                      ))
                    : null}
                  <Icon
                    name={
                      item.kind === "directory" ? "Folder" : isImageFileName(item.path) ? "File" : "FileText"
                    }
                    className="size-3.5 shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate">
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
          <div
            className={cn(
              "flex h-9 shrink-0 items-center gap-2 border-b border-border pr-2 transition-[padding] duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
              !compact && listCollapsed ? "pl-12" : "pl-3",
            )}
          >
            <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{fileLabel(doc.name)}</h1>
            {doc.kind === "markdown" && viewMode === "preview" && markdown.fields.length > 0 ? (
              <button
                type="button"
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-md",
                  propsOpen
                    ? "bg-state-active text-foreground"
                    : "text-muted-foreground hover:bg-state-hover hover:text-foreground",
                )}
                aria-pressed={propsOpen}
                aria-label="속성"
                onClick={() => {
                  const next = !propsOpen;
                  setPropsOpen(next);
                  storeFrontmatterOpen(next);
                }}
              >
                <Icon name="SlidersHorizontal" className="size-3.5" />
              </button>
            ) : null}
            {doc.kind === "markdown" || doc.kind === "html" ? (
              <DocViewToggle mode={viewMode} onChange={setViewMode} />
            ) : null}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1">
            {doc.kind === "image" ? (
              <div className="min-h-0 min-w-0 flex-1">
                <ImagePreview url={doc.url} name={fileLabel(doc.name)} />
              </div>
            ) : (
            <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
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
            {doc.kind === "markdown" && viewMode === "preview" && markdown.fields.length > 0 ? (
              <aside
                className={cn("relative h-full shrink-0 overflow-hidden", PANEL_WIDTH_MOTION)}
                style={{ width: propsOpen ? "14rem" : 0 }}
                aria-hidden={!propsOpen}
                inert={!propsOpen}
              >
                <div className="absolute inset-y-0 right-0 w-56 overflow-y-auto border-l border-border">
                  <FrontmatterPanel
                    fields={markdown.fields}
                    docPath={doc.path}
                    index={index}
                    vaultId={vaultId}
                    rawByHash={rawArchive}
                    onOpen={goTo}
                  />
                </div>
              </aside>
            ) : null}
          </div>
        </>
      )}
    </div>
  );

  const showDetail = !compact || viewingFile;

  if (graphOpen) {
    return (
      <div
        data-no-sidebar-swipe=""
        className="flex h-full min-h-0 flex-col bg-background text-foreground"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setGraphOpen(false)}>
            <Icon name="ChevronLeft" className="size-4" />
            닫기
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium">3D 그래프</h1>
        </div>
        {loadingGraph && graph === null ? (
          <p className="p-6 text-sm text-muted-foreground">그래프를 그리는 중…</p>
        ) : (
          <GraphView
            nodes={graph?.nodes ?? []}
            edges={graph?.edges ?? []}
            activePath={activePath}
            highlightPaths={highlightPaths}
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
    <div
      data-no-sidebar-swipe=""
      className={cn(
        "relative flex h-full min-h-0 bg-background text-foreground",
        resizing ? "select-none" : "",
      )}
    >
      {compact ? (
        showList ? listPane : null
      ) : showList ? (
        <div
          className={cn(
            "relative h-full max-w-[70%] shrink-0 overflow-hidden",
            resizing ? "" : PANEL_WIDTH_MOTION,
          )}
          style={{ width: listCollapsed ? 0 : listWidth }}
        >
          <div
            data-testid="vault-list-card"
            aria-hidden={listCollapsed}
            inert={listCollapsed}
            className="absolute inset-y-0 left-0 flex flex-col bg-background"
            style={{ width: listWidth }}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <div
                className="flex min-h-0 flex-col"
                style={{ flexGrow: graphPeek ? 1 - graphSplit : 1, flexBasis: 0 }}
              >
                {listPane}
              </div>
              {graphPeek ? (
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="그래프 높이"
                  aria-valuemin={Math.round(GRAPH_SPLIT_MIN * 100)}
                  aria-valuemax={Math.round(GRAPH_SPLIT_MAX * 100)}
                  aria-valuenow={Math.round(graphSplit * 100)}
                  tabIndex={0}
                  className={cn(
                    "relative z-10 h-px shrink-0 cursor-row-resize touch-none before:absolute before:inset-x-0 before:-top-1.5 before:h-3 before:content-['']",
                    resizing && graphSplitDrag.current !== null ? "bg-primary" : "bg-border",
                  )}
                  onPointerDown={onGraphSplitPointerDown}
                  onPointerMove={onGraphSplitPointerMove}
                  onPointerUp={onGraphSplitPointerUp}
                  onPointerCancel={onGraphSplitPointerUp}
                  onDoubleClick={() => applyGraphSplit(GRAPH_SPLIT_DEFAULT)}
                  onKeyDown={onGraphSplitKeyDown}
                />
              ) : null}
              {graphPeek ? (
                <div
                  className="flex min-h-0 flex-col"
                  style={{ flexGrow: graphSplit, flexBasis: 0 }}
                  aria-label="그래프"
                >
                  {loadingGraph && graph === null ? (
                    <p className="p-4 text-sm text-muted-foreground">그래프를 그리는 중…</p>
                  ) : (
                    <GraphView
                      nodes={graph?.nodes ?? []}
                      edges={graph?.edges ?? []}
                      activePath={activePath}
                      highlightPaths={highlightPaths}
                      onFullscreen={() => setGraphOpen(true)}
                      onOpen={(path) => {
                        if (vaultId === null) return;
                        goTo(vaultId, path);
                      }}
                    />
                  )}
                </div>
              ) : null}
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="사이드바 너비"
              aria-valuemin={LIST_WIDTH_MIN}
              aria-valuemax={LIST_WIDTH_MAX}
              aria-valuenow={listWidth}
              tabIndex={listCollapsed ? -1 : 0}
              className={cn(
                "absolute inset-y-0 right-0 z-10 w-px cursor-col-resize touch-none before:absolute before:inset-y-0 before:-left-1.5 before:w-3 before:content-['']",
                resizing && resizeDrag.current !== null ? "bg-primary" : "bg-border",
              )}
              onPointerDown={onResizePointerDown}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              onPointerCancel={onResizePointerUp}
              onDoubleClick={() => applyListWidth(LIST_WIDTH_DEFAULT)}
              onKeyDown={onResizeKeyDown}
            />
          </div>
        </div>
      ) : null}
      {showDetail ? detailPane : null}
      {!compact ? (
        <button
          type="button"
          aria-label={listCollapsed ? "파일 목록 펼치기" : "파일 목록 접기"}
          aria-pressed={!listCollapsed}
          data-testid="vault-list-collapse"
          className={cn(
            "absolute top-1 z-30 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-state-hover hover:text-foreground",
            resizing
              ? ""
              : "transition-[left] duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          )}
          style={{ left: listCollapsed ? 8 : Math.max(8, listWidth - 36) }}
          onClick={() => collapseList(!listCollapsed)}
        >
          <Icon name="PanelLeft" className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

const VaultScreen = withPanelSplash("Vault", <BrandIcon className="size-9" />, DocsReaderPanel);

function ThreadVaultPanel(_props: PluginThreadPanelProps) {
  const [subPath, setSubPath] = useState(readSessionRoute);
  return <VaultScreen subPath={subPath} onRoute={setSubPath} />;
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "docs",
    title: "Vault",
    icon: "FileText",
    path: PANEL_PATH,
    component: VaultScreen,
  });

  app.slots.threadPanelAction({
    id: THREAD_VAULT_ACTION_ID,
    title: "Vault",
    icon: "FileText",
    layout: "flush",
    component: ThreadVaultPanel,
  });

  app.slots.settingsSection({
    id: "vaults",
    title: "볼트",
    description: "패널에 보여줄 폴더를 넣고, 끌어다 놓아 순서를 바꿉니다.",
    component: SettingsSection,
  });

  app.slots.messageDirective({ id: "vault-file", component: VaultFileDirective });
  app.slots.messageDirective({ id: "vault-graph", component: VaultGraphDirective });

  const slots = app.slots as PluginAppSlots & {
    experimental_appOverlay?: (registration: { id: string; component: ComponentType }) => void;
  };
  slots.experimental_appOverlay?.({ id: "panel-open", component: PanelOpenBridge });
});
