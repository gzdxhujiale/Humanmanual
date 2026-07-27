// Platform seam: single source of truth for "are we on mobile?".
// All mobile adaptations (window services, layout, settings) branch on this module
// instead of sniffing the environment themselves.

import { platform } from '@tauri-apps/plugin-os';

export type AppPlatform = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown';

let cachedPlatform: AppPlatform | null = null;

/** Detect current platform once; safe to call outside Tauri (tests / browser). */
export function getAppPlatform(): AppPlatform {
  if (cachedPlatform) return cachedPlatform;
  try {
    // plugin-os platform() is synchronous in v2
    cachedPlatform = platform() as AppPlatform;
  } catch {
    // Not running inside Tauri (vitest / plain browser): fall back to UA
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (/android/i.test(ua)) cachedPlatform = 'android';
    else if (/iphone|ipad|ipod/i.test(ua)) cachedPlatform = 'ios';
    else cachedPlatform = 'unknown';
  }
  return cachedPlatform;
}

/** True on Android/iOS. Drives single-window overlays and mobile layout. */
export function isMobilePlatform(): boolean {
  const p = getAppPlatform();
  return p === 'android' || p === 'ios';
}

/** Test hook: override platform detection (pass null to reset). */
export function __setPlatformForTest(p: AppPlatform | null): void {
  cachedPlatform = p;
}
