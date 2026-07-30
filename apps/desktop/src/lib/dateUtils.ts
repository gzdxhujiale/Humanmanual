/**
 * dateUtils — shared pure date helpers.
 *
 * Local-timezone `YYYY-MM-DD` formatting and whole-day arithmetic were
 * re-implemented in habit / daily-review / pomodoro / time-management; this
 * module is now the single source. All functions are pure and side-effect
 * free.
 */

/** Format a Date as local-timezone `YYYY-MM-DD`. */
export function formatDateYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today as local-timezone `YYYY-MM-DD`. */
export function todayYMD(): string {
  return formatDateYMD(new Date());
}

/**
 * Absolute whole-day difference between two `YYYY-MM-DD` (or parseable)
 * date strings, ignoring the time-of-day component.
 */
export function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/** Parse a `YYYY-MM-DD` string into a local-midnight Date, or null if invalid. */
export function parseYMD(dateStr: string): Date | null {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}
