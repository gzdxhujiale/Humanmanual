import { invoke } from '@tauri-apps/api/core';
import { FavoriteFocusTask, PomodoroRecord } from './pomodoroTypes';

const STORAGE_KEY_RECORDS = 'fishworker_pomodoro_records_v1';
const STORAGE_KEY_FAVORITES = 'fishworker_pomodoro_favorites_v1';
const STORAGE_KEY_MIN_EFFECTIVE_MINS = 'fishworker_pomodoro_min_effective_mins_v1';
const STORAGE_KEY_INITIALIZED = 'fishworker_pomodoro_initialized_v1';

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
      if (data && (data.records !== undefined || data.favoriteTasks !== undefined || (data as any).favorite_tasks !== undefined)) {
        return {
          records: data.records || [],
          favoriteTasks: data.favoriteTasks || (data as any).favorite_tasks || [],
          isFromDb: true,
        };
      }
    } catch (e) {
      // Offline / Web browser fallback
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
      console.error('Failed to parse local storage fallback for pomodoro', e);
    }

    return { records, favoriteTasks, isFromDb: false };
  },

  async getMinEffectiveMinutes(): Promise<number> {
    try {
      const val = await invoke<string | null>('db_get_preference', { key: 'pomodoro_min_effective_minutes' });
      if (val !== null && val !== undefined) {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          return parsed;
        }
      }
    } catch (e) {
      // Fallback to localStorage
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY_MIN_EFFECTIVE_MINS);
      if (raw !== null) {
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed) && parsed >= 0) return parsed;
      }
    } catch (e) {}

    return 5; // Default 5 minutes
  },

  async setMinEffectiveMinutes(mins: number): Promise<void> {
    const valStr = String(mins);
    try {
      localStorage.setItem(STORAGE_KEY_MIN_EFFECTIVE_MINS, valStr);
    } catch (e) {}

    try {
      await invoke('db_set_preference', { key: 'pomodoro_min_effective_minutes', value: valStr });
    } catch (e) {
      // Offline fallback
    }
  },

  async upsertRecord(record: PomodoroRecord): Promise<void> {
    try {
      await invoke('pomodoro_upsert_record', { record });
    } catch (e) {
      // Fallback handled by local memory + localStorage
    }
  },

  async deleteRecord(id: string): Promise<void> {
    try {
      await invoke('pomodoro_delete_record', { id });
    } catch (e) {
      // Fallback handled by local memory + localStorage
    }
  },

  async clearAllRecords(): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEY_INITIALIZED, 'true');
    } catch (e) {}

    try {
      await invoke('pomodoro_clear_all_records');
    } catch (e) {
      console.warn('Failed to clear pomodoro records from backend DB:', e);
    }
  },

  async upsertFavoriteTask(task: FavoriteFocusTask): Promise<void> {
    try {
      await invoke('pomodoro_upsert_favorite', { task });
    } catch (e) {
      // Fallback handled by local memory + localStorage
    }
  },

  async deleteFavoriteTask(id: string): Promise<void> {
    try {
      await invoke('pomodoro_delete_favorite', { id });
    } catch (e) {
      // Fallback handled by local memory + localStorage
    }
  },
};
