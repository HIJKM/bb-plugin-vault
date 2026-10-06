export type Device = "phone" | "tablet" | "desktop";
export type Orientation = "portrait" | "landscape";
export type Viewport = "narrow" | "medium" | "wide";
export type HitTarget = "large" | "small";
export type ChromeFamily = "mobile" | "tablet" | "desktop";

export const PHONE_MAX_MIN_EDGE = 600;
export const VIEWPORT_MEDIUM_MIN = 768;
export const VIEWPORT_WIDE_MIN = 1024;

export type DeviceSignals = {
  hoverNone: boolean;
  pointerCoarse: boolean;
  pointerFine: boolean;
  anyPointerCoarse: boolean;
  screenWidth: number;
  screenHeight: number;
  maxTouchPoints: number;
  userAgent: string;
  platform: string;
};

export function minScreenEdge(width: number, height: number): number {
  return Math.min(width, height);
}

export function isIpadHybrid(
  signals: Pick<DeviceSignals, "maxTouchPoints" | "userAgent" | "platform">,
): boolean {
  if (signals.maxTouchPoints <= 1) return false;
  const haystack = `${signals.platform} ${signals.userAgent}`;
  if (/iPhone/i.test(haystack)) return false;
  return /iPad/i.test(haystack) || /MacIntel/i.test(signals.platform);
}

export function readDevice(signals: DeviceSignals): Device {
  if (isIpadHybrid(signals)) return "tablet";
  if (/Electron/i.test(signals.userAgent)) return "desktop";

  const minEdge = minScreenEdge(signals.screenWidth, signals.screenHeight);

  if (signals.pointerFine && !signals.hoverNone) return "desktop";

  if (
    signals.hoverNone &&
    signals.pointerCoarse &&
    minEdge < PHONE_MAX_MIN_EDGE
  ) {
    return "phone";
  }

  if (signals.anyPointerCoarse && minEdge >= PHONE_MAX_MIN_EDGE) {
    return "tablet";
  }

  return "desktop";
}

export function readOrientation(portrait: boolean): Orientation {
  return portrait ? "portrait" : "landscape";
}

export function readViewport(width: number): Viewport {
  if (width < VIEWPORT_MEDIUM_MIN) return "narrow";
  if (width < VIEWPORT_WIDE_MIN) return "medium";
  return "wide";
}

export function readHitTarget(
  device: Device,
  pointerCoarse: boolean,
): HitTarget {
  if (device === "phone" || device === "tablet") return "large";
  return pointerCoarse ? "large" : "small";
}

export function chromeFamily(device: Device): ChromeFamily {
  return device === "phone" ? "mobile" : device;
}

export function readWindowSignals(
  win: Pick<Window, "screen" | "navigator" | "matchMedia">,
): DeviceSignals {
  return {
    hoverNone: win.matchMedia("(hover: none)").matches,
    pointerCoarse: win.matchMedia("(pointer: coarse)").matches,
    pointerFine: win.matchMedia("(pointer: fine)").matches,
    anyPointerCoarse: win.matchMedia("(any-pointer: coarse)").matches,
    screenWidth: win.screen.width,
    screenHeight: win.screen.height,
    maxTouchPoints: win.navigator.maxTouchPoints,
    userAgent: win.navigator.userAgent,
    platform: win.navigator.platform,
  };
}

export type DeviceChrome = {
  device: Device;
  orientation: Orientation;
  viewport: Viewport;
  hitTarget: HitTarget;
  chromeFamily: ChromeFamily;
};

export function sameDeviceChrome(a: DeviceChrome, b: DeviceChrome): boolean {
  return (
    a.device === b.device &&
    a.orientation === b.orientation &&
    a.viewport === b.viewport &&
    a.hitTarget === b.hitTarget &&
    a.chromeFamily === b.chromeFamily
  );
}

export function reuseChromeSnapshot(
  previous: DeviceChrome | null,
  next: DeviceChrome,
): DeviceChrome {
  if (previous && sameDeviceChrome(previous, next)) return previous;
  return next;
}

export function readWindowChrome(win: Window): DeviceChrome {
  const signals = readWindowSignals(win);
  const device = readDevice(signals);
  return {
    device,
    orientation: readOrientation(win.matchMedia("(orientation: portrait)").matches),
    viewport: readViewport(win.innerWidth),
    hitTarget: readHitTarget(device, signals.pointerCoarse),
    chromeFamily: chromeFamily(device),
  };
}
