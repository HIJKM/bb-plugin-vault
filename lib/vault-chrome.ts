import type { Device, Viewport } from "./device.ts";

export type VaultChromeAxes = {
  device: Device;
  viewport: Viewport;
};

/**
 * Narrow window layout, with a separate branch per device.
 * A wide phone stays on the wide layout it already has.
 * Tablet has no stage.
 */
export function stackedLayout(chrome: VaultChromeAxes): boolean {
  if (chrome.viewport !== "narrow") return false;
  if (chrome.device === "phone") return true;
  if (chrome.device === "desktop") return true;
  return false;
}

/** Type and control size the narrow phone already uses. Desktop never grows. */
export function phoneMetrics(chrome: VaultChromeAxes): boolean {
  return chrome.device === "phone" && chrome.viewport === "narrow";
}
