import { create } from 'zustand';
import { Habit, HabitCheckIn, HabitStats } from './habitTypes';
import { habitService } from './habitService';
import { createSyncEngine, HIGH_FREQ_DELAY } from '@humanmanual/core';
import { logError } from '@humanmanual/core';
import { formatDateYMD, todayYMD } from '../../lib/dateUtils';

interface HabitState {
  habits: Habit[];
  checkIns: HabitCheckIn[];
  currentDate: string; // YYYY-MM-DD
  isLoading: boolean;
  error: string | null;

  // Actions
  setCurrentDate: (date: string) => void;
  loadAll: () => Promise<void>;
  createHabit: (payload: Partial<Habit>) => Promise<void>;
  updateHabit: (id: string, payload: Partial<Habit>) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  toggleCheckIn: (habitId: string, date: string) => Promise<void>;

  // Getters/Computed
  getHabitsForDate: (date: string) => Habit[];
  getCheckInStatus: (habitId: string, date: string) => boolean;
  getStats: (habitId: string, dateStr: string) => HabitStats;
}

const syncEngine = createSyncEngine();

export const useHabitStore = create<HabitState>((set, get) => ({
  habits: [],
  checkIns: [],
  currentDate: todayYMD(),
  isLoading: false,
  error: null,

  setCurrentDate: (date: string) => set({ currentDate: date }),

  loadAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await habitService.loadAll();
      const habits = (data.habits || []).map((h) => ({
        ...h,
        checkInTime: h.checkInTime || h.reminder || '08:00:00',
      }));
      set({ habits, checkIns: data.checkIns || [], isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  createHabit: async (payload: Partial<Habit>) => {
    try {
      const newHabit = await habitService.createHabit(payload);
      const formattedHabit = {
        ...newHabit,
        checkInTime: newHabit.checkInTime || newHabit.reminder || payload.checkInTime || '08:00:00',
      };
      // The backend returns the persisted habit; no full reload needed.
      set((state) => ({ habits: [formattedHabit, ...state.habits] }));
    } catch (error: any) {
      logError('habitStore', 'failed to create habit', error);
      throw error;
    }
  },

  updateHabit: async (id: string, payload: Partial<Habit>) => {
    // Optimistic update; persistence is debounced per habit.
    set((state) => ({
      habits: state.habits.map((h) => (h.id === id ? { ...h, ...payload } : h)),
    }));
    const updated = get().habits.find((h) => h.id === id);
    if (updated) {
      const { id: _, ...fields } = updated;
      syncEngine.schedule(`habit:${id}`, () => habitService.updateHabit(id, fields), HIGH_FREQ_DELAY);
    }
  },

  deleteHabit: async (id: string) => {
    set((state) => ({
      habits: state.habits.filter((h) => h.id !== id),
      checkIns: state.checkIns.filter((c) => c.habitId !== id),
    }));
    // Cancel any pending upsert so it cannot resurrect the deleted habit.
    syncEngine.cancel(`habit:${id}`);
    try {
      await habitService.deleteHabit(id);
    } catch (error: any) {
      logError('habitStore', 'failed to delete habit', error);
      get().loadAll();
      throw error;
    }
  },

  toggleCheckIn: async (habitId: string, date: string) => {
    const isCurrentlyChecked = get().getCheckInStatus(habitId, date);
    const nextStatus = !isCurrentlyChecked;
    
    // Optimistic update
    set((state) => {
      const existingCheckInIndex = state.checkIns.findIndex(
        (c) => c.habitId === habitId && c.date === date
      );

      let newCheckIns = [...state.checkIns];
      if (existingCheckInIndex >= 0) {
        newCheckIns[existingCheckInIndex] = {
          ...newCheckIns[existingCheckInIndex],
          completed: nextStatus,
        };
      } else {
        newCheckIns.push({
          id: 'temp-' + Date.now(),
          habitId,
          date,
          completed: nextStatus,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      return { checkIns: newCheckIns };
    });

    try {
      const realCheckIn = await habitService.toggleCheckIn(habitId, date, nextStatus);
      // Update temp id with real id from DB
      set((state) => {
        const newCheckIns = [...state.checkIns];
        const index = newCheckIns.findIndex((c) => c.habitId === habitId && c.date === date);
        if (index >= 0) {
          newCheckIns[index] = realCheckIn;
        }
        return { checkIns: newCheckIns };
      });
    } catch (error: any) {
      logError('habitStore', 'failed to toggle checkin', error);
      get().loadAll();
      throw error;
    }
  },

  getHabitsForDate: (dateStr: string) => {
    const { habits } = get();
    
    return habits.filter((habit) => {
      // 1. startDate logic (safely extract YYYY-MM-DD)
      let startDateStr = habit.startDate;
      if (!startDateStr || startDateStr.trim() === '') {
        startDateStr = habit.createdAt ? habit.createdAt.slice(0, 10) : dateStr;
      }

      if (dateStr < startDateStr) return false;

      // 2. duration logic
      if (habit.duration && habit.duration !== 'forever') {
        let days = 0;
        if (habit.duration.startsWith('custom:')) {
          days = parseInt(habit.duration.replace('custom:', ''), 10) || 0;
        } else {
          days = parseInt(habit.duration.replace(/[^0-9]/g, ''), 10) || 0;
        }

        if (days > 0) {
          const parts = startDateStr.split('-').map(Number);
          if (parts.length === 3 && !parts.some(isNaN)) {
            const startDateObj = new Date(parts[0], parts[1] - 1, parts[2]);
            const endDateObj = new Date(startDateObj);
            endDateObj.setDate(startDateObj.getDate() + (days - 1));

            const qParts = dateStr.split('-').map(Number);
            if (qParts.length === 3 && !qParts.some(isNaN)) {
              const queryDateObj = new Date(qParts[0], qParts[1] - 1, qParts[2]);
              if (queryDateObj > endDateObj) {
                return false;
              }
            }
          }
        }
      }

      return true;
    });
  },

  getCheckInStatus: (habitId: string, date: string) => {
    const checkIn = get().checkIns.find(
      (c) => c.habitId === habitId && c.date === date
    );
    return checkIn ? checkIn.completed : false;
  },

  getStats: (habitId: string, dateStr: string) => {
    const { checkIns } = get();
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth();

    const totalCheckIns = checkIns.filter(c => c.habitId === habitId && c.completed).length;

    const monthCheckIns = checkIns.filter(c => {
      if (c.habitId !== habitId || !c.completed) return false;
      const cDate = new Date(c.date);
      return cDate.getFullYear() === year && cDate.getMonth() === month;
    }).length;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthlyCompletionRate = Math.round((monthCheckIns / daysInMonth) * 100);

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const completedDates = new Set(
      checkIns
        .filter(c => c.habitId === habitId && c.completed)
        .map(c => c.date)
    );

    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() - i);
      const dateString = formatDateYMD(checkDate);

      if (completedDates.has(dateString)) {
        streak++;
      } else if (i === 0) {
        // If today is not checked in, we can still have a streak from yesterday.
        continue;
      } else {
        break;
      }
    }

    return {
      monthCheckIns,
      totalCheckIns,
      monthlyCompletionRate,
      currentStreak: streak,
    };
  },
}));
