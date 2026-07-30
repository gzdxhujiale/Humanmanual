export interface Habit {
  id: string;
  name: string;
  icon?: string;
  frequency?: string;
  goal?: string;
  startDate?: string;
  duration?: string;
  group?: string;
  reminder?: string;
  autoPopupLog?: boolean;
  checkInTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HabitCheckIn {
  id: string;
  habitId: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HabitData {
  habits: Habit[];
  checkIns: HabitCheckIn[];
}

export interface HabitStats {
  monthCheckIns: number;
  totalCheckIns: number;
  monthlyCompletionRate: number;
  currentStreak: number;
}
