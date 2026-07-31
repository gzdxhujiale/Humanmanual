import { useMemo } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  queryKeys,
  sharedSyncEngine,
  HIGH_FREQ_DELAY,
  LOW_FREQ_DELAY,
  logError,
} from '@humanmanual/core';
import { timeManagementApi } from './timeManagementService';
import { Task, Role, QuadrantType } from './timeManagementTypes';

export interface TimeManagementData {
  roles: Role[];
  tasks: Task[];
}

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

function setTasksData(
  queryClient: QueryClient,
  updater: (prev: TimeManagementData) => TimeManagementData
) {
  queryClient.setQueryData<TimeManagementData>(queryKeys.tasks.all, (prev) =>
    updater(prev ?? { roles: [], tasks: [] })
  );
}

export interface TaskActions {
  addTask: (title: string, quadrant?: QuadrantType, scheduledDate?: string, roleId?: string) => Task;
  updateTask: (taskId: string, updates: Partial<Task>, isHighFreq?: boolean) => void;
  deleteTask: (taskId: string) => void;
}

/**
 * Write path for tasks: optimistic query-cache update + debounced persistence
 * via sharedSyncEngine (`task:` keys). useSyncQueryInvalidator refetches the
 * cache once persistence completes, keeping the cache authoritative.
 */
export function useTaskActions(): TaskActions {
  const queryClient = useQueryClient();

  return useMemo<TaskActions>(() => ({
    addTask: (title, quadrant = 'Q2', scheduledDate, roleId) => {
      const newTask: Task = {
        id: crypto.randomUUID(),
        title,
        quadrant,
        scheduledDate,
        roleId,
        completed: false,
        createdAt: Date.now(),
      };
      setTasksData(queryClient, (prev) => ({ ...prev, tasks: [...prev.tasks, newTask] }));
      sharedSyncEngine.schedule(`task:${newTask.id}`, () => timeManagementApi.upsertTask(newTask), LOW_FREQ_DELAY);
      return newTask;
    },

    updateTask: (taskId, updates, isHighFreq = true) => {
      let nextTask: Task | undefined;
      setTasksData(queryClient, (prev) => {
        const tasks = prev.tasks.map((t) => {
          if (t.id !== taskId) return t;
          nextTask = { ...t, ...updates };
          return nextTask;
        });
        return { ...prev, tasks };
      });
      if (nextTask) {
        const task = nextTask;
        sharedSyncEngine.schedule(
          `task:${taskId}`,
          () => timeManagementApi.upsertTask(task),
          isHighFreq ? HIGH_FREQ_DELAY : LOW_FREQ_DELAY
        );
      }
    },

    deleteTask: (taskId) => {
      setTasksData(queryClient, (prev) => ({
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== taskId),
      }));
      // Cancel any pending upsert so it cannot resurrect the deleted task.
      sharedSyncEngine.cancel(`task:${taskId}`);
      timeManagementApi.deleteTask(taskId).catch((e) => {
        logError('useTimeManagementQuery', 'failed to delete task', e);
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      });
    },
  }), [queryClient]);
}
