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

export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
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
