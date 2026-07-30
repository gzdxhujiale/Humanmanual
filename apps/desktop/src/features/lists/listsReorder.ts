import { arrayMove } from '@dnd-kit/sortable';
import { List, Folder, Note } from './listsTypes';

// ── Discriminated union: 拖拽计算结果 ──

export type ReorderAction<TGroup = string | null> =
  | { kind: 'none' }
  | { kind: 'reorder'; newOrder: string[] }
  | { kind: 'move'; targetGroup: TGroup; targetIndex?: number };

// ── Sidebar 专用：list / folder 树的重排 ──

export interface ComputeListReorderInput {
  activeId: string;
  overId: string;
  lists: List[];
  folders: Folder[];
  overType: 'folder' | 'standalone' | 'list' | 'other'; // dnd over.data?.current?.type 或推断
}

/**
 * 纯函数：根据 sidebar 的拖拽事件，计算出 store 应执行的动作。
 * 调用方只需根据 kind 分发到 store.reorderFolders / reorderLists / moveList。
 */
export function computeListReorder(input: ComputeListReorderInput): ReorderAction<string | null> {
  const { activeId, overId, lists, folders, overType } = input;
  if (activeId === overId) return { kind: 'none' };

  // 1) 拖 folder → 只可能在 folder 之间重排
  const activeIsFolder = folders.some(f => f.id === activeId);
  if (activeIsFolder) {
    const overIdx = folders.findIndex(f => f.id === overId);
    if (overIdx === -1) return { kind: 'none' };
    const oldIdx = folders.findIndex(f => f.id === activeId);
    if (oldIdx === -1) return { kind: 'none' };
    const newOrder = arrayMove(folders, oldIdx, overIdx).map(f => f.id);
    return { kind: 'reorder', newOrder };
  }

  // 2) 拖 list：解析目标 folder 与插入位置
  const activeList = lists.find(l => l.id === activeId);
  if (!activeList) return { kind: 'none' };

  let targetFolderId: string | null;
  let targetIndex: number | undefined = undefined;

  if (overType === 'folder' || overType === 'standalone') {
    // 拖到 folder 头部 / standalone-area
    targetFolderId = overType === 'standalone' ? null : overId;
  } else {
    // 拖到某个 list 上
    const overList = lists.find(l => l.id === overId);
    if (!overList) return { kind: 'none' };
    targetFolderId = overList.folderId ?? null;

    // 同 folder 内部 → arrayMove
    if (activeList.folderId === targetFolderId) {
      const siblings = lists
        .filter(l => (l.folderId ?? null) === targetFolderId)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      const oldIdx = siblings.findIndex(l => l.id === activeId);
      const newIdx = siblings.findIndex(l => l.id === overId);
      if (oldIdx !== -1 && newIdx !== -1) {
        return { kind: 'reorder', newOrder: arrayMove(siblings, oldIdx, newIdx).map(l => l.id) };
      }
      return { kind: 'none' };
    }

    // 跨 folder
    const siblings = lists
      .filter(l => (l.folderId ?? null) === targetFolderId)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    targetIndex = siblings.findIndex(l => l.id === overId);
    if (targetIndex === -1) targetIndex = undefined;
  }

  return { kind: 'move', targetGroup: targetFolderId, targetIndex };
}

// ── Panel 专用：note 在 group 之间的重排 ──

export interface ComputeNoteReorderInput {
  activeId: string;
  overId: string;
  notes: Note[];
  overType: 'group' | 'note' | 'other'; // dnd over.data?.current?.type
  overGroupId?: string | null; // 当 overType === 'group' 时提供（'ungrouped' 视为 null）
}

/**
 * 纯函数：根据 panel 的拖拽事件，计算出 store 应执行的动作。
 * 调用方只需根据 kind 分发到 store.reorderNotes / moveNoteAndReorder。
 */
export function computeNoteReorder(input: ComputeNoteReorderInput): ReorderAction<string | null> {
  const { activeId, overId, notes, overType, overGroupId } = input;
  if (activeId === overId) return { kind: 'none' };

  const activeNote = notes.find(n => n.id === activeId);
  if (!activeNote) return { kind: 'none' };
  const activeGroupId = activeNote.groupId ?? null;

  let targetGroupId: string | null;

  if (overType === 'group') {
    targetGroupId = overGroupId === 'ungrouped' || overGroupId == null ? null : (overGroupId ?? null);
  } else if (overType === 'note') {
    const overNote = notes.find(n => n.id === overId);
    if (!overNote) return { kind: 'none' };
    targetGroupId = overNote.groupId ?? null;

    // 同 group 内部 → arrayMove
    if (activeGroupId === targetGroupId) {
      const siblings = notes
        .filter(n => (n.groupId ?? null) === targetGroupId)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      const oldIdx = siblings.findIndex(n => n.id === activeId);
      const newIdx = siblings.findIndex(n => n.id === overId);
      if (oldIdx !== -1 && newIdx !== -1) {
        return { kind: 'reorder', newOrder: arrayMove(siblings, oldIdx, newIdx).map(n => n.id) };
      }
      return { kind: 'none' };
    }

    const siblings = notes
      .filter(n => (n.groupId ?? null) === targetGroupId)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const idx = siblings.findIndex(n => n.id === overId);
    return { kind: 'move', targetGroup: targetGroupId, targetIndex: idx === -1 ? undefined : idx };
  } else {
    return { kind: 'none' };
  }

  // 拖到 group 头部（无具体 note）
  return { kind: 'move', targetGroup: targetGroupId, targetIndex: undefined };
}
