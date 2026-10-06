import { useSyncExternalStore } from "react";

import {
  readWindowChrome,
  reuseChromeSnapshot,
  type DeviceChrome,
} from "./device.ts";

const QUERY_LIST = [
  "(hover: none)",
  "(pointer: coarse)",
  "(pointer: fine)",
  "(any-pointer: coarse)",
  "(orientation: portrait)",
] as const;

function subscribe(onStoreChange: () => void): () => void {
  const medias = QUERY_LIST.map((query) => window.matchMedia(query));
  for (const media of medias) {
    media.addEventListener("change", onStoreChange);
  }
  window.addEventListener("resize", onStoreChange);
  return () => {
    for (const media of medias) {
      media.removeEventListener("change", onStoreChange);
    }
    window.removeEventListener("resize", onStoreChange);
  };
}

const SERVER_SNAPSHOT = {
  device: "desktop",
  orientation: "landscape",
  viewport: "wide",
  hitTarget: "small",
  chromeFamily: "desktop",
} as const;

let cachedSnapshot: DeviceChrome = SERVER_SNAPSHOT;

function getSnapshot() {
  cachedSnapshot = reuseChromeSnapshot(cachedSnapshot, readWindowChrome(window));
  return cachedSnapshot;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

export function useDeviceChrome() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
