// Platform seam: single source of truth for platform detection.

import { platform } from '@tauri-apps/plugin-os';

export type AppPlatform = 'windows' | 'macos' | 'linux' | 'unknown';

let cachedPlatform: AppPlatform | null = null;

/** Detect current platform once; safe to call outside Tauri (tests / browser). */
export function getAppPlatform(): AppPlatform {
  if (cachedPlatform) return cachedPlatform;
  try {
    cachedPlatform = platform() as AppPlatform;
  } catch {
    cachedPlatform = 'unknown';
  }
  return cachedPlatform;
}

/** Desktop app platform check (always false in desktop app). */
export function isMobilePlatform(): boolean {
  return false;
}

/** Test hook: override platform detection (pass null to reset). */
export function __setPlatformForTest(p: AppPlatform | null): void {
  cachedPlatform = p;
}
