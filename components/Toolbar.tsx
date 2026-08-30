import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { PathBar } from "@/components/PathBar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import type { FilterScope } from "@/lib/filter-scope";
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
  const height = popover?.offsetHeight ?? 88;
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
  folder: string;
  rootLabel: string;
  onNavigate: (path: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  filterScope: FilterScope;
  onFilterScopeChange: (scope: FilterScope) => void;
  filterFocusTick?: number;
}

export function Toolbar({
  folder,
  rootLabel,
  onNavigate,
  query,
  onQueryChange,
  filterScope,
  onFilterScopeChange,
  filterFocusTick = 0,
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
      className="relative flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-2"
    >
      <PathBar folder={folder} rootLabel={rootLabel} onNavigate={onNavigate} />

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
              <div className="mt-1.5 grid grid-cols-2 gap-1" role="group" aria-label="검색 범위">
                <Button
                  type="button"
                  variant={filterScope === "folder" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  aria-pressed={filterScope === "folder"}
                  data-testid="vault-filter-scope-folder"
                  onClick={() => onFilterScopeChange("folder")}
                >
                  이 폴더
                </Button>
                <Button
                  type="button"
                  variant={filterScope === "all" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  aria-pressed={filterScope === "all"}
                  data-testid="vault-filter-scope-all"
                  onClick={() => onFilterScopeChange("all")}
                >
                  전체 경로
                </Button>
              </div>
            </div>,
            portalTarget,
          )
        : null}
    </div>
  );
}
