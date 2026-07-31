import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { emit, listen } from '@tauri-apps/api/event';
import {
  queryKeys,
  sharedSyncEngine,
  HIGH_FREQ_DELAY,
  LOW_FREQ_DELAY,
  logSilent,
} from '@humanmanual/core';
import * as listsService from './listsService';
import type { List, Folder, Note, NoteGroup } from './listsTypes';
import { getNoteGroups as selectNoteGroups, getNotesByListId as selectNotesByListId } from './listsSelectors';

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * useListsQuery — the Lists feature's async-data seam on TanStack Query.
 *
 * `useListsData` owns fetching/caching of the four entity collections; components
 * derive views via `listsSelectors`. `useListsActions` is the write path:
 * synchronous optimistic cache updates + debounced persistence through
 * `sharedSyncEngine` (`list:` completions are refetched by useSyncQueryInvalidator).
 * Cross-window note sync (registered once per window) patches the same cache.
 */

// ── Cross-window note sync (Tauri events) ───────────────────────────────────
// BroadcastChannel does not cross Tauri windows on macOS WKWebView, so note
// changes fan out over Tauri events. `emit` echoes back to the sender window;
// the instance id filters out self-echo.
const SYNC_SOURCE_ID = genId('win');
const NOTE_UPDATED_EVENT = 'lists:note-updated';
const NOTE_DELETED_EVENT = 'lists:note-deleted';
const NOTES_REORDERED_EVENT = 'lists:notes-reordered';

interface NoteSyncPayload {
  source: string;
  noteId: string;
  updates?: Partial<Note>;
}

interface NotesReorderPayload {
  source: string;
  /** [noteId, sortOrder] */
  items: Array<[string, number]>;
}

function broadcastNoteUpdate(noteId: string, updates: Partial<Note>) {
  emit(NOTE_UPDATED_EVENT, { source: SYNC_SOURCE_ID, noteId, updates } satisfies NoteSyncPayload)
    .catch(e => logSilent('useListsQuery', 'note sync broadcast failed', e));
}

function broadcastNoteDelete(noteId: string) {
  emit(NOTE_DELETED_EVENT, { source: SYNC_SOURCE_ID, noteId } satisfies NoteSyncPayload)
    .catch(e => logSilent('useListsQuery', 'note sync broadcast failed', e));
}

function broadcastNotesReorder(items: Array<[string, number]>) {
  if (items.length === 0) return;
  emit(NOTES_REORDERED_EVENT, { source: SYNC_SOURCE_ID, items } satisfies NotesReorderPayload)
    .catch(e => logSilent('useListsQuery', 'note sync broadcast failed', e));
}

// ── Query data ──────────────────────────────────────────────────────────────

export interface ListsQueryData {
  lists: List[];
  folders: Folder[];
  noteGroups: NoteGroup[];
  notes: Note[];
}

const EMPTY_DATA: ListsQueryData = { lists: [], folders: [], noteGroups: [], notes: [] };

async function fetchListsData(): Promise<ListsQueryData> {
  const allData = await listsService.loadAll();
  return {
    folders: allData.folders.map(f => ({ ...f })),
    lists: allData.lists.map(l => ({ ...l, viewType: l.viewType as 'list' | 'board' })),
    noteGroups: allData.noteGroups.map(g => ({ ...g })),
    notes: allData.notes.map(n => ({ ...n })),
  };
}

function getData(queryClient: QueryClient): ListsQueryData {
  return queryClient.getQueryData<ListsQueryData>(queryKeys.lists.all) ?? EMPTY_DATA;
}

function setData(queryClient: QueryClient, updater: (prev: ListsQueryData) => ListsQueryData) {
  queryClient.setQueryData<ListsQueryData>(queryKeys.lists.all, prev => updater(prev ?? EMPTY_DATA));
}

