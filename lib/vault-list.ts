export type Vault = {
  id: string;
  name: string;
  hostId: string | null;
  rootPath: string;
};

type Listener = (vaults: Vault[]) => void;

const listeners = new Set<Listener>();
let snapshot: Vault[] = [];

export function rememberedVaults(): Vault[] {
  return snapshot;
}

export function publishVaults(vaults: Vault[]): void {
  snapshot = vaults;
  for (const listener of listeners) listener(vaults);
}

export function subscribeVaults(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
