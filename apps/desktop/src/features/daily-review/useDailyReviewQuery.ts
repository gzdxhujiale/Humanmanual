import { useMemo } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  queryKeys,
  sharedSyncEngine,
  HIGH_FREQ_DELAY,
  LOW_FREQ_DELAY,
  logError,
} from '@humanmanual/core';
import { dailyReviewApi } from './dailyReviewService';
import { DailyReview } from './dailyReviewTypes';
import { isReviewEmpty } from './dailyReviewSelectors';

const EMPTY_REVIEWS: DailyReview[] = [];

/**
 * Deep Module Hook: owns fetching/caching of all daily reviews.
 * Components derive views via dailyReviewSelectors over `data`.
 */
export function useDailyReviewData() {
  return useQuery({
    queryKey: queryKeys.dailyReviews.all,
    queryFn: (): Promise<DailyReview[]> => dailyReviewApi.loadAll(),
  });
}

function setReviewsData(
  queryClient: QueryClient,
  updater: (prev: DailyReview[]) => DailyReview[]
) {
  queryClient.setQueryData<DailyReview[]>(queryKeys.dailyReviews.all, (prev) =>
    updater(prev ?? EMPTY_REVIEWS)
  );
}

export interface ReviewActions {
  saveReview: (date: string, content: string, rating?: number, isHighFreq?: boolean) => DailyReview;
  deleteReview: (id: string) => void;
}

/**
 * Write path for daily reviews: optimistic query-cache update + debounced
 * persistence via sharedSyncEngine (`daily-review:` keys). useSyncQueryInvalidator
 * refetches the cache once persistence completes.
 */
export function useReviewActions(): ReviewActions {
  const queryClient = useQueryClient();

  return useMemo<ReviewActions>(() => {
    const deleteReview = (id: string) => {
      setReviewsData(queryClient, (prev) => prev.filter((r) => r.id !== id));
      sharedSyncEngine.cancel(`daily-review:${id}`);
      dailyReviewApi.delete(id).catch((e) => {
        logError('useDailyReviewQuery', 'failed to delete review', e);
        queryClient.invalidateQueries({ queryKey: queryKeys.dailyReviews.all });
      });
    };

    const saveReview = (date: string, content: string, rating?: number, isHighFreq?: boolean): DailyReview => {
      const prev = queryClient.getQueryData<DailyReview[]>(queryKeys.dailyReviews.all) ?? EMPTY_REVIEWS;
      const existing = prev.find((r) => r.date === date);

      const isEmpty = isReviewEmpty(content) && (rating === undefined || rating === 0);

      // Blank review: if existing record exists, delete it from DB & cloud, otherwise return transient blank object
      if (isEmpty) {
        if (existing) {
          deleteReview(existing.id);
        }
        return { id: '', date, content: '', rating: 0, createdAt: 0, updatedAt: 0 };
      }

      const review: DailyReview = existing
        ? {
            ...existing,
            content,
            rating: rating !== undefined ? rating : existing.rating,
            updatedAt: Date.now(),
          }
        : {
            id: crypto.randomUUID(),
            date,
            content,
            rating: rating || 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

      setReviewsData(queryClient, (list) => {
        const index = list.findIndex((r) => r.date === date);
        if (index >= 0) {
          const next = [...list];
          next[index] = review;
          return next;
        }
        return [...list, review];
      });

      sharedSyncEngine.schedule(
        `daily-review:${review.id}`,
        () => dailyReviewApi.save(review),
        (isHighFreq ?? true) ? HIGH_FREQ_DELAY : LOW_FREQ_DELAY
      );
      return review;
    };

    return { saveReview, deleteReview };
  }, [queryClient]);
}
