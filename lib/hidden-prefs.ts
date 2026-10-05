import { useSyncExternalStore } from "react";

import {
  acceptHiddenName,
  parseHiddenNames,
  showHiddenFromStorage,
  type HiddenListPrefs,
} from "./hidden-files.ts";

const SHOW_KEY = "vault-show-hidden";
const NAMES_KEY = "vault-hidden-names";

type Listener = () => void;

function readPrefs(): HiddenListPrefs {
  if (typeof localStorage === "undefined") return { showHidden: false, names: [] };
  try {
    return {
      showHidden: showHiddenFromStorage(localStorage.getItem(SHOW_KEY)),
      names: parseHiddenNames(localStorage.getItem(NAMES_KEY)),
    };
  } catch {
    return { showHidden: false, names: [] };
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode keeps the in-memory value only.
  }
}

let prefs: HiddenListPrefs = readPrefs();
const listeners = new Set<Listener>();

function commit(next: HiddenListPrefs): void {
  prefs = next;
  for (const listener of listeners) listener();
}

export function getHiddenPrefs(): HiddenListPrefs {
  return prefs;
}

export function subscribeHiddenPrefs(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setShowHidden(showHidden: boolean): void {
  if (prefs.showHidden === showHidden) return;
  writeStorage(SHOW_KEY, showHidden ? "1" : "0");
  commit({ showHidden, names: prefs.names });
}

export function addHiddenName(input: string): boolean {
  const name = acceptHiddenName(input);
  if (name === null || prefs.names.includes(name)) return false;
  const names = [...prefs.names, name];
  writeStorage(NAMES_KEY, JSON.stringify(names));
  commit({ showHidden: prefs.showHidden, names });
  return true;
}

export function removeHiddenName(name: string): void {
  if (!prefs.names.includes(name)) return;
  const names = prefs.names.filter((item) => item !== name);
  writeStorage(NAMES_KEY, JSON.stringify(names));
  commit({ showHidden: prefs.showHidden, names });
}

export function useHiddenPrefs(): HiddenListPrefs {
  return useSyncExternalStore(subscribeHiddenPrefs, getHiddenPrefs, getHiddenPrefs);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== SHOW_KEY && event.key !== NAMES_KEY) return;
    commit(readPrefs());
  });
}
