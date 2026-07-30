import { create } from 'zustand';
import { callSilent } from '../../lib/tauriClient';
import { logError } from '@humanmanual/core';

interface PreferencesState {
  preferences: Record<string, string>;
  initialized: boolean;
  
  getPreference: (key: string, defaultValue?: string) => string;
  setPreference: (key: string, value: string) => Promise<void>;
  init: () => Promise<void>;
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  preferences: {},
  initialized: false,

  getPreference: (key: string, defaultValue: string = '') => {
    return get().preferences[key] ?? localStorage.getItem(key) ?? defaultValue;
  },

  setPreference: async (key: string, value: string) => {
    set(state => ({
      preferences: {
        ...state.preferences,
        [key]: value
      }
    }));
    localStorage.setItem(key, value);
    // Backend write is best-effort: localStorage already holds the value.
    await callSilent('db_set_preference', { key, value }, undefined);
  },

  init: async () => {
    if (get().initialized) return;
    try {
      const keysToLoad = ['tm-hide-completed', 'lists-sidebar-collapsed', 'lists-active-list-id', 'lists-note-open-mode', 'toolbar-tool-order'];
      const loadedPrefs: Record<string, string> = {};
      
      for (const key of keysToLoad) {
        const val = await callSilent<string | null>('db_get_preference', { key }, null);
        if (val !== null) {
          loadedPrefs[key] = val;
          localStorage.setItem(key, val);
        }
      }

      set(state => ({
        preferences: {
          ...state.preferences,
          ...loadedPrefs
        },
        initialized: true
      }));
    } catch (e) {
      logError('preferencesStore', 'failed to initialize preferences', e);
      set({ initialized: true });
    }
  }
}));

// Initialize
usePreferencesStore.getState().init();
