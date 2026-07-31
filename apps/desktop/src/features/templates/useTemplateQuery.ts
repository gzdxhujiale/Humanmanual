import { useMemo } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys, logError } from '@humanmanual/core';
import * as templateService from './templateService';
import { Template } from './templateTypes';

const EMPTY_TEMPLATES: Template[] = [];

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Deep Module Hook: owns fetching/caching of note templates.
 * Components read `data` and mutate through useTemplateActions.
 */
export function useTemplateData() {
  return useQuery({
    queryKey: queryKeys.templates.all,
    queryFn: (): Promise<Template[]> => templateService.loadAll(),
  });
}

function setTemplatesData(
  queryClient: QueryClient,
  updater: (prev: Template[]) => Template[]
) {
  queryClient.setQueryData<Template[]>(queryKeys.templates.all, (prev) =>
    updater(prev ?? EMPTY_TEMPLATES)
  );
}

export interface TemplateActions {
  addTemplate: (name: string, content: string) => Template;
  updateTemplate: (id: string, updates: Partial<Template>) => void;
  deleteTemplate: (id: string) => void;
}

/**
 * Write path for templates: optimistic query-cache update + fire-and-forget
 * persistence via templateService. Empty template list is a valid state.
 */
export function useTemplateActions(): TemplateActions {
  const queryClient = useQueryClient();

  return useMemo<TemplateActions>(() => ({
    addTemplate: (name, content) => {
      const newTemplate: Template = { id: genId('tpl'), name, content };
      setTemplatesData(queryClient, (prev) => [...prev, newTemplate]);
      templateService
        .upsertTemplate(newTemplate)
        .catch((err) => logError('useTemplateQuery', 'failed to persist new template', err));
      return newTemplate;
    },

    updateTemplate: (id, updates) => {
      let persisted: Template | undefined;
      setTemplatesData(queryClient, (prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          persisted = { ...t, ...updates };
          return persisted;
        })
      );
      if (persisted) {
        const template = persisted;
        templateService
          .upsertTemplate(template)
          .catch((err) => logError('useTemplateQuery', 'failed to persist template update', err));
      }
    },

    deleteTemplate: (id) => {
      setTemplatesData(queryClient, (prev) => prev.filter((t) => t.id !== id));
      templateService
        .deleteTemplate(id)
        .catch((err) => logError('useTemplateQuery', 'failed to delete template', err));
    },
  }), [queryClient]);
}
