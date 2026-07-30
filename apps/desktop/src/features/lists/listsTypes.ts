export type ViewType = 'list' | 'board';

export interface List {
  id: string;
  name: string;
  icon: string;
  color: string;
  viewType: ViewType;
  folderId: string | null;
  itemCount?: number;
  isPinned?: boolean;
  sortOrder?: number;
}

export interface Folder {
  id: string;
  name: string;
  isPinned?: boolean;
  sortOrder?: number;
}

export interface NoteGroup {
  id: string;
  listId: string;
  name: string;
  sortOrder?: number;
}

export interface Note {
  id: string;
  listId: string;
  groupId?: string | null;
  title: string;
  content: string;
  isPinned?: boolean;
  sortOrder?: number;
  createdAt: number;
  updatedAt: number;
}

import { Template } from '../templates/templateTypes';
export type { Template };

export interface ListsData {
  lists: List[];
  folders: Folder[];
  noteGroups: NoteGroup[];
  notes: Note[];
  templates: Template[];
}
