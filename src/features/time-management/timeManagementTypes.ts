export type QuadrantType = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export interface Role {
  id: string;
  name: string;
  color?: string;
  createdAt: number;
}

export interface Task {
  id: string;
  title: string;
  roleId?: string; // Optional connection to a role
  quadrant: QuadrantType;
  scheduledDate?: string; // Format: YYYY-MM-DD
  timeOfDay?: 'morning' | 'afternoon';
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  description?: string;
  deadline?: number; // Timestamp
  reminder?: string; // JSON-serialized TaskReminder
}

export interface TaskReminder {
  offsetDays: number; // 0 = 当天，1 = 提前 1 天…
  time: string; // "HH:mm"
  repeat: boolean; // 持续提醒
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
