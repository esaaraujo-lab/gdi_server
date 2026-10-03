/**
 * Device detection helpers — Task 51-A.
 *
 * Lightweight parser that extracts a friendly device name (e.g. "iPhone 14",
 * "Samsung Galaxy S23", "Windows PC", "MacBook") from `navigator.userAgent`
 * and `navigator.platform`, plus the screen resolution.
 *
 * Returns safe defaults on SSR (no `navigator`).
 */

export interface DeviceInfo {
  deviceName: string;
  deviceType: "mobile" | "tablet" | "desktop";
  screenResolution: string | null;
  rawUserAgent: string;
}

/**
 * Parse a User-Agent string + platform into a friendly device descriptor.
 * Pure function — exported separately so it's trivially testable.
 */
export function parseDeviceInfo(
  userAgent: string,
  platform: string,
  screenWidth?: number,
  screenHeight?: number
): DeviceInfo {
  const ua = userAgent || "";
  const p = platform || "";
  const isMobile = /iPhone|Android.*Mobile|Windows Phone|Mobile/i.test(ua);
  const isTablet = /iPad|Android(?!.*Mobile)|Tablet|Silk/i.test(ua);

  let deviceName = "Dispositivo Desconhecido";

  // iOS family
  const iphoneMatch = ua.match(/iPhone(\d+,\d+)?/);
  const ipadMatch = ua.match(/iPad(\d+,\d+)?/);
  if (iphoneMatch) {
    deviceName = "iPhone";
  } else if (ipadMatch) {
    deviceName = "iPad";
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    const macModelMatch = ua.match(/Macintosh;.*?(\d+[\d_,]+)/);
    deviceName = macModelMatch ? `Mac ${macModelMatch[1]}` : "Mac";
  } else if (/Windows NT/i.test(ua)) {
    deviceName = "Windows PC";
  } else if (/Android/i.test(ua)) {
    // Try to extract model — usually after "Android X.Y; <Model>"
    const androidModelMatch = ua.match(/Android[^;]*;\s*([^)]+?)\s*Build/i);
    if (androidModelMatch) {
      deviceName = `Android ${androidModelMatch[1].trim()}`.slice(0, 60);
    } else {
      deviceName = "Android Device";
    }
  } else if (/Linux/i.test(ua)) {
    deviceName = "Linux Device";
  } else if (p) {
    deviceName = p.slice(0, 40);
  }

  let deviceType: DeviceInfo["deviceType"] = "desktop";
  if (isTablet) deviceType = "tablet";
  else if (isMobile) deviceType = "mobile";

  const screenResolution =
    screenWidth && screenHeight ? `${screenWidth}x${screenHeight}` : null;

  return {
    deviceName,
    deviceType,
    screenResolution,
    rawUserAgent: ua,
  };
}

/**
 * Reads device info from the browser. Safe on SSR (returns defaults).
 */
export function getDeviceInfoBrowser(): DeviceInfo {
  if (typeof navigator === "undefined") {
    return {
      deviceName: "SSR",
      deviceType: "desktop",
      screenResolution: null,
      rawUserAgent: "",
    };
  }
  const ua =
    typeof navigator.userAgent === "string" ? navigator.userAgent : "";
  const platform =
    typeof navigator.platform === "string" ? navigator.platform : "";
  const sw =
    typeof window !== "undefined" && window.screen
      ? window.screen.width
      : undefined;
  const sh =
    typeof window !== "undefined" && window.screen
      ? window.screen.height
      : undefined;
  return parseDeviceInfo(ua, platform, sw, sh);
}
