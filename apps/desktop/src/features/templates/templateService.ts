import { call, callSilent } from '../../lib/tauriClient';
import { logError } from '@humanmanual/core';
import { DEFAULT_TEMPLATES, type Template } from './templateTypes';

/**
 * templateService — data-access seam for the Templates feature.
 * Concentrates Tauri IPC calls for template persistence.
 */

// 默认模板只在首次运行时 seed 一次（标记存 app_preferences，随双层持久化同步）；
// “DB 为空”不等于“首次运行”，否则用户删光模板后重启会复活默认模板。
const TEMPLATES_SEEDED_KEY = 'templates-seeded-v1';

/**
 * Load all templates. Templates ship bundled in the lists payload, so we read
 * `list_load_all` and extract them. On the very first run (empty DB + no seed
 * marker) the default templates are seeded into the DB and returned.
 */
export async function loadAll(): Promise<Template[]> {
  const data = await call<{ templates: Template[] }>('list_load_all');
  let templates = data.templates || [];

  if (templates.length === 0) {
    const seeded = await callSilent<string | null>('db_get_preference', { key: TEMPLATES_SEEDED_KEY }, null);
    if (!seeded) {
      templates = DEFAULT_TEMPLATES;
      for (const t of DEFAULT_TEMPLATES) {
        upsertTemplate(t).catch((err) => logError('templateService', 'failed to seed default template', err));
      }
    }
  }
  void callSilent('db_set_preference', { key: TEMPLATES_SEEDED_KEY, value: 'true' }, undefined);
  return templates;
}

export function upsertTemplate(template: Template): Promise<void> {
  return call('list_upsert_template', { template });
}

export function deleteTemplate(id: string): Promise<void> {
  return call('list_delete_template', { id });
}
