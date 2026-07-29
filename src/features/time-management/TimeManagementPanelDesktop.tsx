import React, { useState, useEffect, useRef, memo } from 'react';
import {
  Plus, X,
  ChevronDown, ChevronRight, Calendar as CalendarIcon, Clock,
  CheckCircle2, Circle
} from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import dayjs from 'dayjs';
import 'react-day-picker/dist/style.css';
import { useTimeStore } from './timeManagementStore';
import { QuadrantType, Task } from './timeManagementTypes';
import { WeeklyPlanning } from './WeeklyPlanning';
import { usePreferencesStore } from '../settings/preferencesStore';
import { openQuickEditWindow, requestQuickEditCloseLayer } from './quickEditWindow';
import './timeManagement.css';

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

export const CollapsibleGroup: React.FC<{
  title: string;
  count: number;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  titleColor?: string;
}> = memo(({ title, count, children, defaultExpanded = true, titleColor }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  if (count === 0) return null;

  return (
    <div className="tm-collapsible-group">
      <div
        className="tm-collapsible-header"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 0', cursor: 'pointer', color: titleColor || 'var(--text-faint)', fontSize: '12px' }}
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span style={{ fontWeight: titleColor ? 600 : 500 }}>{title}</span>
        <span style={{ 
          background: titleColor ? `${titleColor}18` : 'rgba(123, 145, 169, 0.1)', 
          padding: '2px 8px', 
          borderRadius: '10px', 
          fontSize: '11px', 
          color: titleColor || 'var(--text-muted)',
          fontWeight: titleColor ? 600 : 400
        }}>{count}</span>
      </div>
      {isExpanded && (
        <div className="tm-collapsible-content" style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '4px', marginTop: '-6px' }}>
          {children}
        </div>
      )}
    </div>
  );
});

export const DateTimePicker: React.FC<{
  value?: number;
  onChange: (value?: number) => void;
}> = memo(({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useClickOutside<HTMLDivElement>(() => setIsOpen(false));

  const selectedDate = value ? new Date(value) : undefined;
  const timeStr = value ? dayjs(selectedDate).format('HH:mm') : '12:00';

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) {
      onChange(undefined);
      return;
    }
    const current = value ? new Date(value) : new Date();
    const hours = current.getHours();
    const minutes = current.getMinutes();
    const newDate = new Date(date);
    newDate.setHours(hours, minutes, 0, 0);
    onChange(newDate.getTime());
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [hoursStr, minutesStr] = e.target.value.split(':');
    const hours = parseInt(hoursStr, 10) || 0;
    const minutes = parseInt(minutesStr, 10) || 0;
    const baseDate = selectedDate || new Date();
    const newDate = new Date(baseDate);
    newDate.setHours(hours, minutes, 0, 0);
    onChange(newDate.getTime());
  };

  return (
    <div className="tm-datetime-picker-container" ref={containerRef} style={{ position: 'relative' }}>
      <div 
        className="tm-datetime-trigger"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          border: '1px solid rgba(123, 145, 169, 0.25)',
          borderRadius: '8px',
          background: 'var(--surface-1)',
          cursor: 'pointer',
          fontSize: '14px',
          color: value ? 'var(--text-strong)' : 'var(--text-faint)',
          minHeight: '42px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CalendarIcon size={16} className="text-muted" />
          <span>{value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '设置截止时间...'}</span>
        </div>
        {value && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(undefined); setIsOpen(false); }}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', color: 'var(--text-muted)' }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {isOpen && (
        <div 
          className="tm-datetime-popover"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 100,
            background: 'var(--surface-0)',
            border: '1px solid rgba(123, 145, 169, 0.2)',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
            padding: '12px',
            minWidth: '280px',
          }}
        >
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleDateSelect}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(123, 145, 169, 0.15)' }}>
            <Clock size={16} className="text-muted" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>时间:</span>
            <input
              type="time"
              value={timeStr}
              onChange={handleTimeChange}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(123, 145, 169, 0.25)',
                background: 'var(--surface-1)',
                color: 'var(--text-strong)',
                fontSize: '13px',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
});

const QUADRANTS: { id: QuadrantType; title: string; subtitle: string; color: string }[] = [
  { id: 'Q1', title: '重要且紧急', subtitle: '危机、紧迫的问题', color: 'var(--red, #ef4444)' },
  { id: 'Q2', title: '重要但不紧急', subtitle: '规划、自我提升、关系建立', color: 'var(--blue, #3b82f6)' },
  { id: 'Q3', title: '紧急但不重要', subtitle: '打扰、某些会议、突发请求', color: 'var(--orange, #f97316)' },
  { id: 'Q4', title: '不重要不紧急', subtitle: '琐事、消遣、琐碎事务', color: 'var(--gray, #6b7280)' },
];

