import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { sharedSyncEngine, queryKeys } from '@humanmanual/core';

/**
 * Hook that listens to background sync engine completions and automatically
 * invalidates matching TanStack Query caches so UI updates seamlessly.
 */
export function useSyncQueryInvalidator() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = sharedSyncEngine.onSync((key, status) => {
      if (status === 'completed') {
        if (key.startsWith('habit:')) {
          queryClient.invalidateQueries({ queryKey: queryKeys.habits.all });
        } else if (key.startsWith('task:')) {
          queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
        } else if (key.startsWith('list:')) {
          queryClient.invalidateQueries({ queryKey: queryKeys.lists.all });
        } else if (key.startsWith('daily-review:')) {
          queryClient.invalidateQueries({ queryKey: queryKeys.dailyReviews.all });
        }
      }
    });

    return unsubscribe;
  }, [queryClient]);
}
