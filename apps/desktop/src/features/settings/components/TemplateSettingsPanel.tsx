import { useState } from 'react';
import { Plus, Search, Edit2, Trash2, ArrowLeft } from 'lucide-react';
import { useTemplateStore, Template, getTemplatePreviewText } from '../../templates';
import { ReactjsTiptapEditor } from '../../reactjs-tiptap-v1';
import { useConfirmDialog } from '../../../components/ui/ConfirmDeleteDialog';

export function TemplateSettingsPanel() {
  const templates = useTemplateStore((state) => state.templates);
  const addTemplate = useTemplateStore((state) => state.addTemplate);
  const updateTemplate = useTemplateStore((state) => state.updateTemplate);
  const deleteTemplate = useTemplateStore((state) => state.deleteTemplate);
  const { confirm: confirmDelete } = useConfirmDialog();

  const [searchQuery, setSearchQuery] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');

  const filteredTemplates = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getTemplatePreviewText(t.content).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleStartCreate = () => {
    setIsCreating(true);
    setEditingTemplate(null);
    setEditName('');
    const defaultDoc = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
    setEditContent(defaultDoc);
  };

  const handleStartEdit = (tpl: Template) => {
    setEditingTemplate(tpl);
    setIsCreating(false);
    setEditName(tpl.name);
    setEditContent(tpl.content);
  };

  const handleCancelEdit = () => {
    setEditingTemplate(null);
    setIsCreating(false);
    setEditName('');
    setEditContent('');
  };

  const handleSave = () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      alert('请输入模板名称');
      return;
    }

    if (isCreating) {
      addTemplate(trimmedName, editContent);
    } else if (editingTemplate) {
      updateTemplate(editingTemplate.id, {
        name: trimmedName,
        content: editContent,
      });
    }

    handleCancelEdit();
  };

  if (isCreating || editingTemplate) {
    return (
      <div className="template-settings-panel template-edit-view">
        <div className="template-edit-header">
          <button className="template-back-btn" onClick={handleCancelEdit} type="button">
            <ArrowLeft size={16} />
            <span>返回列表</span>
          </button>
          <span className="template-edit-title">
            {isCreating ? '新建模板' : `编辑模板: ${editingTemplate?.name}`}
          </span>
        </div>

        <div className="template-edit-form">
          <div className="template-input-group">
            <label className="template-input-label">模板名称</label>
            <input
              type="text"
              className="template-name-input"
              placeholder="请输入模板名称"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="template-input-group editor-group">
            <label className="template-input-label">模板内容</label>
            <div className="template-editor-container">
              <ReactjsTiptapEditor
                key={isCreating ? 'new' : editingTemplate?.id}
                initialContent={editContent}
                onChange={setEditContent}
                className="template-reactjs-tiptap"
              />
            </div>
          </div>

          <div className="template-edit-actions">
            <button className="secondary-button" type="button" onClick={handleCancelEdit}>
              取消
            </button>
            <button className="primary-button" type="button" onClick={handleSave}>
              保存模板
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="template-settings-panel">
      <div className="template-toolbar">
        <div className="template-search-wrapper">
          <Search size={15} className="template-search-icon" />
          <input
            type="text"
            className="template-search-input"
            placeholder="搜索模板名称或内容..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <button className="primary-button create-template-btn" onClick={handleStartCreate} type="button">
          <Plus size={16} />
          <span>新建模板</span>
        </button>
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="template-empty-state">
          <p>{searchQuery ? '未找到符合条件的模板' : '暂无模板，点击右上角新建模板'}</p>
        </div>
      ) : (
        <div className="template-settings-grid">
          {filteredTemplates.map((tpl) => (
            <div key={tpl.id} className="template-settings-card" onClick={() => handleStartEdit(tpl)}>
              <div className="template-card-header">
                <span className="template-card-name" title={tpl.name}>
                  {tpl.name}
                </span>
                <div className="template-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="template-action-btn"
                    title="编辑"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit(tpl);
                    }}
                    type="button"
                  >
                    <Edit2 size={14} />
                  </button>

                  <button
                    className="template-action-btn danger"
                    title="删除"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const confirmed = await confirmDelete({
                        title: '删除模板',
                        description: `确定要删除模板 "${tpl.name}" 吗？`,
                        confirmText: '删除',
                      });
                      if (confirmed) {
                        deleteTemplate(tpl.id);
                      }
                    }}
                    type="button"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="template-card-preview-text">
                {getTemplatePreviewText(tpl.content) || <span className="empty-text">无文本内容</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
