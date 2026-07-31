import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@humanmanual/core';
import { timeManagementApi } from './timeManagementService';
import { Task, Role, QuadrantType } from './timeManagementTypes';
import { TimeManagementData } from './timeManagementStore';

const PREDEFINED_COLORS = ['#1f6fd1', '#25845a', '#d97706', '#7657d6', '#d32f2f', '#0ea5e9'];

function mapRoleColors(roles: Role[]): Role[] {
  return (roles || []).map((role, index) => ({
    ...role,
    color: role.color || PREDEFINED_COLORS[index % PREDEFINED_COLORS.length],
  }));
}

/**
 * Deep Module Hook: Encapsulates all query fetching, caching, and mutation leverage
 * for Time Management & TaskQuadrant features.
 */
export function useTimeManagementData() {
  return useQuery({
    queryKey: queryKeys.tasks.all,
    queryFn: async (): Promise<TimeManagementData> => {
      const dbData = await timeManagementApi.loadAll();
      if (!dbData) {
        return { roles: [], tasks: [] };
      }
      return {
        roles: mapRoleColors(dbData.roles),
        tasks: dbData.tasks || [],
      };
    },
  });
}

export function useAddTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      title,
      quadrant = 'Q2',
      scheduledDate,
      roleId,
    }: {
      title: string;
      quadrant?: QuadrantType;
      scheduledDate?: string;
      roleId?: string;
    }): Promise<Task> => {
      const newTask: Task = {
        id: crypto.randomUUID(),
        title,
        quadrant,
        scheduledDate,
        roleId,
        completed: false,
        createdAt: Date.now(),
      };
      await timeManagementApi.upsertTask(newTask);
      return newTask;
    },

    // Optimistic Update
    onMutate: async (newTaskParams) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
      const previousData = queryClient.getQueryData<TimeManagementData>(queryKeys.tasks.all);

      if (previousData) {
        const optimisticTask: Task = {
          id: 'temp-' + Date.now(),
          title: newTaskParams.title,
          quadrant: newTaskParams.quadrant || 'Q2',
          scheduledDate: newTaskParams.scheduledDate,
          roleId: newTaskParams.roleId,
          completed: false,
          createdAt: Date.now(),
        };

        queryClient.setQueryData<TimeManagementData>(queryKeys.tasks.all, {
          ...previousData,
          tasks: [...previousData.tasks, optimisticTask],
        });
      }

      return { previousData };
    },

    onError: (_err, _newTask, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.tasks.all, context.previousData);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

export function useUpdateTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: Partial<Task> }) => {
      const currentData = queryClient.getQueryData<TimeManagementData>(queryKeys.tasks.all);
      const existingTask = currentData?.tasks.find((t) => t.id === taskId);
      if (!existingTask) return;

      const updatedTask = { ...existingTask, ...updates };
      await timeManagementApi.upsertTask(updatedTask);
      return updatedTask;
    },

    // Optimistic Update
    onMutate: async ({ taskId, updates }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
      const previousData = queryClient.getQueryData<TimeManagementData>(queryKeys.tasks.all);

      if (previousData) {
        queryClient.setQueryData<TimeManagementData>(queryKeys.tasks.all, {
          ...previousData,
          tasks: previousData.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
        });
      }

      return { previousData };
    },

    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.tasks.all, context.previousData);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

export function useDeleteTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      await timeManagementApi.deleteTask(taskId);
    },

    // Optimistic Update
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
      const previousData = queryClient.getQueryData<TimeManagementData>(queryKeys.tasks.all);

      if (previousData) {
        queryClient.setQueryData<TimeManagementData>(queryKeys.tasks.all, {
          ...previousData,
          tasks: previousData.tasks.filter((t) => t.id !== taskId),
        });
      }

      return { previousData };
    },

    onError: (_err, _taskId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.tasks.all, context.previousData);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}
