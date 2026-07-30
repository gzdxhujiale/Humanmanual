import { create } from 'zustand';
import { Role, Task, QuadrantType } from './timeManagementTypes';
import { timeManagementApi } from './timeManagementService';
import { createSyncEngine } from '@humanmanual/core';

export interface TimeManagementData {
  roles: Role[];
  tasks: Task[];
}

const defaultData: TimeManagementData = {
  roles: [],
  tasks: []
};

interface TimeManagementStore {
  data: TimeManagementData;

  // Public
  syncAllFromDB: () => Promise<void>;
  setRoles: (roles: Role[]) => void;
  addTask: (title: string, quadrant?: QuadrantType, scheduledDate?: string, roleId?: string) => Task;
  updateTask: (taskId: string, updates: Partial<Task>, isHighFreq?: boolean) => void;
  deleteTask: (taskId: string) => void;
}

const syncEngine = createSyncEngine();

const PREDEFINED_COLORS = ['#1f6fd1', '#25845a', '#d97706', '#7657d6', '#d32f2f', '#0ea5e9'];

function mapRoleColors(roles: Role[]): Role[] {
  return roles.map((role, index) => ({
    ...role,
    color: role.color || PREDEFINED_COLORS[index % PREDEFINED_COLORS.length]
  }));
}

export const useTimeStore = create<TimeManagementStore>((set, get) => ({
  data: defaultData,

  syncAllFromDB: async () => {
    try {
      const dbData = await timeManagementApi.loadAll();
      if (dbData) {
        const merged = { ...dbData, roles: mapRoleColors(dbData.roles) };
        set({ data: merged });
      }
    } catch (e) {
      console.error('Time management sync from DB failed:', e);
    }
  },

  setRoles: (roles: Role[]) => {
    const data = get().data;
    set({ data: { ...data, roles: mapRoleColors(roles) } });
  },

  addTask: (title: string, quadrant: QuadrantType = 'Q2', scheduledDate?: string, roleId?: string): Task => {
    const data = get().data;
    const newTask: Task = {
      id: crypto.randomUUID(),
      title,
      quadrant,
      scheduledDate,
      roleId,
      completed: false,
      createdAt: Date.now()
    };
    const newData = { ...data, tasks: [...data.tasks, newTask] };
    set({ data: newData });
    syncEngine.schedule(newTask.id, () => timeManagementApi.upsertTask(newTask), 300);
    return newTask;
  },

  updateTask: (taskId: string, updates: Partial<Task>, isHighFreq: boolean = true): void => {
    const data = get().data;
    const index = data.tasks.findIndex(t => t.id === taskId);
    if (index !== -1) {
      const newTasks = [...data.tasks];
      newTasks[index] = { ...newTasks[index], ...updates };
      const newData = { ...data, tasks: newTasks };
      set({ data: newData });
      syncEngine.schedule(taskId, () => timeManagementApi.upsertTask(newTasks[index]), isHighFreq ? 500 : 300);
    }
  },

  deleteTask: (taskId: string): void => {
    const data = get().data;
    const newTasks = data.tasks.filter(t => t.id !== taskId);
    const newData = { ...data, tasks: newTasks };
    set({ data: newData });

    syncEngine.cancel(taskId);
    timeManagementApi.deleteTask(taskId).catch(e => {
      console.error('Failed to delete task:', e);
    });
  }
}));
