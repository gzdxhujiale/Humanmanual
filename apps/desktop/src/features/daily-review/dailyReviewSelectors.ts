import { DailyReview, CompoundStats } from './dailyReviewTypes';
import { daysBetween, formatDateYMD, todayYMD } from '../../lib/dateUtils';

/**
 * dailyReviewSelectors — pure derivation helpers over the daily-review query data.
 *
 * These moved out of the Zustand store when review data ownership shifted to
 * TanStack Query. They take the loaded `reviews` array explicitly so components
 * can derive from the query cache without a store round-trip.
 */

export function isReviewEmpty(content: string): boolean {
  if (!content) return true;
  const trimmed = content.trim();
  if (trimmed === '' || trimmed === '{}') {
    return true;
  }
  try {
    const json = JSON.parse(trimmed);
    if (!json.content || !Array.isArray(json.content) || json.content.length === 0) return true;
    if (json.content.length === 1) {
      const p = json.content[0];
      if (p.type === 'paragraph' && (!p.content || p.content.length === 0)) return true;
    }
    return false;
  } catch {
    const stripped = trimmed.replace(/<[^>]*>/g, '').trim();
    return stripped.length === 0;
  }
}

export function normalizeDateStr(d: string): string {
  if (!d) return '';
  const trimmed = d.trim();
  if (trimmed.length >= 10 && trimmed[4] === '-' && trimmed[7] === '-') {
    return trimmed.slice(0, 10);
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return formatDateYMD(parsed);
  }
  return trimmed;
}

/** Non-empty reviews sorted newest-first. */
export function getAllReviews(reviews: DailyReview[]): DailyReview[] {
  return reviews
    .filter(r => !isReviewEmpty(r.content) || (r.rating !== undefined && r.rating > 0))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getReviewByDate(reviews: DailyReview[], date: string): DailyReview | undefined {
  const target = normalizeDateStr(date);
  const matches = reviews.filter(r => normalizeDateStr(r.date) === target || r.date.startsWith(target));
  if (matches.length === 0) return undefined;
  matches.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return matches[0];
}

export function getCompoundStats(reviews: DailyReview[]): CompoundStats {
  const meaningful = reviews.filter(r => !isReviewEmpty(r.content) || (r.rating !== undefined && r.rating > 0));
  if (meaningful.length === 0) {
    return { currentStreak: 0, longestStreak: 0, totalReviews: 0, compoundValue: 1.00 };
  }

  const dates = [...new Set(meaningful.map(r => r.date))].sort();

  let currentStreak = 1;
  let longestStreak = 1;
  let streakCount = 1;

  for (let i = 1; i < dates.length; i++) {
    const diff = daysBetween(dates[i - 1], dates[i]);
    if (diff === 1) {
      streakCount++;
      longestStreak = Math.max(longestStreak, streakCount);
    } else {
      streakCount = 1;
    }
  }

  const today = new Date();
  const todayStr = todayYMD();

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = formatDateYMD(yesterday);

  const lastDate = dates[dates.length - 1];

  if (lastDate === todayStr || lastDate === yesterdayStr) {
    currentStreak = streakCount;
  } else {
    currentStreak = 0;
  }

  const compoundValue = parseFloat(Math.pow(1.01, currentStreak).toFixed(4));

  return {
    currentStreak,
    longestStreak,
    totalReviews: dates.length,
    compoundValue,
  };
}
