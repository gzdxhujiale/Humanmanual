import { useState, useEffect } from 'react';
import { Plus, CheckCircle2, Circle } from 'lucide-react';
import { useTimeStore } from './timeManagementStore';
import { QuadrantType, Task } from './timeManagementTypes';
import { usePreferencesStore } from '../settings/preferencesStore';
import { openQuickEditWindow } from './quickEditWindow';
import { triggerHaptic } from '../../lib/haptics';
import './timeManagement.css';

const QUADRANTS: { id: QuadrantType; title: string; color: string }[] = [
  { id: 'Q1', title: '重要·紧急', color: 'var(--red, #ef4444)' },
  { id: 'Q2', title: '重要·不紧急', color: 'var(--blue, #3b82f6)' },
  { id: 'Q3', title: '紧急·不重要', color: 'var(--orange, #f97316)' },
  { id: 'Q4', title: '不重要·不紧急', color: 'var(--gray, #6b7280)' },
];

export interface TimeManagementPanelProps {
  mode?: 'daily' | 'weekly';
}

export function TimeManagementPanelMobile({ mode = 'daily' }: TimeManagementPanelProps) {
  const { data, updateTask, syncAllFromDB } = useTimeStore();
  const tasks = data.tasks;
  const hideCompleted = usePreferencesStore((s) => s.preferences['tm-hide-completed'] === 'true');

  const [activeTab, setActiveTab] = useState<'daily' | 'weekly'>(mode);
  const [selectedQuadrant, setSelectedQuadrant] = useState<QuadrantType>('Q1');

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

  const handleCreateTask = (quadrant: QuadrantType) => {
    triggerHaptic('light');
    const newTask = useTimeStore.getState().addTask('新待办任务', quadrant);
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

  const filteredTasks = tasks.filter(
    (t) => t.quadrant === selectedQuadrant && (!hideCompleted || !t.completed)
  );

  return (
    <section className="tm-panel mobile" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <header className="tm-header mobile-tm-header" style={{ padding: '12px 16px', borderBottom: '1px solid rgba(123,145,169,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>四象限待办</h2>
          <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-1)', padding: '2px', borderRadius: '8px' }}>
            <button
              type="button"
              className={`tm-tab-btn ${activeTab === 'daily' ? 'active' : ''}`}
              onClick={() => {
                triggerHaptic('light');
                setActiveTab('daily');
              }}
              style={{ border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
            >
              象限
            </button>
            <button
              type="button"
              className={`tm-tab-btn ${activeTab === 'weekly' ? 'active' : ''}`}
              onClick={() => {
                triggerHaptic('light');
                setActiveTab('weekly');
              }}
              style={{ border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
            >
              列表
            </button>
          </div>
        </div>

        {activeTab === 'daily' && (
          <div className="mobile-quadrant-selector" style={{ display: 'flex', gap: '6px', marginTop: '12px', overflowX: 'auto' }}>
            {QUADRANTS.map((q) => {
              const count = tasks.filter((t) => t.quadrant === q.id && !t.completed).length;
              const isSelected = selectedQuadrant === q.id;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setSelectedQuadrant(q.id);
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 6px',
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: isSelected ? q.color : 'transparent',
                    background: isSelected ? `${q.color}15` : 'var(--surface-1)',
                    color: isSelected ? q.color : 'var(--text-muted)',
                    fontWeight: isSelected ? 600 : 400,
                    fontSize: '12px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {q.title} ({count})
                </button>
              );
            })}
          </div>
        )}
      </header>

      <main style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
            {QUADRANTS.find((q) => q.id === selectedQuadrant)?.title} ({filteredTasks.length})
          </span>
          <button
            type="button"
            className="mobile-add-task-btn"
            onClick={() => handleCreateTask(selectedQuadrant)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Plus size={14} /> 新建任务
          </button>
        </div>

        {filteredTasks.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            该象限暂无待办任务
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredTasks.map((t) => (
              <div
                key={t.id}
                className={`tm-task-row mobile-task-row ${t.completed ? 'done' : ''}`}
                onClick={(e) => handleEditTask(t, e.currentTarget)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'var(--surface-1)',
                  border: '1px solid rgba(123,145,169,0.12)',
                  minHeight: '48px',
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleComplete(t);
                  }}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: t.completed ? 'var(--accent)' : 'var(--text-muted)' }}
                >
                  {t.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                </button>
                <span
                  style={{
                    flex: 1,
                    fontSize: '14px',
                    color: t.completed ? 'var(--text-muted)' : 'var(--text-strong)',
                    textDecoration: t.completed ? 'line-through' : 'none',
                  }}
                >
                  {t.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </section>
  );
}
