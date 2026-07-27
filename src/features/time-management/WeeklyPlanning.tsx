import React from 'react';
import { Clock, X } from 'lucide-react';
import { Role, Task } from './timeManagementTypes';

interface WeeklyPlanningProps {
  roles: Role[];
  tasks: Task[];
  onScheduleTask: (taskId: string, date: string | undefined, timeOfDay?: 'morning' | 'afternoon') => void;
  hideCompleted: boolean;
  onDeleteTask: (taskId: string) => void;
  onEditTask: (task: Task) => void;
}

const DAYS_OF_WEEK = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function getWeekDates() {
  const today = new Date();
  const day = today.getDay(); // 0 is Sunday, 1 is Monday...
  const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  
  const monday = new Date(today.setDate(diff));
  const dates = [];
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    // format as YYYY-MM-DD
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dates.push({ label: DAYS_OF_WEEK[i], dateStr });
  }
  
  return dates;
}

export function WeeklyPlanning({ roles, tasks, onScheduleTask, hideCompleted, onDeleteTask, onEditTask }: WeeklyPlanningProps) {
  const [draggedTaskId, setDraggedTaskId] = React.useState<string | null>(null);
  
  const weekDates = React.useMemo(() => getWeekDates(), []);

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

  return (
    <div className="weekly-planning-layout" style={{ flex: 1 }}>
      {/* Main Area: Weekly Schedule Board */}
      <div className="tm-weekly-board">
        <div className="tm-kanban-grid">
          {weekDates.map((dayInfo) => {
            let dayTasks = tasks.filter(t => t.scheduledDate === dayInfo.dateStr);
            if (hideCompleted) {
              dayTasks = dayTasks.filter(t => !t.completed);
            }
            const isToday = new Date().toISOString().split('T')[0] === dayInfo.dateStr;
            
            return (
              <div 
                key={dayInfo.dateStr} 
                className={`tm-kanban-column ${isToday ? 'is-today' : ''}`}
              >
                <div className="tm-column-header">
                  <strong>{dayInfo.label}</strong>
                  <span className="tm-date-label">{dayInfo.dateStr.slice(5)}</span>
                </div>
                
                <div 
                  className="tm-column-content tm-column-morning"
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDrop={(e) => handleDrop(e, dayInfo.dateStr, 'morning')}
                  style={{ flex: 1, borderBottom: '1px dashed rgba(123, 145, 169, 0.2)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '120px' }}
                >
                  <div className="tm-time-label" style={{ fontSize: '11px', color: 'var(--text-faint)', marginBottom: '4px' }}>上午</div>
                  {dayTasks.filter(t => t.timeOfDay === 'morning' || !t.timeOfDay).map(task => {
                    const taskRole = roles.find(r => r.id === task.roleId);
                    return (
                      <div 
                        key={task.id} 
                        className={`tm-scheduled-task ${task.completed ? 'completed' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onClick={() => onEditTask(task)}
                        style={taskRole ? { borderLeftColor: taskRole.color } : {}}
                      >
                        <div className="tm-scheduled-task-content">
                          <span className="tm-task-title">{task.title}</span>
                        </div>
                        <button 
                          className="icon-button tm-task-delete-btn" 
                          onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div 
                  className="tm-column-content tm-column-afternoon"
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDrop={(e) => handleDrop(e, dayInfo.dateStr, 'afternoon')}
                  style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '120px' }}
                >
                  <div className="tm-time-label" style={{ fontSize: '11px', color: 'var(--text-faint)', marginBottom: '4px' }}>下午</div>
                  {dayTasks.filter(t => t.timeOfDay === 'afternoon').map(task => {
                    const taskRole = roles.find(r => r.id === task.roleId);
                    return (
                      <div 
                        key={task.id} 
                        className={`tm-scheduled-task ${task.completed ? 'completed' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onClick={() => onEditTask(task)}
                        style={taskRole ? { borderLeftColor: taskRole.color } : {}}
                      >
                        <div className="tm-scheduled-task-content">
                          <span className="tm-task-title">{task.title}</span>
                          {task.deadline && (
                            <div className={`tm-task-deadline ${task.deadline < Date.now() ? 'overdue' : ''}`}>
                              <Clock size={12} />
                              {new Date(task.deadline).toLocaleDateString([], {month: 'numeric', day: 'numeric'})}
                            </div>
                          )}
                        </div>
                        <button 
                          className="icon-button tm-task-delete-btn" 
                          onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
