import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { PathBar } from "@/components/PathBar";
import type { VaultChoice } from "@/components/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { cn } from "@/lib/utils";

const ACTION_BUTTON_CLASS = "h-7 w-7 shrink-0 p-0";
const POPOVER_WIDTH = 224;

function placePopover(
  anchor: HTMLElement,
  popover?: HTMLElement | null,
): { top: number; left: number; width: number } {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(POPOVER_WIDTH, Math.max(160, window.innerWidth - 16));
  const height = popover?.offsetHeight ?? 48;
  const gap = 6;
  const maxLeft = window.innerWidth - width - 8;
  const left = Math.min(Math.max(8, rect.left - width - gap), Math.max(8, maxLeft));
  let top = rect.top;
  if (top + height > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - 8 - height);
  }
  return { top, left, width };
}

export interface ToolbarProps {
  rootLabel: string;
  query: string;
  onQueryChange: (query: string) => void;
  filterFocusTick?: number;
  onOpenGraph?: () => void;
  graphOpen?: boolean;
  onToggleGraph?: () => void;
  vaults?: readonly VaultChoice[];
  vaultId?: string | null;
  onSelectVault?: (vaultId: string) => void;
  className?: string;
}

export function Toolbar({
  rootLabel,
  query,
  onQueryChange,
  filterFocusTick = 0,
  onOpenGraph,
  graphOpen = false,
  onToggleGraph,
  vaults,
  vaultId,
  onSelectVault,
  className,
}: ToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [popoverBox, setPopoverBox] = useState({ top: 0, left: 0, width: POPOVER_WIDTH });
  const filterWrapRef = useRef<HTMLDivElement>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const portalScopeProps = usePortalScopeProps();

  useEffect(() => {
    if (filterFocusTick === 0) return;
    setFilterOpen(true);
  }, [filterFocusTick]);

  useLayoutEffect(() => {
    if (!filterOpen) return;
    const anchor = filterWrapRef.current;
    if (anchor !== null) setPopoverBox(placePopover(anchor, filterPopoverRef.current));
  }, [filterOpen]);

  useLayoutEffect(() => {
    if (!filterOpen) return;
    const input = searchInputRef.current;
    if (input === null) return;
    input.focus();
    if (input.value === "") input.select();
  }, [filterOpen, filterFocusTick]);

  useEffect(() => {
    if (!filterOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (filterWrapRef.current?.contains(event.target)) return;
      if (filterPopoverRef.current?.contains(event.target)) return;
      setFilterOpen(false);
    }
    function onReposition() {
      const anchor = filterWrapRef.current;
      if (anchor !== null) setPopoverBox(placePopover(anchor, filterPopoverRef.current));
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [filterOpen]);

  const filterActive = query !== "";
  const portalTarget = typeof document === "undefined" ? null : document.body;

  return (
    <div
      data-testid="vault-toolbar"
      className={cn(
        "relative flex h-9 shrink-0 items-center gap-0.5 border-b border-border px-1.5",
        className,
      )}
    >
      <PathBar
        rootLabel={rootLabel}
        vaults={vaults}
        vaultId={vaultId}
        onSelectVault={onSelectVault}
      />

      {onOpenGraph ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={ACTION_BUTTON_CLASS}
          aria-label="그래프 보기"
          data-testid="vault-graph"
          onClick={onOpenGraph}
        >
          <Icon name="GitBranch" className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}

      {onToggleGraph ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={ACTION_BUTTON_CLASS}
          aria-label="그래프"
          aria-pressed={graphOpen}
          data-testid="vault-column-graph"
          onClick={onToggleGraph}
        >
          <Icon name="GitBranch" className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}

      <div className="relative shrink-0" ref={filterWrapRef} title="필터검색 (Ctrl+F)">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("relative", ACTION_BUTTON_CLASS)}
          aria-label={filterActive ? `필터검색 (${query})` : "필터검색"}
          aria-pressed={filterOpen || filterActive}
          aria-expanded={filterOpen}
          data-testid="vault-filter"
          onClick={() => setFilterOpen((open) => !open)}
        >
          <Icon name="Search" className="size-3.5" aria-hidden="true" />
          {filterActive ? (
            <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" aria-hidden="true" />
          ) : null}
        </Button>
      </div>

      {filterOpen && portalTarget !== null
        ? createPortal(
            <div
              {...portalScopeProps}
              ref={filterPopoverRef}
              role="dialog"
              aria-label="Filter this folder"
              data-testid="vault-search-popover"
              className="rounded-md border border-border bg-background p-2 shadow-md"
              style={{
                position: "fixed",
                top: popoverBox.top,
                left: popoverBox.left,
                width: popoverBox.width,
                zIndex: 80,
              }}
            >
              <Input
                ref={searchInputRef}
                type="text"
                value={query}
                data-testid="vault-search"
                aria-label="Filter this folder"
                placeholder="Filter…"
                className="h-8 text-sm"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => onQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    if (query !== "") {
                      event.preventDefault();
                      onQueryChange("");
                    } else {
                      setFilterOpen(false);
                      event.currentTarget.blur();
                    }
                  }
                }}
              />
            </div>,
            portalTarget,
          )
        : null}
    </div>
  );
}
