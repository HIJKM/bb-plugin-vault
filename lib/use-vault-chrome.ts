import { useMemo } from "react";

import type { Device, HitTarget, Orientation, Viewport } from "./device.ts";
import { useDeviceChrome } from "./use-device.ts";

export type VaultChrome = {
  device: Device;
  orientation: Orientation;
  viewport: Viewport;
  hitTarget: HitTarget;
};

/** Decision fields from `useDeviceChrome()`. `chromeFamily` is not used. */
export function useVaultChrome(): VaultChrome {
  const { device, orientation, viewport, hitTarget } = useDeviceChrome();
  return useMemo(
    () => ({ device, orientation, viewport, hitTarget }),
    [device, orientation, viewport, hitTarget],
  );
}
