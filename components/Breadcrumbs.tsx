import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/ui/icon";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { cn } from "@/lib/utils";

export interface VaultChoice {
  id: string;
  name: string;
}

export interface BreadcrumbsProps {
  rootLabel: string;
  vaults?: readonly VaultChoice[];
  vaultId?: string | null;
  onSelectVault?: (vaultId: string) => void;
  className?: string;
}

export function Breadcrumbs({
  rootLabel,
  vaults = [],
  vaultId = null,
  onSelectVault,
  className,
}: BreadcrumbsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuBox, setMenuBox] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const portalScopeProps = usePortalScopeProps();
  const canPickVault = vaults.length > 0 && onSelectVault !== undefined;

  useEffect(() => {
    if (!menuOpen) return;
    const anchor = rootRef.current;
    if (anchor !== null) {
      const rect = anchor.getBoundingClientRect();
      setMenuBox({ top: rect.bottom + 4, left: rect.left });
    }
    function onPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (rootRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const portalTarget = typeof document === "undefined" ? null : document.body;

  return (
    <nav
      aria-label="Breadcrumb"
      data-testid="vault-breadcrumbs"
      className={cn("flex w-max min-w-0 items-center gap-0.5", className)}
    >
      <button
        ref={canPickVault ? rootRef : undefined}
        type="button"
        aria-current="page"
        aria-haspopup={canPickVault ? "listbox" : undefined}
        aria-expanded={canPickVault ? menuOpen : undefined}
        aria-controls={canPickVault && menuOpen ? menuId : undefined}
        className="flex h-7 items-center gap-1 rounded-md px-1.5 text-xs font-semibold whitespace-nowrap text-foreground hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => {
          if (canPickVault) setMenuOpen((open) => !open);
        }}
      >
        <Icon name="FolderOpen" className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{rootLabel}</span>
        {canPickVault ? <Icon name="ChevronDown" className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
      </button>
      {menuOpen && portalTarget !== null
        ? createPortal(
            <div
              {...portalScopeProps}
              ref={menuRef}
              id={menuId}
              role="listbox"
              aria-label="디렉토리"
              className="max-h-64 min-w-40 overflow-y-auto rounded-md border border-border bg-background p-1 shadow-md"
              style={{ position: "fixed", top: menuBox.top, left: menuBox.left, zIndex: 80 }}
            >
              {vaults.map((vault) => {
                const selected = vault.id === vaultId;
                return (
                  <button
                    key={vault.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={cn(
                      "flex h-7 w-full items-center rounded-md px-2 text-left text-xs",
                      selected ? "bg-accent text-accent-foreground" : "hover:bg-state-hover",
                    )}
                    onClick={() => {
                      setMenuOpen(false);
                      onSelectVault?.(vault.id);
                    }}
                  >
                    {vault.name}
                  </button>
                );
              })}
            </div>,
            portalTarget,
          )
        : null}
    </nav>
  );
}
