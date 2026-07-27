import { create } from 'zustand';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { PomodoroMode, PomodoroPhase, PomodoroRecord, PomodoroStats, FavoriteFocusTask, LinkedTarget } from './pomodoroTypes';
import { pomodoroService } from './pomodoroService';
import { createSyncEngine } from '../../lib/createSyncEngine';

const STORAGE_KEY_RECORDS = 'fishworker_pomodoro_records_v1';
const STORAGE_KEY_FAVORITES = 'fishworker_pomodoro_favorites_v1';
const STORAGE_KEY_INITIALIZED = 'fishworker_pomodoro_initialized_v1';

export const FOCUS_DURATION_DEFAULT = 25 * 60; // 25 minutes in seconds
export const BREAK_DURATION_DEFAULT = 5 * 60;   // 5 minutes in seconds

const formatTimeDigit = (num: number) => String(num).padStart(2, '0');

export const formatDateLabel = (dateObj: Date): string => {
  return `${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
};

export const formatTimeStr = (dateObj: Date): string => {
  return `${formatTimeDigit(dateObj.getHours())}:${formatTimeDigit(dateObj.getMinutes())}`;
};

export const getTodayDateStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${formatTimeDigit(d.getMonth() + 1)}-${formatTimeDigit(d.getDate())}`;
};

// Initial Mock Favorite Task matching Screenshot 2 ("专注任务1")
const initialMockFavorites: FavoriteFocusTask[] = [
  {
    id: 'fav-1',
    name: '专注任务1',
    icon: '😊',
    mode: 'pomodoro',
    durationMinutes: 25,
    accumulatedMinutes: 0,
    isArchived: false,
    createdAt: new Date().toISOString(),
  },
];

// Initial Mock Records matching Screenshot 2 (including "o 习惯一" under 14:08-14:33)
const initialMockRecords: PomodoroRecord[] = [
  {
    id: 'mock-1',
    mode: 'pomodoro',
    phase: 'focus',
    startTime: '14:08',
    endTime: '14:33',
    durationMinutes: 25,
    date: getTodayDateStr(),
    dateLabel: '7月22日',
    timeRangeLabel: '14:08 - 14:33',
    linkedTarget: {
      type: 'habit',
      id: 'habit-1',
      title: '习惯一',
    },
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: 'mock-2',
    mode: 'pomodoro',
    phase: 'focus',
    startTime: '13:36',
    endTime: '14:01',
    durationMinutes: 25,
    date: getTodayDateStr(),
    dateLabel: '7月22日',
    timeRangeLabel: '13:36 - 14:01',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: 'mock-3',
    mode: 'pomodoro',
    phase: 'focus',
    startTime: '11:32',
    endTime: '11:53',
    durationMinutes: 20,
    date: getTodayDateStr(),
    dateLabel: '7月22日',
    timeRangeLabel: '11:32 - 11:53',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: 'mock-4',
    mode: 'pomodoro',
    phase: 'focus',
    startTime: '11:01',
    endTime: '11:26',
    durationMinutes: 25,
    date: getTodayDateStr(),
    dateLabel: '7月22日',
    timeRangeLabel: '11:01 - 11:26',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
  {
    id: 'mock-5',
    mode: 'pomodoro',
    phase: 'focus',
    startTime: '10:36',
    endTime: '11:01',
    durationMinutes: 25,
    date: getTodayDateStr(),
    dateLabel: '7月22日',
    timeRangeLabel: '10:36 - 11:01',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 7).toISOString(),
  },
  // 7月21日
  {
    id: 'mock-6',
    mode: 'pomodoro',
    phase: 'focus',
    startTime: '14:24',
    endTime: '15:35',
    durationMinutes: 71,
    date: '2026-07-21',
    dateLabel: '7月21日',
    timeRangeLabel: '14:24 - 15:35',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
  },
  {
    id: 'mock-7',
    mode: 'pomodoro',
    phase: 'focus',
    startTime: '13:53',
    endTime: '14:18',
    durationMinutes: 25,
    date: '2026-07-21',
    dateLabel: '7月21日',
    timeRangeLabel: '13:53 - 14:18',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 29).toISOString(),
  },
  // 7月15日
  {
    id: 'mock-8',
    mode: 'pomodoro',
    phase: 'focus',
    startTime: '09:22',
    endTime: '09:47',
    durationMinutes: 25,
    date: '2026-07-15',
    dateLabel: '7月15日',
    timeRangeLabel: '9:22 - 9:47',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
  },
];

