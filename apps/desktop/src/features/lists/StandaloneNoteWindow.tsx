import { useState, useEffect, useRef } from 'react';
import { useListsData, useListsActions } from './useListsQuery';
import { Note } from './listsTypes';
import { MoreHorizontal, Pin, Cloud, Minus, Square, Copy, X } from 'lucide-react';
import * as listsService from './listsService';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { logWarn } from '@humanmanual/core';
import { ReactjsTiptapEditor, convertMarkdownToTipTapJson, convertTipTapJsonToMarkdown } from '../reactjs-tiptap-v1';
import './lists.css';

const EMPTY_NOTES: Note[] = [];

export function StandaloneNoteWindow() {
  const { data } = useListsData();
  const notes = data?.notes ?? EMPTY_NOTES;
  const [noteId, setNoteId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('noteId');
    if (id) {
      setNoteId(id);
    }
  }, []);

  const note = notes.find(n => n.id === noteId) || null;

  // 笔记被其他窗口删除（删除事件同步过来）：自动关闭本窗口，不停在“不存在”占位页
  const hadNoteRef = useRef(false);
  useEffect(() => {
    if (note) {
      hadNoteRef.current = true;
      return;
    }
    if (hadNoteRef.current) {
      getCurrentWindow().close().catch(() => window.close());
    }
  }, [note]);

  if (!noteId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888' }}>
        未指定笔记 ID
      </div>
    );
  }

  if (!note) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888' }}>
        正在加载笔记或笔记不存在...
      </div>
    );
  }

  return <StandaloneNoteEditorContent key={note.id} note={note} />;
}

