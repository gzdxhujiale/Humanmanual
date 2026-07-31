import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import {
  Plus, GripVertical, User, X, MoreHorizontal,
  ChevronDown, ChevronRight, Calendar as CalendarIcon, Clock,
  AlignLeft, CheckCircle2, Circle
} from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import dayjs from 'dayjs';
import 'react-day-picker/dist/style.css';
import { useTimeManagementData, useTaskActions } from './useTimeManagementQuery';
import { QuadrantType, Task, Role } from './timeManagementTypes';
import { WeeklyPlanning } from './WeeklyPlanning';
import { usePreferencesStore } from '../settings/preferencesStore';
import { todayYMD } from '../../lib/dateUtils';
import { openQuickEditWindow, requestQuickEditCloseLayer } from './quickEditWindow';
import './timeManagement.css';

const checkJsonEmpty = (val?: string): boolean => {
  if (!val) return true;
  const trimmed = val.trim();
  if (!trimmed || trimmed === '{}') return true;
  try {
    const json = JSON.parse(trimmed);
    if (!json.content || !Array.isArray(json.content) || json.content.length === 0) return true;
    if (json.content.length === 1) {
      const p = json.content[0];
      if (p.type === 'paragraph' && (!p.content || p.content.length === 0)) return true;
    }
    return false;
  } catch {
    return false;
  }
};

// Stable empty-array references so query-cache misses don't create new arrays each render
const EMPTY_TASKS: Task[] = [];
const EMPTY_ROLES: Role[] = [];

// ==========================================
// 0. Shared Helpers & Custom Hooks
// ==========================================
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

// ==========================================
// 1. CollapsibleGroup Component
// ==========================================
interface CollapsibleGroupProps {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  titleColor?: string;
}

