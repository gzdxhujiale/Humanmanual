import React from "react";
import { usePreferencesStore } from "../../features/settings/preferencesStore";

const TOOL_ORDER_KEY = "toolbar-tool-order";

function parseOrder(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Persisted toolbar tool order. Only tool ids are stored (localStorage +
 * best-effort SQLite via preferencesStore); icon/component stay in the static
 * registry so lazy chunks are never affected by reordering.
 *
 * Saved ids unknown to the registry are dropped; new tools not present in the
 * saved order are appended, so upgrades stay compatible with old data.
 */
export function useToolOrder(defaultIds: readonly string[]) {
  const setPreference = usePreferencesStore((s) => s.setPreference);
  const stored = usePreferencesStore((s) => s.preferences[TOOL_ORDER_KEY]);
  const raw = stored ?? localStorage.getItem(TOOL_ORDER_KEY);

  const orderedIds = React.useMemo(() => {
    const saved = parseOrder(raw).filter((id) => defaultIds.includes(id));
    return [...saved, ...defaultIds.filter((id) => !saved.includes(id))];
  }, [raw, defaultIds]);

  const setOrder = React.useCallback(
    (ids: string[]) => {
      void setPreference(TOOL_ORDER_KEY, JSON.stringify(ids));
    },
    [setPreference]
  );

  return { orderedIds, setOrder };
}
