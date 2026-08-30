import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
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

function idsEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

type DragState = {
  id: string;
  startIds: string[];
};

export function SettingsSection(_props: PluginSettingsSectionProps) {
  const rpc = useRpc<typeof rpcContract>();
  const [vaults, setVaults] = useState<Vault[]>(() => rememberedVaults());
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(() => rememberedVaults().length === 0);
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const activeRef = useRef(true);
  const listRef = useRef<HTMLUListElement>(null);
  const vaultsRef = useRef(vaults);
  const dragRef = useRef<DragState | null>(null);
  vaultsRef.current = vaults;

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

  function rowIdAtY(clientY: number): string | null {
    const list = listRef.current;
    if (list === null) return null;
    const rows = Array.from(list.querySelectorAll("[data-vault-id]"));
    for (const row of rows) {
      if (!(row instanceof HTMLElement)) continue;
      const box = row.getBoundingClientRect();
      if (clientY >= box.top && clientY <= box.bottom) return row.dataset.vaultId ?? null;
    }
    if (rows.length === 0) return null;
    const first = rows[0];
    const last = rows[rows.length - 1];
    if (!(first instanceof HTMLElement) || !(last instanceof HTMLElement)) return null;
    if (clientY < first.getBoundingClientRect().top) return first.dataset.vaultId ?? null;
    return last.dataset.vaultId ?? null;
  }

  function onGripPointerDown(event: PointerEvent<HTMLSpanElement>, id: string) {
    if (busy || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id, startIds: vaultsRef.current.map((vault) => vault.id) };
    setDragId(id);
  }

  function onGripPointerMove(event: PointerEvent<HTMLSpanElement>) {
    const drag = dragRef.current;
    if (drag === null) return;
    const overId = rowIdAtY(event.clientY);
    if (overId === null || overId === drag.id) return;
    const current = vaultsRef.current;
    const ids = moveId(
      current.map((vault) => vault.id),
      drag.id,
      overId,
    );
    setVaults(ids.flatMap((vaultId) => current.filter((vault) => vault.id === vaultId)));
  }

  function onGripPointerUp(event: PointerEvent<HTMLSpanElement>) {
    const drag = dragRef.current;
    if (drag === null) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragId(null);
    const ids = vaultsRef.current.map((vault) => vault.id);
    if (!idsEqual(ids, drag.startIds)) void persistOrder(ids);
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
        <ul ref={listRef} className={cn("space-y-1", dragId !== null ? "select-none" : "")}>
          {vaults.map((vault) => {
            const dragging = vault.id === dragId;
            return (
              <li
                key={vault.id}
                data-vault-id={vault.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-2",
                  dragging ? "border-primary opacity-70" : "",
                )}
              >
                <span
                  className="shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
                  aria-label={`${vault.name} 순서 바꾸기`}
                  onPointerDown={(event) => onGripPointerDown(event, vault.id)}
                  onPointerMove={onGripPointerMove}
                  onPointerUp={onGripPointerUp}
                  onPointerCancel={onGripPointerUp}
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
