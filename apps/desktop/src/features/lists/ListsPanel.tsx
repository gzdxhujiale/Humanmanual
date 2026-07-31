import React, { useState, useEffect, useMemo, useRef, cloneElement, ReactElement, ReactNode, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownUp, MoreHorizontal, Plus, PanelLeftClose, PanelLeftOpen, CheckCircle, AlertCircle,
  ChevronRight, Check, Sidebar, ExternalLink, Folder as FolderIcon, BookOpen, Briefcase, Home,
  Package, Activity, Star, ChevronDown, FileText, Search, Cloud, X, LayoutList, Columns, Trash2
} from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverEvent, useDroppable } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { useListsData, useListsActions } from './useListsQuery';
import { sortLists, sortFolders } from './listsSelectors';
import { List, Folder, ViewType, Note, NoteGroup, Template } from './listsTypes';
import { getNoteOpenMode, setNoteOpenMode, openNoteInNewWindow, NoteOpenMode } from './noteOpenService';
import { TemplateModal, useTemplateData, useTemplateActions } from '../templates';
import * as listsService from './listsService';
import { logError, logSilent } from '@humanmanual/core';
import { computeNoteReorder, computeListReorder } from './listsReorder';
import { ReactjsTiptapEditor, convertMarkdownToTipTapJson, convertTipTapJsonToMarkdown } from '../reactjs-tiptap-v1';
import { useConfirmDialog } from '../../components/ui/ConfirmDeleteDialog';
import './lists.css';

// ============================================================================
// 0. Shared Helpers & Custom Hooks
// ============================================================================
function useClickOutside<T extends HTMLElement>(handler: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const listener = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler();
      }
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [handler]);
  return ref;
}

interface ModalShellProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  headerRight?: ReactNode;
  zIndex?: number;
}

