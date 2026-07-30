import { useState, useEffect } from 'react';
import { Sidebar, ExternalLink, Check } from 'lucide-react';
import { getNoteOpenMode, setNoteOpenMode, NoteOpenMode } from '../../lists/noteOpenService';

export function ListSettingsPanel() {
  const [openMode, setOpenMode] = useState<NoteOpenMode>('sidebar');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    setOpenMode(getNoteOpenMode());
  }, []);

  const handleSelectMode = async (mode: NoteOpenMode) => {
    setOpenMode(mode);
    try {
      await setNoteOpenMode(mode);
      setSaveMessage(`已更新为：${mode === 'sidebar' ? '侧边栏弹出' : '新窗口弹出'}`);
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (e) {
      console.error('Failed to save note open mode:', e);
      setSaveMessage('保存配置失败');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '8px 0' }}>
      <div>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong, #111827)', marginBottom: '6px' }}>
          笔记弹出方式
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted, #6b7280)', marginBottom: '16px', lineHeight: '1.5' }}>
          控制在清单界面点击笔记时的展示形态。设置将实时同步至本地 SQLite 数据库与远端 Turso 数据库。
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '520px' }}>
          {/* Sidebar option */}
          <div
            onClick={() => handleSelectMode('sidebar')}
            style={{
              border: `2px solid ${openMode === 'sidebar' ? 'var(--primary-color, #3b82f6)' : 'var(--line-soft, #e5e7eb)'}`,
              background: openMode === 'sidebar' ? 'rgba(59, 130, 246, 0.04)' : 'var(--bg-app, #f9fafb)',
              borderRadius: '8px',
              padding: '16px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Sidebar size={22} color={openMode === 'sidebar' ? 'var(--primary-color, #3b82f6)' : '#6b7280'} />
              {openMode === 'sidebar' && (
                <span style={{ color: 'var(--primary-color, #3b82f6)' }}>
                  <Check size={18} />
                </span>
              )}
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong, #111827)' }}>
                侧边栏弹出 (默认)
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted, #6b7280)', marginTop: '4px' }}>
                在应用右侧滑出抽屉面板编辑笔记
              </div>
            </div>
          </div>

          {/* Window option */}
          <div
            onClick={() => handleSelectMode('window')}
            style={{
              border: `2px solid ${openMode === 'window' ? 'var(--primary-color, #3b82f6)' : 'var(--line-soft, #e5e7eb)'}`,
              background: openMode === 'window' ? 'rgba(59, 130, 246, 0.04)' : 'var(--bg-app, #f9fafb)',
              borderRadius: '8px',
              padding: '16px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <ExternalLink size={22} color={openMode === 'window' ? 'var(--primary-color, #3b82f6)' : '#6b7280'} />
              {openMode === 'window' && (
                <span style={{ color: 'var(--primary-color, #3b82f6)' }}>
                  <Check size={18} />
                </span>
              )}
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong, #111827)' }}>
                新独立窗口弹出
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted, #6b7280)', marginTop: '4px' }}>
                在新独立的操作系统窗口中编辑笔记
              </div>
            </div>
          </div>
        </div>

        {saveMessage && (
          <div style={{ marginTop: '12px', fontSize: '13px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Check size={16} />
            <span>{saveMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
