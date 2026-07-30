export type QuadrantType = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export interface TimeRole {
  id: string;
  name: string;
  color?: string;
  createdAt: number;
}

export interface Task {
  id: string;
  title: string;
  roleId?: string;
  quadrant: QuadrantType;
  scheduledDate?: string;
  timeOfDay?: 'morning' | 'afternoon';
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  description?: string;
  deadline?: number;
  reminder?: string;
}

export interface TaskReminder {
  offsetDays: number;
  time: string;
  repeat: boolean;
}

export function parseReminder(raw?: string): TaskReminder | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (typeof obj?.offsetDays !== 'number' || typeof obj?.time !== 'string') return null;
    return { offsetDays: obj.offsetDays, time: obj.time, repeat: !!obj.repeat };
  } catch {
    return null;
  }
}

export function serializeReminder(r: TaskReminder): string {
  return JSON.stringify(r);
}

export function reminderLabel(r: TaskReminder): string {
  return r.offsetDays === 0 ? '当天' : `提前 ${r.offsetDays} 天`;
}
