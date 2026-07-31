import React, { useMemo, useState, memo } from 'react';
import { Clock, X } from 'lucide-react';
import dayjs from 'dayjs';
import { Role, Task } from './timeManagementTypes';

interface WeeklyPlanningProps {
  roles: Role[];
  tasks: Task[];
  onScheduleTask: (taskId: string, date: string | undefined, timeOfDay?: 'morning' | 'afternoon') => void;
  hideCompleted: boolean;
  onDeleteTask: (taskId: string) => void;
  onEditTask: (task: Task, anchor: HTMLElement) => void;
}

const DAYS_OF_WEEK = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function getWeekDates() {
  // dayjs startOf('week') is Sunday in default locale; add 1 day to get Monday
  const today = dayjs();
  const day = today.day(); // 0 is Sun, 1 is Mon...
  const monday = today.subtract(day === 0 ? 6 : day - 1, 'day');

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = monday.add(i, 'day');
    dates.push({ label: DAYS_OF_WEEK[i], dateStr: d.format('YYYY-MM-DD') });
  }
  return dates;
}

export const WeeklyPlanning: React.FC<WeeklyPlanningProps> = memo(({
  roles,
  tasks,
  onScheduleTask,
  hideCompleted,
  onDeleteTask,
  onEditTask,
}) => {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const weekDates = useMemo(() => getWeekDates(), []);
  const roleMap = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const todayStr = useMemo(() => dayjs().format('YYYY-MM-DD'), []);

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

  const handleDrop = (e: React.DragEvent, targetDateStr: string | undefined, timeOfDay?: 'morning' | 'afternoon') => {
    e.preventDefault();
    e.stopPropagation();
    const taskId = e.dataTransfer.getData('application/tm-task-id') || draggedTaskId;
    if (taskId) {
      onScheduleTask(taskId, targetDateStr, timeOfDay);
    }
    setDraggedTaskId(null);
  };

  const renderSlot = (
    dayTasks: Task[],
    dateStr: string,
    timeOfDay: 'morning' | 'afternoon',
    label: string,
    borderBottom?: boolean
  ) => {
    const slotTasks = dayTasks.filter((t) =>
      timeOfDay === 'morning' ? t.timeOfDay === 'morning' || !t.timeOfDay : t.timeOfDay === 'afternoon'
    );

    return (
      <div
        className={`tm-column-content tm-column-${timeOfDay}`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDrop={(e) => handleDrop(e, dateStr, timeOfDay)}
        style={{
          flex: 1,
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          minHeight: '120px',
          borderBottom: borderBottom ? '1px dashed rgba(123, 145, 169, 0.2)' : undefined,
        }}
      >
        <div className="tm-time-label" style={{ fontSize: '11px', color: 'var(--text-faint)', marginBottom: '4px' }}>
          {label}
        </div>
        {slotTasks.map((task) => {
          const taskRole = task.roleId ? roleMap.get(task.roleId) : undefined;
          return (
            <div
              key={task.id}
              className={`tm-scheduled-task ${task.completed ? 'completed' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, task.id)}
              onClick={(e) => onEditTask(task, e.currentTarget)}
              style={taskRole ? { borderLeftColor: taskRole.color } : {}}
            >
              <div className="tm-scheduled-task-content">
                <span className="tm-task-title">{task.title}</span>
                {timeOfDay === 'afternoon' && task.deadline && (
                  <div className={`tm-task-deadline ${task.deadline < Date.now() ? 'overdue' : ''}`}>
                    <Clock size={12} />
                    {new Date(task.deadline).toLocaleDateString([], { month: 'numeric', day: 'numeric' })}
                  </div>
                )}
              </div>
              <button
                className="icon-button tm-task-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteTask(task.id);
                }}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="weekly-planning-layout" style={{ flex: 1 }}>
      <div className="tm-weekly-board">
        <div className="tm-kanban-grid">
          {weekDates.map((dayInfo) => {
            let dayTasks = tasks.filter((t) => t.scheduledDate === dayInfo.dateStr && t.quadrant === 'Q2');
            if (hideCompleted) {
              dayTasks = dayTasks.filter((t) => !t.completed);
            }
            const isToday = todayStr === dayInfo.dateStr;

            return (
              <div
                key={dayInfo.dateStr}
                className={`tm-kanban-column ${isToday ? 'is-today' : ''}`}
              >
                <div className="tm-column-header">
                  <strong>{dayInfo.label}</strong>
                  <span className="tm-date-label">{dayInfo.dateStr.slice(5)}</span>
                </div>

                {renderSlot(dayTasks, dayInfo.dateStr, 'morning', '上午', true)}
                {renderSlot(dayTasks, dayInfo.dateStr, 'afternoon', '下午', false)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
