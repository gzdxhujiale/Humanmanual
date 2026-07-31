/**
 * Global Query Key Factory for TanStack Query across desktop and mobile.
 * Standardizing Query Keys avoids cache key collisions and ensures type-safe cache invalidation.
 */

export const queryKeys = {
  // Habit tracking module
  habits: {
    all: ['habits'] as const,
    lists: () => [...queryKeys.habits.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.habits.all, 'detail', id] as const,
    logs: (monthStr?: string) => [...queryKeys.habits.all, 'logs', monthStr ?? 'all'] as const,
  },

  // Time management & task module
  tasks: {
    all: ['tasks'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.tasks.all, 'list', filters ?? {}] as const,
    quadrant: (quadrant: string) => [...queryKeys.tasks.all, 'quadrant', quadrant] as const,
    date: (dateStr: string) => [...queryKeys.tasks.all, 'date', dateStr] as const,
    detail: (id: string) => [...queryKeys.tasks.all, 'detail', id] as const,
  },

  // Daily review module
  dailyReviews: {
    all: ['dailyReviews'] as const,
    byDate: (dateStr: string) => [...queryKeys.dailyReviews.all, 'date', dateStr] as const,
    range: (start: string, end: string) => [...queryKeys.dailyReviews.all, 'range', start, end] as const,
  },

  // Note templates module
  templates: {
    all: ['templates'] as const,
  },

  // Lists & Notes module
  lists: {
    all: ['lists'] as const,
    list: () => [...queryKeys.lists.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.lists.all, 'detail', id] as const,
  },

  // Pomodoro module
  pomodoro: {
    all: ['pomodoro'] as const,
    stats: (period?: string) => [...queryKeys.pomodoro.all, 'stats', period ?? 'all'] as const,
    logs: () => [...queryKeys.pomodoro.all, 'logs'] as const,
  },

  // Mission / Compass module
  mission: {
    all: ['mission'] as const,
    values: () => [...queryKeys.mission.all, 'values'] as const,
    goals: () => [...queryKeys.mission.all, 'goals'] as const,
  },
} as const;
