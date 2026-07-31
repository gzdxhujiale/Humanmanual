import { useState, useEffect, useLayoutEffect, useRef, useMemo, memo, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import {
  Clock, Bell, Flag, AlignLeft, Sun, Sunrise, Moon,
  CalendarPlus, ChevronLeft, ChevronRight, Circle, CalendarDays
} from 'lucide-react';
import dayjs from 'dayjs';
import { QuadrantType, Task, TaskReminder, parseReminder, serializeReminder, reminderLabel } from './timeManagementTypes';
import { ReactjsTiptapEditor } from '../reactjs-tiptap-v1';

// ==========================================
// TaskQuickEdit — TickTick 风格任务快捷编辑浮层
// 第一层：标题/描述 + 「日期与提醒」字段 + 象限旗标
// 第二层：快捷日期 + 月历 + 时间/提醒入口
// 第三层：时间下拉 / 提醒设置
// ==========================================

const QUADRANT_META: Record<QuadrantType, { name: string; color: string }> = {
  Q1: { name: '重要且紧急', color: '#d32f2f' },
  Q2: { name: '重要不紧急', color: '#25845a' },
  Q3: { name: '紧急不重要', color: '#d97706' },
  Q4: { name: '不重要不紧急', color: '#697381' },
};

const L1_WIDTH = 420;
const L2_WIDTH = 316;
const L3_WIDTH = 288;
const MARGIN = 8;

// 与 TaskDetailModal 保持一致：判断 Tiptap JSON 是否为空内容
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

/** 从 deadline 拆出日期与显式时间（23:59 / 00:00 视为「未设置时间」的整日截止） */
function splitDeadline(deadline?: number): { date: string | null; time: string } {
  if (!deadline) return { date: null, time: '' };
  const d = dayjs(deadline);
  const hm = d.format('HH:mm');
  const isAllDay = hm === '23:59' || hm === '00:00';
  return { date: d.format('YYYY-MM-DD'), time: isAllDay ? '' : hm };
}

/** 由日期 + 可选时间合成 deadline；无时间按当天 23:59:59.999 */
function composeDeadline(dateYMD: string, time: string): number {
  const base = dayjs(dateYMD);
  if (time) {
    const [h, m] = time.split(':').map(Number);
    return base.hour(h).minute(m).second(0).millisecond(0).valueOf();
  }
  return base.endOf('day').valueOf();
}

interface AnchorRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
}

export interface TaskDraft {
  title: string;
  description?: string;
  deadline?: number;
  scheduledDate?: string;
  reminder?: string;
}

interface TaskQuickEditPopoverProps {
  /** 编辑模式：传入既有任务；缺省为新建模式 */
  task?: Task;
  /** 新建模式：目标象限（决定旗标颜色） */
  quadrant?: QuadrantType;
  anchorRect: AnchorRect;
  onSave?: (taskId: string, updates: Partial<Task>, isHighFreq?: boolean) => void;
  onCreate?: (draft: TaskDraft) => void;
  onClose: () => void;
}

/** 对外暴露的命令式句柄：供子窗口模式下主窗口蒙版逐层关闭 / 应用失焦时整体关闭 */
export interface TaskQuickEditHandle {
  closeTopLayer: () => void;
  closeAll: () => void;
}

