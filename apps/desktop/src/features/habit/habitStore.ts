import { create } from 'zustand';
import { todayYMD } from '../../lib/dateUtils';

/**
 * habitStore — UI-only state for the Habit feature.
 *
 * Habit data (habits + check-ins) is owned by TanStack Query (`useHabitQuery`).
 * This store keeps just the transient view state that doesn't belong in the
 * server cache: the currently selected date.
 */
interface HabitUIState {
  currentDate: string; // YYYY-MM-DD
  setCurrentDate: (date: string) => void;
}

export const useHabitStore = create<HabitUIState>((set) => ({
  currentDate: todayYMD(),
  setCurrentDate: (date: string) => set({ currentDate: date }),
}));