function StandaloneNoteEditorContent({ note }: { note: Note }) {
  const { updateNote, deleteNote } = useListsActions();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content || '');
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [isMaximized, setIsMaximized] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  // Focus and select title input when switching to edit mode
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Synchronize window state (isMaximized)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const initWindowState = async () => {
      try {
        const appWin = getCurrentWindow();
        setIsMaximized(await appWin.isMaximized());
        unlisten = await appWin.onResized(async () => {
          setIsMaximized(await appWin.isMaximized());
        });
      } catch (e) {
        logWarn('standaloneNote', 'Tauri window API listener warning', e);
      }
    };
    initWindowState();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Synchronize when note prop is updated externally
  useEffect(() => {
    setTitle(note.title);
    setContent(note.content || '');
    document.title = note.title ? `${note.title} - 笔记` : '笔记编辑';
    latestDataRef.current = { title: note.title, content: note.content || '', noteId: note.id };
  }, [note.id, note.title, note.content]);

  const latestDataRef = useRef({ title, content, noteId: note.id });
  useEffect(() => {
    latestDataRef.current = { title, content, noteId: note.id };
  }, [title, content, note.id]);

  // Save changes on unmount or window close
  useEffect(() => {
    return () => {
      const currentId = latestDataRef.current.noteId;
      const currentTitle = latestDataRef.current.title;
      const currentContent = latestDataRef.current.content;
      if (currentId && (currentTitle !== note.title || currentContent !== note.content)) {
        updateNote(currentId, { title: currentTitle, content: currentContent });
      }
    };
  }, [updateNote, note.title, note.content]);

  // Debounced auto-save effect
  useEffect(() => {
    if (title !== note.title || content !== note.content) {
      setSaveStatus('saving');
      const timer = setTimeout(() => {
        updateNote(note.id, { title, content });
        setSaveStatus('saved');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [title, content, note.id, note.title, note.content, updateNote]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMinimizeWindow = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (err) {
      logWarn('standaloneNote', 'failed to minimize window', err);
    }
  };

  const handleToggleMaximizeWindow = async () => {
    try {
      const appWin = getCurrentWindow();
      await appWin.toggleMaximize();
      setIsMaximized(await appWin.isMaximized());
    } catch (err) {
      logWarn('standaloneNote', 'failed to toggle maximize', err);
    }
  };

  const handleCloseWindow = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.close();
    } catch {
      window.close();
    }
  };

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.closest('button') || target.closest('.lists-dropdown-menu')) {
      return;
    }
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = false;
  };

  const handleHeaderMouseMove = (e: React.MouseEvent) => {
    if (!dragStartPosRef.current || isDraggingRef.current) return;
    const dx = e.clientX - dragStartPosRef.current.x;
    const dy = e.clientY - dragStartPosRef.current.y;
    if (Math.hypot(dx, dy) > 4) {
      isDraggingRef.current = true;
      try {
        getCurrentWindow().startDragging();
      } catch (err) {
        logWarn('standaloneNote', 'startDragging error', err);
      }
    }
  };

  const handleHeaderMouseUp = () => {
    dragStartPosRef.current = null;
    isDraggingRef.current = false;
  };

  const handleHeaderDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.closest('button') || target.closest('.lists-dropdown-menu')) {
      return;
    }
    setIsEditingTitle(true);
  };

  const handlePin = () => {
    updateNote(note.id, { isPinned: !note.isPinned });
  };

  const handleImport = async () => {
    const mdContent = await listsService.pickMarkdownFile();
    if (mdContent) {
      const jsonStr = convertMarkdownToTipTapJson(mdContent);
      setContent(jsonStr);
    }
  };

  const handleExport = async () => {
    try {
      const exportText = convertTipTapJsonToMarkdown(content);
      await listsService.saveMarkdownFile(`${title || '未命名笔记'}.md`, exportText);
    } catch (err) {
      // Cancellation surfaces as an error from the backend; already logged by `call`.
    }
  };

  const handleDelete = () => {
    if (window.confirm(`确定要删除笔记"${note.title || '未命名笔记'}"吗？`)) {
      deleteNote(note.id);
      handleCloseWindow();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-app, #ffffff)', color: 'var(--text-strong, #1f2937)' }}>
      {/* Top Header Bar */}
      <div
        className="standalone-note-header"
        onMouseDown={handleHeaderMouseDown}
        onMouseMove={handleHeaderMouseMove}
        onMouseUp={handleHeaderMouseUp}
        onDoubleClick={handleHeaderDoubleClick}
      >
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, marginRight: '16px', minWidth: 0 }}>
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              className="note-drawer-title-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  setIsEditingTitle(false);
                }
              }}
              placeholder="笔记标题"
              style={{
                flex: 1,
                fontSize: '18px',
                fontWeight: 600,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'var(--text-strong, #111827)',
              }}
            />
          ) : (
            <div
              title="双击修改标题，按住拖拽窗口"
              style={{
                flex: 1,
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--text-strong, #111827)',
                cursor: 'default',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                userSelect: 'none',
                padding: '4px 0',
              }}
            >
              {title || <span style={{ color: 'var(--text-faint, #9ca3af)', fontWeight: 400 }}>未命名笔记 (双击修改)</span>}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            title={saveStatus === 'saving' ? '保存中...' : '已自动保存'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '4px',
              padding: '4px',
            }}
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

          <button
            type="button"
            onClick={handlePin}
            title={note.isPinned ? '取消置顶' : '置顶'}
            style={{
              border: 'none',
              background: note.isPinned ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
              color: note.isPinned ? '#3b82f6' : 'var(--text-muted, #6b7280)',
              borderRadius: '4px',
              padding: '6px',
              cursor: 'pointer',
            }}
          >
            <Pin size={16} />
          </button>

          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              title="更多操作"
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--text-muted, #6b7280)',
                borderRadius: '4px',
                padding: '6px',
                cursor: 'pointer',
              }}
            >
              <MoreHorizontal size={18} />
            </button>

            {menuOpen && (
              <div className="lists-dropdown-menu" style={{ top: '100%', right: 0, marginTop: '4px', zIndex: 100 }}>
                <div className="lists-dropdown-item" onClick={() => { setMenuOpen(false); handlePin(); }}>{note.isPinned ? '取消置顶' : '置顶笔记'}</div>
                <div className="lists-dropdown-item" onClick={() => { setMenuOpen(false); handleImport(); }}>导入 MD</div>
                <div className="lists-dropdown-item" onClick={() => { setMenuOpen(false); handleExport(); }}>导出 MD</div>
                <div className="lists-dropdown-item text-danger" onClick={() => { setMenuOpen(false); handleDelete(); }}>删除笔记</div>
              </div>
            )}
          </div>

          {/* Window Control Buttons */}
          <div className="standalone-window-controls">
            <button
              type="button"
              className="standalone-window-btn"
              onClick={handleMinimizeWindow}
              title="最小化"
              aria-label="最小化"
            >
              <Minus size={15} />
            </button>
            <button
              type="button"
              className="standalone-window-btn"
              onClick={handleToggleMaximizeWindow}
              title={isMaximized ? "向下还原" : "最大化"}
              aria-label={isMaximized ? "向下还原" : "最大化"}
            >
              {isMaximized ? <Copy size={13} /> : <Square size={13} />}
            </button>
            <button
              type="button"
              className="standalone-window-btn close-btn"
              onClick={handleCloseWindow}
              title="关闭"
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Editor Area */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', position: 'relative' }}>
        <ReactjsTiptapEditor
          key={note.id}
          content={content}
          initialContent={content}
          onChange={setContent}
          enableCustomTemplates={true}
          className="note-drawer-reactjs-tiptap"
        />
      </div>
    </div>
  );
}
