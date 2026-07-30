import { create } from 'zustand';
import { Template, DEFAULT_TEMPLATES } from './templateTypes';
import * as templateService from './templateService';
import { logError } from '@humanmanual/core';

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface TemplateStoreState {
  templates: Template[];
  initialized: boolean;
  
  getTemplates: () => Template[];
  addTemplate: (name: string, content: string) => Template;
  updateTemplate: (id: string, updates: Partial<Template>) => void;
  deleteTemplate: (id: string) => void;
  setTemplates: (templates: Template[]) => void;
}

export const useTemplateStore = create<TemplateStoreState>((set, get) => ({
  templates: DEFAULT_TEMPLATES,
  initialized: true,

  getTemplates: () => {
    return get().templates;
  },

  setTemplates: (templates: Template[]) => {
    // 空数组是合法状态（用户删光了模板），不能忽略
    set({ templates, initialized: true });
  },

  addTemplate: (name, content) => {
    const templates = get().templates;
    const newTemplate: Template = {
      id: genId('tpl'),
      name,
      content,
    };

    set({ templates: [...templates, newTemplate] });
    templateService.upsertTemplate(newTemplate).catch(err => logError('templateStore', 'failed to persist new template', err));
    return newTemplate;
  },

  updateTemplate: (id, updates) => {
    const templates = get().templates;
    const index = templates.findIndex(t => t.id === id);
    if (index !== -1) {
      const newTemplates = [...templates];
      newTemplates[index] = { ...newTemplates[index], ...updates };
      set({ templates: newTemplates });
      templateService.upsertTemplate(newTemplates[index]).catch(err => logError('templateStore', 'failed to persist template update', err));
    }
  },

  deleteTemplate: (id) => {
    const templates = get().templates;
    set({ templates: templates.filter(t => t.id !== id) });
    templateService.deleteTemplate(id).catch(err => logError('templateStore', 'failed to delete template from DB', err));
  },
}));
