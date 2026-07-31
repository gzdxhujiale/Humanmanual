import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data remains fresh for 5 minutes by default to reduce redundant DB reads
      staleTime: 1000 * 60 * 5,
      // Keep unused data in cache for 15 minutes before garbage collection
      gcTime: 1000 * 60 * 15,
      // Refetch on window focus when user returns to app
      refetchOnWindowFocus: true,
      // Reconnect refetch
      refetchOnReconnect: true,
      // Retry failed queries once before throwing
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
