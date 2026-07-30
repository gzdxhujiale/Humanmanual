export type PomodoroMode = 'pomodoro' | 'stopwatch';
export type PomodoroPhase = 'focus' | 'break';

export interface LinkedTarget {
  type: 'quadrant' | 'habit';
  id: string;
  title: string;
}

export interface FavoriteFocusTask {
  id: string;
  name: string;
  icon: string;
  mode: PomodoroMode;
  durationMinutes: number;
  accumulatedMinutes: number;
  linkedTarget?: LinkedTarget;
  isArchived: boolean;
  createdAt: string;
}

export interface PomodoroRecord {
  id: string;
  mode: PomodoroMode;
  phase: PomodoroPhase;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  date: string;
  dateLabel: string;
  timeRangeLabel: string;
  taskId?: string;
  linkedTarget?: LinkedTarget;
  createdAt: string;
}

export interface PomodoroStats {
  todayCount: number;
  todayFocusMinutes: number;
  totalCount: number;
  totalFocusMinutes: number;
}