const loadSavedRecords = (): PomodoroRecord[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECORDS);
    if (raw !== null) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load records from localStorage', e);
  }
  const isInit = localStorage.getItem(STORAGE_KEY_INITIALIZED);
  if (isInit === 'true') return [];
  return initialMockRecords;
};

const saveRecords = (records: PomodoroRecord[]) => {
  try {
    localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(records));
  } catch (e) {
    console.error('Failed to save records to localStorage', e);
  }
};

const loadSavedFavorites = (): FavoriteFocusTask[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FAVORITES);
    if (raw !== null) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load favorites from localStorage', e);
  }
  return initialMockFavorites;
};

const saveFavorites = (favs: FavoriteFocusTask[]) => {
  try {
    localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(favs));
  } catch (e) {
    console.error('Failed to save favorites to localStorage', e);
  }
};

const syncEngine = createSyncEngine();
const HIGH_FREQ_DELAY = 500;
const LOW_FREQ_DELAY = 300;

interface PomodoroState {
  mode: PomodoroMode;
  phase: PomodoroPhase;
  isRunning: boolean;
  timeLeft: number; // in seconds
  totalTargetSeconds: number; // 25*60 or custom
  targetEndTime: number | null; // target end timestamp in ms
  stopwatchSeconds: number;
  sessionStartTime: Date | null;
  focusDuration: number;
  breakDuration: number;
  minEffectiveMinutes: number;

  records: PomodoroRecord[];
  favoriteTasks: FavoriteFocusTask[];
  activeTab: 'active' | 'archived'; // "坚持中" | "已归档"
  activeFavoriteTaskId: string | null;

  // Actions
  syncAllFromDB: () => Promise<void>;
  setMode: (mode: PomodoroMode) => void;
  setPhase: (phase: PomodoroPhase) => void;
  setActiveTab: (tab: 'active' | 'archived') => void;
  setFocusDuration: (mins: number) => void;
  setBreakDuration: (mins: number) => void;
  setMinEffectiveMinutes: (mins: number) => void;
  startTimer: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  tick: () => void;
  finishCurrentSession: (reason?: 'auto' | 'manual') => void;

  // Favorite Tasks CRUD
  addFavoriteTask: (payload: {
    name: string;
    icon?: string;
    mode: PomodoroMode;
    durationMinutes: number;
    linkedTarget?: LinkedTarget;
  }) => void;
  updateFavoriteTask: (id: string, updates: Partial<FavoriteFocusTask>) => void;
  archiveFavoriteTask: (id: string) => void;
  unarchiveFavoriteTask: (id: string) => void;
  deleteFavoriteTask: (id: string) => void;
  startFavoriteTask: (id: string) => void;

  // Manual record & Clear
  addManualRecord: (minutes: number) => void;
  deleteRecord: (id: string) => void;
  clearAllRecords: () => void;

  // Computed getters
  getStats: () => PomodoroStats;
  getActiveFavoriteTasks: () => FavoriteFocusTask[];
  getArchivedFavoriteTasks: () => FavoriteFocusTask[];
}

export const requestNotificationPermission = async () => {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === 'granted';
    }
  } catch (e) {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (err) {}
    }
  }
};

export const sendDesktopNotification = async (title: string, body: string) => {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === 'granted';
    }
    if (granted) {
      sendNotification({
        title,
        body,
      });
      return;
    }
  } catch (e) {
    console.warn('Tauri notification plugin failed, trying Web Notification fallback:', e);
  }

  // Fallback to Web Notification API
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        tag: 'fishworker-pomodoro-notification',
      });
    } catch (e) {
      console.error('Failed to send desktop notification via Web API:', e);
    }
  }
};

let globalTimerInterval: NodeJS.Timeout | null = null;

const stopGlobalTimer = () => {
  if (globalTimerInterval) {
    clearInterval(globalTimerInterval);
    globalTimerInterval = null;
  }
};

const startGlobalTimer = () => {
  stopGlobalTimer();
  globalTimerInterval = setInterval(() => {
    usePomodoroStore.getState().tick();
  }, 500);
};

