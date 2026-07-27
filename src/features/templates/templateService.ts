import { call } from '../../lib/tauriClient';
import type { Template } from './templateTypes';

/**
 * templateService — data-access seam for the Templates feature.
 * Concentrates Tauri IPC calls for template persistence.
 */

export function upsertTemplate(template: Template): Promise<void> {
  return call('list_upsert_template', { template });
}

export function deleteTemplate(id: string): Promise<void> {
  return call('list_delete_template', { id });
}