// Register the cross-window listeners exactly once per window. Each Tauri window
// has its own JS context (and thus its own module instance + queryClient), so a
// module-level guard is per-window — precisely the desired scope.
let crossWindowRegistered = false;
function registerCrossWindowSync(queryClient: QueryClient) {
  if (crossWindowRegistered) return;
  crossWindowRegistered = true;

  void listen<NoteSyncPayload>(NOTE_UPDATED_EVENT, (event) => {
    const { source, noteId, updates } = event.payload;
    if (source === SYNC_SOURCE_ID) return;
    setData(queryClient, (data) => {
      const index = data.notes.findIndex(n => n.id === noteId);
      if (index === -1) return data;
      const newNotes = [...data.notes];
      newNotes[index] = { ...newNotes[index], ...updates, updatedAt: Date.now() };
      return { ...data, notes: newNotes };
    });
  }).catch(e => logSilent('useListsQuery', 'note sync listen failed', e));

  void listen<NoteSyncPayload>(NOTE_DELETED_EVENT, (event) => {
    const { source, noteId } = event.payload;
    if (source === SYNC_SOURCE_ID) return;
    // Cancel this window's pending debounced save first, so a deleted note is
    // not written back to the database ("resurrected").
    sharedSyncEngine.cancel(`note:${noteId}`);
    setData(queryClient, (data) => {
      const note = data.notes.find(n => n.id === noteId);
      if (!note) return data;
      const newLists = [...data.lists];
      const listIndex = newLists.findIndex(l => l.id === note.listId);
      if (listIndex !== -1 && (newLists[listIndex].itemCount || 0) > 0) {
        newLists[listIndex] = { ...newLists[listIndex], itemCount: newLists[listIndex].itemCount! - 1 };
      }
      return { ...data, notes: data.notes.filter(n => n.id !== noteId), lists: newLists };
    });
  }).catch(e => logSilent('useListsQuery', 'note sync listen failed', e));

  void listen<NotesReorderPayload>(NOTES_REORDERED_EVENT, (event) => {
    const { source, items } = event.payload;
    if (source === SYNC_SOURCE_ID) return;
    const orderMap = new Map(items);
    setData(queryClient, (data) => ({
      ...data,
      notes: data.notes.map(n => (orderMap.has(n.id) ? { ...n, sortOrder: orderMap.get(n.id)! } : n)),
    }));
  }).catch(e => logSilent('useListsQuery', 'note sync listen failed', e));
}

/**
 * Fetches all Lists/Folders/Notes/Groups and wires up cross-window note sync.
 * Templates are owned by the templates feature (`useTemplateData`).
 */
export function useListsData() {
  const queryClient = useQueryClient();

  useEffect(() => {
    registerCrossWindowSync(queryClient);
  }, [queryClient]);

  return useQuery({
    queryKey: queryKeys.lists.all,
    queryFn: fetchListsData,
  });
}

// ── Write path ───────────────────────────────────────────────────────────────

export interface ListsActions {
  addList: (list: Omit<List, 'id'>) => List;
  updateList: (id: string, updates: Partial<List>) => void;
  deleteList: (id: string) => void;
  duplicateList: (list: List) => List;
  reorderLists: (orderedIds: string[]) => void;
  moveList: (listId: string, folderId: string | null, targetIndex?: number) => void;

  addFolder: (name: string) => Folder;
  updateFolder: (id: string, updates: Partial<Folder>) => void;
  reorderFolders: (orderedIds: string[]) => void;
  deleteFolder: (id: string) => void;

