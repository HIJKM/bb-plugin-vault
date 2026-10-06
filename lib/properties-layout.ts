import type { Device, Viewport } from "./device.ts";

/** The rising sheet is a narrow phone. A narrow desktop stays the dock. A wider phone keeps the dock. */
export function propertiesUseSheet(input: {
  device: Device;
  viewport: Viewport;
}): boolean {
  if (input.viewport !== "narrow") return false;
  if (input.device === "phone") return true;
  return false;
}
