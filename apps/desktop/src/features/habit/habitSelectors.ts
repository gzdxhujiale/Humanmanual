import { Habit, HabitCheckIn, HabitStats } from './habitTypes';
import { formatDateYMD } from '../../lib/dateUtils';

/**
 * habitSelectors — pure derivation helpers over the habit query data.
 *
 * These moved out of the Zustand store when habit data ownership shifted to
 * TanStack Query. They take the loaded `habits`/`checkIns` arrays explicitly so
 * components can derive from the query cache without a store round-trip.
 */

export function getHabitsForDate(habits: Habit[], dateStr: string): Habit[] {
  return habits.filter((habit) => {
    // 1. startDate logic (safely extract YYYY-MM-DD)
    let startDateStr = habit.startDate;
    if (!startDateStr || startDateStr.trim() === '') {
      startDateStr = habit.createdAt ? habit.createdAt.slice(0, 10) : dateStr;
    }

    if (dateStr < startDateStr) return false;

    // 2. duration logic
    if (habit.duration && habit.duration !== 'forever') {
      let days = 0;
      if (habit.duration.startsWith('custom:')) {
        days = parseInt(habit.duration.replace('custom:', ''), 10) || 0;
      } else {
        days = parseInt(habit.duration.replace(/[^0-9]/g, ''), 10) || 0;
      }

      if (days > 0) {
        const parts = startDateStr.split('-').map(Number);
        if (parts.length === 3 && !parts.some(isNaN)) {
          const startDateObj = new Date(parts[0], parts[1] - 1, parts[2]);
          const endDateObj = new Date(startDateObj);
          endDateObj.setDate(startDateObj.getDate() + (days - 1));

          const qParts = dateStr.split('-').map(Number);
          if (qParts.length === 3 && !qParts.some(isNaN)) {
            const queryDateObj = new Date(qParts[0], qParts[1] - 1, qParts[2]);
            if (queryDateObj > endDateObj) {
              return false;
            }
          }
        }
      }
    }

    return true;
  });
}

export function getCheckInStatus(checkIns: HabitCheckIn[], habitId: string, date: string): boolean {
  const checkIn = checkIns.find((c) => c.habitId === habitId && c.date === date);
  return checkIn ? checkIn.completed : false;
}

export function getStats(checkIns: HabitCheckIn[], habitId: string, dateStr: string): HabitStats {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth();

  const totalCheckIns = checkIns.filter((c) => c.habitId === habitId && c.completed).length;

  const monthCheckIns = checkIns.filter((c) => {
    if (c.habitId !== habitId || !c.completed) return false;
    const cDate = new Date(c.date);
    return cDate.getFullYear() === year && cDate.getMonth() === month;
  }).length;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthlyCompletionRate = Math.round((monthCheckIns / daysInMonth) * 100);

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const completedDates = new Set(
    checkIns.filter((c) => c.habitId === habitId && c.completed).map((c) => c.date)
  );

  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() - i);
    const dateString = formatDateYMD(checkDate);

    if (completedDates.has(dateString)) {
      streak++;
    } else if (i === 0) {
      // If today is not checked in, we can still have a streak from yesterday.
      continue;
    } else {
      break;
    }
  }

  return {
    monthCheckIns,
    totalCheckIns,
    monthlyCompletionRate,
    currentStreak: streak,
  };
}