  addNote: (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'>) => Note;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  moveNoteAndReorder: (noteId: string, groupId: string | null, targetIndex?: number) => void;
  moveNoteToList: (noteId: string, targetListId: string, targetGroupId?: string | null) => void;
  reorderNotes: (orderedIds: string[]) => void;

  addGroup: (listId: string, name: string) => NoteGroup;
  updateGroup: (id: string, updates: Partial<NoteGroup>) => void;
  deleteGroup: (id: string) => void;
}

export function useListsActions(): ListsActions {
  const queryClient = useQueryClient();

  return useMemo<ListsActions>(() => {
    // ── Lists ──
    const addList: ListsActions['addList'] = (list) => {
      const data = getData(queryClient);
      const newList: List = {
        ...list,
        id: genId('list'),
        itemCount: 0,
        sortOrder: data.lists.length,
      };
      setData(queryClient, () => ({ ...data, lists: [...data.lists, newList] }));
      sharedSyncEngine.schedule(`list:${newList.id}`, () => listsService.upsertList(newList), LOW_FREQ_DELAY);
      return newList;
    };

    const updateList: ListsActions['updateList'] = (id, updates) => {
      const data = getData(queryClient);
      const index = data.lists.findIndex(l => l.id === id);
      if (index === -1) return;
      const newLists = [...data.lists];
      newLists[index] = { ...newLists[index], ...updates };
      const list = newLists[index];
      setData(queryClient, () => ({ ...data, lists: newLists }));
      sharedSyncEngine.schedule(`list:${id}`, () => listsService.upsertList(list), HIGH_FREQ_DELAY);
    };

    const deleteList: ListsActions['deleteList'] = (id) => {
      const data = getData(queryClient);
      setData(queryClient, () => ({
        ...data,
        lists: data.lists.filter(l => l.id !== id),
        notes: data.notes.filter(n => n.listId !== id),
        noteGroups: data.noteGroups.filter(g => g.listId !== id),
      }));
      sharedSyncEngine.cancel(`list:${id}`);
      listsService.deleteList(id).catch(() => {});
    };

    const reorderLists: ListsActions['reorderLists'] = (orderedIds) => {
      const data = getData(queryClient);
      const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
      const items: Array<[string, number]> = [];
      const newLists = data.lists.map(l => {
        if (orderMap.has(l.id)) {
          const order = orderMap.get(l.id)!;
          items.push([l.id, order]);
          return { ...l, sortOrder: order };
        }
        return l;
      });
      setData(queryClient, () => ({ ...data, lists: newLists }));
      sharedSyncEngine.schedule('reorder:lists', () => listsService.reorderLists(items), LOW_FREQ_DELAY);
    };

    const moveList: ListsActions['moveList'] = (listId, folderId, targetIndex) => {
      const data = getData(queryClient);
      const listIndex = data.lists.findIndex(l => l.id === listId);
      if (listIndex === -1) return;

      const list = { ...data.lists[listIndex], folderId };
      let newLists = [...data.lists];
      newLists[listIndex] = list;

      const siblingLists = newLists
        .filter(l => l.folderId === folderId && l.id !== listId)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

      if (targetIndex !== undefined) {
        siblingLists.splice(targetIndex, 0, list);
      } else {
        siblingLists.push(list);
      }

      const orderMap = new Map<string, number>();
      siblingLists.forEach((l, idx) => orderMap.set(l.id, idx));

      newLists = newLists.map(l => (orderMap.has(l.id) ? { ...l, sortOrder: orderMap.get(l.id) } : l));
      setData(queryClient, () => ({ ...data, lists: newLists }));
      const updatedList = newLists.find(l => l.id === listId);
      sharedSyncEngine.schedule(
        `list:${listId}`,
        () => listsService.moveList(listId, folderId, updatedList?.sortOrder || 0),
        LOW_FREQ_DELAY
      );
    };

    // ── Note Groups ──
    const addGroup: ListsActions['addGroup'] = (listId, name) => {
      const data = getData(queryClient);
      const newGroup: NoteGroup = {
        id: genId('group'),
        listId,
        name,
        sortOrder: data.noteGroups.filter(g => g.listId === listId).length,
      };
      setData(queryClient, () => ({ ...data, noteGroups: [...data.noteGroups, newGroup] }));
      sharedSyncEngine.schedule(`group:${newGroup.id}`, () => listsService.upsertGroup(newGroup), LOW_FREQ_DELAY);
      return newGroup;
    };

    const updateGroup: ListsActions['updateGroup'] = (id, updates) => {
      const data = getData(queryClient);
      const index = data.noteGroups.findIndex(g => g.id === id);
      if (index === -1) return;
      const newGroups = [...data.noteGroups];
      newGroups[index] = { ...newGroups[index], ...updates };
      const group = newGroups[index];
      setData(queryClient, () => ({ ...data, noteGroups: newGroups }));
      sharedSyncEngine.schedule(`group:${id}`, () => listsService.upsertGroup(group), HIGH_FREQ_DELAY);
    };

    const deleteGroup: ListsActions['deleteGroup'] = (id) => {
      const data = getData(queryClient);
      setData(queryClient, () => ({
        ...data,
        noteGroups: data.noteGroups.filter(g => g.id !== id),
        notes: data.notes.map(n => (n.groupId === id ? { ...n, groupId: null } : n)),
      }));
      sharedSyncEngine.cancel(`group:${id}`);
      listsService.deleteGroup(id).catch(() => {});
    };

    // ── Notes ──
    const addNote: ListsActions['addNote'] = (note) => {
      const data = getData(queryClient);
      const siblingNotes = data.notes.filter(n => n.listId === note.listId && n.groupId === note.groupId);
      const newNote: Note = {
        ...note,
        id: genId('note'),
        sortOrder: siblingNotes.length,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const newLists = [...data.lists];
      const listIndex = newLists.findIndex(l => l.id === note.listId);
      if (listIndex !== -1) {
        newLists[listIndex] = { ...newLists[listIndex], itemCount: (newLists[listIndex].itemCount || 0) + 1 };
      }
      setData(queryClient, () => ({ ...data, notes: [...data.notes, newNote], lists: newLists }));
      sharedSyncEngine.schedule(`note:${newNote.id}`, () => listsService.upsertNote(newNote), LOW_FREQ_DELAY);
      return newNote;
    };

    const updateNote: ListsActions['updateNote'] = (id, updates) => {
      const data = getData(queryClient);
      const index = data.notes.findIndex(n => n.id === id);
      if (index === -1) return;
      const newNotes = [...data.notes];
      newNotes[index] = { ...newNotes[index], ...updates, updatedAt: Date.now() };
      const note = newNotes[index];
      setData(queryClient, () => ({ ...data, notes: newNotes }));
      broadcastNoteUpdate(id, updates);
      sharedSyncEngine.schedule(`note:${id}`, () => listsService.upsertNote(note), HIGH_FREQ_DELAY);
    };

    const deleteNote: ListsActions['deleteNote'] = (id) => {
      const data = getData(queryClient);
      const note = data.notes.find(n => n.id === id);
      if (!note) return;
      const newLists = [...data.lists];
      const listIndex = newLists.findIndex(l => l.id === note.listId);
      if (listIndex !== -1 && (newLists[listIndex].itemCount || 0) > 0) {
        newLists[listIndex] = { ...newLists[listIndex], itemCount: newLists[listIndex].itemCount! - 1 };
      }
      setData(queryClient, () => ({
        ...data,
        notes: data.notes.filter(n => n.id !== id),
        lists: newLists,
      }));
      sharedSyncEngine.cancel(`note:${id}`);
      listsService.deleteNote(id).catch(() => {});
      broadcastNoteDelete(id);
    };

    const moveNoteAndReorder: ListsActions['moveNoteAndReorder'] = (noteId, groupId, targetIndex) => {
      const data = getData(queryClient);
      const noteIndex = data.notes.findIndex(n => n.id === noteId);
      if (noteIndex === -1) return;

      let newNotes = [...data.notes];
      const note = { ...newNotes[noteIndex], groupId };
      newNotes[noteIndex] = note;

      const siblingNotes = newNotes
        .filter(n => n.listId === note.listId && n.groupId === groupId && n.id !== noteId)
        .sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          if (a.sortOrder !== b.sortOrder) return (a.sortOrder || 0) - (b.sortOrder || 0);
          return b.updatedAt - a.updatedAt;
        });

      if (targetIndex !== undefined) {
        siblingNotes.splice(targetIndex, 0, note);
      } else {
        siblingNotes.push(note);
      }

      const orderMap = new Map<string, number>();
      siblingNotes.forEach((n, idx) => orderMap.set(n.id, idx));

      newNotes = newNotes.map(n => (orderMap.has(n.id) ? { ...n, sortOrder: orderMap.get(n.id)! } : n));
      setData(queryClient, () => ({ ...data, notes: newNotes }));
      const updatedNote = newNotes.find(n => n.id === noteId);
      // Sync the group change and affected same-group ordering so a stale copy in
      // a child window does not write back the whole note and undo the move.
      broadcastNoteUpdate(noteId, { groupId });
      broadcastNotesReorder(Array.from(orderMap.entries()));
      sharedSyncEngine.schedule(
        `note:${noteId}`,
        () => listsService.moveNote(noteId, note.listId, groupId, updatedNote?.sortOrder || 0),
        LOW_FREQ_DELAY
      );
    };

    const moveNoteToList: ListsActions['moveNoteToList'] = (noteId, targetListId, targetGroupId = null) => {
      const data = getData(queryClient);
      const noteIndex = data.notes.findIndex(n => n.id === noteId);
      if (noteIndex === -1) return;

      const oldNote = data.notes[noteIndex];
      if (oldNote.listId === targetListId && oldNote.groupId === targetGroupId) return;

      const oldListId = oldNote.listId;
      const targetListNotes = data.notes.filter(n => n.listId === targetListId);
      const maxSortOrder = targetListNotes.reduce((max, n) => Math.max(max, n.sortOrder || 0), -1);
      const newSortOrder = maxSortOrder + 1;

      const newNotes = [...data.notes];
      newNotes[noteIndex] = {
        ...oldNote,
        listId: targetListId,
        groupId: targetGroupId,
        sortOrder: newSortOrder,
        updatedAt: Date.now(),
      };

      const newLists = data.lists.map(l => {
        if (l.id === oldListId) return { ...l, itemCount: Math.max(0, (l.itemCount || 0) - 1) };
        if (l.id === targetListId) return { ...l, itemCount: (l.itemCount || 0) + 1 };
        return l;
      });

      setData(queryClient, () => ({ ...data, notes: newNotes, lists: newLists }));
      broadcastNoteUpdate(noteId, { listId: targetListId, groupId: targetGroupId, sortOrder: newSortOrder });
      sharedSyncEngine.schedule(
        `note:${noteId}`,
        () => listsService.moveNote(noteId, targetListId, targetGroupId, newSortOrder),
        LOW_FREQ_DELAY
      );
    };

    const reorderNotes: ListsActions['reorderNotes'] = (orderedIds) => {
      const data = getData(queryClient);
      const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
      const items: Array<[string, number]> = [];
      const newNotes = data.notes.map(n => {
        if (orderMap.has(n.id)) {
          const order = orderMap.get(n.id)!;
          items.push([n.id, order]);
          return { ...n, sortOrder: order };
        }
        return n;
      });
      setData(queryClient, () => ({ ...data, notes: newNotes }));
      broadcastNotesReorder(items);
      sharedSyncEngine.schedule('reorder:notes', () => listsService.reorderNotes(items), LOW_FREQ_DELAY);
    };

    // ── Folders ──
    const addFolder: ListsActions['addFolder'] = (name) => {
      const data = getData(queryClient);
      const newFolder: Folder = {
        id: genId('folder'),
        name,
        sortOrder: data.folders.length,
      };
      setData(queryClient, () => ({ ...data, folders: [...data.folders, newFolder] }));
      sharedSyncEngine.schedule(`folder:${newFolder.id}`, () => listsService.upsertFolder(newFolder), LOW_FREQ_DELAY);
      return newFolder;
    };

    const updateFolder: ListsActions['updateFolder'] = (id, updates) => {
      const data = getData(queryClient);
      const index = data.folders.findIndex(f => f.id === id);
      if (index === -1) return;
      const newFolders = [...data.folders];
      newFolders[index] = { ...newFolders[index], ...updates };
      const folder = newFolders[index];
      setData(queryClient, () => ({ ...data, folders: newFolders }));
      sharedSyncEngine.schedule(`folder:${id}`, () => listsService.upsertFolder(folder), HIGH_FREQ_DELAY);
    };

    const reorderFolders: ListsActions['reorderFolders'] = (orderedIds) => {
      const data = getData(queryClient);
      const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
      const items: Array<[string, number]> = [];
      const newFolders = data.folders.map(f => {
        if (orderMap.has(f.id)) {
          const order = orderMap.get(f.id)!;
          items.push([f.id, order]);
          return { ...f, sortOrder: order };
        }
        return f;
      });
      setData(queryClient, () => ({ ...data, folders: newFolders }));
      sharedSyncEngine.schedule('reorder:folders', () => listsService.reorderFolders(items), LOW_FREQ_DELAY);
    };

    const deleteFolder: ListsActions['deleteFolder'] = (id) => {
      const data = getData(queryClient);
      setData(queryClient, () => ({
        ...data,
        folders: data.folders.filter(f => f.id !== id),
        lists: data.lists.map(l => (l.folderId === id ? { ...l, folderId: null } : l)),
      }));
      sharedSyncEngine.cancel(`folder:${id}`);
      listsService.deleteFolder(id).catch(() => {});
    };

    // ── Duplicate (composes the primitives above) ──
    const duplicateList: ListsActions['duplicateList'] = (list) => {
      const newList = addList({ ...list, name: list.name + ' (副本)', isPinned: false });

      const sourceGroups = selectNoteGroups(getData(queryClient).noteGroups, list.id);
      const groupMap = new Map<string, string>();
      sourceGroups.forEach(group => {
        const newGroup = addGroup(newList.id, group.name);
        updateGroup(newGroup.id, { sortOrder: group.sortOrder });
        groupMap.set(group.id, newGroup.id);
      });

      const sourceNotes = selectNotesByListId(getData(queryClient).notes, list.id);
      sourceNotes.forEach(note => {
        addNote({
          listId: newList.id,
          groupId: note.groupId ? groupMap.get(note.groupId) || null : null,
          title: note.title,
          content: note.content,
          isPinned: note.isPinned,
        });
      });

      // The server-side duplicate RPC performs the deep copy; cancel the freshly
      // scheduled list write and any source-list debounced writes to avoid racing it.
      sharedSyncEngine.cancel(`list:${newList.id}`);
      selectNoteGroups(getData(queryClient).noteGroups, list.id).forEach(g => sharedSyncEngine.cancel(`group:${g.id}`));
      selectNotesByListId(getData(queryClient).notes, list.id).forEach(n => sharedSyncEngine.cancel(`note:${n.id}`));
      listsService.duplicateList(list.id, newList).catch(() => {});

      return newList;
    };

    return {
      addList,
      updateList,
      deleteList,
      duplicateList,
      reorderLists,
      moveList,
      addFolder,
      updateFolder,
      reorderFolders,
      deleteFolder,
      addNote,
      updateNote,
      deleteNote,
      moveNoteAndReorder,
      moveNoteToList,
      reorderNotes,
      addGroup,
      updateGroup,
      deleteGroup,
    };
  }, [queryClient]);
}
