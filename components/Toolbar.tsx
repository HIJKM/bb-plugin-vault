import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { PathBar } from "@/components/PathBar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ACTION_BUTTON_CLASS = "h-7 w-7 shrink-0 p-0";

export interface ToolbarProps {
  folder: string;
  rootLabel: string;
  onNavigate: (path: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  filterFocusTick?: number;
}

export function Toolbar({
  folder,
  rootLabel,
  onNavigate,
  query,
  onQueryChange,
  filterFocusTick = 0,
}: ToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const filterWrapRef = useRef<HTMLDivElement>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (filterFocusTick === 0) return;
    setFilterOpen(true);
  }, [filterFocusTick]);

  useLayoutEffect(() => {
    if (!filterOpen) return;
    filterWrapRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const input = searchInputRef.current;
    input?.focus();
    input?.select();
  }, [filterOpen, filterFocusTick]);

  useEffect(() => {
    if (!filterOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (filterWrapRef.current?.contains(event.target)) return;
      if (filterPopoverRef.current?.contains(event.target)) return;
      setFilterOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [filterOpen]);

  const filterActive = query !== "";

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

      {filterOpen ? (
        <div
          ref={filterPopoverRef}
          role="dialog"
          aria-label="Filter this folder"
          className="absolute right-3 top-[calc(100%-2px)] z-30 w-56 rounded-md border border-border bg-background p-2 shadow-md"
        >
          <Input
            ref={searchInputRef}
            type="search"
            value={query}
            data-testid="vault-search"
            aria-label="Filter this folder"
            placeholder="Filter…"
            className="h-8 text-sm"
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
        </div>
      ) : null}
    </div>
  );
}
