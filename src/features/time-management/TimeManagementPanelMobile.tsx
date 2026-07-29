import { useEffect } from 'react';
import { Plus, CheckCircle2, Circle } from 'lucide-react';
import { useTimeStore } from './timeManagementStore';
import { QuadrantType, Task } from './timeManagementTypes';
import { usePreferencesStore } from '../settings/preferencesStore';
import { openQuickEditWindow } from './quickEditWindow';
import { triggerHaptic } from '../../lib/haptics';
import './timeManagement.css';

const QUADRANTS: { id: QuadrantType; title: string; badge: string; color: string }[] = [
  { id: 'Q1', title: '重要且紧急', badge: '❶', color: '#ef4444' },
  { id: 'Q2', title: '重要不紧急', badge: '❷', color: '#f59e0b' },
  { id: 'Q3', title: '不重要但紧急', badge: '❸', color: '#3b82f6' },
  { id: 'Q4', title: '不重要不紧急', badge: '❹', color: '#10b981' },
];

export interface TimeManagementPanelProps {
  mode?: 'daily' | 'weekly';
}

export function TimeManagementPanelMobile(_props?: TimeManagementPanelProps) {
  const { data, updateTask, syncAllFromDB } = useTimeStore();
  const tasks = data.tasks;
  const hideCompleted = usePreferencesStore((s) => s.preferences['tm-hide-completed'] === 'true');

  useEffect(() => {
    syncAllFromDB();
  }, [syncAllFromDB]);

  const handleToggleComplete = (task: Task) => {
    triggerHaptic('medium');
    const isCompleted = !task.completed;
    updateTask(task.id, {
      completed: isCompleted,
      completedAt: isCompleted ? Date.now() : undefined,
    }, false);
  };

  const handleOpenCreateSheet = (defaultQuadrant: QuadrantType = 'Q1') => {
    triggerHaptic('medium');
    const newTask = useTimeStore.getState().addTask('', defaultQuadrant);
    void openQuickEditWindow({
      task: newTask,
      anchorEl: document.body,
      onSave: (taskId, updates, isHighFreq) => updateTask(taskId, updates, isHighFreq),
      onClosed: () => {},
    });
  };

  const handleEditTask = (task: Task, anchor: HTMLElement) => {
    triggerHaptic('light');
    void openQuickEditWindow({
      task,
      anchorEl: anchor,
      onSave: (taskId, updates, isHighFreq) => updateTask(taskId, updates, isHighFreq),
      onClosed: () => {},
    });
  };

  return (
    <section className="tm-panel mobile" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative', background: 'var(--surface-0)' }}>
      {/* 页头 Header */}
      <header style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>四象限</h2>
      </header>

      {/* 2x2 滴答清单风格四象限网格布局 */}
      <main style={{ flex: 1, padding: '0 12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '12px', overflow: 'hidden' }}>
        {QUADRANTS.map((q) => {
          const qTasks = tasks.filter((t) => t.quadrant === q.id && (!hideCompleted || !t.completed));

          return (
            <div
              key={q.id}
              onClick={() => {
                if (qTasks.length === 0) handleOpenCreateSheet(q.id);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--surface-1)',
                borderRadius: '16px',
                padding: '14px 12px',
                border: '1px solid rgba(123, 145, 169, 0.12)',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
                overflow: 'hidden',
              }}
            >
              {/* 卡片标题 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <span style={{ fontSize: '15px', color: q.color, fontWeight: 700 }}>{q.badge}</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: q.color }}>{q.title}</span>
              </div>

              {/* 任务列表或“没有任务”空状态 */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {qTasks.length === 0 ? (
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-faint)',
                      fontSize: '13px',
                      userSelect: 'none',
                    }}
                  >
                    没有任务
                  </div>
                ) : (
                  qTasks.map((t) => (
                    <div
                      key={t.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditTask(t, e.currentTarget);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        cursor: 'pointer',
                        padding: '4px 0',
                      }}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleComplete(t);
                        }}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          padding: 0,
                          color: t.completed ? 'var(--text-muted)' : q.color,
                          marginTop: '2px',
                        }}
                      >
                        {t.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                      </button>
                      <span
                        style={{
                          fontSize: '13.5px',
                          lineHeight: 1.4,
                          color: t.completed ? 'var(--text-muted)' : 'var(--text-strong)',
                          textDecoration: t.completed ? 'line-through' : 'none',
                          wordBreak: 'break-word',
                        }}
                      >
                        {t.title || '未命名任务'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </main>

      {/* 滴答清单风格悬浮圆形新建按钮 (FAB) */}
      <button
        type="button"
        onClick={() => handleOpenCreateSheet('Q1')}
        aria-label="新建任务"
        style={{
          position: 'absolute',
          bottom: '24px',
          right: '20px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          border: 'none',
          background: 'var(--accent, #10b981)',
          color: '#ffffff',
          display: 'grid',
          placeItems: 'center',
          boxShadow: '0 6px 18px rgba(16, 185, 129, 0.35)',
          cursor: 'pointer',
          zIndex: 90,
        }}
      >
        <Plus size={28} />
      </button>
    </section>
  );
}
