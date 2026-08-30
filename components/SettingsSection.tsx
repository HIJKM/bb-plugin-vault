import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useRpc, type PluginSettingsSectionProps } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn, formatHomePathForDisplay } from "@/lib/utils";
import { publishVaults, rememberedVaults, type Vault } from "@/lib/vault-list";
import type { rpcContract } from "../server";

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function moveId(ids: readonly string[], fromId: string, toId: string): string[] {
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return [...ids];
  const next = [...ids];
  const [item] = next.splice(from, 1);
  if (item === undefined) return [...ids];
  next.splice(to, 0, item);
  return next;
}

export function SettingsSection(_props: PluginSettingsSectionProps) {
  const rpc = useRpc<typeof rpcContract>();
  const [vaults, setVaults] = useState<Vault[]>(() => rememberedVaults());
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(() => rememberedVaults().length === 0);
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const applyVaults = useCallback((next: Vault[]) => {
    publishVaults(next);
    setVaults(next);
  }, []);

  const load = useCallback(async () => {
    try {
      const result = await rpc.call("listVaults");
      if (!activeRef.current) return;
      applyVaults(result.vaults);
      setLoading(false);
    } catch (cause: unknown) {
      if (!activeRef.current) return;
      setLoading(false);
      toast.error(errorText(cause, "볼트 목록을 읽지 못했습니다."));
    }
  }, [applyVaults, rpc]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextPath = path.trim();
    if (nextPath === "" || busy) return;
    setBusy(true);
    try {
      const result = await rpc.call("addVault", { path: nextPath });
      if (!activeRef.current) return;
      applyVaults(result.vaults);
      setPath("");
      toast.success("볼트를 추가했습니다.");
    } catch (cause: unknown) {
      if (activeRef.current) toast.error(errorText(cause, "볼트를 추가하지 못했습니다."));
    } finally {
      if (activeRef.current) setBusy(false);
    }
  }

  async function removeVault(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await rpc.call("removeVault", { id });
      if (!activeRef.current) return;
      applyVaults(result.vaults);
      toast.success("볼트를 뺐습니다.");
    } catch (cause: unknown) {
      if (activeRef.current) toast.error(errorText(cause, "볼트를 빼지 못했습니다."));
    } finally {
      if (activeRef.current) setBusy(false);
    }
  }

  async function persistOrder(ids: string[]) {
    setBusy(true);
    try {
      const result = await rpc.call("reorderVaults", { ids });
      if (!activeRef.current) return;
      applyVaults(result.vaults);
    } catch (cause: unknown) {
      if (activeRef.current) {
        toast.error(errorText(cause, "순서를 저장하지 못했습니다."));
        void load();
      }
    } finally {
      if (activeRef.current) setBusy(false);
    }
  }

  function onDragStart(event: DragEvent<HTMLLIElement>, id: string) {
    event.dataTransfer.setData("text/plain", id);
    event.dataTransfer.effectAllowed = "move";
    setDragId(id);
  }

  function onDragOver(event: DragEvent<HTMLLIElement>, id: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (overId !== id) setOverId(id);
  }

  function onDrop(event: DragEvent<HTMLLIElement>, id: string) {
    event.preventDefault();
    const fromId = event.dataTransfer.getData("text/plain") || dragId;
    setDragId(null);
    setOverId(null);
    if (fromId === null || fromId === "" || fromId === id) return;
    const ids = moveId(
      vaults.map((vault) => vault.id),
      fromId,
      id,
    );
    applyVaults(ids.flatMap((vaultId) => vaults.filter((vault) => vault.id === vaultId)));
    void persistOrder(ids);
  }

  return (
    <div className="w-full space-y-3" data-testid="vault-settings-section">
      <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => void addVault(event)}>
        <Input
          value={path}
          onChange={(event) => setPath(event.target.value)}
          placeholder="폴더 경로, 예: ~/Vault/memex"
          aria-label="볼트 경로"
          className="min-w-0 flex-1 font-mono"
          disabled={busy}
        />
        <Button type="submit" size="sm" disabled={busy || path.trim() === ""}>
          추가
        </Button>
      </form>

      {loading && vaults.length === 0 ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : vaults.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 추가한 볼트가 없습니다.</p>
      ) : (
        <ul className="space-y-1">
          {vaults.map((vault) => {
            const dragging = vault.id === dragId;
            const over = vault.id === overId && dragId !== null && dragId !== vault.id;
            return (
              <li
                key={vault.id}
                draggable={!busy}
                onDragStart={(event) => onDragStart(event, vault.id)}
                onDragOver={(event) => onDragOver(event, vault.id)}
                onDragLeave={() => {
                  if (overId === vault.id) setOverId(null);
                }}
                onDrop={(event) => onDrop(event, vault.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-2",
                  dragging ? "opacity-50" : "",
                  over ? "border-primary" : "",
                )}
              >
                <span
                  className="shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
                  aria-hidden="true"
                >
                  <Icon name="DragDropVertical" className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{vault.name}</div>
                  <div className="truncate font-mono text-xs text-muted-foreground" title={vault.rootPath}>
                    {formatHomePathForDisplay(vault.rootPath)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  disabled={busy}
                  aria-label={`${vault.name} 제거`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => void removeVault(vault.id)}
                >
                  <Icon name="Trash2" className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
