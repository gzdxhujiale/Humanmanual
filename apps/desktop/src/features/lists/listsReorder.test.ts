import { describe, it, expect } from 'vitest';
import { computeListReorder, computeNoteReorder } from './listsReorder';
import type { List, Folder, Note } from './listsTypes';

const mkList = (id: string, folderId: string | null, sortOrder: number): List => ({
  id,
  name: `list-${id}`,
  icon: 'BookOpen',
  color: 'none',
  viewType: 'list' as any,
  folderId,
  isPinned: false,
  sortOrder,
});

const mkFolder = (id: string, sortOrder: number): Folder => ({
  id,
  name: `folder-${id}`,
  isPinned: false,
  sortOrder,
});

const mkNote = (id: string, groupId: string | null, sortOrder: number, listId = 'L1'): Note => ({
  id,
  listId,
  groupId,
  title: `note-${id}`,
  content: '',
  isPinned: false,
  sortOrder,
  createdAt: 0,
  updatedAt: 0,
});

// ── computeListReorder ──

describe('computeListReorder', () => {
  const folders = [mkFolder('F1', 0), mkFolder('F2', 1)];
  const lists = [
    mkList('L1', 'F1', 0),
    mkList('L2', 'F1', 1),
    mkList('L3', 'F1', 2),
    mkList('L4', null, 0),
  ];

  it('active === over → none', () => {
    const r = computeListReorder({ activeId: 'L1', overId: 'L1', lists, folders, overType: 'list' });
    expect(r.kind).toBe('none');
  });

  it('拖 folder → folder reorder', () => {
    const r = computeListReorder({ activeId: 'F2', overId: 'F1', lists, folders, overType: 'folder' });
    expect(r).toEqual({ kind: 'reorder', newOrder: ['F2', 'F1'] });
  });

  it('同 folder 拖到前面 → reorder（新 ID 顺序）', () => {
    const r = computeListReorder({ activeId: 'L3', overId: 'L1', lists, folders, overType: 'list' });
    expect(r).toEqual({ kind: 'reorder', newOrder: ['L3', 'L1', 'L2'] });
  });

  it('跨 folder 拖到具体 list → move，targetIndex = 该 list 在目标 folder 的排序位置', () => {
    const r = computeListReorder({ activeId: 'L4', overId: 'L2', lists, folders, overType: 'list' });
    expect(r).toEqual({ kind: 'move', targetGroup: 'F1', targetIndex: 1 });
  });

  it('拖到 folder 头部 → move，无 targetIndex', () => {
    const r = computeListReorder({ activeId: 'L4', overId: 'F1', lists, folders, overType: 'folder' });
    expect(r).toEqual({ kind: 'move', targetGroup: 'F1', targetIndex: undefined });
  });

  it('拖到 standalone-area → move targetGroup=null', () => {
    const r = computeListReorder({ activeId: 'L1', overId: 'standalone-area', lists, folders, overType: 'standalone' });
    expect(r).toEqual({ kind: 'move', targetGroup: null, targetIndex: undefined });
  });

  it('over 未知 id → none', () => {
    const r = computeListReorder({ activeId: 'L1', overId: 'ghost', lists, folders, overType: 'list' });
    expect(r.kind).toBe('none');
  });
});

// ── computeNoteReorder ──

describe('computeNoteReorder', () => {
  const notes = [
    mkNote('N1', 'G1', 0),
    mkNote('N2', 'G1', 1),
    mkNote('N3', 'G1', 2),
    mkNote('N4', null, 0),
    mkNote('N5', 'G2', 0),
  ];

  it('active === over → none', () => {
    const r = computeNoteReorder({ activeId: 'N1', overId: 'N1', notes, overType: 'note' });
    expect(r.kind).toBe('none');
  });

  it('同 group reorder：N3 拖到 N1 → reorder [N3, N1, N2]', () => {
    const r = computeNoteReorder({ activeId: 'N3', overId: 'N1', notes, overType: 'note' });
    expect(r).toEqual({ kind: 'reorder', newOrder: ['N3', 'N1', 'N2'] });
  });

  it('跨 group：N4(ungrouped) 拖到 G1 的 N2 → move targetGroup=G1, targetIndex=1', () => {
    const r = computeNoteReorder({ activeId: 'N4', overId: 'N2', notes, overType: 'note' });
    expect(r).toEqual({ kind: 'move', targetGroup: 'G1', targetIndex: 1 });
  });

  it('拖到 group 头部（overType=group，id=G2）→ move targetGroup=G2, targetIndex=undefined', () => {
    const r = computeNoteReorder({ activeId: 'N1', overId: 'G2', notes, overType: 'group', overGroupId: 'G2' });
    expect(r).toEqual({ kind: 'move', targetGroup: 'G2', targetIndex: undefined });
  });

  it('拖到 ungrouped 头部 → move targetGroup=null', () => {
    const r = computeNoteReorder({ activeId: 'N1', overId: 'ungrouped', notes, overType: 'group', overGroupId: 'ungrouped' });
    expect(r).toEqual({ kind: 'move', targetGroup: null, targetIndex: undefined });
  });

  it('over 未知 note → none', () => {
    const r = computeNoteReorder({ activeId: 'N1', overId: 'ghost', notes, overType: 'note' });
    expect(r.kind).toBe('none');
  });

  it('active 不存在 → none', () => {
    const r = computeNoteReorder({ activeId: 'ghost', overId: 'N1', notes, overType: 'note' });
    expect(r.kind).toBe('none');
  });

  it('overType === "other" → none', () => {
    const r = computeNoteReorder({ activeId: 'N1', overId: 'N2', notes, overType: 'other' });
    expect(r.kind).toBe('none');
  });

  it('跨 group 拖到 ungrouped note → move targetGroup=null', () => {
    const r = computeNoteReorder({ activeId: 'N1', overId: 'N4', notes, overType: 'note' });
    expect(r).toEqual({ kind: 'move', targetGroup: null, targetIndex: 0 });
  });

  it('拖到 ungrouped 头部（overGroupId=null）→ move targetGroup=null', () => {
    const r = computeNoteReorder({ activeId: 'N1', overId: 'ungrouped', notes, overType: 'group', overGroupId: null });
    expect(r).toEqual({ kind: 'move', targetGroup: null, targetIndex: undefined });
  });

  it('拖到 ungrouped 头部（overGroupId=undefined）→ move targetGroup=null', () => {
    const r = computeNoteReorder({ activeId: 'N1', overId: 'ungrouped', notes, overType: 'group' });
    expect(r).toEqual({ kind: 'move', targetGroup: null, targetIndex: undefined });
  });

  it('跨 group 拖到目标 group 第一个 note → targetIndex=0', () => {
    const r = computeNoteReorder({ activeId: 'N4', overId: 'N1', notes, overType: 'note' });
    expect(r).toEqual({ kind: 'move', targetGroup: 'G1', targetIndex: 0 });
  });
});
