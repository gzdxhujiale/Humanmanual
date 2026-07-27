/**
 * logger — the single logging seam for the frontend.
 *
 * All error/warn reporting funnels through here so that format (unified
 * `[scope]` prefix) and future routing (toast, telemetry, file log) are
 * decided in exactly one place instead of 30+ scattered console calls.
 *
 * `logSilent` marks the few call sites where swallowing an error is a
 * deliberate, documented decision (e.g. offline fallback paths) — it still
 * logs at debug level so the information is never fully lost.
 */

export function logError(scope: string, message: string, err?: unknown): void {
  if (err !== undefined) {
    console.error(`[${scope}] ${message}:`, err);
  } else {
    console.error(`[${scope}] ${message}`);
  }
}

export function logWarn(scope: string, message: string, err?: unknown): void {
  if (err !== undefined) {
    console.warn(`[${scope}] ${message}:`, err);
  } else {
    console.warn(`[${scope}] ${message}`);
  }
}

/**
 * For intentionally-swallowed errors on degradable paths (offline fallback,
 * notification permission, etc.). Keeps a debug trace without polluting the
 * error console.
 */
export function logSilent(scope: string, message: string, err?: unknown): void {
  if (err !== undefined) {
    console.debug(`[${scope}] (silent) ${message}:`, err);
  } else {
    console.debug(`[${scope}] (silent) ${message}`);
  }
}
