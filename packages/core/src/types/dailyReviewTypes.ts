export interface DailyReview {
  id: string;
  date: string; // YYYY-MM-DD
  content: string;
  rating?: number; // 1-5 scale
  createdAt: number;
  updatedAt: number;
}

export interface CompoundStats {
  currentStreak: number;
  longestStreak: number;
  totalReviews: number;
  compoundValue: number;
}

export interface DailyReviewData {
  reviews: DailyReview[];
}