export const CollapsibleGroup: React.FC<CollapsibleGroupProps> = memo(({
  title,
  count,
  children,
  defaultExpanded = true,
  titleColor,
}) => {
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

// ==========================================
// 3. DateTimePicker Component
// ==========================================
interface DateTimePickerProps {
  value?: number;
  onChange: (value?: number) => void;
}

export const DateTimePicker: React.FC<DateTimePickerProps> = memo(({ value, onChange }) => {
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

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(undefined);
    setIsOpen(false);
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
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CalendarIcon size={16} style={{ color: 'var(--text-muted)' }} />
          <span>
            {value ? dayjs(selectedDate).format('YYYY-MM-DD HH:mm') : '选择截止日期时间...'}
          </span>
        </div>
        {value && (
          <button 
            type="button" 
            onClick={handleClear} 
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', color: 'var(--text-faint)' }}
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
            zIndex: 1001,
            background: '#ffffff',
            border: '1px solid rgba(123, 145, 169, 0.2)',
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 16px -6px rgba(0, 0, 0, 0.05)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div className="tm-daypicker-wrapper">
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
            />
          </div>

          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              borderTop: '1px solid rgba(123, 145, 169, 0.1)', 
              paddingTop: '12px',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-primary)' }}>
              <Clock size={14} style={{ color: 'var(--text-muted)' }} />
              <span>具体时间</span>
            </div>
            <input 
              type="time" 
              value={timeStr}
              onChange={handleTimeChange}
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(123, 145, 169, 0.2)',
                outline: 'none',
                fontSize: '13px',
                color: 'var(--text-strong)',
                background: 'var(--surface-1)'
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
});

// ==========================================
// 4. DailyQuadrants Component
// ==========================================
interface DailyQuadrantsProps {
  tasks: Task[];
  onToggleComplete: (taskId: string) => void;
  /** 点击象限加号：在子窗口中打开快捷新建浮层 */
  onCreateTask: (quadrant: QuadrantType, anchor: HTMLElement) => void;
  hideCompleted: boolean;
  onDeleteTask: (taskId: string) => void;
  onEditTask: (task: Task, anchor: HTMLElement) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
}

const quadrantConfig: Record<QuadrantType, { title: string; desc: string; color: string; bgColor: string }> = {
  Q1: { title: '重要且紧急', desc: '危机、急迫的问题', color: '#d32f2f', bgColor: '#fef2f2' },
  Q2: { title: '重要不紧急', desc: '计划、预防、要事', color: '#25845a', bgColor: '#f0fdf4' },
  Q3: { title: '紧急不重要', desc: '干扰、某些会议', color: '#d97706', bgColor: '#fffbeb' },
  Q4: { title: '不重要不紧急', desc: '琐事、消遣', color: '#697381', bgColor: '#f8fafc' },
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getDeadlineGroup(deadline: number | undefined, now: number): string {
  if (!deadline) return '无日期';
  if (deadline < now) return '已过期';
  const diffDays = (deadline - now) / MS_PER_DAY;
  if (diffDays <= 1) return '一天内';
  if (diffDays <= 3) return '三天内';
  if (diffDays <= 7) return '一周内';
  return '一周外';
}

function getDefaultDeadlineForGroup(groupName: string, now: number): number | undefined {
  if (groupName === '已过期') {
    return now - 3600 * 1000;
  }
  if (groupName === '一天内') {
    const d = new Date(now + MS_PER_DAY);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }
  if (groupName === '三天内') {
    const d = new Date(now + 3 * MS_PER_DAY);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }
  if (groupName === '一周内') {
    const d = new Date(now + 7 * MS_PER_DAY);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }
  if (groupName === '一周外') {
    const d = new Date(now + 8 * MS_PER_DAY);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }
  return undefined;
}

export const DailyQuadrants: React.FC<DailyQuadrantsProps> = memo(({
  tasks,
  onToggleComplete,
  onCreateTask,
  hideCompleted,
  onDeleteTask,
  onEditTask,
  onUpdateTask,
}) => {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'top' | 'bottom' | null>(null);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/tm-task-id', taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetQuadrant: QuadrantType) => {
    e.preventDefault();
    e.stopPropagation();
    const taskId = e.dataTransfer.getData('application/tm-task-id') || draggedTaskId;
    setDraggedTaskId(null);
    setDragOverTaskId(null);
    setDropPosition(null);
    
    if (taskId) {
      onUpdateTask(taskId, { quadrant: targetQuadrant });
    }
  };

  const handleDragOverTask = (e: React.DragEvent, taskId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (taskId === draggedTaskId) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const position = relativeY > rect.height / 2 ? 'bottom' : 'top';
    
    setDragOverTaskId(taskId);
    setDropPosition(position);
  };

  const handleDragLeaveTask = () => {
    setDragOverTaskId(null);
    setDropPosition(null);
  };

  const handleDropOnTask = (e: React.DragEvent, targetTask: Task) => {
    e.preventDefault();
    e.stopPropagation();
    
    const taskId = e.dataTransfer.getData('application/tm-task-id') || draggedTaskId;
    setDragOverTaskId(null);
    setDropPosition(null);
    setDraggedTaskId(null);
    
    if (!taskId || taskId === targetTask.id) return;

    const targetQTasks = tasks.filter(t => t.quadrant === targetTask.quadrant);
    const filteredTasks = hideCompleted ? targetQTasks.filter(t => !t.completed) : targetQTasks;
    
    const now = Date.now();
    const targetGroup = getDeadlineGroup(targetTask.deadline, now);
    
    const sameGroupTasks = [...filteredTasks].filter(t => 
      t.completed === targetTask.completed && 
      getDeadlineGroup(t.deadline, now) === targetGroup &&
      t.id !== taskId
    ).sort((a, b) => b.createdAt - a.createdAt);

    const yIndex = sameGroupTasks.findIndex(t => t.id === targetTask.id);
    if (yIndex === -1) return;

    let newCreatedAt = targetTask.createdAt;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const isBelow = relativeY > rect.height / 2;

    if (!isBelow) {
      if (yIndex === 0) {
        newCreatedAt = targetTask.createdAt + 1000;
      } else {
        const prevTask = sameGroupTasks[yIndex - 1];
        newCreatedAt = Math.round((prevTask.createdAt + targetTask.createdAt) / 2);
      }
    } else {
      if (yIndex === sameGroupTasks.length - 1) {
        newCreatedAt = targetTask.createdAt - 1000;
      } else {
        const nextTask = sameGroupTasks[yIndex + 1];
        newCreatedAt = Math.round((targetTask.createdAt + nextTask.createdAt) / 2);
      }
    }

    onUpdateTask(taskId, {
      quadrant: targetTask.quadrant,
      deadline: targetTask.deadline,
      createdAt: newCreatedAt
    });
  };

  const handleDropOnGroup = (e: React.DragEvent, targetQuadrant: QuadrantType, groupName: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const taskId = e.dataTransfer.getData('application/tm-task-id') || draggedTaskId;
    setDraggedTaskId(null);
    setDragOverTaskId(null);
    setDropPosition(null);
    
    if (!taskId) return;
    
    const taskObj = tasks.find(t => t.id === taskId);
    if (!taskObj) return;

    const now = Date.now();
    const targetDeadline = getDefaultDeadlineForGroup(groupName, now);

    const targetQTasks = tasks.filter(t => t.quadrant === targetQuadrant);
    const filteredTasks = hideCompleted ? targetQTasks.filter(t => !t.completed) : targetQTasks;
    const sameGroupTasks = filteredTasks.filter(t => 
      t.completed === taskObj.completed && 
      getDeadlineGroup(t.deadline, now) === groupName &&
      t.id !== taskId
    );

    let newCreatedAt = Date.now();
    if (sameGroupTasks.length > 0) {
      newCreatedAt = Math.max(...sameGroupTasks.map(t => t.createdAt)) + 1000;
    }

    onUpdateTask(taskId, {
      quadrant: targetQuadrant,
      deadline: targetDeadline,
      createdAt: newCreatedAt
    });
  };

  const renderTasks = (taskList: Task[], color: string) => {
    const now = Date.now();
    return taskList.map(task => {
      const isHovered = dragOverTaskId === task.id;
      const isExpired = task.deadline && task.deadline < now && !task.completed;
      const hasContent = !checkJsonEmpty(task.description);
      return (
        <div 
          key={task.id} 
          className={`tm-task-item-minimal ${task.completed ? 'completed' : ''}`}
          draggable
          onDragStart={(e) => handleDragStart(e, task.id)}
          onDragOver={(e) => handleDragOverTask(e, task.id)}
          onDragLeave={handleDragLeaveTask}
          onDrop={(e) => handleDropOnTask(e, task)}
          onClick={(e) => onEditTask(task, e.currentTarget)}
          style={{
            borderTop: isHovered && dropPosition === 'top' ? '2px solid var(--accent, #1f6fd1)' : undefined,
            borderBottom: isHovered && dropPosition === 'bottom' ? '2px solid var(--accent, #1f6fd1)' : undefined,
            paddingTop: isHovered && dropPosition === 'top' ? '4px' : undefined,
            paddingBottom: isHovered && dropPosition === 'bottom' ? '4px' : undefined,
          }}
        >
          <button 
            className="tm-task-checkbox" 
            onClick={(e) => { e.stopPropagation(); onToggleComplete(task.id); }}
            type="button"
          >
            {task.completed ? <CheckCircle2 size={16} color={color} /> : <Circle size={16} />}
          </button>
          <div className="tm-task-content-wrapper" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '4px', minWidth: 0 }}>
            <span className="tm-task-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
            {isExpired && (
              <span
                className="tm-overdue-tag"
                onClick={(e) => {
                  e.stopPropagation();
                  const today = new Date();
                  today.setHours(23, 59, 59, 999);
                  onUpdateTask(task.id, {
                    deadline: today.getTime(),
                    scheduledDate: todayYMD(),
                  });
                }}
                title="点击延期至今日"
                style={{
                  fontSize: '10px',
                  color: '#dc2626',
                  backgroundColor: '#fef2f2',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  border: '1px solid #fca5a5',
                  flexShrink: 0,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  userSelect: 'none',
                }}
                onMouseEnter={(e) => {
                  const target = e.currentTarget;
                  target.textContent = '延期';
                  target.style.backgroundColor = '#dc2626';
                  target.style.color = '#ffffff';
                  target.style.borderColor = '#dc2626';
                }}
                onMouseLeave={(e) => {
                  const target = e.currentTarget;
                  target.textContent = '已过期';
                  target.style.backgroundColor = '#fef2f2';
                  target.style.color = '#dc2626';
                  target.style.borderColor = '#fca5a5';
                }}
              >
                已过期
              </span>
            )}
          </div>
          <div className="tm-task-right-action">
            {hasContent && (
              <span className="tm-task-detail-icon" title="包含任务详情">
                <AlignLeft size={14} />
              </span>
            )}
            <button 
              className="icon-button tm-task-delete-btn" 
              onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); }}
              title="删除任务"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      );
    });
  };

  const renderQuadrant = (type: QuadrantType) => {
    const config = quadrantConfig[type];
    let qTasks = tasks.filter(t => t.quadrant === type);
    
    if (hideCompleted) {
      qTasks = qTasks.filter(t => !t.completed);
    }
    
    const sortedTasks = [...qTasks].sort((a, b) => {
      if (a.completed === b.completed) return b.createdAt - a.createdAt;
      return a.completed ? 1 : -1;
    });

    const now = Date.now();

    const expired: Task[] = [];
    const noDate: Task[] = [];
    const within1Day: Task[] = [];
    const within3Days: Task[] = [];
    const within1Week: Task[] = [];
    const beyond1Week: Task[] = [];

    sortedTasks.forEach(t => {
      if (!t.deadline) {
        noDate.push(t);
      } else if (t.deadline < now) {
        expired.push(t);
      } else {
        const diffDays = (t.deadline - now) / MS_PER_DAY;
        if (diffDays <= 1) within1Day.push(t);
        else if (diffDays <= 3) within3Days.push(t);
        else if (diffDays <= 7) within1Week.push(t);
        else beyond1Week.push(t);
      }
    });

    return (
      <div 
        key={type}
        className={`quadrant-box quadrant-${type.toLowerCase()}`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDrop={(e) => handleDrop(e, type)}
      >
        <div className="quadrant-header">
          <div className="quadrant-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ background: config.color, color: '#fff', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>{type[1]}</div>
            <h3 style={{ color: config.color }}>{config.title}</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              onClick={(e) => onCreateTask(type, e.currentTarget)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-strong)' }}
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
        
        <div className="quadrant-task-list">
          {expired.length > 0 && (
            <div onDragOver={handleDragOver} onDrop={(e) => handleDropOnGroup(e, type, '已过期')}>
              <CollapsibleGroup title="已过期" count={expired.length} titleColor="#d32f2f">
                {renderTasks(expired, config.color)}
              </CollapsibleGroup>
            </div>
          )}
          {within1Day.length > 0 && (
            <div onDragOver={handleDragOver} onDrop={(e) => handleDropOnGroup(e, type, '一天内')}>
              <CollapsibleGroup title="一天内" count={within1Day.length}>
                {renderTasks(within1Day, config.color)}
              </CollapsibleGroup>
            </div>
          )}
          {within3Days.length > 0 && (
            <div onDragOver={handleDragOver} onDrop={(e) => handleDropOnGroup(e, type, '三天内')}>
              <CollapsibleGroup title="三天内" count={within3Days.length}>
                {renderTasks(within3Days, config.color)}
              </CollapsibleGroup>
            </div>
          )}
          {within1Week.length > 0 && (
            <div onDragOver={handleDragOver} onDrop={(e) => handleDropOnGroup(e, type, '一周内')}>
              <CollapsibleGroup title="一周内" count={within1Week.length}>
                {renderTasks(within1Week, config.color)}
              </CollapsibleGroup>
            </div>
          )}
          {beyond1Week.length > 0 && (
            <div onDragOver={handleDragOver} onDrop={(e) => handleDropOnGroup(e, type, '一周外')}>
              <CollapsibleGroup title="一周外" count={beyond1Week.length}>
                {renderTasks(beyond1Week, config.color)}
              </CollapsibleGroup>
            </div>
          )}
          {noDate.length > 0 && (
            <div onDragOver={handleDragOver} onDrop={(e) => handleDropOnGroup(e, type, '无日期')}>
              <CollapsibleGroup title="无日期" count={noDate.length}>
                {renderTasks(noDate, config.color)}
              </CollapsibleGroup>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="daily-quadrants-layout">
      {renderQuadrant('Q1')}
      {renderQuadrant('Q2')}
      {renderQuadrant('Q3')}
      {renderQuadrant('Q4')}
    </div>
  );
});

// ==========================================
// 6. TimeManagementPanel Main Component
// ==========================================
export interface TimeManagementPanelProps {
  mode?: 'weekly' | 'daily';
}

export function TimeManagementPanel({ mode = 'weekly' }: TimeManagementPanelProps) {
  const activeTab = mode;

  const { data: tmData } = useTimeManagementData();
  const roles = tmData?.roles ?? EMPTY_ROLES;
  const tasks = tmData?.tasks ?? EMPTY_TASKS;

  const { addTask, updateTask, deleteTask } = useTaskActions();

  const hideCompletedStr = usePreferencesStore(state => state.getPreference('tm-hide-completed', 'false'));
  const hideCompleted = hideCompletedStr === 'true';
  const setPreference = usePreferencesStore(state => state.setPreference);
  const setHideCompleted = (val: boolean) => setPreference('tm-hide-completed', String(val));

  const [quickEditOpen, setQuickEditOpen] = useState(false);
  const [draftTasks, setDraftTasks] = useState<Record<string, string>>({});
  const [menuOpen, setMenuOpen] = useState(false);

  const menuRef = useClickOutside<HTMLDivElement>(() => setMenuOpen(false));

  useEffect(() => {
    if (tasks.length === 0) return;

    const todayStr = todayYMD();
    const toUpdate = tasks.filter(
      t => t.scheduledDate === todayStr && !t.completed && t.quadrant !== 'Q2' && t.quadrant !== 'Q1'
    );

    if (toUpdate.length > 0) {
      toUpdate.forEach(t => {
        updateTask(t.id, { quadrant: 'Q2' }, false);
      });
    }
  }, [tasks, updateTask]);

  const handleToggleComplete = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const isCompleted = !task.completed;
    updateTask(taskId, {
      completed: isCompleted,
      completedAt: isCompleted ? Date.now() : undefined
    }, false);
  };

  const handleAddTaskToQuadrant = (title: string, quadrant: QuadrantType, extras?: { deadline?: number; scheduledDate?: string; reminder?: string; description?: string }) => {
    const task = addTask(title, quadrant, extras?.scheduledDate);
    const updates: Partial<Task> = {};
    if (extras?.deadline) updates.deadline = extras.deadline;
    if (extras?.scheduledDate) updates.scheduledDate = extras.scheduledDate;
    if (extras?.reminder) updates.reminder = extras.reminder;
    if (extras?.description) updates.description = extras.description;
    if (Object.keys(updates).length > 0) {
      updateTask(task.id, updates, false);
    }
  };

  // 快捷编辑/新建：在透明置顶子窗口中打开浮层，主窗口只留蒙版
  const openTaskQuickEdit = (task: Task, anchor: HTMLElement) => {
    setQuickEditOpen(true);
    void openQuickEditWindow({
      task,
      anchorEl: anchor,
      onSave: (taskId, updates, isHighFreq) => updateTask(taskId, updates, isHighFreq),
      onClosed: () => setQuickEditOpen(false),
    });
  };

  const openTaskQuickCreate = (quadrant: QuadrantType, anchor: HTMLElement) => {
    setQuickEditOpen(true);
    void openQuickEditWindow({
      quadrant,
      anchorEl: anchor,
      onCreate: (q, draft) => handleAddTaskToQuadrant(draft.title, q, draft),
      onClosed: () => setQuickEditOpen(false),
    });
  };

  const handleAddTaskToRole = (e: React.KeyboardEvent<HTMLInputElement>, roleId: string) => {
    if (e.key === 'Enter') {
      const title = draftTasks[roleId]?.trim();
      if (title) {
        addTask(title, 'Q2', undefined, roleId);
        setDraftTasks(prev => ({ ...prev, [roleId]: '' }));
      }
    }
  };

  const handleScheduleTask = (taskId: string, date: string | undefined, timeOfDay?: 'morning' | 'afternoon') => {
    const updates: Partial<Task> = { scheduledDate: date, timeOfDay };
    if (date) {
      const d = new Date(date);
      d.setHours(23, 59, 59, 999);
      updates.deadline = d.getTime();
      updates.quadrant = 'Q2';
    }
    updateTask(taskId, updates, false);
  };

  const handleDeleteTask = (taskId: string) => {
    deleteTask(taskId);
  };

  const handleUpdateTask = (taskId: string, updates: Partial<Task>) => {
    updateTask(taskId, updates);
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/tm-task-id', taskId);
  };

  const backlogTasks = useMemo(() => tasks.filter(t => !t.scheduledDate && !t.completed), [tasks]);

  return (
    <section className="time-management-page">
      <div className="tm-shell" style={{ flexDirection: 'column', display: 'flex', height: '100%', width: '100%' }}>
        {mode === 'daily' && (
          <header className="tm-top-menubar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 24px', borderBottom: '1px solid var(--line-soft)', background: 'transparent', flex: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
                四象限工作台
              </h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }} ref={menuRef}>
              <button
                className="icon-button"
                onClick={() => setMenuOpen(!menuOpen)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '4px', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}
              >
                <MoreHorizontal size={18} />
              </button>
              {menuOpen && (
                <div
                  className="tm-dropdown-menu"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '4px',
                    backgroundColor: 'var(--surface-2, var(--color-bg-elevated))',
                    border: '1px solid var(--line-strong, var(--color-border))',
                    borderRadius: '6px',
                    padding: '8px',
                    zIndex: 100,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                    minWidth: '150px'
                  }}
                >
                  <label
                    className="tm-toggle-label"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: 'var(--text-primary, var(--color-text))',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      userSelect: 'none'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={hideCompleted}
                      onChange={(e) => setHideCompleted(e.target.checked)}
                    />
                    <span>隐藏已完成</span>
                  </label>
                </div>
              )}
            </div>
          </header>
        )}

        <div className="tm-content-area" style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {activeTab === 'weekly' && (
            <aside className="tm-roles-sidebar" style={{ width: '200px', flex: 'none', display: 'flex', flexDirection: 'column' }}>
              <div className="tm-sidebar-header" style={{ height: '50px', background: 'transparent' }}>
                <h3>本周计划看板</h3>
              </div>

              <div className="tm-roles-list">
                {roles.map(role => {
                  // 本周计划看板只承载「重要不紧急」(Q2) 的待办：周计划围绕 Q2 大石头展开，
                  // 其余象限（尤其 Q4）不应混入侧栏。
                  const roleTasks = backlogTasks.filter(t => t.roleId === role.id && t.quadrant === 'Q2');
                  return (
                    <div key={role.id} className="tm-role-card" style={{ borderLeftColor: role.color }}>
                      <div className="tm-role-header">
                        <div className="tm-role-title">
                          <User size={16} color={role.color} />
                          <strong style={{ color: role.color }}>{role.name}</strong>
                        </div>
                      </div>

                      <div className="tm-role-tasks">
                        {roleTasks.map(task => (
                          <div
                            key={task.id}
                            className="tm-backlog-task"
                            draggable
                            onDragStart={(e) => handleDragStart(e, task.id)}
                            onClick={(e) => openTaskQuickEdit(task, e.currentTarget)}
                          >
                            <GripVertical size={14} className="drag-handle" />
                            <span className="task-text-truncate">{task.title}</span>
                            <button
                              className="icon-button tm-task-delete-btn"
                              onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}

                        <div className="tm-add-goal">
                          <Plus size={14} className="text-muted" />
                          <input
                            type="text"
                            placeholder="添加待办任务..."
                            value={draftTasks[role.id] || ''}
                            onChange={(e) => setDraftTasks(prev => ({ ...prev, [role.id]: e.target.value }))}
                            onKeyDown={(e) => handleAddTaskToRole(e, role.id)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>
          )}

          <main className="tm-main-dashboard" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div className="tm-workspace" style={{ overflowX: activeTab === 'weekly' ? 'auto' : 'hidden', overflowY: 'auto' }}>
              {activeTab === 'weekly' ? (
                <WeeklyPlanning
                  roles={roles}
                  tasks={tasks}
                  onScheduleTask={handleScheduleTask}
                  hideCompleted={hideCompleted}
                  onDeleteTask={handleDeleteTask}
                  onEditTask={openTaskQuickEdit}
                />
              ) : (
                <DailyQuadrants
                  tasks={tasks}
                  onToggleComplete={handleToggleComplete}
                  onCreateTask={openTaskQuickCreate}
                  hideCompleted={hideCompleted}
                  onDeleteTask={handleDeleteTask}
                  onEditTask={openTaskQuickEdit}
                  onUpdateTask={handleUpdateTask}
                />
              )}
            </div>
          </main>

          {quickEditOpen && (
            <div
              className="tqe-mask"
              onMouseDown={requestQuickEditCloseLayer}
              aria-hidden
            />
          )}
        </div>
      </div>
    </section>
  );
}
