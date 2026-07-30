import { invoke } from '@tauri-apps/api/core';
import { callSilent } from '../../lib/tauriClient';
import { logSilent, logWarn } from '@humanmanual/core';
import { FavoriteFocusTask, PomodoroRecord } from './pomodoroTypes';

const STORAGE_KEY_RECORDS = 'fishworker_pomodoro_records_v1';
const STORAGE_KEY_FAVORITES = 'fishworker_pomodoro_favorites_v1';
const STORAGE_KEY_MIN_EFFECTIVE_MINS = 'fishworker_pomodoro_min_effective_mins_v1';
const STORAGE_KEY_INITIALIZED = 'fishworker_pomodoro_initialized_v1';

/**
 * pomodoroService — data-access seam for the Pomodoro feature.
 *
 * Unlike other services this one degrades deliberately: when the backend is
 * unreachable (web preview / offline) it falls back to localStorage instead
 * of throwing. Every swallowed error goes through `callSilent`/`logSilent`
 * so the degradation stays visible in debug logs.
 */

export interface PomodoroData {
  records: PomodoroRecord[];
  favoriteTasks: FavoriteFocusTask[];
}

export interface PomodoroDataResult {
  records: PomodoroRecord[];
  favoriteTasks: FavoriteFocusTask[];
  isFromDb: boolean;
}

export const pomodoroService = {
  async loadAll(): Promise<PomodoroDataResult> {
    try {
      const data = await invoke<PomodoroData>('pomodoro_load_all');
      if (data && (data.records !== undefined || data.favoriteTasks !== undefined)) {
        return {
          records: data.records || [],
          favoriteTasks: data.favoriteTasks || [],
          isFromDb: true,
        };
      }
    } catch (e) {
      logSilent('pomodoroService', 'load_all unavailable, falling back to localStorage', e);
    }

    // Local storage fallback
    let records: PomodoroRecord[] = [];
    let favoriteTasks: FavoriteFocusTask[] = [];
    try {
      const rawRecs = localStorage.getItem(STORAGE_KEY_RECORDS);
      if (rawRecs !== null) records = JSON.parse(rawRecs);

      const rawFavs = localStorage.getItem(STORAGE_KEY_FAVORITES);
      if (rawFavs !== null) favoriteTasks = JSON.parse(rawFavs);
    } catch (e) {
      logWarn('pomodoroService', 'failed to parse localStorage fallback', e);
    }

    return { records, favoriteTasks, isFromDb: false };
  },

  async getMinEffectiveMinutes(): Promise<number> {
    const val = await callSilent<string | null>(
      'db_get_preference',
      { key: 'pomodoro_min_effective_minutes' },
      null
    );
    if (val !== null && val !== undefined) {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY_MIN_EFFECTIVE_MINS);
      if (raw !== null) {
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed) && parsed >= 0) return parsed;
      }
    } catch (e) {
      logSilent('pomodoroService', 'localStorage read failed', e);
    }

    return 5; // Default 5 minutes
  },

  async setMinEffectiveMinutes(mins: number): Promise<void> {
    const valStr = String(mins);
    try {
      localStorage.setItem(STORAGE_KEY_MIN_EFFECTIVE_MINS, valStr);
    } catch (e) {
      logSilent('pomodoroService', 'localStorage write failed', e);
    }

    await callSilent('db_set_preference', { key: 'pomodoro_min_effective_minutes', value: valStr }, undefined);
  },

  async upsertRecord(record: PomodoroRecord): Promise<void> {
    // Failure is fine: local memory + localStorage already hold the record.
    await callSilent('pomodoro_upsert_record', { record }, undefined);
  },

  async deleteRecord(id: string): Promise<void> {
    await callSilent('pomodoro_delete_record', { id }, undefined);
  },

  async clearAllRecords(): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEY_INITIALIZED, 'true');
    } catch (e) {
      logSilent('pomodoroService', 'localStorage clear failed', e);
    }

    try {
      await invoke('pomodoro_clear_all_records');
    } catch (e) {
      logWarn('pomodoroService', 'failed to clear records from backend DB', e);
    }
  },

  async upsertFavoriteTask(task: FavoriteFocusTask): Promise<void> {
    await callSilent('pomodoro_upsert_favorite', { task }, undefined);
  },

  async deleteFavoriteTask(id: string): Promise<void> {
    await callSilent('pomodoro_delete_favorite', { id }, undefined);
  },
};
