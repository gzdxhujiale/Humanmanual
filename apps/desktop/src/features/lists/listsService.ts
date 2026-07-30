import { call, callSilent } from '../../lib/tauriClient';
import type { List, Folder, Note, NoteGroup } from './listsTypes';

/**
 * listsService — the data-access seam for the Lists feature.
 *
 * All Tauri IPC lives here; the store calls this service and never imports
 * `invoke` directly. DTO shaping (camelCase field names, null-defaulted
 * foreign keys) is concentrated in this one module; error logging and
 * rethrow policy live in `call`.
 */

// ── Init / bootstrap ─────────────────────────────────────────────────────────

export type ListLoadAllPayload = {
  folders: Array<{ id: string; name: string; isPinned: boolean; sortOrder: number }>;
  lists: Array<{
    id: string;
    name: string;
    icon: string;
    color: string;
    viewType: string;
    folderId: string | null;
    isPinned: boolean;
    sortOrder: number;
    itemCount: number;
  }>;
  noteGroups: Array<{ id: string; listId: string; name: string; sortOrder: number }>;
  notes: Array<{
    id: string;
    listId: string;
    groupId: string | null;
    title: string;
    content: string;
    isPinned: boolean;
    sortOrder: number;
    createdAt: number;
    updatedAt: number;
  }>;
  templates: Array<{ id: string; name: string; content: string }>;
};

export function loadAll(): Promise<ListLoadAllPayload> {
  return call<ListLoadAllPayload>('list_load_all');
}

// ── Lists ────────────────────────────────────────────────────────────────────

export function upsertList(list: List): Promise<void> {
  return call('list_upsert_list', {
    list: {
      id: list.id,
      name: list.name,
      icon: list.icon,
      color: list.color,
      viewType: list.viewType,
      folderId: list.folderId,
      isPinned: list.isPinned || false,
      sortOrder: list.sortOrder || 0,
      itemCount: list.itemCount || 0,
    },
  });
}

export function deleteList(id: string): Promise<void> {
  return call('list_delete_list', { id });
}

export function duplicateList(sourceId: string, newList: List): Promise<void> {
  return call('list_duplicate_list', {
    sourceId,
    newList: {
      id: newList.id,
      name: newList.name,
      icon: newList.icon,
      color: newList.color,
      viewType: newList.viewType,
      folderId: newList.folderId,
      isPinned: newList.isPinned || false,
      sortOrder: newList.sortOrder || 0,
      itemCount: 0,
    },
  });
}

export function reorderLists(items: Array<[string, number]>): Promise<void> {
  return call('list_reorder_lists', { items });
}

export function moveList(listId: string, folderId: string | null, sortOrder: number): Promise<void> {
  return call('list_move_list', { listId, folderId, sortOrder });
}

// ── Folders ──────────────────────────────────────────────────────────────────

export function upsertFolder(folder: Folder): Promise<void> {
  return call('list_upsert_folder', {
    folder: {
      id: folder.id,
      name: folder.name,
      isPinned: folder.isPinned || false,
      sortOrder: folder.sortOrder || 0,
    },
  });
}

export function deleteFolder(id: string): Promise<void> {
  return call('list_delete_folder', { id });
}

export function reorderFolders(items: Array<[string, number]>): Promise<void> {
  return call('list_reorder_folders', { items });
}

// ── Notes ────────────────────────────────────────────────────────────────────

export function upsertNote(note: Note): Promise<void> {
  return call('list_upsert_note', {
    note: {
      id: note.id,
      listId: note.listId,
      groupId: note.groupId || null,
      title: note.title,
      content: note.content,
      isPinned: note.isPinned || false,
      sortOrder: note.sortOrder || 0,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    },
  });
}

export function deleteNote(id: string): Promise<void> {
  return call('list_delete_note', { id });
}

export function moveNote(
  noteId: string,
  listId: string,
  groupId: string | null,
  sortOrder: number
): Promise<void> {
  return call('list_move_note', { noteId, listId, groupId, sortOrder });
}

export function reorderNotes(items: Array<[string, number]>): Promise<void> {
  return call('list_reorder_notes', { items });
}

// ── Note Groups ──────────────────────────────────────────────────────────────

export function upsertGroup(group: NoteGroup): Promise<void> {
  return call('list_upsert_group', {
    group: {
      id: group.id,
      listId: group.listId,
      name: group.name,
      sortOrder: group.sortOrder || 0,
    },
  });
}

export function deleteGroup(id: string): Promise<void> {
  return call('list_delete_group', { id });
}

// ── Templates (Delegated to templates feature) ───────────────────────────────

export { upsertTemplate, deleteTemplate } from '../templates/templateService';

// ── Export / Import ──────────────────────────────────────────────────────────

export type ImportedMarkdownFile = { title: string; content: string };

/** Returns null when the user cancels the file picker. */
export function pickMarkdownFile(): Promise<string | null> {
  return callSilent<string | null>('pick_markdown_file', undefined, null);
}

export function saveMarkdownFile(defaultName: string, content: string): Promise<void> {
  return call('save_markdown_file', { defaultName, content });
}

export function pickMultipleMarkdownFiles(): Promise<ImportedMarkdownFile[]> {
  return call<ImportedMarkdownFile[]>('pick_multiple_markdown_files');
}

export function saveMultipleMarkdownFiles(
  files: Array<{ title: string; content: string }>
): Promise<void> {
  return call('save_multiple_markdown_files', { files });
}
