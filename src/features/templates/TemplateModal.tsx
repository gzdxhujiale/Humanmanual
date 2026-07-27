import React, { useState } from 'react';
import { Template, getTemplatePreviewText } from './templateTypes';
import { X, Edit2, Trash2 } from 'lucide-react';
import ReactjsTiptapEditor from '../reactjs-tiptap-v1/components/Editor/Editor';
import { useConfirmDialog, ConfirmDeleteDialog } from '../../components/ui/ConfirmDeleteDialog';

// ==========================================
// 1. ConfirmBubble Component
// ==========================================
interface ConfirmBubbleProps {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const ConfirmBubble: React.FC<ConfirmBubbleProps> = ({
  isOpen,
  message,
  onConfirm,
  onCancel,
  children,
}) => {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {children}
      <ConfirmDeleteDialog
        isOpen={isOpen}
        title="确认删除"
        description={message}
        confirmText="确定"
        cancelText="取消"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </div>
  );
};

// ==========================================
// 2. TemplateModal Component
// ==========================================
interface TemplateModalProps {
  templates: Template[];
  onSelect: (template: Template) => void;
  onClose: () => void;
  onEdit?: (id: string, name: string, content: string) => void;
  onDelete?: (id: string) => void;
}

export function TemplateModal({ templates, onSelect, onClose, onEdit, onDelete }: TemplateModalProps) {
  const { confirm: confirmDelete } = useConfirmDialog();
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    getTemplatePreviewText(t.content).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const startEdit = (e: React.MouseEvent, tpl: Template) => {
    e.stopPropagation();
    setEditingTemplate(tpl);
    setEditName(tpl.name);
    setEditContent(tpl.content);
  };

  const saveEdit = () => {
    if (editingTemplate && onEdit) {
      onEdit(editingTemplate.id, editName, editContent);
    }
    setEditingTemplate(null);
  };

  return (
    <div 
      className="list-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="list-modal-content" style={{ width: '700px', maxWidth: '95vw' }}>
        <div className="list-modal-header" style={{ padding: '24px 32px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>笔记模板</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {!editingTemplate && (
              <div className="search-box" style={{ margin: 0, width: '200px' }}>
                <input 
                  type="text" 
                  placeholder="搜索..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            )}
            <X size={20} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={onClose} />
          </div>
        </div>
        
        <div 
          className="list-modal-body" 
          style={{ 
            padding: '0 32px 24px', 
            overflowY: editingTemplate ? 'visible' : 'auto', 
            maxHeight: editingTemplate ? 'none' : '60vh' 
          }}
        >
          {editingTemplate ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input 
                value={editName} 
                onChange={e => setEditName(e.target.value)} 
                placeholder="模板名称" 
                style={{ fontSize: '16px', fontWeight: 'bold', padding: '8px', border: '1px solid var(--line-soft)', borderRadius: '4px' }}
              />
              <div style={{ height: '380px', display: 'flex', flexDirection: 'column', border: '1px solid var(--line-soft)', borderRadius: '6px', position: 'relative' }}>
                <ReactjsTiptapEditor
                  key={editingTemplate.id}
                  initialContent={editContent}
                  onChange={setEditContent}
                  className="template-reactjs-tiptap"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button className="list-modal-btn" onClick={() => setEditingTemplate(null)}>取消</button>
                <button className="list-modal-btn primary" onClick={saveEdit}>保存</button>
              </div>
            </div>
          ) : (
            <div className="template-grid">
              {filteredTemplates.map(tpl => (
                <div key={tpl.id} className="template-card" onClick={() => onSelect(tpl)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div className="template-card-title">{tpl.name}</div>
                    <div className="template-card-actions" onClick={e => e.stopPropagation()}>
                      <div className="template-action-btn" onClick={(e) => startEdit(e, tpl)}>
                        <Edit2 size={14} />
                      </div>
                      <div
                        className="template-action-btn danger"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const confirmed = await confirmDelete({
                            title: '删除模板',
                            description: `确定要删除模板 "${tpl.name}" 吗？`,
                            confirmText: '删除',
                          });
                          if (confirmed && onDelete) {
                            onDelete(tpl.id);
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </div>
                    </div>
                  </div>
                  <div className="template-card-preview">
                    {getTemplatePreviewText(tpl.content)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