/** Unified Modal Shell with Portal mounting to document.body */
const ModalShell: React.FC<ModalShellProps> = memo(({ title, onClose, children, footer, width = '400px', headerRight, zIndex = 100 }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="list-modal-overlay" style={{ zIndex }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="list-modal-content" style={{ width, maxWidth: '90vw' }}>
        <div className="list-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600 }}>{title}</h2>
          {headerRight || <X size={18} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={onClose} />}
        </div>
        <div className="list-modal-body">{children}</div>
        {footer && <div className="list-modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
});

// ============================================================================
// 1. SortableItem & Droppable Helper Components
// ============================================================================
interface SortableItemProps {
  id: string;
  children: ReactNode;
  disabled?: boolean;
}

function SortableItem({ id, children, disabled }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

interface DroppableAreaProps {
  id: string;
  data?: Record<string, any>;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
}

function DroppableArea({ id, data, children, className, style, onClick }: DroppableAreaProps) {
  const { setNodeRef, isOver } = useDroppable({ id, data });
  const dynamicClassName = `${className || ''} ${isOver ? 'droppable-over' : ''}`.trim();
  return <div ref={setNodeRef} className={dynamicClassName} style={style} onClick={onClick}>{children}</div>;
}

interface SidebarListItemDroppableProps {
  list: List;
  activeListId: string | null;
  dragOverListId?: string | null;
  onSelectList: (id: string) => void;
  isNested: boolean;
  children: ReactNode;
}

const SidebarListItemDroppable: React.FC<SidebarListItemDroppableProps> = memo(({ list, activeListId, dragOverListId, onSelectList, isNested, children }) => {
  const { moveNoteToList } = useListsActions();
  const [isHovered, setIsHovered] = useState(false);
  const { setNodeRef, isOver } = useDroppable({
    id: `sidebar-list-${list.id}`,
    data: { type: 'sidebar-list', listId: list.id }
  });
  const isTarget = isOver || isHovered || dragOverListId === list.id;

  return (
    <div
      ref={setNodeRef}
      className={`lists-item ${isNested ? 'nested' : ''} ${activeListId === list.id ? 'active' : ''} ${isTarget ? 'droppable-over-target' : ''}`}
      onClick={() => onSelectList(list.id)}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        if (!isHovered) setIsHovered(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsHovered(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsHovered(false);
        try {
          const raw = e.dataTransfer.getData('text/plain');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.type === 'note' && parsed.noteId) {
              moveNoteToList(parsed.noteId, list.id);
            }
          }
        } catch (err) {
          logSilent('listsPanel', 'invalid note drag payload', err);
        }
      }}
    >
      {children}
    </div>
  );
});

// ============================================================================
// 2. ListsSidebar Component
// ============================================================================
interface ListsSidebarProps {
  lists: List[];
  folders: Folder[];
  activeListId: string | null;
  dragOverListId?: string | null;
  dragOverFolderId?: string | null;
  onSelectList: (id: string) => void;
  onAddClick: (folderId?: string) => void;
  onEditFolder: (folder: Folder) => void;
  onPinFolder: (folder: Folder) => void;
  onDissolveFolder: (folder: Folder) => void;
  onEditList: (list: List) => void;
  onPinList: (list: List) => void;
  onDuplicateList: (list: List) => void;
  onDeleteList: (list: List) => void;
  isCollapsed?: boolean;
}

const ICON_MAP: Record<string, ReactNode> = {
  BookOpen: <BookOpen size={16} />,
  Briefcase: <Briefcase size={16} />,
  Home: <Home size={16} />,
  Package: <Package size={16} />,
  Activity: <Activity size={16} />,
  Star: <Star size={16} />
};

function ListsSidebar({
  lists,
  folders,
  activeListId,
  dragOverListId,
  dragOverFolderId,
  onSelectList,
  onAddClick,
  onEditFolder,
  onPinFolder,
  onDissolveFolder,
  onEditList,
  onPinList,
  onDuplicateList,
  onDeleteList,
  isCollapsed
}: ListsSidebarProps) {
  const { confirm: confirmDelete } = useConfirmDialog();
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [activeDropdown, setActiveDropdown] = useState<{ type: 'folder' | 'list', id: string } | null>(null);

  const closeDropdown = useCallback(() => setActiveDropdown(null), []);
  const dropdownRef = useClickOutside<HTMLDivElement>(closeDropdown);

  const toggleFolder = (folderId: string) => {
    setCollapsedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  const getIcon = (iconName: string, color: string) => {
    const icon = ICON_MAP[iconName] || <BookOpen size={16} />;
    return cloneElement(icon as ReactElement<any>, { color: color !== 'none' ? color : 'var(--text-strong)' });
  };

  const standaloneLists = useMemo(() => lists.filter(l => !l.folderId), [lists]);
  const listsByFolder = useMemo(() => {
    const acc: Record<string, List[]> = {};
    folders.forEach(f => {
      acc[f.id] = lists.filter(l => l.folderId === f.id);
    });
    return acc;
  }, [folders, lists]);

  const renderSidebarItem = (list: List, isNested: boolean) => (
    <SortableItem key={list.id} id={list.id}>
      <SidebarListItemDroppable
        list={list}
        activeListId={activeListId}
        dragOverListId={dragOverListId}
        onSelectList={onSelectList}
        isNested={isNested}
      >
        <div className="lists-item-icon">
          {getIcon(list.icon, list.color)}
        </div>
        <span>{list.name}</span>
        {list.isPinned && <span style={{ marginLeft: '4px', fontSize: '10px', color: 'var(--accent)' }}>📌</span>}

        <div className="lists-item-count-wrapper">
          {list.itemCount !== undefined && list.itemCount > 0 && (
            <span className="lists-item-count">{list.itemCount}</span>
          )}
          <div className="lists-item-actions-wrapper" onClick={e => e.stopPropagation()}>
            <MoreHorizontal
              size={16}
              className={`lists-item-more-action ${activeDropdown?.type === 'list' && activeDropdown.id === list.id ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setActiveDropdown(activeDropdown?.id === list.id ? null : { type: 'list', id: list.id });
              }}
            />
            {activeDropdown?.type === 'list' && activeDropdown.id === list.id && (
              <div className="lists-dropdown-menu" ref={dropdownRef}>
                <div className="lists-dropdown-item" onClick={() => { setActiveDropdown(null); onEditList(list); }}>编辑</div>
                <div className="lists-dropdown-item" onClick={() => { setActiveDropdown(null); onPinList(list); }}>{list.isPinned ? '取消置顶' : '置顶'}</div>
                <div className="lists-dropdown-item" onClick={() => { setActiveDropdown(null); onDuplicateList(list); }}>复制</div>
                <div
                  className="lists-dropdown-item text-danger"
                  onClick={async (e) => {
                    e.stopPropagation();
                    setActiveDropdown(null);
                    const confirmed = await confirmDelete({
                      title: '删除清单',
                      description: `确定要删除清单 "${list.name}" 吗？`,
                      confirmText: '删除',
                    });
                    if (confirmed) {
                      onDeleteList(list);
                    }
                  }}
                >
                  删除
                </div>
              </div>
            )}
          </div>
        </div>
      </SidebarListItemDroppable>
    </SortableItem>
  );

  const isTargetStandalone = dragOverFolderId === 'standalone-area';

  return (
    <aside className={`lists-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="lists-sidebar-header">
        <span>清单</span>
        <div className="lists-add-btn" onClick={() => onAddClick()}>
          <Plus size={16} />
        </div>
      </div>

      <div className="lists-tree">
        <SortableContext items={folders.map(f => f.id)} strategy={verticalListSortingStrategy}>
          {folders.map(folder => {
            const isCollapsedFolder = collapsedFolders[folder.id];
            const folderLists = listsByFolder[folder.id] || [];
            const isTarget = dragOverFolderId === folder.id;

            return (
              <div key={folder.id} className="lists-folder-group">
                <SortableItem id={folder.id}>
                  <DroppableArea
                    id={folder.id}
                    data={{ type: 'folder' }}
                    className={`lists-folder-header ${isCollapsedFolder ? 'collapsed' : ''} ${isTarget ? 'droppable-over-target' : ''}`}
                    onClick={() => toggleFolder(folder.id)}
                  >
                    <ChevronDown size={14} className="chevron-icon" />
                    <FolderIcon size={16} className="folder-icon" />
                    <span>{folder.name}</span>
                    {folder.isPinned && <span style={{ marginLeft: '4px', fontSize: '10px', color: 'var(--accent)' }}>📌</span>}

                    <div className="lists-item-actions-wrapper" onClick={e => e.stopPropagation()}>
                      <MoreHorizontal
                        size={16}
                        className="lists-folder-actions"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveDropdown(activeDropdown?.id === folder.id ? null : { type: 'folder', id: folder.id });
                        }}
                      />
                      {activeDropdown?.type === 'folder' && activeDropdown.id === folder.id && (
                        <div className="lists-dropdown-menu" ref={dropdownRef}>
                          <div className="lists-dropdown-item" onClick={() => { setActiveDropdown(null); onAddClick(folder.id); }}>添加清单</div>
                          <div className="lists-dropdown-item" onClick={() => { setActiveDropdown(null); onEditFolder(folder); }}>编辑</div>
                          <div className="lists-dropdown-item" onClick={() => { setActiveDropdown(null); onPinFolder(folder); }}>{folder.isPinned ? '取消置顶' : '置顶'}</div>
                          <div
                            className="lists-dropdown-item text-danger"
                            onClick={async (e) => {
                              e.stopPropagation();
                              setActiveDropdown(null);
                              const confirmed = await confirmDelete({
                                title: '解散文件夹',
                                description: `确定要解散文件夹 "${folder.name}" 吗？（其中的清单不会被删除）`,
                                confirmText: '解散',
                              });
                              if (confirmed) {
                                onDissolveFolder(folder);
                              }
                            }}
                          >
                            解散
                          </div>
                        </div>
                      )}
                    </div>
                  </DroppableArea>
                </SortableItem>

                {!isCollapsedFolder && (
                  <SortableContext items={folderLists.map(l => l.id)} strategy={verticalListSortingStrategy}>
                    {folderLists.map(list => renderSidebarItem(list, true))}
                  </SortableContext>
                )}
              </div>
            );
          })}
        </SortableContext>

        {folders.length > 0 && standaloneLists.length > 0 && <div style={{ height: '12px' }} />}

        <DroppableArea id="standalone-area" data={{ type: 'folder' }} className={isTargetStandalone ? 'droppable-over-target' : ''} style={{ flex: 1, minHeight: '50px', paddingBottom: '20px', borderRadius: '6px' }}>
          <SortableContext items={standaloneLists.map(l => l.id)} strategy={verticalListSortingStrategy}>
            {standaloneLists.map(list => renderSidebarItem(list, false))}
          </SortableContext>
        </DroppableArea>
      </div>
    </aside>
  );
}

// ============================================================================
// 3. NoteItem & NoteGroupView Components
// ============================================================================
interface NoteItemProps {
  note: Note;
  allLists: List[];
  onClick: () => void;
  onPin: (note: Note) => void;
  onDuplicate: (note: Note) => void;
  onDelete: (note: Note) => void;
  onMove: (note: Note, targetListId: string) => void;
}

function NoteItem({ note, allLists, onClick, onPin, onDuplicate, onDelete, onMove }: NoteItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showMoveTo, setShowMoveTo] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setShowMoveTo(false);
    setSearchQuery('');
  }, []);
  const menuRef = useClickOutside<HTMLDivElement>(closeMenu);

  const otherLists = allLists.filter(l => l.id !== note.listId && l.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div 
      className="note-list-item" 
      onClick={onClick} 
      style={{ position: 'relative' }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'note', noteId: note.id }));
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <FileText size={16} className="note-item-icon" />
      <div className="note-item-title">{note.title || '无标题笔记'}</div>
      {note.isPinned && <span style={{fontSize: '12px', color: 'var(--accent)', marginRight: '8px'}}>📌 置顶</span>}
      
      <div className="note-item-actions-container" onClick={e => e.stopPropagation()} ref={menuRef}>
        <div 
          className={`note-item-more-action ${menuOpen ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
            setShowMoveTo(false);
            setSearchQuery('');
          }}
        >
          <MoreHorizontal size={16} />
        </div>
        
        {menuOpen && (
          <div className="lists-dropdown-menu" style={{ right: 0, top: '100%', marginTop: '4px' }}>
            {showMoveTo ? (
              <div className="move-to-menu">
                <div style={{ display: 'flex', alignItems: 'center', padding: '8px', borderBottom: '1px solid var(--line-soft)' }}>
                  <ChevronRight 
                    size={14} 
                    style={{ transform: 'rotate(180deg)', cursor: 'pointer', marginRight: '4px' }}
                    onClick={(e) => { e.stopPropagation(); setShowMoveTo(false); }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>移动到...</span>
                </div>
                <div style={{ padding: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', borderRadius: '4px', padding: '4px 8px' }}>
                    <Search size={12} color="var(--text-faint)" style={{ marginRight: '4px' }} />
                    <input 
                      type="text" 
                      placeholder="搜索清单" 
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '12px', width: '100%' }}
                    />
                  </div>
                </div>
                <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                  {otherLists.length === 0 ? (
                    <div style={{ padding: '8px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>无匹配清单</div>
                  ) : (
                    otherLists.map(list => (
                      <div 
                        key={list.id}
                        className="lists-dropdown-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpen(false);
                          setShowMoveTo(false);
                          onMove(note, list.id);
                        }}
                      >
                        {list.name}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="lists-dropdown-item" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onPin(note); }}>{note.isPinned ? '取消置顶' : '置顶'}</div>
                <div className="lists-dropdown-item" onClick={(e) => { e.stopPropagation(); setShowMoveTo(true); }}>
                  移动到 <ChevronRight size={14} style={{ marginLeft: 'auto' }} />
                </div>
                <div className="lists-dropdown-item" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDuplicate(note); }}>创建副本</div>
                <div 
                  className="lists-dropdown-item text-danger" 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setMenuOpen(false);
                    onDelete(note);
                  }}
                >
                  删除
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface NoteGroupViewProps {
  group: { id: string; listId: string; name: string };
  notes: Note[];
  allLists: List[];
  isUngrouped?: boolean;
  isDragOverTarget?: boolean;
  onRenameGroup: (id: string, newName: string) => void;
  onDeleteGroup: (id: string) => void;
  onNoteClick: (note: Note) => void;
  onPinNote: (note: Note) => void;
  onDuplicateNote: (note: Note) => void;
  onDeleteNote: (note: Note) => void;
  onMoveNote: (note: Note, targetListId: string) => void;
}

function NoteGroupView({ group, notes, allLists, isUngrouped, isDragOverTarget, onRenameGroup, onDeleteGroup, onNoteClick, onPinNote, onDuplicateNote, onDeleteNote, onMoveNote }: NoteGroupViewProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const [menuOpen, setMenuOpen] = useState(false);
  
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const menuRef = useClickOutside<HTMLDivElement>(closeMenu);
  const inputRef = useRef<HTMLInputElement>(null);

  const { setNodeRef } = useDroppable({
    id: group.id,
    data: { type: 'group' }
  });

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSaveRename = () => {
    if (editName.trim()) {
      onRenameGroup(group.id, editName.trim());
    } else {
      setEditName(group.name);
    }
    setIsEditing(false);
  };

  return (
    <div ref={setNodeRef} className={`note-group ${isDragOverTarget ? 'droppable-over-target' : ''}`}>
      <div className="note-group-header" onClick={() => setIsCollapsed(!isCollapsed)}>
        <ChevronDown size={14} style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s', marginRight: '4px' }} />
        
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={handleSaveRename}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSaveRename();
              if (e.key === 'Escape') {
                setEditName(group.name);
                setIsEditing(false);
              }
            }}
            onClick={e => e.stopPropagation()}
            style={{ fontSize: '14px', fontWeight: 600, border: 'none', background: 'var(--bg-secondary)', outline: 'none', borderRadius: '4px', padding: '0 4px', color: 'var(--text-strong)' }}
          />
        ) : (
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>{group.name}</span>
        )}
        
        <div className="note-group-actions-container" onClick={e => e.stopPropagation()} ref={menuRef}>
          <span className="note-group-count">{notes.length}</span>
          {!isUngrouped && (
            <>
              <div 
                className={`note-group-more-action ${menuOpen ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(!menuOpen);
                }}
              >
                <MoreHorizontal size={16} />
              </div>
              {menuOpen && (
                <div className="lists-dropdown-menu" style={{ right: 0, top: '100%', marginTop: '4px' }}>
                  <div className="lists-dropdown-item" onClick={(e) => { e.stopPropagation(); setIsEditing(true); setMenuOpen(false); }}>重命名</div>
                  <div 
                    className="lists-dropdown-item text-danger" 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setMenuOpen(false);
                      onDeleteGroup(group.id);
                    }}
                  >
                    <Trash2 size={14} style={{ marginRight: '4px' }} /> 删除
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="note-group-content" style={{ minHeight: '10px' }}>
          {notes.length === 0 ? (
            <div style={{ padding: '8px 24px', fontSize: '13px', color: 'var(--text-faint)' }}>暂无笔记</div>
          ) : (
            <SortableContext items={notes.map(n => n.id)} strategy={verticalListSortingStrategy}>
              {notes.map(note => (
                <SortableItem key={note.id} id={note.id}>
                  <NoteItem 
                    note={note}
                    allLists={allLists}
                    onClick={() => onNoteClick(note)}
                    onPin={onPinNote}
                    onDuplicate={onDuplicateNote}
                    onDelete={onDeleteNote}
                    onMove={onMoveNote}
                  />
                </SortableItem>
              ))}
            </SortableContext>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 4. NoteDrawer & NoteDrawerContent Components
// ============================================================================
interface NoteDrawerProps {
  note: Note | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (id: string, title: string, content: string) => void;
  onPin: (note: Note) => void;
  onDuplicate: (note: Note) => void;
  onSaveAsTemplate: (note: Note) => void;
  onDelete: (note: Note) => void;
  onOpenTemplate?: () => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

function NoteDrawerContent({
  note,
  isOpen,
  onClose,
  onUpdate,
  onPin,
  onDuplicate,
  onSaveAsTemplate,
  onDelete,
  showToast,
}: {
  note: Note;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (id: string, title: string, content: string) => void;
  onPin: (note: Note) => void;
  onDuplicate: (note: Note) => void;
  onSaveAsTemplate: (note: Note) => void;
  onDelete: (note: Note) => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}) {
  const { confirm: confirmDelete } = useConfirmDialog();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content || '');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const menuRef = useClickOutside<HTMLDivElement>(closeMenu);

  const isDirtyRef = useRef(false);
  const latestDataRef = useRef({ title: note.title, content: note.content || '', note });

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content || '');
    setSaveStatus('saved');
    isDirtyRef.current = false;
    latestDataRef.current = { title: note.title, content: note.content || '', note };
  }, [note.id, note.title, note.content]);

  useEffect(() => {
    latestDataRef.current = { title, content, note };
  }, [title, content, note]);

  // Clean unmount auto-save
  useEffect(() => {
    return () => {
      if (isDirtyRef.current) {
        const { note: currentNote, title: currentTitle, content: currentContent } = latestDataRef.current;
        if (currentNote) {
          onUpdate(currentNote.id, currentTitle, currentContent);
        }
      }
    };
  }, [onUpdate]);

  // Debounced auto-save effect
  useEffect(() => {
    if (!isOpen) return;
    if (title !== note.title || content !== note.content) {
      isDirtyRef.current = true;
      setSaveStatus('saving');
      const timer = setTimeout(() => {
        onUpdate(note.id, title, content);
        isDirtyRef.current = false;
        setSaveStatus('saved');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [title, content, note.id, note.title, note.content, isOpen, onUpdate]);

  const handleImport = async () => {
    const mdContent = await listsService.pickMarkdownFile();
    if (mdContent) {
      const jsonStr = convertMarkdownToTipTapJson(mdContent);
      setContent(jsonStr);
      if (showToast) showToast('导入成功！');
    }
  };

  const handleExport = async () => {
    try {
      const exportText = convertTipTapJsonToMarkdown(content);
      await listsService.saveMarkdownFile(`${title || '未命名笔记'}.md`, exportText);
      if (showToast) showToast('导出成功！');
    } catch (err) {
      // Cancellation surfaces as an error from the backend; already logged by `call`.
    }
  };

  return (
    <>
      <div className="note-drawer-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <input
          type="text"
          className="note-drawer-title-input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="笔记标题"
          style={{ flex: 1, marginRight: '16px' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span
            title={saveStatus === 'saving' ? '保存中...' : '已自动保存'}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}
          >
            <Cloud
              size={18}
              style={{
                color: saveStatus === 'saved' ? '#3b82f6' : '#9ca3af',
                fill: saveStatus === 'saved' ? 'rgba(59, 130, 246, 0.18)' : 'none',
                transition: 'all 0.25s ease',
              }}
            />
          </span>
          <div style={{ position: 'relative' }} ref={menuRef}>
            <MoreHorizontal
              size={20}
              style={{ cursor: 'pointer', color: 'var(--text-muted)' }}
              onClick={() => setMenuOpen(!menuOpen)}
            />
            {menuOpen && (
              <div className="lists-dropdown-menu" style={{ top: '100%', right: 0, marginTop: '8px' }}>
                <div className="lists-dropdown-item" onClick={() => { setMenuOpen(false); onPin(note); }}>{note.isPinned ? '取消置顶' : '置顶'}</div>
                <div className="lists-dropdown-item" onClick={() => { setMenuOpen(false); onDuplicate(note); }}>创建副本</div>
                <div className="lists-dropdown-item" onClick={() => { setMenuOpen(false); onSaveAsTemplate(note); }}>保存为模板</div>
                <div className="lists-dropdown-item" onClick={() => { setMenuOpen(false); handleImport(); }}>导入MD</div>
                <div className="lists-dropdown-item" onClick={() => { setMenuOpen(false); handleExport(); }}>导出MD</div>
                <div
                  className="lists-dropdown-item text-danger"
                  onClick={async (e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    const confirmed = await confirmDelete({
                      title: '删除笔记',
                      description: `确定要删除笔记"${note.title || '未命名笔记'}"吗？`,
                      confirmText: '删除',
                    });
                    if (confirmed) {
                      onDelete(note);
                      onClose();
                    }
                  }}
                >
                  删除
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="note-drawer-content"
        style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 0, overflow: 'hidden', position: 'relative' }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <ReactjsTiptapEditor
          content={content}
          initialContent={content}
          onChange={setContent}
          enableCustomTemplates={true}
          className="note-drawer-reactjs-tiptap"
        />
      </div>
    </>
  );
}

function NoteDrawer({ note, isOpen, onClose, onUpdate, onPin, onDuplicate, onSaveAsTemplate, onDelete, showToast }: NoteDrawerProps) {
  const [drawerWidth, setDrawerWidth] = useState(600);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = drawerWidth;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.current) return;
    const deltaX = startX.current - e.clientX;
    const newWidth = Math.min(Math.max(400, startWidth.current + deltaX), window.innerWidth - 200);
    setDrawerWidth(newWidth);
  };

  const handleMouseUp = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = '';
  };

  if (!note) return null;

  return (
    <>
      {isOpen && (
        <div
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 19 }}
          onClick={() => onClose()}
        />
      )}
      <div
        className={`note-drawer ${isOpen ? 'open' : ''}`}
        style={{ width: drawerWidth, right: isOpen ? 0 : -drawerWidth }}
      >
        <div className="drawer-resize-handle" onMouseDown={handleMouseDown} />
        <NoteDrawerContent
          key={note.id}
          note={note}
          isOpen={isOpen}
          onClose={onClose}
          onUpdate={onUpdate}
          onPin={onPin}
          onDuplicate={onDuplicate}
          onSaveAsTemplate={onSaveAsTemplate}
          onDelete={onDelete}
          showToast={showToast}
        />
      </div>
    </>
  );
}

