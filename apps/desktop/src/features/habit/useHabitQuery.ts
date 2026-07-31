import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@humanmanual/core';
import { habitService } from './habitService';
import { Habit } from './habitTypes';

export function useHabitData() {
  return useQuery({
    queryKey: queryKeys.habits.all,
    queryFn: async () => {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.habits.all });
    },
  });
}