export const DailyQuadrants: React.FC<{
  tasks: Task[];
  onToggleComplete: (task: Task) => void;
  onCreateTask: (quadrant: QuadrantType) => void;
  hideCompleted: boolean;
  onDeleteTask: (id: string) => void;
  onEditTask: (task: Task, anchor: HTMLElement) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>, isHighFreq?: boolean) => void;
}> = memo(({ tasks, onToggleComplete, onCreateTask, hideCompleted, onDeleteTask, onEditTask }) => {
  return (
    <div className="tm-quadrants-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '12px', height: '100%', padding: '12px' }}>
      {QUADRANTS.map((q) => {
        const qTasks = tasks.filter((t) => t.quadrant === q.id && (!hideCompleted || !t.completed));
        const pendingTasks = qTasks.filter((t) => !t.completed);
        const completedTasks = qTasks.filter((t) => t.completed);

        return (
          <div key={q.id} className="tm-quadrant-card" style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface-1)', borderRadius: '12px', border: '1px solid rgba(123,145,169,0.15)', overflow: 'hidden' }}>
            <div className="tm-quadrant-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(123,145,169,0.1)' }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: '14px', color: q.color }}>{q.title}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>({pendingTasks.length})</span>
              </div>
              <button
                type="button"
                className="tm-btn-icon"
                onClick={() => onCreateTask(q.id)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="tm-quadrant-body" style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {pendingTasks.map((t) => (
                <div
                  key={t.id}
                  className="tm-task-row"
                  onClick={(e) => onEditTask(t, e.currentTarget)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}
                >
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggleComplete(t); }}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: 'var(--text-muted)' }}
                  >
                    <Circle size={16} />
                  </button>
                  <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-strong)' }}>{t.title}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDeleteTask(t.id); }}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', color: 'var(--text-muted)' }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {!hideCompleted && completedTasks.length > 0 && (
                <CollapsibleGroup title="已完成" count={completedTasks.length}>
                  {completedTasks.map((t) => (
                    <div key={t.id} className="tm-task-row done" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', opacity: 0.6 }}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onToggleComplete(t); }}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: 'var(--accent)' }}
                      >
                        <CheckCircle2 size={16} />
                      </button>
                      <span style={{ flex: 1, fontSize: '13px', textDecoration: 'line-through' }}>{t.title}</span>
                    </div>
                  ))}
                </CollapsibleGroup>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

export interface TimeManagementPanelProps {
  mode?: 'daily' | 'weekly';
}

export function TimeManagementPanelDesktop({ mode = 'daily' }: TimeManagementPanelProps) {
  const { data, updateTask, deleteTask, syncAllFromDB } = useTimeStore();
  const tasks = data.tasks;
  const tmRoles = data.roles;
  const hideCompleted = usePreferencesStore((s) => s.preferences['tm-hide-completed'] === 'true');

  const [activeTab, setActiveTab] = useState<'daily' | 'weekly'>(mode);
  const [quickEditOpen, setQuickEditOpen] = useState(false);

  useEffect(() => {
    syncAllFromDB();
  }, [syncAllFromDB]);

  const handleToggleComplete = (task: Task) => {
    const isCompleted = !task.completed;
    updateTask(task.id, {
      completed: isCompleted,
      completedAt: isCompleted ? Date.now() : undefined,
    }, false);
  };

  const openTaskQuickCreate = (quadrant: QuadrantType) => {
    const newTask = useTimeStore.getState().addTask('新待办任务', quadrant);
    const anchor = document.activeElement as HTMLElement;
    openTaskQuickEdit(newTask, anchor);
  };

  const openTaskQuickEdit = (task: Task, anchor: HTMLElement) => {
    setQuickEditOpen(true);
    void openQuickEditWindow({
      task,
      anchorEl: anchor,
      onSave: (taskId, updates, isHighFreq) => updateTask(taskId, updates, isHighFreq),
      onClosed: () => setQuickEditOpen(false),
    });
  };

  const handleScheduleTask = (taskId: string, date?: string) => {
    if (date) {
      updateTask(taskId, { scheduledDate: date });
    }
  };

  return (
    <section className="tm-panel desktop" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <header className="tm-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid rgba(123,145,169,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>时间管理</h2>
          <div className="tm-tabs" style={{ display: 'flex', gap: '4px', background: 'var(--surface-1)', padding: '3px', borderRadius: '8px' }}>
            <button
              type="button"
              className={`tm-tab-btn ${activeTab === 'daily' ? 'active' : ''}`}
              onClick={() => setActiveTab('daily')}
              style={{ border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
            >
              四象限
            </button>
            <button
              type="button"
              className={`tm-tab-btn ${activeTab === 'weekly' ? 'active' : ''}`}
              onClick={() => setActiveTab('weekly')}
              style={{ border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
            >
              周计划
            </button>
          </div>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {activeTab === 'weekly' ? (
            <WeeklyPlanning
              roles={tmRoles}
              tasks={tasks}
              onScheduleTask={handleScheduleTask}
              hideCompleted={hideCompleted}
              onDeleteTask={deleteTask}
              onEditTask={(task) => openTaskQuickEdit(task, document.body)}
            />
          ) : (
            <DailyQuadrants
              tasks={tasks}
              onToggleComplete={handleToggleComplete}
              onCreateTask={openTaskQuickCreate}
              hideCompleted={hideCompleted}
              onDeleteTask={deleteTask}
              onEditTask={openTaskQuickEdit}
              onUpdateTask={(taskId, updates, isHighFreq) => updateTask(taskId, updates, isHighFreq)}
            />
          )}
        </main>
      </div>

      {quickEditOpen && (
        <div
          className="tqe-mask"
          onMouseDown={requestQuickEditCloseLayer}
          aria-hidden
        />
      )}
    </section>
  );
}