// ============================================================================
// 5. Modal Components (FolderModal, AddListModal, ListSettingsModal, BatchExportModal)
// ============================================================================
interface FolderModalProps {
  initialData?: Folder;
  onClose: () => void;
  onSave: (name: string) => void;
}

function FolderModal({ initialData, onClose, onSave }: FolderModalProps) {
  const [name, setName] = useState(initialData?.name || '');

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim());
    }
  };

  return (
    <ModalShell
      title={initialData ? '编辑文件夹' : '添加文件夹'}
      onClose={onClose}
      footer={
        <>
          <button className="list-modal-btn primary" onClick={handleSave} disabled={!name.trim()}>
            {initialData ? '保存' : '添加'}
          </button>
          <button className="list-modal-btn" onClick={onClose}>取消</button>
        </>
      }
    >
      <div className="list-form-group" style={{ paddingTop: '8px' }}>
        <div className="list-name-input-wrapper" style={{ width: '100%' }}>
          <FolderIcon size={16} className="icon-prefix" />
          <input 
            type="text" 
            placeholder="文件夹名称" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          />
        </div>
      </div>
    </ModalShell>
  );
}

interface AddListModalProps {
  folders: Folder[];
  initialFolderId?: string;
  initialData?: List;
  onClose: () => void;
  onAdd: (data: { name: string; color: string; viewType: ViewType; folderId: string | null; icon: string }, newFolderName?: string) => void;
  onAddFolder: (name: string) => Folder;
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#3b82f6', '#6366f1', '#a855f7'];

function AddListModal({ folders, initialFolderId, initialData, onClose, onAdd, onAddFolder }: AddListModalProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [color, setColor] = useState(initialData?.color || COLORS[6]);
  const [viewType, setViewType] = useState<ViewType>(initialData?.viewType || 'list');
  const [folderId, setFolderId] = useState<string | null>(initialData?.folderId !== undefined ? initialData.folderId : (initialFolderId || null));
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const closeDropdown = useCallback(() => setIsFolderDropdownOpen(false), []);
  const dropdownRef = useClickOutside<HTMLDivElement>(closeDropdown);

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd({ name, color, viewType, folderId, icon: 'BookOpen' });
  };