export const TaskQuickEditPopover = memo(forwardRef<TaskQuickEditHandle, TaskQuickEditPopoverProps>(({ task, quadrant, anchorRect, onSave, onCreate, onClose }, handleRef) => {
  const isCreate = !task;
  const meta = QUADRANT_META[task?.quadrant ?? quadrant ?? 'Q2'];

  // ---------- 标题 / 描述（编辑模式沿用 TaskDetailModal 的防抖自动保存） ----------
  const [title, setTitle] = useState(task?.title ?? '');
  const latestTitle = useRef(task?.title ?? '');
  const latestDescription = useRef(task?.description || '');
  const timers = useRef<Record<string, number>>({});

  useEffect(() => {
    latestTitle.current = title;
  }, [title]);

  const triggerAutoSave = (updates: Partial<Task>, isHighFreq = true) => {
    if (!task || !onSave) return; // 新建模式：只存草稿，提交时一次性创建
    const key = Object.keys(updates)[0];
    if (timers.current[key]) {
      window.clearTimeout(timers.current[key]);
    }
    timers.current[key] = window.setTimeout(() => {
      onSave(task.id, updates, isHighFreq);
      delete timers.current[key];
    }, 500);
  };

  const flushSaves = () => {
    Object.keys(timers.current).forEach(key => window.clearTimeout(timers.current[key]));
    timers.current = {};
    if (!task || !onSave) return;

    const updates: Partial<Task> = {};
    if (latestTitle.current.trim() && latestTitle.current.trim() !== task.title) {
      updates.title = latestTitle.current.trim();
    }
    const isDescEmpty = checkJsonEmpty(latestDescription.current);
    const finalDesc = isDescEmpty ? '' : latestDescription.current;
    if (finalDesc !== (task.description || '')) {
      updates.description = finalDesc || undefined;
    }
    if (Object.keys(updates).length > 0) {
      onSave(task.id, updates, false);
    }
  };

  // ---------- 日期 / 时间 / 提醒状态 ----------
  const { date: initDate, time: initTime } = splitDeadline(task?.deadline);
  const [dateSel, setDateSel] = useState<string | null>(initDate);
  const [timeSel, setTimeSel] = useState<string>(initTime);
  const [appliedReminder, setAppliedReminder] = useState<TaskReminder | null>(() => parseReminder(task?.reminder));

  const todayStr = dayjs().format('YYYY-MM-DD');
  const [viewYM, setViewYM] = useState(() => {
    const base = initDate ? dayjs(initDate) : dayjs();
    return { y: base.year(), m: base.month() };
  });

  const [dateOpen, setDateOpen] = useState(false);
  const [third, setThird] = useState<'time' | 'remind' | null>(null);

  const commitDeadline = (nextDate: string | null, nextTime: string) => {
    setDateSel(nextDate);
    setTimeSel(nextTime);
    if (task && onSave) {
      onSave(
        task.id,
        {
          deadline: nextDate ? composeDeadline(nextDate, nextTime) : undefined,
          scheduledDate: nextDate || undefined,
        },
        false
      );
    }
  };

  // ---------- 提醒草稿（第三层 B，保存时才写回） ----------
  const [draftOffset, setDraftOffset] = useState<number | null>(appliedReminder ? appliedReminder.offsetDays : null);
  const [draftTime, setDraftTime] = useState(appliedReminder?.time || '09:00');
  const [draftRepeat, setDraftRepeat] = useState(appliedReminder?.repeat || false);
  const [customMode, setCustomMode] = useState(false);

  const openRemind = () => {
    setDraftOffset(appliedReminder ? appliedReminder.offsetDays : null);
    setDraftTime(appliedReminder?.time || '09:00');
    setDraftRepeat(appliedReminder?.repeat || false);
    setCustomMode(!!appliedReminder && ![0, 1, 2, 3, 7].includes(appliedReminder.offsetDays));
    setThird('remind');
  };

  const saveRemind = () => {
    const next: TaskReminder | null =
      draftOffset === null ? null : { offsetDays: draftOffset, time: draftTime || '09:00', repeat: draftRepeat };
    setAppliedReminder(next);
    if (task && onSave) {
      onSave(task.id, { reminder: next ? serializeReminder(next) : undefined }, false);
    }
    setThird(null);
  };

  // ---------- 新建模式：提交草稿（经 ref 读取最新值，避免事件闭包过期） ----------
  const draftRef = useRef({ dateSel, timeSel, appliedReminder });
  useEffect(() => {
    draftRef.current = { dateSel, timeSel, appliedReminder };
  });

  const submitCreate = () => {
    const t = latestTitle.current.trim();
    if (!t) return;
    const { dateSel: d, timeSel: tm, appliedReminder: r } = draftRef.current;
    const isDescEmpty = checkJsonEmpty(latestDescription.current);
    onCreate?.({
      title: t,
      description: isDescEmpty ? undefined : latestDescription.current,
      deadline: d ? composeDeadline(d, tm) : undefined,
      scheduledDate: d || undefined,
      reminder: r ? serializeReminder(r) : undefined,
    });
  };

  const handleClose = () => {
    if (isCreate) submitCreate();
    else flushSaves();
    onClose();
  };

  // ---------- 定位 ----------
  const popRef = useRef<HTMLDivElement>(null);
  const datePopRef = useRef<HTMLDivElement>(null);
  const dateFieldRef = useRef<HTMLButtonElement>(null);
  const timeRowRef = useRef<HTMLButtonElement>(null);
  const remindRowRef = useRef<HTMLButtonElement>(null);
  const timePopRef = useRef<HTMLDivElement>(null);
  const remindPopRef = useRef<HTMLDivElement>(null);
  const timeListRef = useRef<HTMLDivElement>(null);

  const [l1Pos, setL1Pos] = useState<{ top: number; left: number } | null>(null);
  const [l2Pos, setL2Pos] = useState<{ top: number; left: number } | null>(null);
  const [l3Pos, setL3Pos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = popRef.current;
    if (!el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = el.offsetHeight;
    const left = Math.min(Math.max(anchorRect.left, MARGIN), vw - L1_WIDTH - MARGIN);
    let top = anchorRect.bottom + 6;
    if (top + h > vh - MARGIN) {
      top = Math.max(MARGIN, anchorRect.top - h - 6);
    }
    setL1Pos({ top, left });
  }, [anchorRect]);

  useLayoutEffect(() => {
    if (!dateOpen) {
      setL2Pos(null);
      return;
    }
    const el = datePopRef.current;
    const pop = popRef.current;
    if (!el || !pop || !l1Pos) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = el.offsetHeight;
    // 优先展开在第一层左侧，空间不足则翻到右侧
    let left = l1Pos.left - 12 - L2_WIDTH;
    if (left < MARGIN) {
      left = Math.min(l1Pos.left + L1_WIDTH + 12, vw - L2_WIDTH - MARGIN);
    }
    const fieldRect = dateFieldRef.current?.getBoundingClientRect();
    let top = fieldRect ? fieldRect.top : l1Pos.top;
    top = Math.min(Math.max(top, MARGIN), vh - h - MARGIN);
    setL2Pos({ top, left });
  }, [dateOpen, l1Pos, viewYM]);

  useLayoutEffect(() => {
    if (!third) {
      setL3Pos(null);
      return;
    }
    const anchor = third === 'time' ? timeRowRef.current : remindRowRef.current;
    const el = third === 'time' ? timePopRef.current : remindPopRef.current;
    if (!anchor || !el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = anchor.getBoundingClientRect();
    const h = el.offsetHeight;
    const left = Math.min(Math.max(r.left, MARGIN), vw - L3_WIDTH - MARGIN);
    const top = Math.min(Math.max(r.bottom - h, MARGIN), vh - h - MARGIN);
    setL3Pos({ top, left });
  }, [third, customMode]);

  // 打开时间下拉时选中项滚动到中间
  useEffect(() => {
    if (third === 'time') {
      const sel = timeListRef.current?.querySelector('.sel');
      sel?.scrollIntoView({ block: 'center' });
    }
  }, [third]);

  // ---------- 分层关闭：外部点击 / Esc / 主窗口蒙版 ----------
  const closeOneLayer = () => {
    if (third) {
      setThird(null);
      return;
    }
    if (dateOpen) {
      setDateOpen(false);
      return;
    }
    handleClose();
  };

  useImperativeHandle(handleRef, () => ({ closeTopLayer: closeOneLayer, closeAll: handleClose }));

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // 防护：若 e.target 已经在点击回调中被 React 卸载（如选择下拉菜单选项），绝不触发外部点击关闭
      if (!t || !document.body.contains(t)) return;

      if (timePopRef.current?.contains(t) || remindPopRef.current?.contains(t)) return;
      if (third) {
        setThird(null);
        return;
      }
      if (datePopRef.current?.contains(t) || dateFieldRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) {
        setDateOpen(false);
        return;
      }

      handleClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      closeOneLayer();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [third, dateOpen, task?.id]);

  // ---------- 字段回显 ----------
  const fieldText = useMemo(() => {
    if (!dateSel) return '日期与提醒';
    const d = dayjs(dateSel);
    let text = `${d.month() + 1}月${d.date()}日`;
    if (timeSel) text += ` ${timeSel}`;
    if (appliedReminder) text += ` · ${reminderLabel(appliedReminder)}提醒`;
    return text;
  }, [dateSel, timeSel, appliedReminder]);

  // ---------- 月历 ----------
  const calendarCells = useMemo(() => {
    const first = dayjs(new Date(viewYM.y, viewYM.m, 1));
    const offset = (first.day() + 6) % 7; // 周一为首列
    const start = first.subtract(offset, 'day');
    return Array.from({ length: 42 }, (_, i) => {
      const d = start.add(i, 'day');
      return { ymd: d.format('YYYY-MM-DD'), label: d.date(), dim: d.month() !== viewYM.m };
    });
  }, [viewYM]);

  const shiftMonth = (delta: number) => {
    const next = dayjs(new Date(viewYM.y, viewYM.m, 1)).add(delta, 'month');
    setViewYM({ y: next.year(), m: next.month() });
  };

  const quickPick = (daysFromToday: number, time?: string) => {
    const d = dayjs().add(daysFromToday, 'day').format('YYYY-MM-DD');
    commitDeadline(d, time !== undefined ? time : timeSel);
    setViewYM({ y: dayjs(d).year(), m: dayjs(d).month() });
  };

  // ---------- 手动时间输入 ----------
  const [timeInput, setTimeInput] = useState(timeSel);
  useEffect(() => setTimeInput(timeSel), [timeSel]);

  const commitTimeInput = () => {
    const m = timeInput.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) {
      setTimeInput(timeSel);
      return;
    }
    const h = Math.min(23, parseInt(m[1], 10));
    const min = Math.min(59, parseInt(m[2], 10));
    const t = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    commitDeadline(dateSel || todayStr, t);
    setThird(null);
  };

  const timeOptions = useMemo(() => {
    const list: string[] = [];
    for (let h = 8; h <= 22; h++) {
      list.push(`${String(h).padStart(2, '0')}:00`, `${String(h).padStart(2, '0')}:30`);
    }
    return list;
  }, []);

  const focusDesc = () => {
    const pm = popRef.current?.querySelector<HTMLElement>('.tqe-desc-editor .ProseMirror');
    pm?.focus();
  };

  return createPortal(
    <>
      {/* ===== 第一层：任务快捷编辑浮层 ===== */}
      <div
        ref={popRef}
        className="tqe-popover"
        role="dialog"
        aria-label="编辑任务"
        style={{ top: l1Pos?.top ?? -9999, left: l1Pos?.left ?? -9999, width: L1_WIDTH }}
      >
        <div className="tqe-toprow">
          <button
            ref={dateFieldRef}
            type="button"
            className={`tqe-date-field ${dateSel ? 'has-value' : ''}`}
            onClick={() => {
              setThird(null);
              setDateOpen(v => !v);
            }}
          >
            <CalendarDays size={17} />
            <span className="txt">{fieldText}</span>
          </button>
          <button
            type="button"
            className="tqe-flag"
            title={`所属象限：${meta.name}`}
            aria-label={`所属象限：${meta.name}`}
            style={{ color: meta.color }}
          >
            <Flag size={17} fill="currentColor" />
          </button>
        </div>
        <div className="tqe-body">
          <div className="tqe-title-row">
            <input
              className="tqe-title"
              type="text"
              placeholder="准备做什么？"
              value={title}
              autoFocus
              onChange={(e) => {
                setTitle(e.target.value);
                if (e.target.value.trim()) {
                  triggerAutoSave({ title: e.target.value.trim() }, true);
                }
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                if (isCreate) handleClose();
                else (e.currentTarget as HTMLInputElement).blur();
              }}
              onBlur={() => {
                if (!title.trim() && task) setTitle(task.title);
              }}
            />
            <button type="button" className="tqe-desc-icon" title="任务描述" aria-label="任务描述" onClick={focusDesc}>
              <AlignLeft size={17} />
            </button>
          </div>
          <div className="tqe-desc-editor">
            <ReactjsTiptapEditor
              key={task?.id ?? 'tqe-new'}
              initialContent={task?.description || ''}
              onChange={(jsonStr: string) => {
                latestDescription.current = jsonStr;
                triggerAutoSave({ description: jsonStr }, true);
              }}
              showToolbar={false}
              className="task-detail-reactjs-tiptap"
            />
          </div>
        </div>
      </div>

      {/* ===== 第二层：日期与提醒 ===== */}
      {dateOpen && (
        <div
          ref={datePopRef}
          className="tqe-date-popover"
          role="dialog"
          aria-label="日期与提醒"
          style={{ top: l2Pos?.top ?? -9999, left: l2Pos?.left ?? -9999, width: L2_WIDTH }}
        >
          <div className="tqe-tabs">
            <button type="button" className="on">日期</button>
            <button type="button" disabled title="暂未支持">时间段</button>
          </div>

          <div className="tqe-quick">
            <button type="button" title="今天" aria-label="今天" onClick={() => quickPick(0)}>
              <Sun size={20} />
            </button>
            <button type="button" title="明天" aria-label="明天" onClick={() => quickPick(1)}>
              <Sunrise size={20} />
            </button>
            <button type="button" title="下周（+7 天）" aria-label="下周，加 7 天" onClick={() => quickPick(7)}>
              <CalendarPlus size={20} />
            </button>
            <button type="button" title="今晚 20:00" aria-label="今晚" onClick={() => quickPick(0, '20:00')}>
              <Moon size={20} />
            </button>
          </div>

          <div className="tqe-month">
            {viewYM.y}年{viewYM.m + 1}月
            <span className="nav">
              <button type="button" aria-label="上个月" onClick={() => shiftMonth(-1)}>
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                aria-label="回到今天"
                onClick={() => setViewYM({ y: dayjs().year(), m: dayjs().month() })}
              >
                <Circle size={7} />
              </button>
              <button type="button" aria-label="下个月" onClick={() => shiftMonth(1)}>
                <ChevronRight size={14} />
              </button>
            </span>
          </div>

          <div className="tqe-grid">
            {['一', '二', '三', '四', '五', '六', '日'].map(w => (
              <span key={w} className="wd">{w}</span>
            ))}
            {calendarCells.map(cell => (
              <button
                key={cell.ymd}
                type="button"
                className={
                  'day' +
                  (cell.dim ? ' dim' : '') +
                  (cell.ymd === dateSel ? ' sel' : '') +
                  (cell.ymd === todayStr && cell.ymd !== dateSel ? ' today' : '')
                }
                onClick={() => {
                  if (cell.dim) {
                    setViewYM({ y: dayjs(cell.ymd).year(), m: dayjs(cell.ymd).month() });
                  }
                  commitDeadline(cell.ymd, timeSel);
                }}
              >
                {cell.label}
              </button>
            ))}
          </div>

          <div className="tqe-rows">
            <button
              ref={timeRowRef}
              type="button"
              className="tqe-row"
              onClick={() => setThird(t => (t === 'time' ? null : 'time'))}
            >
              <Clock size={16} />
              时间
              <span className={`val ${timeSel ? '' : 'empty'}`}>{timeSel}</span>
              <span className="chev">›</span>
            </button>
            <button
              ref={remindRowRef}
              type="button"
              className="tqe-row"
              onClick={() => (third === 'remind' ? setThird(null) : openRemind())}
            >
              <Bell size={16} />
              提醒
              <span className={`val ${appliedReminder ? '' : 'empty'}`}>
                {appliedReminder ? reminderLabel(appliedReminder) : ''}
              </span>
              <span className="chev">›</span>
            </button>
          </div>
        </div>
      )}

      {/* ===== 第三层 A：时间选择 ===== */}
      {third === 'time' && (
        <div
          ref={timePopRef}
          className="tqe-time-pop"
          role="listbox"
          aria-label="选择时间"
          style={{ top: l3Pos?.top ?? -9999, left: l3Pos?.left ?? -9999, width: L3_WIDTH }}
        >
          <div className="tqe-time-list" ref={timeListRef}>
            {timeOptions.map(t => (
              <button
                key={t}
                type="button"
                className={t === timeSel ? 'sel' : ''}
                onClick={() => {
                  commitDeadline(dateSel || todayStr, t);
                  setThird(null);
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="tqe-time-input-row">
            <Clock size={15} />
            <input
              type="text"
              value={timeInput}
              placeholder="HH:mm"
              aria-label="输入时间"
              onChange={(e) => setTimeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commitTimeInput()}
              onBlur={commitTimeInput}
            />
            <button
              type="button"
              className="clear"
              aria-label="清除时间"
              onClick={() => {
                setTimeInput('');
                if (dateSel) commitDeadline(dateSel, '');
                else setTimeSel('');
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* ===== 第三层 B：提醒设置 ===== */}
      {third === 'remind' && (
        <div
          ref={remindPopRef}
          className="tqe-remind-pop"
          role="dialog"
          aria-label="提醒设置"
          style={{ top: l3Pos?.top ?? -9999, left: l3Pos?.left ?? -9999, width: L3_WIDTH }}
        >
          {[0, 1, 2, 3, 7].map(off => (
            <button
              key={off}
              type="button"
              className={`opt ${!customMode && draftOffset === off ? 'sel' : ''}`}
              onClick={() => {
                setCustomMode(false);
                setDraftOffset(prev => (prev === off && !customMode ? null : off));
              }}
            >
              {off === 0 ? '当天' : `提前 ${off} 天`} <span className="at">({draftTime})</span>
            </button>
          ))}
          <button
            type="button"
            className={`opt ${customMode ? 'sel' : ''}`}
            onClick={() => {
              setCustomMode(v => !v);
              setDraftOffset(prev => (customMode ? null : prev ?? 0));
            }}
          >
            自定义
          </button>
          {customMode && (
            <div className="tqe-remind-custom">
              <label>
                提前
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={draftOffset ?? 0}
                  onChange={(e) => setDraftOffset(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
                />
                天
              </label>
              <input
                type="time"
                value={draftTime}
                onChange={(e) => setDraftTime(e.target.value || '09:00')}
              />
            </div>
          )}
          <div className="tqe-remind-repeat">
            持续提醒
            <button
              type="button"
              className={`tqe-switch ${draftRepeat ? 'on' : ''}`}
              role="switch"
              aria-checked={draftRepeat}
              aria-label="持续提醒"
              onClick={() => setDraftRepeat(v => !v)}
            />
          </div>
          <div className="tqe-remind-actions">
            <button type="button" className="btn-save" onClick={saveRemind}>保存</button>
            <button type="button" className="btn-cancel" onClick={() => setThird(null)}>取消</button>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}));
