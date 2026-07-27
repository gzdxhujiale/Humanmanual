import { call } from '../../lib/tauriClient';
import { Habit, HabitCheckIn, HabitData } from './habitTypes';

/**
 * habitService — data-access seam for the Habit feature.
 * All IPC goes through `call`, which owns logging and rethrow policy.
 */
export const habitService = {
  loadAll: (): Promise<HabitData> => call<HabitData>('habit_load_all'),

  createHabit: (payload: Partial<Habit>): Promise<Habit> => call<Habit>('habit_create', { payload }),

  updateHabit: (id: string, payload: Partial<Habit>): Promise<void> =>
    call('habit_update', { id, payload }),

  deleteHabit: (id: string): Promise<void> => call('habit_delete', { id }),

  toggleCheckIn: (habitId: string, date: string, completed: boolean): Promise<HabitCheckIn> =>
    call<HabitCheckIn>('habit_toggle_checkin', { habitId, date, completed }),
};