  const getFolderDisplay = () => {
    if (!folderId) return '无';
    const folder = folders.find(f => f.id === folderId);
    return folder ? folder.name : '无';
  };

  return (
    <ModalShell
      title={initialData ? '编辑清单' : '添加清单'}
      onClose={onClose}
      footer={
        <>
          <button className="list-modal-btn primary" onClick={handleAdd} disabled={!name.trim()}>
            {initialData ? '保存' : '添加'}
          </button>
          <button className="list-modal-btn" onClick={onClose}>取消</button>
        </>
      }
    >
      <div className="list-form-group">
        <div className="list-name-input-wrapper">
          <BookOpen size={16} className="icon-prefix" />
          <input 
            type="text" 
            placeholder="名称" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
        </div>
      </div>
      <div className="list-form-group">
        <div className="list-form-label">颜色</div>
        <div className="color-picker">
          <div 
            className={`color-swatch ${color === 'none' ? 'selected' : ''}`}
            style={{ border: '1px solid #ccc', background: 'transparent' }}
            onClick={() => setColor('none')}
          />
          {COLORS.map(c => (
            <div 
              key={c}
              className={`color-swatch ${color === c ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>
      <div className="list-form-group">
        <div className="list-form-label">视图</div>
        <div className="view-type-toggle">
          <button 
            className={`view-type-btn ${viewType === 'list' ? 'active' : ''}`}
            onClick={() => setViewType('list')}
          >
            <LayoutList size={16} />
          </button>
          <button 
            className={`view-type-btn ${viewType === 'board' ? 'active' : ''}`}
            onClick={() => setViewType('board')}
          >
            <Columns size={16} />
          </button>
        </div>
      </div>
      <div className="list-form-group">
        <div className="list-form-label">文件夹</div>
        <div className="folder-select-wrapper" ref={dropdownRef}>
          <div className="folder-select-dropdown" onClick={() => setIsFolderDropdownOpen(!isFolderDropdownOpen)}>
            <span>{getFolderDisplay()}</span>
            <ChevronDown size={16} color="var(--text-faint)" />
          </div>
          {isFolderDropdownOpen && (
            <div className="folder-dropdown-menu">
              <div className="folder-dropdown-item" onClick={() => { setFolderId(null); setIsFolderDropdownOpen(false); }}>
                无 {folderId === null && <Check size={16} className="check-icon" />}
              </div>
              {folders.map(f => (
                <div key={f.id} className="folder-dropdown-item" onClick={() => { setFolderId(f.id); setIsFolderDropdownOpen(false); }}>
                  {f.name} {folderId === f.id && <Check size={16} className="check-icon" />}
                </div>
              ))}
              <div className="folder-dropdown-item action" onClick={(e) => e.stopPropagation()} style={{ borderTop: '1px solid var(--line-soft)', padding: '8px 12px' }}>
                <Plus size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input 
                  type="text" 
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="新建文件夹..."
                  style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px', background: 'transparent', marginLeft: '4px' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      if (newFolderName.trim()) {
                        const newFolder = onAddFolder(newFolderName.trim());
                        setFolderId(newFolder.id);
                        setNewFolderName('');
                        setIsFolderDropdownOpen(false);
                      }
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

interface ListSettingsModalProps {
  onClose: () => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

function ListSettingsModal({ onClose, showToast }: ListSettingsModalProps) {
  const [openMode, setOpenMode] = useState<NoteOpenMode>('sidebar');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setOpenMode(getNoteOpenMode());
  }, []);

  const handleSelectMode = async (mode: NoteOpenMode) => {
    setOpenMode(mode);
    setIsSaving(true);
    try {
      await setNoteOpenMode(mode);
      if (showToast) {
        showToast(`已成功将笔记弹出方式切换为：${mode === 'sidebar' ? '侧边栏弹出' : '新窗口弹出'}`);
      }
    } catch (e) {
      logError('listsPanel', 'failed to save note open mode preference', e);
      if (showToast) {
        showToast('保存配置失败', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalShell
      title="清单设置"
      onClose={onClose}
      width="460px"
      zIndex={1000}
      footer={
        <button type="button" onClick={onClose} disabled={isSaving} style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 500, borderRadius: '6px', border: '1px solid var(--line-soft, #d1d5db)', background: '#ffffff', color: '#374151', cursor: 'pointer' }}>完成</button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-strong, #374151)', marginBottom: '8px' }}>笔记弹出方式</label>
          <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'var(--text-muted, #6b7280)' }}>
            选择点击笔记列表条目时的打开方式。设置将自动保存并同步至数据库。
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div
              onClick={() => handleSelectMode('sidebar')}
              style={{
                border: `2px solid ${openMode === 'sidebar' ? 'var(--primary-color, #3b82f6)' : 'var(--line-soft, #e5e7eb)'}`,
                background: openMode === 'sidebar' ? 'rgba(59, 130, 246, 0.04)' : 'var(--bg-app, #f9fafb)',
                borderRadius: '8px', padding: '14px', cursor: 'pointer', transition: 'all 0.15s ease', display: 'flex', flexDirection: 'column', gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Sidebar size={20} color={openMode === 'sidebar' ? 'var(--primary-color, #3b82f6)' : '#6b7280'} />
                {openMode === 'sidebar' && <span style={{ color: 'var(--primary-color, #3b82f6)' }}><Check size={16} /></span>}
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong, #111827)' }}>侧边栏弹出</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted, #6b7280)', marginTop: '2px' }}>在主界面右侧滑出抽屉编辑</div>
              </div>
            </div>

            <div
              onClick={() => handleSelectMode('window')}
              style={{
                border: `2px solid ${openMode === 'window' ? 'var(--primary-color, #3b82f6)' : 'var(--line-soft, #e5e7eb)'}`,
                background: openMode === 'window' ? 'rgba(59, 130, 246, 0.04)' : 'var(--bg-app, #f9fafb)',
                borderRadius: '8px', padding: '14px', cursor: 'pointer', transition: 'all 0.15s ease', display: 'flex', flexDirection: 'column', gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <ExternalLink size={20} color={openMode === 'window' ? 'var(--primary-color, #3b82f6)' : '#6b7280'} />
                {openMode === 'window' && <span style={{ color: 'var(--primary-color, #3b82f6)' }}><Check size={16} /></span>}
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong, #111827)' }}>新窗口弹出</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted, #6b7280)', marginTop: '2px' }}>在独立的窗口中多任务并发编辑</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

interface BatchExportModalProps {
  notes: Note[];
  onExport: (selectedNoteIds: string[]) => void;
  onClose: () => void;
}

function BatchExportModal({ notes, onExport, onClose }: BatchExportModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(notes.map(n => n.id)));

  const handleToggleSelectAll = () => {
    if (selectedIds.size === notes.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notes.map(n => n.id)));
    }
  };

  const handleToggleNote = (noteId: string) => {
    const next = new Set(selectedIds);
    if (next.has(noteId)) {
      next.delete(noteId);
    } else {
      next.add(noteId);
    }
    setSelectedIds(next);
  };

  const handleConfirm = () => {
    if (selectedIds.size === 0) {
      alert('请至少选择一条笔记进行导出。');
      return;
    }
    onExport(Array.from(selectedIds));
  };

  const allSelected = selectedIds.size === notes.length && notes.length > 0;

  return (
    <ModalShell
      title="批量导出笔记"
      onClose={onClose}
      width="500px"
      zIndex={100}
      footer={
        <>
          <button className="list-btn secondary" onClick={onClose}>取消</button>
          <button
            className="list-btn primary"
            onClick={handleConfirm}
            disabled={selectedIds.size === 0 || notes.length === 0}
            style={{ opacity: (selectedIds.size === 0 || notes.length === 0) ? 0.6 : 1 }}
          >
            导出选中的笔记 ({selectedIds.size})
          </button>
        </>
      }
    >
      <div style={{ overflowY: 'auto', maxHeight: '50vh' }}>
        {notes.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>当前清单暂无笔记。</div>
        ) : (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', fontWeight: 'bold', userSelect: 'none' }}>
              <input type="checkbox" checked={allSelected} onChange={handleToggleSelectAll} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
              全选 ({notes.length})
            </label>
            <div style={{ marginTop: '8px' }}>
              {notes.map(note => {
                const isChecked = selectedIds.has(note.id);
                return (
                  <label key={note.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', userSelect: 'none', transition: 'background 0.2s' }} className="batch-export-item">
                    <input type="checkbox" checked={isChecked} onChange={() => handleToggleNote(note.id)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-color)', fontSize: '14px' }}>
                      {note.title || '未命名笔记'}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}

// ============================================================================
// 6. Main ListsPanel Component
// ============================================================================
function MenuIcon({ isCollapsed }: { isCollapsed: boolean }) {
  return isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />;
}

type DragOverTarget =
  | { type: 'sidebar-list'; id: string }
  | { type: 'folder'; id: string }
  | { type: 'group'; id: string }
  | { type: 'standalone-area' }
  | null;

const EMPTY_LISTS: List[] = [];
const EMPTY_FOLDERS: Folder[] = [];
const EMPTY_NOTES: Note[] = [];
const EMPTY_NOTE_GROUPS: NoteGroup[] = [];

export function ListsPanel() {
  // Query-backed data + write actions
  const { data } = useListsData();
  const rawLists = data?.lists ?? EMPTY_LISTS;
  const rawFolders = data?.folders ?? EMPTY_FOLDERS;
  const rawNotes = data?.notes ?? EMPTY_NOTES;
  const rawNoteGroups = data?.noteGroups ?? EMPTY_NOTE_GROUPS;

  const {
    moveNoteToList,
    reorderNotes,
    moveNoteAndReorder,
    reorderFolders,
    reorderLists,
    moveList,
    addFolder,
    updateFolder,
    deleteFolder,
    addList,
    updateList,
    duplicateList,
    deleteList,
    addNote,
    updateNote,
    deleteNote,
    addGroup,
    updateGroup,
    deleteGroup,
  } = useListsActions();
  const { addTemplate, updateTemplate, deleteTemplate } = useTemplateActions();

  const lists = useMemo(() => sortLists(rawLists), [rawLists]);

  const folders = useMemo(() => sortFolders(rawFolders), [rawFolders]);

  // Pre-build O(1) Sets & Maps for drag-and-drop hit testing
  const folderIdSet = useMemo(() => new Set(folders.map(f => f.id)), [folders]);
  const noteMap = useMemo(() => new Map(rawNotes.map(n => [n.id, n])), [rawNotes]);
  const listMap = useMemo(() => new Map(lists.map(l => [l.id, l])), [lists]);

  const templates = useTemplateData().data ?? [];

  const [activeListId, setActiveListId] = useState<string | null>(() => {
    return localStorage.getItem('lists-active-list-id');
  });

  const notes = useMemo(() => {
    if (!activeListId) return [];
    return rawNotes
      .filter(n => n.listId === activeListId)
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        if (a.sortOrder !== b.sortOrder) {
          return (a.sortOrder || 0) - (b.sortOrder || 0);
        }
        return b.updatedAt - a.updatedAt;
      });
  }, [rawNotes, activeListId]);

  const noteGroups = useMemo(() => {
    if (!activeListId) return [];
    return rawNoteGroups
      .filter(g => g.listId === activeListId)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [rawNoteGroups, activeListId]);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('lists-sidebar-collapsed') === 'true';
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('lists-sidebar-collapsed', String(next));
      return next;
    });
  };

  // Modals state (ID-derived dynamic selection)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalInitialFolderId, setAddModalInitialFolderId] = useState<string | undefined>();
  
  const [editListId, setEditListId] = useState<string | null>(null);
  const editListTarget = useMemo(
    () => (editListId ? lists.find(l => l.id === editListId) : undefined),
    [lists, editListId]
  );

  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editFolderId, setEditFolderId] = useState<string | null>(null);
  const editFolderTarget = useMemo(
    () => (editFolderId ? folders.find(f => f.id === editFolderId) : undefined),
    [folders, editFolderId]
  );

  const [isListSettingsOpen, setIsListSettingsOpen] = useState(false);

  // Note state
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const activeNote = useMemo(() => {
    if (!activeNoteId) return null;
    return noteMap.get(activeNoteId) || null;
  }, [noteMap, activeNoteId]);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const [activeDragNoteId, setActiveDragNoteId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<DragOverTarget>(null);

  const dragOverSidebarListId = dragOverTarget?.type === 'sidebar-list' ? dragOverTarget.id : null;
  const dragOverFolderId = dragOverTarget?.type === 'folder' || dragOverTarget?.type === 'standalone-area'
    ? (dragOverTarget.type === 'standalone-area' ? 'standalone-area' : dragOverTarget.id)
    : null;
  const dragOverGroupId = dragOverTarget?.type === 'group' ? dragOverTarget.id : null;

  // Template state
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [batchExportModalOpen, setBatchExportModalOpen] = useState(false);

  // Toast state
  interface ToastMessage {
    id: string;
    message: string;
    type: 'success' | 'error';
    isFadingOut?: boolean;
  }
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev =>
        prev.map(t => (t.id === id ? { ...t, isFadingOut: true } : t))
      );
    }, 2700);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const didInitActiveList = useRef(false);
  useEffect(() => {
    if (didInitActiveList.current) return;
    if (lists.length === 0) return; // wait for the query to load
    didInitActiveList.current = true;

    const savedId = localStorage.getItem('lists-active-list-id');
    const exists = savedId && lists.some(l => l.id === savedId);
    if (exists) return;

    // `lists`/`folders` are already sorted (pinned first, then sortOrder), so the
    // first list of the first folder is simply the first matching entry.
    let defaultListId = lists[0].id;
    if (folders.length > 0) {
      const firstFolder = folders[0];
      const folderLists = lists.filter(l => l.folderId === firstFolder.id);
      if (folderLists.length > 0) {
        defaultListId = folderLists[0].id;
      }
    }

    setActiveListId(defaultListId);
    localStorage.setItem('lists-active-list-id', defaultListId);
  }, [lists, folders]);

  useEffect(() => {
    if (activeListId) {
      setActiveNoteId(null);
      setIsDrawerOpen(false);
      localStorage.setItem('lists-active-list-id', activeListId);
    } else {
      localStorage.removeItem('lists-active-list-id');
    }
  }, [activeListId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      shouldHandleEvent(event: KeyboardEvent) {
        const target = event.target as HTMLElement | null;
        if (
          target &&
          (target.isContentEditable ||
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.closest('.ProseMirror') ||
            target.closest('[contenteditable="true"]'))
        ) {
          return false;
        }
        return true;
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragNoteId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) {
      if (dragOverTarget !== null) setDragOverTarget(null);
      return;
    }
    const overId = String(over.id);
    const overData = over.data?.current as { type?: string; listId?: string } | undefined;
    const activeId = String(active.id);

    const isDraggingNote = noteMap.has(activeId);

    if (isDraggingNote) {
      if (overData?.type === 'sidebar-list' && overData.listId) {
        setDragOverTarget({ type: 'sidebar-list', id: overData.listId });
      } else if (overData?.type === 'folder' || folderIdSet.has(overId)) {
        setDragOverTarget({ type: 'folder', id: overId });
      } else if (overData?.type === 'group') {
        setDragOverTarget({ type: 'group', id: overId === 'ungrouped' ? 'ungrouped' : overId });
      } else {
        const overNote = noteMap.get(overId);
        if (overNote) {
          setDragOverTarget({ type: 'group', id: overNote.groupId || 'ungrouped' });
        } else {
          setDragOverTarget(null);
        }
      }
    } else {
      const activeFolder = folderIdSet.has(activeId);
      if (activeFolder) {
        setDragOverTarget(null);
        return;
      }
      if (overId === 'standalone-area') {
        setDragOverTarget({ type: 'standalone-area' });
      } else if (overData?.type === 'folder' || folderIdSet.has(overId)) {
        setDragOverTarget({ type: 'folder', id: overId });
      } else {
        const overList = listMap.get(overId);
        if (overList) {
          const fId = overList.folderId;
          setDragOverTarget(fId ? { type: 'folder', id: fId } : { type: 'standalone-area' });
        } else {
          setDragOverTarget(null);
        }
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragNoteId(null);
    setDragOverTarget(null);

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const overData = over.data?.current as { type?: string; listId?: string } | undefined;

    const isDraggingNote = noteMap.has(activeId);

    if (isDraggingNote) {
      let targetListId: string | null = null;
      if (overData?.type === 'sidebar-list' && overData.listId) {
        targetListId = overData.listId;
      } else if (overId.startsWith('sidebar-list-')) {
        targetListId = overId.replace('sidebar-list-', '');
      } else if (listMap.has(overId)) {
        targetListId = overId;
      }

      if (targetListId) {
        const targetList = listMap.get(targetListId);
        moveNoteToList(activeId, targetListId);
        if (targetList) {
          showToast(`已成功移动笔记到清单「${targetList.name}」`);
        }
        return;
      }

      if (overData?.type === 'folder' || folderIdSet.has(overId)) {
        const folderId = overId;
        const folderLists = lists.filter(l => l.folderId === folderId);
        if (folderLists.length > 0) {
          const targetList = folderLists[0];
          moveNoteToList(activeId, targetList.id);
          showToast(`已成功移动笔记到清单「${targetList.name}」`);
        }
        return;
      }

      let overType: 'group' | 'note' | 'other' = 'other';
      let overGroupId: string | null | undefined = undefined;
      if (overData?.type === 'group') {
        overType = 'group';
        overGroupId = overId === 'ungrouped' ? null : overId;
      } else if (noteMap.has(overId)) {
        overType = 'note';
      }

      const action = computeNoteReorder({
        activeId,
        overId,
        notes,
        overType,
        overGroupId,
      });

      switch (action.kind) {
        case 'reorder':
          reorderNotes(action.newOrder);
          break;
        case 'move':
          moveNoteAndReorder(activeId, action.targetGroup, action.targetIndex);
          break;
      }
    } else {
      let overType: 'folder' | 'standalone' | 'list' | 'other' = 'other';
      if (overId === 'standalone-area') overType = 'standalone';
      else if (overData?.type === 'folder' || folderIdSet.has(overId)) overType = 'folder';
      else if (listMap.has(overId)) overType = 'list';

      const action = computeListReorder({
        activeId,
        overId,
        lists,
        folders,
        overType,
      });

      switch (action.kind) {
        case 'reorder':
          if (folderIdSet.has(activeId)) {
            reorderFolders(action.newOrder);
          } else {
            reorderLists(action.newOrder);
          }
          break;
        case 'move':
          moveList(activeId, action.targetGroup, action.targetIndex);
          break;
      }
    }
  };

  // --- List Handlers ---
  const handleAddListClick = (folderId?: string) => {
    setEditListId(null);
    setAddModalInitialFolderId(folderId);
    setIsAddModalOpen(true);
  };

  const handleAddFolder = (name: string) => {
    return addFolder(name);
  };

  const handleAddList = (data: { name: string; color: string; viewType: ViewType; folderId: string | null; icon: string }, newFolderName?: string) => {
    let finalFolderId = data.folderId;
    if (newFolderName) {
      const newFolder = addFolder(newFolderName);
      finalFolderId = newFolder.id;
    }
    if (editListId) {
      updateList(editListId, {
        name: data.name,
        color: data.color,
        viewType: data.viewType,
        folderId: finalFolderId,
        icon: data.icon,
      });
    } else {
      const newList = addList({
        name: data.name,
        color: data.color,
        viewType: data.viewType,
        folderId: finalFolderId,
        icon: data.icon,
      });
      setActiveListId(newList.id);
    }
    setIsAddModalOpen(false);
    setEditListId(null);
  };

  // --- Sidebar Actions ---
  const handleEditFolder = (folder: Folder) => {
    setEditFolderId(folder.id);
    setIsFolderModalOpen(true);
  };

  const handleSaveFolder = (name: string) => {
    if (editFolderId) {
      updateFolder(editFolderId, { name });
    }
    setIsFolderModalOpen(false);
    setEditFolderId(null);
  };

  const handlePinFolder = (folder: Folder) => {
    updateFolder(folder.id, { isPinned: !folder.isPinned });
  };

  const handleDissolveFolder = (folder: Folder) => {
    deleteFolder(folder.id);
  };

  const handleEditList = (list: List) => {
    setEditListId(list.id);
    setIsAddModalOpen(true);
  };

  const handlePinList = (list: List) => {
    updateList(list.id, { isPinned: !list.isPinned });
  };

  const handleDuplicateList = (list: List) => {
    const newList = duplicateList(list);
    setActiveListId(newList.id);
  };

  const handleDeleteList = (list: List) => {
    deleteList(list.id);
    if (activeListId === list.id) setActiveListId(null);
  };

  // --- Note Actions ---
  const handleOpenNote = (noteId: string, noteTitle?: string) => {
    const mode = getNoteOpenMode();
    if (mode === 'window') {
      openNoteInNewWindow(noteId, noteTitle);
    } else {
      setActiveNoteId(noteId);
      setIsDrawerOpen(true);
    }
  };

  const handleAddNote = () => {
    if (!activeListId || !newNoteTitle.trim()) return;
    const newNote = addNote({
      listId: activeListId,
      title: newNoteTitle.trim(),
      content: '',
    });
    setNewNoteTitle('');
    handleOpenNote(newNote.id, newNote.title);
  };

  const handleBatchImport = async () => {
    if (!activeListId) return;
    try {
      const importedFiles = await listsService.pickMultipleMarkdownFiles();
      for (const file of importedFiles) {
        const jsonContent = convertMarkdownToTipTapJson(file.content);
        addNote({
          listId: activeListId,
          title: file.title,
          content: jsonContent,
        });
      }
      showToast(`已成功导入 ${importedFiles.length} 条笔记！`);
    } catch (err) {
      logSilent('listsPanel', 'batch import cancelled or failed', err);
    }
  };

  const handleBatchExport = async (selectedNoteIds: string[]) => {
    const notesToExport = notes.filter(n => selectedNoteIds.includes(n.id));
    if (notesToExport.length === 0) return;

    const files = notesToExport.map(n => ({
      title: n.title,
      content: convertTipTapJsonToMarkdown(n.content || ''),
    }));

    try {
      await listsService.saveMultipleMarkdownFiles(files);
      setBatchExportModalOpen(false);
      showToast(`已成功导出 ${files.length} 条笔记！`);
    } catch (err) {
      logSilent('listsPanel', 'batch export cancelled or failed', err);
    }
  };

  const handleNoteUpdate = (id: string, title: string, content: string) => {
    updateNote(id, { title, content });
  };

  const handlePinNote = (note: Note) => {
    updateNote(note.id, { isPinned: !note.isPinned });
  };

  const handleDuplicateNote = (note: Note) => {
    const newNote = addNote({
      listId: note.listId,
      title: note.title + ' (副本)',
      content: note.content,
    });
    handleOpenNote(newNote.id, newNote.title);
  };

  const handleSaveAsTemplate = (note: Note) => {
    addTemplate(note.title || '自定义模板', note.content);
    showToast('已保存为模板！');
  };

  const handleDeleteNote = (note: Note) => {
    deleteNote(note.id);
    if (activeNoteId === note.id) {
      setActiveNoteId(null);
      setIsDrawerOpen(false);
    }
  };

  const ensureJsonFormat = (text: string) => {
    if (!text) return JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
    const trimmed = text.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed;
    }
    return convertMarkdownToTipTapJson(text);
  };

  const handleSelectTemplate = (template: Template) => {
    if (!activeNoteId) return;
    const jsonContent = ensureJsonFormat(template.content);
    updateNote(activeNoteId, { content: jsonContent });
    setIsTemplateModalOpen(false);
  };

  const handleEditTemplate = (id: string, name: string, content: string) => {
    updateTemplate(id, { name, content });
  };

  const handleDeleteTemplate = (id: string) => {
    deleteTemplate(id);
  };

  // --- Group Actions ---
  const handleAddGroupClick = () => {
    setIsAddingGroup(true);
    setNewGroupName('');
  };

  const handleConfirmAddGroup = () => {
    if (!activeListId) return;
    if (newGroupName.trim()) {
      addGroup(activeListId, newGroupName.trim());
    }
    setIsAddingGroup(false);
  };

  const handleRenameGroup = (id: string, name: string) => {
    updateGroup(id, { name });
  };

  const handleDeleteGroup = (id: string) => {
    deleteGroup(id);
  };

  const handleMoveNote = (note: Note, targetListId: string) => {
    updateNote(note.id, { listId: targetListId, groupId: null });
    if (activeNoteId === note.id && activeListId !== targetListId) {
      setActiveNoteId(null);
      setIsDrawerOpen(false);
    }
  };

  const activeList = listMap.get(activeListId || '');

  const ungroupedNotes = useMemo(() => notes.filter(n => !n.groupId), [notes]);
  const activeNoteItem = useMemo(() => (activeDragNoteId ? noteMap.get(activeDragNoteId) : null), [noteMap, activeDragNoteId]);
  const isUngroupedDragOverTarget = dragOverGroupId === 'ungrouped' && activeNoteItem && activeNoteItem.groupId !== null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <section className="lists-page">
        <ListsSidebar
          lists={lists}
          folders={folders}
          activeListId={activeListId}
          dragOverListId={dragOverSidebarListId}
          dragOverFolderId={dragOverFolderId}
          onSelectList={setActiveListId}
          onAddClick={handleAddListClick}
          onEditFolder={handleEditFolder}
          onPinFolder={handlePinFolder}
          onDissolveFolder={handleDissolveFolder}
          onEditList={handleEditList}
          onPinList={handlePinList}
          onDuplicateList={handleDuplicateList}
          onDeleteList={handleDeleteList}
          isCollapsed={isSidebarCollapsed}
        />

        <main className="lists-main-content" onClick={() => setListMenuOpen(false)}>
          {activeList ? (
            <>
              <div className="lists-content-header">
                <div className="lists-content-title">
                  <div className="lists-menu-icon" onClick={toggleSidebar} title={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}>
                    <MenuIcon isCollapsed={isSidebarCollapsed} />
                  </div>
                  <span>{activeList.name}</span>
                </div>
                <div className="lists-content-actions">
                  <ArrowDownUp size={18} style={{ cursor: 'pointer' }} />
                  <div style={{ position: 'relative' }}>
                    <MoreHorizontal
                      size={18}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); setListMenuOpen(!listMenuOpen); }}
                    />
                    {listMenuOpen && (
                      <div className="lists-dropdown-menu" style={{ right: 0, top: '100%', marginTop: '4px', zIndex: 10, width: '160px' }}>
                        <div className="lists-dropdown-submenu-container">
                          <div className="lists-dropdown-item" style={{ justifyContent: 'space-between' }}>
                            <span>笔记打开方式</span>
                            <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                          </div>

                          <div className="lists-dropdown-submenu">
                            <div
                              className="lists-dropdown-item"
                              style={{ justifyContent: 'space-between' }}
                              onClick={async (e) => {
                                e.stopPropagation();
                                await setNoteOpenMode('sidebar');
                                showToast('已成功切换为：侧边栏弹出笔记');
                                setListMenuOpen(false);
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Sidebar size={14} />
                                侧边栏弹出
                              </span>
                              {getNoteOpenMode() === 'sidebar' && <Check size={14} style={{ color: 'var(--primary-color, #3b82f6)' }} />}
                            </div>

                            <div
                              className="lists-dropdown-item"
                              style={{ justifyContent: 'space-between' }}
                              onClick={async (e) => {
                                e.stopPropagation();
                                await setNoteOpenMode('window');
                                showToast('已成功切换为：新窗口弹出笔记');
                                setListMenuOpen(false);
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ExternalLink size={14} />
                                新窗口弹出
                              </span>
                              {getNoteOpenMode() === 'window' && <Check size={14} style={{ color: 'var(--primary-color, #3b82f6)' }} />}
                            </div>
                          </div>
                        </div>

                        <div className="lists-dropdown-item" onClick={() => { handleAddGroupClick(); setListMenuOpen(false); }}>新建分组</div>
                        <div className="lists-dropdown-item" onClick={() => { handleBatchImport(); setListMenuOpen(false); }}>批量导入MD</div>
                        <div className="lists-dropdown-item" onClick={() => { setBatchExportModalOpen(true); setListMenuOpen(false); }}>批量导出MD</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ padding: '0 32px', display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', border: '1px solid var(--line-soft)', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px' }}>
                  <Plus size={16} style={{ marginRight: '8px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="添加笔记..."
                    value={newNoteTitle}
                    onChange={e => setNewNoteTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddNote();
                    }}
                    style={{ border: 'none', outline: 'none', flex: 1, fontSize: '14px', background: 'transparent' }}
                  />
                </div>

                {notes.length === 0 && !isAddingGroup ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-faint)' }}>
                    暂无笔记
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: '32px' }}>
                    {isAddingGroup && (
                      <div className="note-group" style={{ marginBottom: '16px' }}>
                        <div className="note-group-header">
                          <input
                            autoFocus
                            type="text"
                            value={newGroupName}
                            onChange={e => setNewGroupName(e.target.value)}
                            placeholder="输入分组名称..."
                            onBlur={handleConfirmAddGroup}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleConfirmAddGroup();
                              if (e.key === 'Escape') setIsAddingGroup(false);
                            }}
                            style={{ fontSize: '14px', fontWeight: 600, border: '1px solid var(--line-soft)', background: '#ffffff', outline: 'none', borderRadius: '4px', padding: '4px 8px', color: 'var(--text-strong)', width: '200px' }}
                          />
                        </div>
                      </div>
                    )}
                    {noteGroups.length === 0 && !isAddingGroup ? (
                      <SortableContext items={notes.map(n => n.id)} strategy={verticalListSortingStrategy}>
                        {notes.map(note => (
                          <SortableItem key={note.id} id={note.id}>
                            <NoteItem
                              key={note.id}
                              note={note}
                              allLists={lists}
                              onClick={() => handleOpenNote(note.id, note.title)}
                              onPin={handlePinNote}
                              onDuplicate={handleDuplicateNote}
                              onDelete={handleDeleteNote}
                              onMove={handleMoveNote}
                            />
                          </SortableItem>
                        ))}
                      </SortableContext>
                    ) : (
                      <>
                        {noteGroups.map(group => {
                          const groupNotes = notes.filter(n => n.groupId === group.id);
                          const isDragOverTarget = dragOverGroupId === group.id && activeNoteItem && activeNoteItem.groupId !== group.id;
                          return (
                            <NoteGroupView
                              key={group.id}
                              group={group}
                              notes={groupNotes}
                              allLists={lists}
                              isDragOverTarget={!!isDragOverTarget}
                              onRenameGroup={handleRenameGroup}
                              onDeleteGroup={handleDeleteGroup}
                              onNoteClick={(note) => handleOpenNote(note.id, note.title)}
                              onPinNote={handlePinNote}
                              onDuplicateNote={handleDuplicateNote}
                              onDeleteNote={handleDeleteNote}
                              onMoveNote={handleMoveNote}
                            />
                          );
                        })}
                        {ungroupedNotes.length > 0 && (
                          <NoteGroupView
                            key="ungrouped"
                            group={{ id: 'ungrouped', listId: activeListId!, name: '未分组' }}
                            notes={ungroupedNotes}
                            allLists={lists}
                            isUngrouped={true}
                            isDragOverTarget={!!isUngroupedDragOverTarget}
                            onRenameGroup={() => { }}
                            onDeleteGroup={() => { }}
                            onNoteClick={(note) => handleOpenNote(note.id, note.title)}
                            onPinNote={handlePinNote}
                            onDuplicateNote={handleDuplicateNote}
                            onDeleteNote={handleDeleteNote}
                            onMoveNote={handleMoveNote}
                          />
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <NoteDrawer
                note={activeNote}
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                onUpdate={handleNoteUpdate}
                onPin={handlePinNote}
                onDuplicate={handleDuplicateNote}
                onSaveAsTemplate={handleSaveAsTemplate}
                onDelete={handleDeleteNote}
                showToast={showToast}
              />
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              请在左侧选择或创建一个清单
            </div>
          )}
        </main>

        {isAddModalOpen && (
          <AddListModal
            folders={folders}
            initialFolderId={addModalInitialFolderId}
            initialData={editListTarget}
            onClose={() => { setIsAddModalOpen(false); setEditListId(null); }}
            onAdd={handleAddList}
            onAddFolder={handleAddFolder}
          />
        )}

        {isFolderModalOpen && (
          <FolderModal
            initialData={editFolderTarget}
            onClose={() => { setIsFolderModalOpen(false); setEditFolderId(null); }}
            onSave={handleSaveFolder}
          />
        )}

        {isTemplateModalOpen && (
          <TemplateModal
            templates={templates}
            onSelect={handleSelectTemplate}
            onClose={() => setIsTemplateModalOpen(false)}
            onEdit={handleEditTemplate}
            onDelete={handleDeleteTemplate}
          />
        )}

        {batchExportModalOpen && (
          <BatchExportModal
            notes={notes}
            onExport={handleBatchExport}
            onClose={() => setBatchExportModalOpen(false)}
          />
        )}

        {isListSettingsOpen && (
          <ListSettingsModal
            onClose={() => setIsListSettingsOpen(false)}
            showToast={showToast}
          />
        )}

        <div className="lists-toast-container">
          {toasts.map(t => (
            <div key={t.id} className={`lists-toast-item ${t.type} ${t.isFadingOut ? 'fade-out' : ''}`}>
              {t.type === 'success' ? (
                <CheckCircle size={18} className="lists-toast-icon success" />
              ) : (
                <AlertCircle size={18} className="lists-toast-icon error" />
              )}
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      </section>
    </DndContext>
  );
}
