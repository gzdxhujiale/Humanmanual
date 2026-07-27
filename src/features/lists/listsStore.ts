import { create } from 'zustand';
import { List, Folder, Note, Template, ListsData, NoteGroup } from './listsTypes';
import * as listsService from './listsService';
import { createSyncEngine } from '../../lib/createSyncEngine';
import { useTemplateStore } from '../templates/templateStore';
import { DEFAULT_TEMPLATES } from '../templates/templateTypes';



function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

const HIGH_FREQ_DELAY = 500;
const LOW_FREQ_DELAY = 300;

let noteSyncChannel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    noteSyncChannel = new BroadcastChannel('humanmanual_note_sync');
  }
} catch (e) {}

function broadcastNoteUpdate(noteId: string, updates: Partial<Note>) {
  if (noteSyncChannel) {
    try {
      noteSyncChannel.postMessage({ type: 'NOTE_UPDATED', noteId, updates });
    } catch (e) {}
  }
}

interface ListsStoreState {
  data: ListsData;
  initialized: boolean;
  
  // System
  initPromise: Promise<void> | null;
  init: () => Promise<void>;
  
  // Lists
  getLists: () => List[];
  addList: (list: Omit<List, 'id'>) => List;
  updateList: (id: string, updates: Partial<List>) => void;
  deleteList: (id: string) => void;
  duplicateList: (list: List) => List;
  reorderLists: (orderedIds: string[]) => void;
  moveList: (listId: string, folderId: string | null, targetIndex?: number) => void;
  
  // Folders
  getFolders: () => Folder[];
  addFolder: (name: string) => Folder;
  updateFolder: (id: string, updates: Partial<Folder>) => void;
  reorderFolders: (orderedIds: string[]) => void;
  deleteFolder: (id: string) => void;
  
