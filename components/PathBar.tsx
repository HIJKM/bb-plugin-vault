import { Breadcrumbs, type VaultChoice } from "@/components/Breadcrumbs";

export interface PathBarProps {
  rootLabel: string;
  vaults?: readonly VaultChoice[];
  vaultId?: string | null;
  onSelectVault?: (vaultId: string) => void;
}

export function PathBar({ rootLabel, vaults, vaultId, onSelectVault }: PathBarProps) {
  return (
    <div
      className="relative flex min-w-0 flex-1 items-center"
      data-testid="vault-path-bar"
      title={rootLabel}
    >
      <Breadcrumbs
        rootLabel={rootLabel}
        vaults={vaults}
        vaultId={vaultId}
        onSelectVault={onSelectVault}
      />
    </div>
  );
}
