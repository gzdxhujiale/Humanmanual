import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronRight, RotateCcw, Pause, CheckCircle2,
  Play, Edit3, Archive, ArchiveRestore, Trash2,
  Link2, Pencil, Check, X, LayoutGrid, Flame,
  Timer, Plus, MoreHorizontal, Settings, ArrowLeft, Maximize2
} from 'lucide-react';
import { requestNotificationPermission, usePomodoroStore } from './pomodoroStore';
import { FavoriteFocusTask, LinkedTarget, PomodoroMode, PomodoroRecord } from './pomodoroTypes';
import { useTimeManagementData } from '../time-management/useTimeManagementQuery';
import type { Task } from '../time-management/timeManagementTypes';
import { useHabitData } from '../habit/useHabitQuery';
import type { Habit } from '../habit/habitTypes';
import { useConfirmDialog } from '../../components/ui/ConfirmDeleteDialog';
import './pomodoro.css';

const EMPTY_TIME_TASKS: Task[] = [];
const EMPTY_HABITS: Habit[] = [];

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

interface ModalShellProps {
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}

const ModalShell: React.FC<ModalShellProps> = memo(({ title, icon, onClose, children }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="pomodoro-modal-backdrop" onClick={onClose}>
      <div className="pomodoro-modal" onClick={(e) => e.stopPropagation()}>
        {(title || icon) && (
          <div className="modal-header">
            {icon}
            {title && <h4>{title}</h4>}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
});

// ==========================================
// 1. PomodoroTimerCircle Component
// ==========================================
interface PomodoroTimerCircleProps {
  onTogglePhase?: () => void;
}

const PomodoroTimerCircle: React.FC<PomodoroTimerCircleProps> = memo(({ onTogglePhase }) => {
  const mode = usePomodoroStore(s => s.mode);
  const phase = usePomodoroStore(s => s.phase);
  const isRunning = usePomodoroStore(s => s.isRunning);
  const timeLeft = usePomodoroStore(s => s.timeLeft);
  const totalTargetSeconds = usePomodoroStore(s => s.totalTargetSeconds);
  const stopwatchSeconds = usePomodoroStore(s => s.stopwatchSeconds);

  const startTimer = usePomodoroStore(s => s.startTimer);
  const pauseTimer = usePomodoroStore(s => s.pauseTimer);
  const resetTimer = usePomodoroStore(s => s.resetTimer);
  const finishCurrentSession = usePomodoroStore(s => s.finishCurrentSession);
  const setPhase = usePomodoroStore(s => s.setPhase);

  const displaySeconds = mode === 'stopwatch' ? stopwatchSeconds : timeLeft;
  const minutes = Math.floor(displaySeconds / 60);
  const seconds = displaySeconds % 60;
  const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const progress = mode === 'stopwatch' 
    ? (stopwatchSeconds % 60) / 60 
    : (totalTargetSeconds - timeLeft) / totalTargetSeconds;

  const size = 320;
  const strokeWidth = 8;
  const center = size / 2;
  const radius = center - strokeWidth * 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progress * circumference;

  const handlePrimaryClick = () => {
    if (isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  };

  const handlePhaseSwitch = () => {
    if (onTogglePhase) {
      onTogglePhase();
    } else {
      const nextPhase = phase === 'focus' ? 'break' : 'focus';
      setPhase(nextPhase);
    }
  };

  return (
    <div className="pomodoro-timer-container">
      <button 
        className="pomodoro-phase-badge" 
        onClick={handlePhaseSwitch} 
        title="点击切换 专注/休息 模式"
      >
        <span>{phase === 'focus' ? '专注' : '休息'}</span>
        <ChevronRight size={16} className="badge-chevron" />
      </button>

      <div className="pomodoro-circle-wrapper">
        <svg className="pomodoro-circle-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            className="pomodoro-circle-bg-glow"
            cx={center}
            cy={center}
            r={radius + 4}
            strokeWidth="1"
          />
          <circle
            className="pomodoro-circle-bg"
            cx={center}
            cy={center}
            r={radius}
            strokeWidth={strokeWidth}
          />
          <circle
            className={`pomodoro-circle-progress ${phase === 'break' ? 'is-break' : ''}`}
            cx={center}
            cy={center}
            r={radius}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`}
          />
        </svg>

        <div className="pomodoro-timer-content">
          <div className="pomodoro-clock-text">{timeString}</div>
        </div>
      </div>

      <div className="pomodoro-controls">
        <button
          className={`pomodoro-start-btn ${isRunning ? 'is-running' : ''}`}
          onClick={handlePrimaryClick}
        >
          {isRunning ? (
            <>
              <Pause size={18} fill="currentColor" />
              <span>暂停</span>
            </>
          ) : (
            <>
              <span>{displaySeconds === totalTargetSeconds || stopwatchSeconds === 0 ? '开始' : '继续'}</span>
            </>
          )}
        </button>

        {(isRunning || displaySeconds !== totalTargetSeconds || stopwatchSeconds > 0) && (
          <div className="pomodoro-sub-controls">
            <button
              className="pomodoro-icon-btn"
              onClick={resetTimer}
              title="重置计时"
            >
              <RotateCcw size={16} />
              <span>重置</span>
            </button>

            <button
              className="pomodoro-icon-btn"
              onClick={() => finishCurrentSession('manual')}
              title="完成并记录"
            >
              <CheckCircle2 size={16} />
              <span>完成</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

// ==========================================
// 2. PomodoroOverview Component
// ==========================================
const PomodoroOverview: React.FC = memo(() => {
  const records = usePomodoroStore(s => s.records);

  const stats = useMemo(() => {
    const todayStr = usePomodoroStore.getState().getStats();
    return todayStr;
  }, [records]);

  const formatHoursMins = (totalMinutes: number) => {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return (
      <span className="stat-value-formatted">
        <span className="num">{h}</span>
        <span className="unit"> h </span>
        <span className="num">{m}</span>
        <span className="unit"> m</span>
      </span>
    );
  };

  return (
    <div className="pomodoro-overview-section">
      <h3 className="overview-title">概览</h3>
      <div className="overview-grid">
        <div className="stat-card">
          <div className="stat-label">今日番茄</div>
          <div className="stat-value num-only">{stats.todayCount}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">今日专注时长</div>
          <div className="stat-value">{formatHoursMins(stats.todayFocusMinutes)}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">总番茄</div>
          <div className="stat-value num-only">{stats.totalCount}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">总专注时长</div>
          <div className="stat-value">{formatHoursMins(stats.totalFocusMinutes)}</div>
        </div>
      </div>
    </div>
  );
});

// ==========================================
// 3. MiniTimerBar Component
// ==========================================
interface MiniTimerBarProps {
  onExpandCircleView: () => void;
}

const MiniTimerBar: React.FC<MiniTimerBarProps> = memo(({ onExpandCircleView }) => {
  const phase = usePomodoroStore(s => s.phase);
  const mode = usePomodoroStore(s => s.mode);
  const isRunning = usePomodoroStore(s => s.isRunning);
  const timeLeft = usePomodoroStore(s => s.timeLeft);
  const stopwatchSeconds = usePomodoroStore(s => s.stopwatchSeconds);

  const startTimer = usePomodoroStore(s => s.startTimer);
  const pauseTimer = usePomodoroStore(s => s.pauseTimer);

  const displaySecs = mode === 'stopwatch' ? stopwatchSeconds : timeLeft;
  const mins = Math.floor(displaySecs / 60);
  const secs = displaySecs % 60;
  const timeString = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const handlePlayToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  };

  return (
    <div className="mini-timer-bar-container" onClick={onExpandCircleView}>
      <div className="mini-timer-left">
        <div className="mini-timer-icon-circle">
          <Timer size={16} fill="currentColor" />
        </div>
        <div className="mini-timer-text-group">
          <span className="mini-timer-phase-label">{phase === 'focus' ? '专注' : '休息'}</span>
          <span className="mini-timer-clock">{timeString}</span>
        </div>
      </div>

      <div className="mini-timer-right">
        <button
          type="button"
          className="mini-timer-expand-btn"
          onClick={onExpandCircleView}
          title="展开环形计时器"
        >
          <Maximize2 size={14} />
        </button>

        <button
          type="button"
          className={`mini-timer-play-btn ${isRunning ? 'is-running' : ''}`}
          onClick={handlePlayToggle}
          title={isRunning ? '暂停' : '开始'}
        >
          {isRunning ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
        </button>
      </div>
    </div>
  );
});

// ==========================================
// 4. FavoriteTaskModal Component
// ==========================================
interface FavoriteTaskModalProps {
  initialTask?: FavoriteFocusTask | null;
  onClose: () => void;
}

const EMOJI_OPTIONS = ['😊', '🎯', '⚡', '📚', '💻', '🎨', '🔥', '🧠', '🎧', '☕'];

const FavoriteTaskModal: React.FC<FavoriteTaskModalProps> = memo(({ initialTask, onClose }) => {
  const addFavoriteTask = usePomodoroStore(s => s.addFavoriteTask);
  const updateFavoriteTask = usePomodoroStore(s => s.updateFavoriteTask);

  const timeTasks = useTimeManagementData().data?.tasks ?? EMPTY_TIME_TASKS;
  const habits = useHabitData().data?.habits ?? EMPTY_HABITS;

  const [name, setName] = useState(initialTask?.name || '');
  const [icon, setIcon] = useState(initialTask?.icon || '😊');
  const [mode, setMode] = useState<PomodoroMode>(initialTask?.mode || 'pomodoro');
  const [durationMinutes, setDurationMinutes] = useState(initialTask?.durationMinutes || 25);
  const [linkedTarget, setLinkedTarget] = useState<LinkedTarget | undefined>(initialTask?.linkedTarget);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showLinkDropdown, setShowLinkDropdown] = useState(false);
  const [linkTab, setLinkTab] = useState<'quadrant' | 'habit'>('quadrant');

  const linkDropdownRef = useClickOutside<HTMLDivElement>(() => setShowLinkDropdown(false));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (initialTask) {
      updateFavoriteTask(initialTask.id, {
        name: name.trim(),
        icon,
        mode,
        durationMinutes,
        linkedTarget,
      });
    } else {
      addFavoriteTask({
        name: name.trim(),
        icon,
        mode,
        durationMinutes,
        linkedTarget,
      });
    }

    onClose();
  };

  const handleSelectLinkedTarget = (target: LinkedTarget) => {
    setLinkedTarget(target);
    if (!name.trim()) {
      setName(target.title);
    }
    setShowLinkDropdown(false);
  };

  return createPortal(
    <div className="pomodoro-modal-backdrop" onClick={onClose}>
      <div className="favorite-task-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{initialTask ? '编辑常用专注' : '添加常用专注'}</h3>

        <form onSubmit={handleSubmit}>
          <div className="fav-input-row">
            <div className="fav-avatar-wrapper">
              <button
                type="button"
                className="fav-avatar-btn"
                onClick={() => {
                  setShowEmojiPicker(!showEmojiPicker);
                  setShowLinkDropdown(false);
                }}
                title="更换图标"
              >
                <span className="fav-avatar-emoji">{icon}</span>
                <span className="fav-avatar-pencil">
                  <Pencil size={10} />
                </span>
              </button>

              {showEmojiPicker && (
                <div className="emoji-picker-popover">
                  {EMOJI_OPTIONS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className={`emoji-option ${icon === e ? 'active' : ''}`}
                      onClick={() => {
                        setIcon(e);
                        setShowEmojiPicker(false);
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="fav-name-input-wrapper" ref={linkDropdownRef}>
              <input
                type="text"
                className="fav-name-input"
                placeholder="名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
              <button
                type="button"
                className={`fav-link-btn ${linkedTarget || showLinkDropdown ? 'has-link' : ''}`}
                onClick={() => {
                  setShowLinkDropdown(!showLinkDropdown);
                  setShowEmojiPicker(false);
                }}
                title={linkedTarget ? `已关联: ${linkedTarget.title}` : '关联四象限任务或习惯追踪'}
              >
                <Link2 size={16} />
              </button>

              {showLinkDropdown && (
                <div className="link-dropdown-popover">
                  <div className="link-dropdown-tabs">
                    <button
                      type="button"
                      className={`link-tab ${linkTab === 'quadrant' ? 'active' : ''}`}
                      onClick={() => setLinkTab('quadrant')}
                    >
                      <LayoutGrid size={13} />
                      <span>四象限 ({timeTasks.filter((t) => !t.completed).length})</span>
                    </button>
                    <button
                      type="button"
                      className={`link-tab ${linkTab === 'habit' ? 'active' : ''}`}
                      onClick={() => setLinkTab('habit')}
                    >
                      <Flame size={13} />
                      <span>习惯追踪 ({habits.length})</span>
                    </button>
                  </div>

                  <div className="link-dropdown-list">
                    {linkTab === 'quadrant' ? (
                      timeTasks.filter((t) => !t.completed).length === 0 ? (
                        <div className="link-empty-item">暂无未完成的四象限任务</div>
                      ) : (
                        timeTasks
                          .filter((t) => !t.completed)
                          .map((task) => (
                            <div
                              key={task.id}
                              className={`link-dropdown-item ${
                                linkedTarget?.id === task.id ? 'selected' : ''
                              }`}
                              onClick={() =>
                                handleSelectLinkedTarget({
                                  type: 'quadrant',
                                  id: task.id,
                                  title: task.title,
                                })
                              }
                            >
                              <span className="target-title">{task.title}</span>
                              <span className="target-badge">{task.quadrant}</span>
                              {linkedTarget?.id === task.id && (
                                <Check size={14} className="check-icon" />
                              )}
                            </div>
                          ))
                      )
                    ) : habits.length === 0 ? (
                      <div className="link-empty-item">暂无习惯项目</div>
                    ) : (
                      habits.map((habit) => (
                        <div
                          key={habit.id}
                          className={`link-dropdown-item ${
                            linkedTarget?.id === habit.id ? 'selected' : ''
                          }`}
                          onClick={() =>
                            handleSelectLinkedTarget({
                              type: 'habit',
                              id: habit.id,
                              title: habit.name,
                            })
                          }
                        >
                          <span className="target-title">{habit.name}</span>
                          <span className="target-badge">习惯</span>
                          {linkedTarget?.id === habit.id && (
                            <Check size={14} className="check-icon" />
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {linkedTarget && (
            <div className="linked-tag-bar">
              <span className="linked-tag-label">
                {linkedTarget.type === 'quadrant' ? '关联四象限: ' : '关联习惯: '}
                <strong>{linkedTarget.title}</strong>
              </span>
              <button
                type="button"
                className="linked-tag-remove"
                onClick={() => setLinkedTarget(undefined)}
                title="解除关联"
              >
                <X size={12} />
              </button>
            </div>
          )}

          <div className="fav-mode-section">
            <div className="section-subtitle">计时模式</div>

            <div className="mode-radio-group">
              <label className="mode-radio-label">
                <input
                  type="radio"
                  name="timingMode"
                  checked={mode === 'pomodoro'}
                  onChange={() => setMode('pomodoro')}
                />
                <span className="radio-custom" />
                <span className="mode-text">番茄计时</span>
                {mode === 'pomodoro' && (
                  <div className="duration-input-inline">
                    <input
                      type="number"
                      min="1"
                      max="180"
                      className="duration-num-input"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(Math.max(1, Number(e.target.value)))}
                    />
                    <span className="unit-text">分钟</span>
                  </div>
                )}
              </label>

              <label className="mode-radio-label">
                <input
                  type="radio"
                  name="timingMode"
                  checked={mode === 'stopwatch'}
                  onChange={() => setMode('stopwatch')}
                />
                <span className="radio-custom" />
                <span className="mode-text">正计时</span>
              </label>
            </div>
          </div>

          <div className="fav-modal-footer">
            <button type="submit" className="fav-btn-save">
              保存
            </button>
            <button type="button" className="fav-btn-cancel" onClick={onClose}>
              取消
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
});

// ==========================================
// 5. FavoriteTaskList Component
// ==========================================
interface FavoriteTaskListProps {
  tasks: FavoriteFocusTask[];
  isArchivedView?: boolean;
}

interface ContextMenuState {
  mouseX: number;
  mouseY: number;
  task: FavoriteFocusTask;
}

const FavoriteTaskList: React.FC<FavoriteTaskListProps> = memo(({ tasks, isArchivedView }) => {
  const startFavoriteTask = usePomodoroStore(s => s.startFavoriteTask);
  const archiveFavoriteTask = usePomodoroStore(s => s.archiveFavoriteTask);
  const unarchiveFavoriteTask = usePomodoroStore(s => s.unarchiveFavoriteTask);
  const deleteFavoriteTask = usePomodoroStore(s => s.deleteFavoriteTask);
  const { confirm: confirmDelete } = useConfirmDialog();

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [editingTask, setEditingTask] = useState<FavoriteFocusTask | null>(null);

  const handleContextMenu = (e: React.MouseEvent, task: FavoriteFocusTask) => {
    e.preventDefault();
    setContextMenu({
      mouseX: e.clientX,
      mouseY: e.clientY,
      task,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  return (
    <div className="fav-task-list-container" onClick={handleCloseContextMenu}>
      {tasks.length === 0 ? (
        <div className="fav-list-empty">
          {isArchivedView ? '暂无归档的专注任务' : '暂无常用专注任务，点击右上角 + 新增'}
        </div>
      ) : (
        <div className="fav-task-items">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="fav-task-item-row"
              onContextMenu={(e) => handleContextMenu(e, task)}
            >
              <div className="item-left">
                <div className="item-avatar-circle">
                  <span className="item-emoji">{task.icon || '😊'}</span>
                </div>
                <div className="item-info">
                  <span className="item-name">{task.name}</span>
                  {task.linkedTarget && (
                    <span className="item-link-badge">
                      🔗 {task.linkedTarget.title}
                    </span>
                  )}
                </div>
              </div>

              <div className="item-right">
                <span className="item-duration-text">{task.accumulatedMinutes}m</span>
                {!isArchivedView && (
                  <button
                    type="button"
                    className="item-play-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      startFavoriteTask(task.id);
                    }}
                    title="立即开始专注"
                  >
                    <Play size={14} fill="currentColor" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {contextMenu && createPortal(
        <div
          className="context-menu-popover"
          style={{ top: contextMenu.mouseY, left: contextMenu.mouseX, zIndex: 99999 }}
          onClick={(e) => e.stopPropagation()}
        >
          {!isArchivedView ? (
            <>
              <button
                className="context-menu-item"
                onClick={() => {
                  setEditingTask(contextMenu.task);
                  handleCloseContextMenu();
                }}
              >
                <Edit3 size={14} />
                <span>编辑</span>
              </button>

              <button
                className="context-menu-item"
                onClick={() => {
                  archiveFavoriteTask(contextMenu.task.id);
                  handleCloseContextMenu();
                }}
              >
                <Archive size={14} />
                <span>归档</span>
              </button>

              <button
                className="context-menu-item danger"
                onClick={async () => {
                  const task = contextMenu.task;
                  handleCloseContextMenu();
                  const confirmed = await confirmDelete({
                    title: '删除专注任务',
                    description: `确认删除专注任务"${task.name}"？`,
                    confirmText: '删除',
                  });
                  if (confirmed) {
                    deleteFavoriteTask(task.id);
                  }
                }}
              >
                <Trash2 size={14} />
                <span>删除</span>
              </button>
            </>
          ) : (
            <>
              <button
                className="context-menu-item"
                onClick={() => {
                  unarchiveFavoriteTask(contextMenu.task.id);
                  handleCloseContextMenu();
                }}
              >
                <ArchiveRestore size={14} />
                <span>恢复到专注列表</span>
              </button>

              <button
                className="context-menu-item danger"
                onClick={async () => {
                  const task = contextMenu.task;
                  handleCloseContextMenu();
                  const confirmed = await confirmDelete({
                    title: '删除专注任务',
                    description: `确认删除专注任务"${task.name}"？`,
                    confirmText: '删除',
                  });
                  if (confirmed) {
                    deleteFavoriteTask(task.id);
                  }
                }}
              >
                <Trash2 size={14} />
                <span>删除</span>
              </button>
            </>
          )}
        </div>,
        document.body
      )}

      {editingTask && (
        <FavoriteTaskModal
          initialTask={editingTask}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
});

// ==========================================
// 6. PomodoroHistory Component
// ==========================================
const PomodoroHistory: React.FC = memo(() => {
  const records = usePomodoroStore(s => s.records);
  const deleteRecord = usePomodoroStore(s => s.deleteRecord);
  const addManualRecord = usePomodoroStore(s => s.addManualRecord);
  const clearAllRecords = usePomodoroStore(s => s.clearAllRecords);
  const { confirm: confirmDelete } = useConfirmDialog();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [manualMins, setManualMins] = useState(25);

  const groupedRecords = useMemo(() => {
    const groups: { [key: string]: PomodoroRecord[] } = {};
    records.forEach((rec) => {
      const label = rec.dateLabel || '近期';
      if (!groups[label]) {
        groups[label] = [];
      }
      groups[label].push(rec);
    });
    return Object.entries(groups).map(([dateLabel, items]) => ({
      dateLabel,
      items,
    }));
  }, [records]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualMins > 0) {
      addManualRecord(manualMins);
      setShowAddModal(false);
    }
  };

  const formatDurationText = (mins: number) => {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h${m}m` : `${h}h`;
  };

  return (
    <div className="pomodoro-history-section">
      <div className="history-header">
        <h3 className="history-title">专注记录</h3>
        <div className="history-actions">
          <button
            className="history-icon-btn"
            onClick={() => setShowAddModal(true)}
            title="补录专注时长"
          >
            <Plus size={18} />
          </button>

          <div className="history-menu-wrapper">
            <button
              className="history-icon-btn"
              onClick={() => setShowMenu(!showMenu)}
              title="记录选项"
            >
              <MoreHorizontal size={18} />
            </button>
            {showMenu && (
              <div className="history-dropdown-menu">
                <button
                  className="dropdown-item danger"
                  onClick={async () => {
                    setShowMenu(false);
                    const confirmed = await confirmDelete({
                      title: '清空历史记录',
                      description: '确认清空所有历史专注记录？此操作无法撤销。',
                      confirmText: '清空',
                    });
                    if (confirmed) {
                      clearAllRecords();
                    }
                  }}
                >
                  <Trash2 size={14} />
                  <span>清空历史记录</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="history-timeline-list">
        {groupedRecords.length === 0 ? (
          <div className="history-empty">暂无专注记录</div>
        ) : (
          groupedRecords.map((group) => (
            <div key={group.dateLabel} className="timeline-group">
              <div className="timeline-group-date">{group.dateLabel}</div>
              <div className="timeline-items">
                {group.items.map((item, index) => (
                  <div key={item.id} className="timeline-item">
                    {index < group.items.length - 1 && <div className="timeline-line" />}

                    <div className="timeline-node">
                      <div className="node-icon-bg">
                        <Timer size={13} className="node-icon" />
                      </div>
                    </div>

                    <div className="timeline-content">
                      <div className="timeline-main-info">
                        <span className="timeline-time">{item.timeRangeLabel || `${item.startTime} - ${item.endTime}`}</span>
                        {item.linkedTarget && (
                          <div className="timeline-linked-subnode">
                            <span className="subnode-dot">o</span>
                            <span className="subnode-title">{item.linkedTarget.title}</span>
                          </div>
                        )}
                      </div>
                      <span className="timeline-duration">{formatDurationText(item.durationMinutes)}</span>
                    </div>

                    <button
                      className="item-delete-btn"
                      onClick={() => deleteRecord(item.id)}
                      title="删除此记录"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {showAddModal && (
        <ModalShell title="补录专注时长" onClose={() => setShowAddModal(false)}>
          <form onSubmit={handleAddSubmit}>
            <div className="form-group">
              <label>专注时长（分钟）</label>
              <input
                type="number"
                min="1"
                max="480"
                value={manualMins}
                onChange={(e) => setManualMins(Number(e.target.value))}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-cancel" onClick={() => setShowAddModal(false)}>
                取消
              </button>
              <button type="submit" className="btn-confirm">
                确定添加
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
});

// ==========================================
// 7. PomodoroPanel Main Component
// ==========================================
export const PomodoroPanel: React.FC = () => {
  const mode = usePomodoroStore(s => s.mode);
  const phase = usePomodoroStore(s => s.phase);
  const isRunning = usePomodoroStore(s => s.isRunning);
  const focusDuration = usePomodoroStore(s => s.focusDuration);
  const breakDuration = usePomodoroStore(s => s.breakDuration);
  const minEffectiveMinutes = usePomodoroStore(s => s.minEffectiveMinutes);
  const activeTab = usePomodoroStore(s => s.activeTab);
  const favoriteTasks = usePomodoroStore(s => s.favoriteTasks);

  const setMode = usePomodoroStore(s => s.setMode);
  const setPhase = usePomodoroStore(s => s.setPhase);
  const setActiveTab = usePomodoroStore(s => s.setActiveTab);
  const setFocusDuration = usePomodoroStore(s => s.setFocusDuration);
  const setBreakDuration = usePomodoroStore(s => s.setBreakDuration);
  const setMinEffectiveMinutes = usePomodoroStore(s => s.setMinEffectiveMinutes);
  const getActiveFavoriteTasks = usePomodoroStore(s => s.getActiveFavoriteTasks);
  const getArchivedFavoriteTasks = usePomodoroStore(s => s.getArchivedFavoriteTasks);
  const syncAllFromDB = usePomodoroStore(s => s.syncAllFromDB);

  const [showAddFavModal, setShowAddFavModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showExpandedCircle, setShowExpandedCircle] = useState(false);

  const [customFocusMins, setCustomFocusMins] = useState(Math.round(focusDuration / 60));
  const [customBreakMins, setCustomBreakMins] = useState(Math.round(breakDuration / 60));
  const [customMinEffectiveMins, setCustomMinEffectiveMins] = useState(minEffectiveMinutes);

  const activeFavTasks = getActiveFavoriteTasks();
  const archivedFavTasks = getArchivedFavoriteTasks();
  const hasFavTasks = favoriteTasks.length > 0;

  useEffect(() => {
    syncAllFromDB();
    requestNotificationPermission();
  }, [syncAllFromDB]);

  useEffect(() => {
    if (showSettingsModal) {
      setCustomFocusMins(Math.round(focusDuration / 60));
      setCustomBreakMins(Math.round(breakDuration / 60));
      setCustomMinEffectiveMins(minEffectiveMinutes);
    }
  }, [showSettingsModal, focusDuration, breakDuration, minEffectiveMinutes]);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setFocusDuration(customFocusMins);
    setBreakDuration(customBreakMins);
    setMinEffectiveMinutes(customMinEffectiveMins);
    setShowSettingsModal(false);
  };

  return (
    <div className="pomodoro-panel-container">
      <header className="pomodoro-header">
        <div className="header-left">
          {showExpandedCircle ? (
            <button
              className="header-back-btn"
              onClick={() => setShowExpandedCircle(false)}
              title="返回专注任务列表"
            >
              <ArrowLeft size={18} />
              <span>返回列表</span>
            </button>
          ) : (
            <h1 className="header-title">番茄专注</h1>
          )}
        </div>

        <div className="header-center">
          {hasFavTasks && !showExpandedCircle ? (
            <div className="mode-pill-switch">
              <button
                className={`pill-btn ${activeTab === 'active' ? 'active' : ''}`}
                onClick={() => setActiveTab('active')}
              >
                坚持中
              </button>
              <button
                className={`pill-btn ${activeTab === 'archived' ? 'active' : ''}`}
                onClick={() => setActiveTab('archived')}
              >
                已归档
              </button>
            </div>
          ) : (
            <div className="mode-pill-switch">
              <button
                className={`pill-btn ${mode === 'pomodoro' ? 'active' : ''}`}
                onClick={() => !isRunning && setMode('pomodoro')}
                disabled={isRunning}
                title={isRunning ? '计时进行中，无法切换模式' : '番茄计时模式'}
                style={{
                  opacity: isRunning && mode !== 'pomodoro' ? 0.5 : 1,
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                }}
              >
                番茄计时
              </button>
              <button
                className={`pill-btn ${mode === 'stopwatch' ? 'active' : ''}`}
                onClick={() => !isRunning && setMode('stopwatch')}
                disabled={isRunning}
                title={isRunning ? '计时进行中，无法切换模式' : '正计时模式'}
                style={{
                  opacity: isRunning && mode !== 'stopwatch' ? 0.5 : 1,
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                }}
              >
                正计时
              </button>
            </div>
          )}
        </div>

        <div className="header-right">
          <button
            className="header-icon-btn"
            onClick={() => setShowAddFavModal(true)}
            title="添加常用专注"
          >
            <Plus size={19} />
          </button>
          <button
            className="header-icon-btn"
            onClick={() => setShowSettingsModal(true)}
            title="专注设置"
          >
            <MoreHorizontal size={19} />
          </button>
        </div>
      </header>

      <div className="pomodoro-body">
        <div className="pomodoro-main-area">
          {hasFavTasks && !showExpandedCircle ? (
            <div className="fav-task-list-view-wrapper">
              <FavoriteTaskList
                tasks={activeTab === 'active' ? activeFavTasks : archivedFavTasks}
                isArchivedView={activeTab === 'archived'}
              />

              <MiniTimerBar onExpandCircleView={() => setShowExpandedCircle(true)} />
            </div>
          ) : (
            <PomodoroTimerCircle
              onTogglePhase={() => {
                const nextPhase = phase === 'focus' ? 'break' : 'focus';
                setPhase(nextPhase);
              }}
            />
          )}
        </div>

        <aside className="pomodoro-sidebar-area">
          <PomodoroOverview />
          <PomodoroHistory />
        </aside>
      </div>

      {showAddFavModal && (
        <FavoriteTaskModal onClose={() => setShowAddFavModal(false)} />
      )}

      {showSettingsModal && (
        <ModalShell
          title="番茄专注设置"
          icon={<Settings size={18} />}
          onClose={() => setShowSettingsModal(false)}
        >
          <form onSubmit={handleSaveSettings}>
            <div className="form-group">
              <label>专注时长 (分钟)</label>
              <input
                type="number"
                min="1"
                max="120"
                value={customFocusMins}
                onChange={(e) => setCustomFocusMins(Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>休息时长 (分钟)</label>
              <input
                type="number"
                min="1"
                max="60"
                value={customBreakMins}
                onChange={(e) => setCustomBreakMins(Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>最小计入专注时长 (分钟)</label>
              <input
                type="number"
                min="0"
                max="60"
                value={customMinEffectiveMins}
                onChange={(e) => setCustomMinEffectiveMins(Number(e.target.value))}
              />
              <span className="form-hint">专注小于此分钟数时不计入专注记录与累计时长（默认 5 分钟）</span>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-cancel" onClick={() => setShowSettingsModal(false)}>
                取消
              </button>
              <button type="submit" className="btn-confirm">
                保存设置
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
};