  // Notes
  getNotesByListId: (listId: string) => Note[];
  addNote: (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'>) => Note;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  moveNoteAndReorder: (noteId: string, groupId: string | null, targetIndex?: number) => void;
  moveNoteToList: (noteId: string, targetListId: string, targetGroupId?: string | null) => void;
  reorderNotes: (orderedIds: string[]) => void;
  
  // Note Groups
  getNoteGroups: (listId: string) => NoteGroup[];
  addGroup: (listId: string, name: string) => NoteGroup;
  updateGroup: (id: string, updates: Partial<NoteGroup>) => void;
  deleteGroup: (id: string) => void;
  
  // Templates
  getTemplates: () => Template[];
  addTemplate: (name: string, content: string) => Template;
  updateTemplate: (id: string, updates: Partial<Template>) => void;
  deleteTemplate: (id: string) => void;
}

const syncEngine = createSyncEngine();

export const useListsStore = create<ListsStoreState>((set, get) => ({
  data: {
    lists: [],
    folders: [],
    noteGroups: [],
    notes: [],
    templates: DEFAULT_TEMPLATES,
  },
  initialized: false,
  initPromise: null,

  init: async () => {
    const state = get();
    if (state.initialized) return;
    if (state.initPromise) return state.initPromise;

    const promise = (async () => {
      try {
        // One-time migration from legacy localStorage for offline upgrade users
        const MIGRATION_KEY = 'aistudy_sqlite_migrated_v1';
        if (!localStorage.getItem(MIGRATION_KEY)) {
          try {
            const oldLists = localStorage.getItem('aistudy_lists_data');
            if (oldLists) {
              const parsed = JSON.parse(oldLists) as ListsData;
              if (parsed.folders?.length || parsed.lists?.length || parsed.notes?.length) {
                await listsService.migrateFromLocal(parsed);
              }
            }
            localStorage.setItem(MIGRATION_KEY, 'true');
          } catch (mErr) {
            console.error('Legacy localStorage migration error:', mErr);
          }
        }

        const allData = await listsService.loadAll();

        let defaultTemplates = allData.templates.length > 0 ? allData.templates : DEFAULT_TEMPLATES;
        useTemplateStore.getState().setTemplates(defaultTemplates);

        if (allData.templates.length === 0) {
          for (const t of DEFAULT_TEMPLATES) {
            listsService.upsertTemplate(t).catch(() => {});
          }
        }

        set({
          data: {
            folders: allData.folders.map(f => ({ ...f })),
            lists: allData.lists.map(l => ({ ...l, viewType: l.viewType as 'list' | 'board' })),
            noteGroups: allData.noteGroups.map(g => ({ ...g })),
            notes: allData.notes.map(n => ({ ...n })),
            templates: defaultTemplates,
          },
          initialized: true
        });

        if (noteSyncChannel) {
          noteSyncChannel.onmessage = (event) => {
            if (event.data?.type === 'NOTE_UPDATED') {
              const { noteId, updates } = event.data;
              const data = get().data;
              const index = data.notes.findIndex(n => n.id === noteId);
              if (index !== -1) {
                const newNotes = [...data.notes];
                newNotes[index] = { ...newNotes[index], ...updates, updatedAt: Date.now() };
                set({ data: { ...data, notes: newNotes } });
              }
            }
          };
        }
      } catch (e) {
        console.error('Failed to load from SQLite:', e);
        set({ initialized: true });
      }
    })();

    set({ initPromise: promise });
    return promise;
  },

  // ── Lists ──
  getLists: () => {
    return [...get().data.lists].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });
  },

  addList: (list) => {
    const data = get().data;
    const newList: List = {
      ...list,
      id: genId('list'),
      itemCount: 0,
      sortOrder: data.lists.length
    };
    
    set({ data: { ...data, lists: [...data.lists, newList] } });

    syncEngine.schedule(`list:${newList.id}`, () => listsService.upsertList(newList), LOW_FREQ_DELAY);

    return newList;
  },

  updateList: (id, updates) => {
    const data = get().data;
    const index = data.lists.findIndex(l => l.id === id);
    if (index !== -1) {
      const newLists = [...data.lists];
      newLists[index] = { ...newLists[index], ...updates };
      set({ data: { ...data, lists: newLists } });
      const list = newLists[index];

      syncEngine.schedule(`list:${id}`, () => listsService.upsertList(list), HIGH_FREQ_DELAY);
    }
  },

  deleteList: (id) => {
    const data = get().data;
    set({
      data: {
        ...data,
        lists: data.lists.filter(l => l.id !== id),
        notes: data.notes.filter(n => n.listId !== id),
        noteGroups: data.noteGroups.filter(g => g.listId !== id)
      }
    });

    syncEngine.cancel(`list:${id}`);
    listsService.deleteList(id).catch(() => {});
  },

  duplicateList: (list) => {
    const newList = get().addList({
      ...list,
      name: list.name + ' (副本)',
      isPinned: false
    });

    const groups = get().getNoteGroups(list.id);
    const groupMap = new Map<string, string>();

    groups.forEach(group => {
      const newGroup = get().addGroup(newList.id, group.name);
      get().updateGroup(newGroup.id, { sortOrder: group.sortOrder });
      groupMap.set(group.id, newGroup.id);
    });

    const notes = get().getNotesByListId(list.id);
    notes.forEach(note => {
      get().addNote({
        listId: newList.id,
        groupId: note.groupId ? groupMap.get(note.groupId) || null : null,
        title: note.title,
        content: note.content,
        isPinned: note.isPinned
      });
    });

    syncEngine.cancel(`list:${newList.id}`);
    get().getNoteGroups(list.id).forEach(g => syncEngine.cancel(`group:${g.id}`));
    get().getNotesByListId(list.id).forEach(n => syncEngine.cancel(`note:${n.id}`));
    listsService.duplicateList(list.id, newList).catch(() => {});

    return newList;
  },

  reorderLists: (orderedIds) => {
    const data = get().data;
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

    set({ data: { ...data, lists: newLists } });
    syncEngine.schedule('reorder:lists', () => listsService.reorderLists(items), LOW_FREQ_DELAY);
  },

  moveList: (listId, folderId, targetIndex) => {
    const data = get().data;
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

    const orderMap = new Map();
    siblingLists.forEach((l, idx) => {
      orderMap.set(l.id, idx);
    });

    newLists = newLists.map(l => {
      if (orderMap.has(l.id)) {
        return { ...l, sortOrder: orderMap.get(l.id) };
      }
      return l;
    });

    set({ data: { ...data, lists: newLists } });
    const updatedList = newLists.find(l => l.id === listId);

    syncEngine.schedule(`list:${listId}`, () => listsService.moveList(listId, folderId, updatedList?.sortOrder || 0), LOW_FREQ_DELAY);
  },

  // ── Folders ──
  getFolders: () => {
    return [...get().data.folders].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });
  },

  addFolder: (name) => {
    const data = get().data;
    const newFolder: Folder = {
      id: genId('folder'),
      name,
      sortOrder: data.folders.length,
    };

    set({ data: { ...data, folders: [...data.folders, newFolder] } });

    syncEngine.schedule(`folder:${newFolder.id}`, () => listsService.upsertFolder(newFolder), LOW_FREQ_DELAY);

    return newFolder;
  },

  updateFolder: (id, updates) => {
    const data = get().data;
    const index = data.folders.findIndex(f => f.id === id);
    if (index !== -1) {
      const newFolders = [...data.folders];
      newFolders[index] = { ...newFolders[index], ...updates };
      set({ data: { ...data, folders: newFolders } });
      const folder = newFolders[index];

      syncEngine.schedule(`folder:${id}`, () => listsService.upsertFolder(folder), HIGH_FREQ_DELAY);
    }
  },

  reorderFolders: (orderedIds) => {
    const data = get().data;
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

    set({ data: { ...data, folders: newFolders } });
    syncEngine.schedule('reorder:folders', () => listsService.reorderFolders(items), LOW_FREQ_DELAY);
  },

  deleteFolder: (id) => {
    const data = get().data;
    set({
      data: {
        ...data,
        folders: data.folders.filter(f => f.id !== id),
        lists: data.lists.map(l => (l.folderId === id ? { ...l, folderId: null } : l))
      }
    });

    syncEngine.cancel(`folder:${id}`);
    listsService.deleteFolder(id).catch(() => {});
  },

  // ── Notes ──
  getNotesByListId: (listId) => {
    return get().data.notes
      .filter(n => n.listId === listId)
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        if (a.sortOrder !== b.sortOrder) {
          return (a.sortOrder || 0) - (b.sortOrder || 0);
        }
        return b.updatedAt - a.updatedAt;
      });
  },

  addNote: (note) => {
    const data = get().data;
    const siblingNotes = data.notes.filter(n => n.listId === note.listId && n.groupId === note.groupId);
    const newNote: Note = {
      ...note,
      id: genId('note'),
      sortOrder: siblingNotes.length,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    let newLists = [...data.lists];
    const listIndex = newLists.findIndex(l => l.id === note.listId);
    if (listIndex !== -1) {
      newLists[listIndex] = { ...newLists[listIndex], itemCount: (newLists[listIndex].itemCount || 0) + 1 };
    }

    set({ data: { ...data, notes: [...data.notes, newNote], lists: newLists } });

    syncEngine.schedule(`note:${newNote.id}`, () => listsService.upsertNote(newNote), LOW_FREQ_DELAY);

    return newNote;
  },

  updateNote: (id, updates) => {
    const data = get().data;
    const index = data.notes.findIndex(n => n.id === id);
    if (index !== -1) {
      const newNotes = [...data.notes];
      newNotes[index] = { ...newNotes[index], ...updates, updatedAt: Date.now() };
      set({ data: { ...data, notes: newNotes } });
      broadcastNoteUpdate(id, updates);
      const note = newNotes[index];
      syncEngine.schedule(`note:${id}`, () => listsService.upsertNote(note), HIGH_FREQ_DELAY);
    }
  },

  deleteNote: (id) => {
    const data = get().data;
    const note = data.notes.find(n => n.id === id);
    if (note) {
      let newLists = [...data.lists];
      const listIndex = newLists.findIndex(l => l.id === note.listId);
      if (listIndex !== -1 && (newLists[listIndex].itemCount || 0) > 0) {
        newLists[listIndex] = { ...newLists[listIndex], itemCount: newLists[listIndex].itemCount! - 1 };
      }

      set({
        data: {
          ...data,
          notes: data.notes.filter(n => n.id !== id),
          lists: newLists
        }
      });

      syncEngine.cancel(`note:${id}`);
      listsService.deleteNote(id).catch(() => {});
    }
  },

  moveNoteAndReorder: (noteId, groupId, targetIndex) => {
    const data = get().data;
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

    const orderMap = new Map();
    siblingNotes.forEach((n, idx) => {
      orderMap.set(n.id, idx);
    });

    newNotes = newNotes.map(n => {
      if (orderMap.has(n.id)) {
        return { ...n, sortOrder: orderMap.get(n.id) };
      }
      return n;
    });

    set({ data: { ...data, notes: newNotes } });
    const updatedNote = newNotes.find(n => n.id === noteId);

    syncEngine.schedule(`note:${noteId}`, () => listsService.moveNote(noteId, note.listId, groupId, updatedNote?.sortOrder || 0), LOW_FREQ_DELAY);
  },

  moveNoteToList: (noteId, targetListId, targetGroupId = null) => {
    const data = get().data;
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
      updatedAt: Date.now()
    };

    const newLists = data.lists.map(l => {
      if (l.id === oldListId) return { ...l, itemCount: Math.max(0, (l.itemCount || 0) - 1) };
      if (l.id === targetListId) return { ...l, itemCount: (l.itemCount || 0) + 1 };
      return l;
    });

    set({ data: { ...data, notes: newNotes, lists: newLists } });

    syncEngine.schedule(`note:${noteId}`, () => listsService.moveNote(noteId, targetListId, targetGroupId, newSortOrder), LOW_FREQ_DELAY);
  },

  reorderNotes: (orderedIds) => {
    const data = get().data;
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

    set({ data: { ...data, notes: newNotes } });
    syncEngine.schedule('reorder:notes', () => listsService.reorderNotes(items), LOW_FREQ_DELAY);
  },

  // ── Note Groups ──
  getNoteGroups: (listId) => {
    return get().data.noteGroups
      .filter(g => g.listId === listId)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  },

  addGroup: (listId, name) => {
    const data = get().data;
    const newGroup: NoteGroup = {
      id: genId('group'),
      listId,
      name,
      sortOrder: data.noteGroups.filter(g => g.listId === listId).length
    };

    set({ data: { ...data, noteGroups: [...data.noteGroups, newGroup] } });

    syncEngine.schedule(`group:${newGroup.id}`, () => listsService.upsertGroup(newGroup), LOW_FREQ_DELAY);

    return newGroup;
  },

  updateGroup: (id, updates) => {
    const data = get().data;
    const index = data.noteGroups.findIndex(g => g.id === id);
    if (index !== -1) {
      const newGroups = [...data.noteGroups];
      newGroups[index] = { ...newGroups[index], ...updates };
      set({ data: { ...data, noteGroups: newGroups } });
      const group = newGroups[index];

      syncEngine.schedule(`group:${id}`, () => listsService.upsertGroup(group), HIGH_FREQ_DELAY);
    }
  },

  deleteGroup: (id) => {
    const data = get().data;
    set({
      data: {
        ...data,
        noteGroups: data.noteGroups.filter(g => g.id !== id),
        notes: data.notes.map(n => (n.groupId === id ? { ...n, groupId: null } : n))
      }
    });

    syncEngine.cancel(`group:${id}`);
    listsService.deleteGroup(id).catch(() => {});
  },

  // ── Templates (Delegated to useTemplateStore) ──
  getTemplates: () => useTemplateStore.getState().getTemplates(),
  addTemplate: (name, content) => useTemplateStore.getState().addTemplate(name, content),
  updateTemplate: (id, updates) => useTemplateStore.getState().updateTemplate(id, updates),
  deleteTemplate: (id) => useTemplateStore.getState().deleteTemplate(id),
}));
