import { useState, useEffect, useMemo } from 'react';
import { Plus, ChevronRight, Folder as FolderIcon, X, Check } from 'lucide-react';
import { useListsStore } from './listsStore';
import { ReactjsTiptapEditor, convertMarkdownToTipTapJson, convertTipTapJsonToMarkdown } from '../reactjs-tiptap-v1';
import { triggerHaptic } from '../../lib/haptics';
import './lists.css';

export function ListsPanelMobile() {
  const rawLists = useListsStore((s) => s.data.lists);
  const rawNotes = useListsStore((s) => s.data.notes);
  const storeInit = useListsStore((s) => s.init);
  const addNote = useListsStore((s) => s.addNote);
  const updateNote = useListsStore((s) => s.updateNote);

  const [activeListId, setActiveListId] = useState<string | null>(() => {
    return localStorage.getItem('lists-active-list-id') || rawLists[0]?.id || null;
  });
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    storeInit();
  }, [storeInit]);

  const activeList = useMemo(() => rawLists.find((l) => l.id === activeListId), [rawLists, activeListId]);

  const notes = useMemo(() => {
    if (!activeListId) return [];
    return rawNotes
      .filter((n) => n.listId === activeListId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [rawNotes, activeListId]);

  const activeNote = useMemo(() => notes.find((n) => n.id === activeNoteId), [notes, activeNoteId]);

  const handleSelectList = (listId: string) => {
    triggerHaptic('light');
    setActiveListId(listId);
    localStorage.setItem('lists-active-list-id', listId);
    setActiveNoteId(null);
    setIsDrawerOpen(false);
  };

  const handleCreateNote = () => {
    triggerHaptic('medium');
    if (!activeListId) return;
    const newNote = addNote({ listId: activeListId, title: '未命名笔记', content: '' });
    setActiveNoteId(newNote.id);
  };

  return (
    <div className="lists-panel mobile" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <header className="mobile-lists-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(123,145,169,0.15)', background: 'var(--surface-0)' }}>
        {activeNoteId ? (
          <button
            type="button"
            className="mobile-back-btn"
            onClick={() => {
              triggerHaptic('light');
              setActiveNoteId(null);
            }}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px', color: 'var(--accent)', fontWeight: 500 }}
          >
            ← 返回列表
          </button>
        ) : (
          <button
            type="button"
            className="mobile-list-switch-btn"
            onClick={() => {
              triggerHaptic('light');
              setIsDrawerOpen(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', border: 'none', background: 'var(--surface-1)', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}
          >
            <FolderIcon size={16} />
            <span>{activeList ? activeList.name : '选择清单'}</span>
            <ChevronRight size={14} />
          </button>
        )}

        {!activeNoteId && (
          <button
            type="button"
            className="mobile-new-note-btn"
            onClick={handleCreateNote}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', border: 'none', background: 'var(--accent)', color: '#fff', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
          >
            <Plus size={16} /> 新建笔记
          </button>
        )}
      </header>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeNote ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px', overflowY: 'auto' }}>
            <input
              type="text"
              value={activeNote.title}
              onChange={(e) => updateNote(activeNote.id, { title: e.target.value })}
              style={{ fontSize: '20px', fontWeight: 700, border: 'none', background: 'transparent', color: 'var(--text-strong)', outline: 'none', marginBottom: '12px' }}
              placeholder="请输入笔记标题..."
            />
            <div style={{ flex: 1, minHeight: '300px' }}>
              <ReactjsTiptapEditor
                content={convertMarkdownToTipTapJson(activeNote.content || '')}
                onChange={(json) => {
                  const md = convertTipTapJsonToMarkdown(json);
                  updateNote(activeNote.id, { content: md });
                }}
              />
            </div>
          </div>
        ) : (
          <div style={{ height: '100%', overflowY: 'auto', padding: '12px 16px' }}>
            {notes.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
                当前清单下暂无笔记，点击右上角“新建笔记”开始书写
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className="mobile-note-card"
                    onClick={() => {
                      triggerHaptic('light');
                      setActiveNoteId(n.id);
                    }}
                    style={{ padding: '14px', borderRadius: '10px', background: 'var(--surface-1)', border: '1px solid rgba(123,145,169,0.12)', cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '4px' }}>
                      {n.title || '未命名笔记'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {n.content ? n.content.slice(0, 100) : '暂无正文内容'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {isDrawerOpen && (
        <div className="mobile-more-backdrop" onClick={() => setIsDrawerOpen(false)}>
          <div className="mobile-more-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
            <div className="mobile-more-handle-bar"><div className="mobile-more-handle" /></div>
            <div className="mobile-more-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px 12px' }}>
              <span className="mobile-more-title" style={{ fontSize: '16px', fontWeight: 600 }}>选择笔记清单</span>
              <button type="button" className="mobile-more-close" onClick={() => setIsDrawerOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
              {rawLists.map((l) => (
                <div
                  key={l.id}
                  onClick={() => handleSelectList(l.id)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', borderRadius: '8px', background: activeListId === l.id ? 'var(--surface-2)' : 'transparent', cursor: 'pointer', marginBottom: '4px' }}
                >
                  <span style={{ fontSize: '14px', fontWeight: activeListId === l.id ? 600 : 400, color: activeListId === l.id ? 'var(--accent)' : 'var(--text-strong)' }}>
                    {l.name}
                  </span>
                  {activeListId === l.id && <Check size={16} color="var(--accent)" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
