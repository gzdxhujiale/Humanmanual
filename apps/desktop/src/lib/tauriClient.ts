import { invoke } from '@tauri-apps/api/core';
import { logError, logSilent } from "@humanmanual/core";

/**
 * tauriClient — the single IPC seam between the frontend and the Tauri
 * backend.
 *
 * Every service goes through `call` (log + rethrow) or `callSilent`
 * (log-and-swallow, for degradable offline paths). Error reporting policy —
 * prefix format, future toast/telemetry — changes here, nowhere else.
 */

/**
 * Check if the application is running inside a Tauri Webview environment.
 */
export function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    if (!isTauriEnv()) {
      console.warn(`[Tauri IPC] Command '${cmd}' failed: App is running in standard browser or Tauri Rust backend process is down.`);
    }
    logError('tauri', `${cmd} failed`, e);
    throw e;
  }
}

/**
 * Like `call`, but swallows failures and returns `fallback`. Use only where
 * the caller genuinely can proceed without the backend (e.g. web preview,
 * localStorage fallback). The error is still traced at debug level.
 */
export async function callSilent<T>(
  cmd: string,
  args: Record<string, unknown> | undefined,
  fallback: T
): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    logSilent('tauri', `${cmd} failed (degraded)`, e);
    return fallback;
  }
}
