import { useLayoutEffect, useRef } from "react";

import { Breadcrumbs, type VaultChoice } from "@/components/Breadcrumbs";

export interface PathBarProps {
  folder: string;
  rootLabel: string;
  onNavigate: (path: string) => void;
  vaults?: readonly VaultChoice[];
  vaultId?: string | null;
  onSelectVault?: (vaultId: string) => void;
}

export function PathBar({ folder, rootLabel, onNavigate, vaults, vaultId, onSelectVault }: PathBarProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller === null) return;
    scroller.scrollLeft = scroller.scrollWidth;
  }, [folder]);

  return (
    <div
      className="relative flex min-w-0 flex-1 items-center"
      data-testid="vault-path-bar"
      title={folder === "" ? rootLabel : `${rootLabel}/${folder}`}
    >
      <div
        ref={scrollerRef}
        data-allow-pan
        className="flex h-6 min-w-0 flex-1 items-center overflow-x-auto overscroll-x-contain touch-pan-x [scrollbar-width:thin]"
      >
        <Breadcrumbs
          folder={folder}
          rootLabel={rootLabel}
          onNavigate={onNavigate}
          vaults={vaults}
          vaultId={vaultId}
          onSelectVault={onSelectVault}
        />
      </div>
    </div>
  );
}
