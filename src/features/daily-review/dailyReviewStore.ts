import { create } from 'zustand';
import { DailyReview, DailyReviewData, CompoundStats } from './dailyReviewTypes';
import { dailyReviewApi } from './dailyReviewService';
import { createSyncEngine, HIGH_FREQ_DELAY, LOW_FREQ_DELAY } from '../../lib/createSyncEngine';
import { logError } from '../../lib/logger';
import { daysBetween, formatDateYMD, todayYMD } from '../../lib/dateUtils';



const defaultData: DailyReviewData = {
  reviews: []
};

function isReviewEmpty(content: string): boolean {
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
    return false;
  }
}

interface DailyReviewStore {
  data: DailyReviewData;

  // Public Actions
  syncAllFromDB: () => Promise<void>;
  getAllReviews: () => DailyReview[];
  getReviewByDate: (date: string) => DailyReview | undefined;
  getCompoundStats: () => CompoundStats;
  saveReview: (date: string, content: string, rating?: number, isHighFreq?: boolean) => DailyReview;
  deleteReview: (id: string) => void;
}

const syncEngine = createSyncEngine();



export const useDailyReviewStore = create<DailyReviewStore>((set, get) => ({
  data: defaultData,

  syncAllFromDB: async () => {
    try {
      const dbReviews = await dailyReviewApi.loadAll();
      set({ data: { reviews: dbReviews } });
    } catch (e) {
      logError('dailyReviewStore', 'failed to load reviews from SQLite', e);
    }
  },

  getReviewByDate: (date: string): DailyReview | undefined => {
    return get().data.reviews.find(r => r.date === date);
  },

  getAllReviews: (): DailyReview[] => {
    return get().data.reviews
      .filter(r => !isReviewEmpty(r.content) || (r.rating !== undefined && r.rating > 0))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },

  saveReview: (date: string, content: string, rating?: number, isHighFreq?: boolean): DailyReview => {
    const data = get().data;
    const existingIndex = data.reviews.findIndex(r => r.date === date);

    if (isReviewEmpty(content) && (rating === undefined || rating === 0)) {
      if (existingIndex !== -1) {
        const id = data.reviews[existingIndex].id;
        get().deleteReview(id);
      }
      return {
        id: '',
        date,
        content: '',
        rating: 0,
        createdAt: 0,
        updatedAt: 0
      };
    }

    let review: DailyReview;
    const newReviews = [...data.reviews];

    if (existingIndex !== -1) {
      review = {
        ...newReviews[existingIndex],
        content,
        rating: rating !== undefined ? rating : newReviews[existingIndex].rating,
        updatedAt: Date.now()
      };
      newReviews[existingIndex] = review;
    } else {
      review = {
        id: crypto.randomUUID(),
        date,
        content,
        rating: rating || 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      newReviews.push(review);
    }

    const newData = { ...data, reviews: newReviews };
    set({ data: newData });
    syncEngine.schedule(review.id, () => dailyReviewApi.save(review), (isHighFreq ?? true) ? HIGH_FREQ_DELAY : LOW_FREQ_DELAY);
    return review;
  },

  deleteReview: (id: string): void => {
    const data = get().data;
    const newReviews = data.reviews.filter(r => r.id !== id);
    const newData = { ...data, reviews: newReviews };
    set({ data: newData });

    syncEngine.cancel(id);
    dailyReviewApi.delete(id).catch(e => {
      logError('dailyReviewStore', 'failed to delete review', e);
    });
  },

  getCompoundStats: (): CompoundStats => {
    const reviews = get().data.reviews.filter(r => !isReviewEmpty(r.content) || (r.rating !== undefined && r.rating > 0));
    if (reviews.length === 0) {
      return { currentStreak: 0, longestStreak: 0, totalReviews: 0, compoundValue: 1.00 };
    }

    const dates = [...new Set(reviews.map(r => r.date))].sort();
    
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
      compoundValue
    };
  }
}));