export const usePomodoroStore = create<PomodoroState>((set, get) => ({
  mode: 'pomodoro',
  phase: 'focus',
  isRunning: false,
  timeLeft: FOCUS_DURATION_DEFAULT,
  totalTargetSeconds: FOCUS_DURATION_DEFAULT,
  targetEndTime: null,
  stopwatchSeconds: 0,
  sessionStartTime: null,
  focusDuration: FOCUS_DURATION_DEFAULT,
  breakDuration: BREAK_DURATION_DEFAULT,
  minEffectiveMinutes: 5,

  records: loadSavedRecords(),
  favoriteTasks: loadSavedFavorites(),
  activeTab: 'active',
  activeFavoriteTaskId: null,

  syncAllFromDB: async () => {
    try {
      const dbData = await pomodoroService.loadAll();
      const minMins = await pomodoroService.getMinEffectiveMinutes();
      const isInit = localStorage.getItem(STORAGE_KEY_INITIALIZED);

      let mergedRecords: PomodoroRecord[];
      let mergedFavs: FavoriteFocusTask[];

      if (dbData.isFromDb) {
        if (!isInit && dbData.records.length === 0) {
          // Brand new app launch before any records or initialization:
          mergedRecords = initialMockRecords;
          localStorage.setItem(STORAGE_KEY_INITIALIZED, 'true');
          for (const rec of initialMockRecords) {
            pomodoroService.upsertRecord(rec).catch(() => {});
          }
        } else {
          // DB is ground truth! (Even if [])
          mergedRecords = dbData.records;
          localStorage.setItem(STORAGE_KEY_INITIALIZED, 'true');
        }

        if (!isInit && dbData.favoriteTasks.length === 0) {
          mergedFavs = initialMockFavorites;
          for (const fav of initialMockFavorites) {
            pomodoroService.upsertFavoriteTask(fav).catch(() => {});
          }
        } else {
          mergedFavs = dbData.favoriteTasks.length > 0 ? dbData.favoriteTasks : get().favoriteTasks;
        }
      } else {
        mergedRecords = dbData.records;
        mergedFavs = dbData.favoriteTasks;
      }

      saveRecords(mergedRecords);
      saveFavorites(mergedFavs);

      set({
        records: mergedRecords,
        favoriteTasks: mergedFavs,
        minEffectiveMinutes: minMins,
      });
    } catch (e) {
      console.error('Failed to sync pomodoro data from DB:', e);
    }
  },

  setMode: (mode: PomodoroMode) => {
    const state = get();
    // Do not allow switching mode while timer is running
    if (state.isRunning || state.mode === mode) return;
    stopGlobalTimer();
    set({
      mode,
      isRunning: false,
      stopwatchSeconds: 0,
      targetEndTime: null,
      sessionStartTime: null,
      timeLeft: state.phase === 'focus' ? state.focusDuration : state.breakDuration,
      totalTargetSeconds: state.phase === 'focus' ? state.focusDuration : state.breakDuration,
    });
  },

  setPhase: (phase: PomodoroPhase) => {
    const state = get();
    stopGlobalTimer();
    const duration = phase === 'focus' ? state.focusDuration : state.breakDuration;
    set({
      phase,
      isRunning: false,
      targetEndTime: null,
      timeLeft: duration,
      totalTargetSeconds: duration,
      sessionStartTime: null,
    });
  },

  setActiveTab: (tab: 'active' | 'archived') => {
    set({ activeTab: tab });
  },

  setFocusDuration: (mins: number) => {
    const secs = Math.max(1, mins) * 60;
    set((state) => {
      const isFocus = state.phase === 'focus';
      return {
        focusDuration: secs,
        timeLeft: isFocus && !state.isRunning ? secs : state.timeLeft,
        totalTargetSeconds: isFocus ? secs : state.totalTargetSeconds,
      };
    });
  },

  setBreakDuration: (mins: number) => {
    const secs = Math.max(1, mins) * 60;
    set((state) => {
      const isBreak = state.phase === 'break';
      return {
        breakDuration: secs,
        timeLeft: isBreak && !state.isRunning ? secs : state.timeLeft,
        totalTargetSeconds: isBreak ? secs : state.totalTargetSeconds,
      };
    });
  },

  setMinEffectiveMinutes: (mins: number) => {
    const cleanMins = Math.max(0, mins);
    set({ minEffectiveMinutes: cleanMins });
    pomodoroService.setMinEffectiveMinutes(cleanMins);
  },

  startTimer: () => {
    const state = get();
    if (state.isRunning) return;
    requestNotificationPermission();

    const now = Date.now();
    const startTime = state.sessionStartTime || new Date(now);
    let targetEnd = state.targetEndTime;

    if (state.mode === 'pomodoro' && !targetEnd) {
      targetEnd = now + state.timeLeft * 1000;
    }

    set({
      isRunning: true,
      sessionStartTime: startTime,
      targetEndTime: targetEnd,
    });

    startGlobalTimer();
  },

  pauseTimer: () => {
    stopGlobalTimer();
    set({ isRunning: false, targetEndTime: null });
  },

  resetTimer: () => {
    const state = get();
    const wasRunning = state.isRunning;
    stopGlobalTimer();
    const target = state.phase === 'focus' ? state.focusDuration : state.breakDuration;

    if (wasRunning) {
      sendDesktopNotification('⏱️ 番茄计时已停止', '当前番茄计时已手动重置并停止。');
    }

    set({
      isRunning: false,
      timeLeft: target,
      stopwatchSeconds: 0,
      sessionStartTime: null,
      targetEndTime: null,
    });
  },

  tick: () => {
    const state = get();
    if (!state.isRunning) return;

    const now = Date.now();

    if (state.mode === 'stopwatch') {
      if (!state.sessionStartTime) return;
      const elapsed = Math.max(0, Math.floor((now - state.sessionStartTime.getTime()) / 1000));
      if (elapsed !== state.stopwatchSeconds) {
        set({ stopwatchSeconds: elapsed });
      }
      return;
    }

    if (state.mode === 'pomodoro') {
      if (!state.targetEndTime) return;
      const remaining = Math.max(0, Math.ceil((state.targetEndTime - now) / 1000));

      if (remaining !== state.timeLeft) {
        set({ timeLeft: remaining });
      }

      if (remaining <= 0) {
        stopGlobalTimer();
        get().finishCurrentSession('auto');
      }
    }
  },

  finishCurrentSession: (reason: 'auto' | 'manual' = 'manual') => {
    const state = get();
    stopGlobalTimer();
    const now = new Date();
    const start = state.sessionStartTime || new Date(now.getTime() - state.totalTargetSeconds * 1000);

    const activeFav = state.favoriteTasks.find((f) => f.id === state.activeFavoriteTaskId);
    const taskName = activeFav ? activeFav.name : (state.phase === 'focus' ? '专注任务' : '休息');

    let isRecordSaved = false;

    if (state.phase === 'focus') {
      let durationMins = 0;
      if (state.mode === 'stopwatch') {
        const elapsedSecs = state.sessionStartTime
          ? Math.max(0, Math.floor((now.getTime() - state.sessionStartTime.getTime()) / 1000))
          : state.stopwatchSeconds;
        durationMins = Math.floor(elapsedSecs / 60);
      } else {
        if (reason === 'auto') {
          durationMins = Math.round(state.totalTargetSeconds / 60);
        } else {
          const elapsedSecs = state.sessionStartTime
            ? Math.max(0, Math.floor((now.getTime() - state.sessionStartTime.getTime()) / 1000))
            : Math.max(0, state.totalTargetSeconds - state.timeLeft);
          durationMins = Math.floor(elapsedSecs / 60);
        }
      }

      if (durationMins < state.minEffectiveMinutes) {
        sendDesktopNotification(
          '⏱️ 专注时长未达到记录标准',
          `本次专注【${taskName}】时长为 ${durationMins} 分钟，小于设置的最小计入时长（${state.minEffectiveMinutes} 分钟），未计入专注记录。`
        );
      } else {
        isRecordSaved = true;
        const newRecord: PomodoroRecord = {
          id: 'rec-' + Date.now(),
          mode: state.mode,
          phase: 'focus',
          startTime: formatTimeStr(start),
          endTime: formatTimeStr(now),
          durationMinutes: durationMins,
          date: getTodayDateStr(),
          dateLabel: formatDateLabel(now),
          timeRangeLabel: `${formatTimeStr(start)} - ${formatTimeStr(now)}`,
          taskId: activeFav?.id,
          linkedTarget: activeFav?.linkedTarget,
          createdAt: now.toISOString(),
        };

        const updatedRecords = [newRecord, ...state.records];
        localStorage.setItem(STORAGE_KEY_INITIALIZED, 'true');
        saveRecords(updatedRecords);

        // Schedule sync engine for record
        syncEngine.schedule(`rec:${newRecord.id}`, () => pomodoroService.upsertRecord(newRecord), LOW_FREQ_DELAY);

        // Accumulate minutes on active favorite task
        let updatedFavs = state.favoriteTasks;
        if (activeFav) {
          const updatedTask = { ...activeFav, accumulatedMinutes: activeFav.accumulatedMinutes + durationMins };
          updatedFavs = state.favoriteTasks.map((f) => (f.id === activeFav.id ? updatedTask : f));
          saveFavorites(updatedFavs);
          syncEngine.schedule(`fav:${updatedTask.id}`, () => pomodoroService.upsertFavoriteTask(updatedTask), HIGH_FREQ_DELAY);
        }

        set({ records: updatedRecords, favoriteTasks: updatedFavs });
      }
    }

    // Send Desktop System Notification
    if (state.phase === 'focus') {
      if (isRecordSaved) {
        if (reason === 'auto') {
          sendDesktopNotification(
            '🎉 专注时间结束！',
            `恭喜完成【${taskName}】！已成功专注 ${Math.round(state.totalTargetSeconds / 60)} 分钟，休息一下吧！`
          );
        } else {
          sendDesktopNotification(
            '✅ 专注任务已完成',
            `提前完成了【${taskName}】并记录结算。`
          );
        }
      }
    } else {
      if (reason === 'auto') {
        sendDesktopNotification(
          '☕ 休息时间结束！',
          '休息时间到了，准备好开始新一轮专注了吗？'
        );
      }
    }

    // Sound chime
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU');
      audio.play().catch(() => {});
    } catch (e) {}

    // Auto transition
    if (state.mode === 'pomodoro') {
      const nextPhase: PomodoroPhase = state.phase === 'focus' ? 'break' : 'focus';
      const nextDuration = nextPhase === 'focus' ? state.focusDuration : state.breakDuration;
      set({
        phase: nextPhase,
        isRunning: false,
        timeLeft: nextDuration,
        totalTargetSeconds: nextDuration,
        sessionStartTime: null,
        targetEndTime: null,
      });
    } else {
      set({
        isRunning: false,
        stopwatchSeconds: 0,
        sessionStartTime: null,
        targetEndTime: null,
      });
    }
  },

  // Favorite Tasks CRUD
  addFavoriteTask: (payload) => {
    const newTask: FavoriteFocusTask = {
      id: 'fav-' + Date.now(),
      name: payload.name,
      icon: payload.icon || '😊',
      mode: payload.mode,
      durationMinutes: payload.durationMinutes || 25,
      accumulatedMinutes: 0,
      linkedTarget: payload.linkedTarget,
      isArchived: false,
      createdAt: new Date().toISOString(),
    };

    const updated = [newTask, ...get().favoriteTasks];
    saveFavorites(updated);
    set({ favoriteTasks: updated });

    syncEngine.schedule(`fav:${newTask.id}`, () => pomodoroService.upsertFavoriteTask(newTask), LOW_FREQ_DELAY);
  },

  updateFavoriteTask: (id, updates) => {
    const updated = get().favoriteTasks.map((f) => (f.id === id ? { ...f, ...updates } : f));
    saveFavorites(updated);
    set({ favoriteTasks: updated });

    const target = updated.find((f) => f.id === id);
    if (target) {
      syncEngine.schedule(`fav:${id}`, () => pomodoroService.upsertFavoriteTask(target), HIGH_FREQ_DELAY);
    }
  },

  archiveFavoriteTask: (id) => {
    const updated = get().favoriteTasks.map((f) => (f.id === id ? { ...f, isArchived: true } : f));
    saveFavorites(updated);
    set({ favoriteTasks: updated });

    const target = updated.find((f) => f.id === id);
    if (target) {
      syncEngine.schedule(`fav:${id}`, () => pomodoroService.upsertFavoriteTask(target), LOW_FREQ_DELAY);
    }
  },

  unarchiveFavoriteTask: (id) => {
    const updated = get().favoriteTasks.map((f) => (f.id === id ? { ...f, isArchived: false } : f));
    saveFavorites(updated);
    set({ favoriteTasks: updated });

    const target = updated.find((f) => f.id === id);
    if (target) {
      syncEngine.schedule(`fav:${id}`, () => pomodoroService.upsertFavoriteTask(target), LOW_FREQ_DELAY);
    }
  },

  deleteFavoriteTask: (id) => {
    const updated = get().favoriteTasks.filter((f) => f.id !== id);
    saveFavorites(updated);
    set({
      favoriteTasks: updated,
      activeFavoriteTaskId: get().activeFavoriteTaskId === id ? null : get().activeFavoriteTaskId,
    });

    syncEngine.cancel(`fav:${id}`);
    pomodoroService.deleteFavoriteTask(id).catch(() => {});
  },

  startFavoriteTask: (id) => {
    const fav = get().favoriteTasks.find((f) => f.id === id);
    if (!fav) return;

    requestNotificationPermission();
    stopGlobalTimer();

    const targetSecs = (fav.durationMinutes || 25) * 60;
    const now = Date.now();
    set({
      activeFavoriteTaskId: id,
      mode: fav.mode,
      phase: 'focus',
      timeLeft: targetSecs,
      totalTargetSeconds: targetSecs,
      stopwatchSeconds: 0,
      isRunning: true,
      sessionStartTime: new Date(now),
      targetEndTime: fav.mode === 'pomodoro' ? now + targetSecs * 1000 : null,
    });

    startGlobalTimer();
  },

  addManualRecord: (minutes: number) => {
    const now = new Date();
    const start = new Date(now.getTime() - minutes * 60 * 1000);

    const newRecord: PomodoroRecord = {
      id: 'rec-' + Date.now(),
      mode: 'pomodoro',
      phase: 'focus',
      startTime: formatTimeStr(start),
      endTime: formatTimeStr(now),
      durationMinutes: minutes,
      date: getTodayDateStr(),
      dateLabel: formatDateLabel(now),
      timeRangeLabel: `${formatTimeStr(start)} - ${formatTimeStr(now)}`,
      createdAt: now.toISOString(),
    };

    const updated = [newRecord, ...get().records];
    localStorage.setItem(STORAGE_KEY_INITIALIZED, 'true');
    saveRecords(updated);
    set({ records: updated });

    syncEngine.schedule(`rec:${newRecord.id}`, () => pomodoroService.upsertRecord(newRecord), LOW_FREQ_DELAY);
  },

  deleteRecord: (id: string) => {
    const updated = get().records.filter((r) => r.id !== id);
    localStorage.setItem(STORAGE_KEY_INITIALIZED, 'true');
    saveRecords(updated);
    set({ records: updated });

    syncEngine.cancel(`rec:${id}`);
    pomodoroService.deleteRecord(id).catch(() => {});
  },

  clearAllRecords: () => {
    get().records.forEach((r) => syncEngine.cancel(`rec:${r.id}`));
    localStorage.setItem(STORAGE_KEY_INITIALIZED, 'true');
    saveRecords([]);
    set({ records: [] });
    pomodoroService.clearAllRecords().catch(() => {});
  },

  getStats: (): PomodoroStats => {
    const { records } = get();
    const todayStr = getTodayDateStr();

    let todayCount = 0;
    let todayFocusMinutes = 0;
    let totalCount = 0;
    let totalFocusMinutes = 0;

    records.forEach((rec) => {
      if (rec.phase === 'focus') {
        totalCount += 1;
        totalFocusMinutes += rec.durationMinutes;

        if (rec.date === todayStr) {
          todayCount += 1;
          todayFocusMinutes += rec.durationMinutes;
        }
      }
    });

    return {
      todayCount,
      todayFocusMinutes,
      totalCount,
      totalFocusMinutes,
    };
  },

  getActiveFavoriteTasks: () => {
    return get().favoriteTasks.filter((f) => !f.isArchived);
  },

  getArchivedFavoriteTasks: () => {
    return get().favoriteTasks.filter((f) => f.isArchived);
  },
}));
