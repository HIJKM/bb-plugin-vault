import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { PathBar } from "@/components/PathBar";
import type { VaultChoice } from "@/components/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { COARSE_POINTER_HEADER_BAR_CLASS, COARSE_POINTER_ICON_BUTTON_GROW_CLASS, COARSE_POINTER_TEXT_SM_CLASS } from "@/components/ui/coarse-pointer-sizing";
import { Icon } from "@/components/ui/icon";
import { setShowHidden, useHiddenPrefs } from "@/lib/hidden-prefs";
import { cn } from "@/lib/utils";

const ACTION_BUTTON_CLASS = cn("h-7 w-7 shrink-0 p-0", COARSE_POINTER_ICON_BUTTON_GROW_CLASS);
const SEARCH_SHELL = "vault-search-shell";

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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const showSearch = filterOpen || query !== "";

  useEffect(() => {
    if (filterFocusTick === 0) return;
    setFilterOpen(true);
  }, [filterFocusTick]);

  useLayoutEffect(() => {
    if (showSearch) {
      const input = searchInputRef.current;
      if (input === null) return;
      input.focus();
      if (input.value === "") input.select();
      return;
    }
    if (document.activeElement === searchInputRef.current) searchButtonRef.current?.focus();
  }, [showSearch, filterFocusTick]);

  const { showHidden } = useHiddenPrefs();

  return (
    <div
      data-testid="vault-toolbar"
      className={cn(
        "relative flex shrink-0 items-center gap-0.5 border-b border-border px-1.5",
        COARSE_POINTER_HEADER_BAR_CLASS,
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

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={ACTION_BUTTON_CLASS}
        aria-label="숨김 파일 표시"
        aria-pressed={showHidden}
        data-testid="vault-show-hidden"
        onClick={() => setShowHidden(!showHidden)}
      >
        <Icon name={showHidden ? "Eye" : "EyeOff"} className="size-3.5" aria-hidden="true" />
      </Button>

      <div
        data-testid={SEARCH_SHELL}
        title={showSearch ? undefined : "필터검색 (Ctrl+F)"}
        className={cn(
          "relative h-7 max-w-full min-w-0 shrink-0 overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none",
          "in-data-[phone-metrics]:h-8",
          showSearch ? "w-80" : "w-7 in-data-[phone-metrics]:w-8",
        )}
      >
        <input
          ref={searchInputRef}
          type="search"
          value={query}
          data-testid="vault-search"
          aria-label="필터검색"
          aria-hidden={showSearch ? undefined : true}
          placeholder="필터"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          tabIndex={showSearch ? 0 : -1}
          className={cn(
            "absolute inset-0 rounded-md border pr-8 pl-2 text-foreground placeholder:text-muted-foreground",
            "in-data-[phone-metrics]:pr-9",
            COARSE_POINTER_TEXT_SM_CLASS,
            "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
            "[&::-webkit-search-cancel-button]:hidden",
            showSearch
              ? "border-border bg-background"
              : "pointer-events-none border-transparent bg-transparent",
          )}
          onChange={(event) => onQueryChange(event.target.value)}
          onBlur={(event) => {
            if (query !== "") return;
            const next = event.relatedTarget;
            const shell = event.currentTarget.closest(`[data-testid='${SEARCH_SHELL}']`);
            if (next instanceof Node && shell?.contains(next)) return;
            setFilterOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            if (query !== "") {
              event.preventDefault();
              onQueryChange("");
              return;
            }
            setFilterOpen(false);
          }}
        />
        <Button
          ref={searchButtonRef}
          type="button"
          variant="ghost"
          size="sm"
          className={cn("absolute top-0 right-0", ACTION_BUTTON_CLASS)}
          aria-label="필터검색"
          aria-pressed={showSearch}
          aria-expanded={showSearch}
          aria-hidden={showSearch ? true : undefined}
          tabIndex={showSearch ? -1 : 0}
          data-testid="vault-filter"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (showSearch) {
              searchInputRef.current?.focus();
              return;
            }
            setFilterOpen(true);
          }}
        >
          <Icon name="Search" className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
