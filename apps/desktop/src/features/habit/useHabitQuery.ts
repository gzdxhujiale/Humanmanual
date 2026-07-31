import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@humanmanual/core';
import { habitService } from './habitService';
import { Habit, HabitCheckIn } from './habitTypes';

export interface HabitQueryData {
  habits: Habit[];
  checkIns: HabitCheckIn[];
}

const EMPTY_DATA: HabitQueryData = { habits: [], checkIns: [] };

export function useHabitData() {
  return useQuery({
    queryKey: queryKeys.habits.all,
    queryFn: async (): Promise<HabitQueryData> => {
      const data = await habitService.loadAll();
      const habits = (data.habits || []).map((h) => ({
        ...h,
        checkInTime: h.checkInTime || h.reminder || '08:00:00',
      }));
      return {
        habits,
        checkIns: data.checkIns || [],
      };
    },
  });
}

/** Read the current habit query cache without subscribing (for imperative reads). */
export function readHabitData(queryClient: QueryClient): HabitQueryData {
  return queryClient.getQueryData<HabitQueryData>(queryKeys.habits.all) ?? EMPTY_DATA;
}

export function useCreateHabitMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<Habit>) => habitService.createHabit(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.habits.all });
    },
  });
}

export function useUpdateHabitMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Habit> }) =>
      habitService.updateHabit(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.habits.all });
    },
  });
}

export function useDeleteHabitMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => habitService.deleteHabit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.habits.all });
    },
  });
}

export function useToggleCheckInMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ habitId, date, completed }: { habitId: string; date: string; completed: boolean }) =>
      habitService.toggleCheckIn(habitId, date, completed),

    // Optimistic toggle so the check-in dot flips instantly.
    onMutate: async ({ habitId, date, completed }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.habits.all });
      const previous = queryClient.getQueryData<HabitQueryData>(queryKeys.habits.all);

      queryClient.setQueryData<HabitQueryData>(queryKeys.habits.all, (prev) => {
        const data = prev ?? EMPTY_DATA;
        const index = data.checkIns.findIndex((c) => c.habitId === habitId && c.date === date);
        const checkIns = [...data.checkIns];
        if (index >= 0) {
          checkIns[index] = { ...checkIns[index], completed };
        } else {
          checkIns.push({
            id: 'temp-' + Date.now(),
            habitId,
            date,
            completed,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        return { ...data, checkIns };
      });

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.habits.all, context.previous);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.habits.all });
    },
  });
}
