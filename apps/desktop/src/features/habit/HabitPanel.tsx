import React, { useEffect, useState, useRef, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ChevronDown,
  LayoutGrid,
  Plus,
  MoreHorizontal,
  Smile,
  CheckCircle2,
  Calendar,
  Flame,
  Award,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  X,
  Check
} from 'lucide-react';
import { Habit, HabitStats } from './habitTypes';
import { useHabitStore } from './habitStore';
import {
  useHabitData,
  useCreateHabitMutation,
  useUpdateHabitMutation,
  useDeleteHabitMutation,
  useToggleCheckInMutation,
} from './useHabitQuery';
import * as habitSelectors from './habitSelectors';
import type { HabitCheckIn } from './habitTypes';
import { useConfirmDialog } from '../../components/ui/ConfirmDeleteDialog';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { formatDateYMD as formatDateStr } from '../../lib/dateUtils';
import { logError, logWarn } from '@humanmanual/core';

// ============================================================
// Notification Helper
// ============================================================

export const requestNotificationPermission = async () => {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === 'granted';
    }
  } catch (e) {
    logWarn('habitPanel', 'Tauri notification permission check failed', e);
  }
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
};

export const sendDesktopNotification = async (title: string, body: string) => {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === 'granted';
    }
    if (granted) {
      sendNotification({ title, body });
      return;
    }
  } catch (e) {
    logWarn('habitPanel', 'Tauri notification plugin failed, trying Web Notification fallback', e);
  }
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body });
    } catch (e) {
      logError('habitPanel', 'Web Notification failed', e);
    }
  }
};

// ============================================================
// Shared Helpers & Constants
// ============================================================

/** Format a Date object to 'HH:MM:SS' string */
const formatTimeStr = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

/** Get recent 7 days info (today and 6 days before) */
const getDaysAround = () => {
  const base = new Date();
  const days = [];
  for (let i = -6; i <= 0; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    days.push({
      dateStr: formatDateStr(d),
      dayNum: d.getDate(),
      dayOfWeek: d.getDay() // 0 is Sunday, 1 is Monday...
    });
  }
  return days;
};

/** Parse raw duration string from backend into form-friendly values */
const parseDuration = (raw: string): { duration: string; customDays: string } => {
  if (!raw || ['7days', '30days', '60days', '21days', 'forever'].includes(raw)) {
    return { duration: raw || '30days', customDays: '14' };
  }
  const match = raw.match(/^custom:(\d+)$/);
  return match
    ? { duration: 'custom', customDays: match[1] }
    : { duration: 'custom', customDays: raw.replace(/\D/g, '') || '14' };
};

const WEEK_DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const SHORT_WEEK_DAYS = ['一', '二', '三', '四', '五', '六', '日'];

const FREQUENCY_OPTIONS = [
  { value: 'everyday', label: '每天' },
  { value: 'weekly', label: '每周' },
] as const;

const GOAL_OPTIONS = [
  { value: 'today', label: '当天完成打卡' },
  { value: 'times', label: '完成特定次数' },
] as const;

const DURATION_OPTIONS = [
  { value: '7days', label: '7天' },
  { value: '30days', label: '30天' },
  { value: '60days', label: '60天' },
  { value: 'forever', label: '永远' },
  { value: 'custom', label: '自定义' },
] as const;

const GROUP_OPTIONS = [
  { value: 'body', label: '身体' },
  { value: 'spirit', label: '精神' },
  { value: 'intellect', label: '智力' },
  { value: 'emotion', label: '情感' },
] as const;

const STAT_CARDS: {
  icon: React.FC<{ size?: number }>;
  bgClass: string;
  textClass: string;
  key: keyof HabitStats;
  label: string;
  suffix?: string;
}[] = [
  { icon: Calendar, bgClass: 'bg-blue-50', textClass: 'text-blue-500', key: 'monthCheckIns', label: '本月完成/天' },
  { icon: CheckCircle2, bgClass: 'bg-emerald-50', textClass: 'text-emerald-500', key: 'totalCheckIns', label: '累计完成/天' },
  { icon: Flame, bgClass: 'bg-orange-50', textClass: 'text-orange-500', key: 'currentStreak', label: '当前连续/天' },
  { icon: Award, bgClass: 'bg-indigo-50', textClass: 'text-indigo-500', key: 'monthlyCompletionRate', label: '本月完成率', suffix: '%' },
];

/** Shared form input className */
const INPUT_CLASS = 'h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-blue-500 cursor-pointer';

// ============================================================
// Shared UI Components
// ============================================================

/** Unified habit avatar icon */
const HabitAvatar: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const sizeMap = { sm: 24, md: 28, lg: 32 };
  const containerMap = { sm: 'w-10 h-10', md: 'w-12 h-12', lg: 'w-14 h-14' };
  return (
    <div className={`${containerMap[size]} rounded-full bg-[#a8e063] flex items-center justify-center shadow-sm shrink-0 transition-transform hover:scale-105 duration-200`}>
      <Smile className="text-yellow-400" size={sizeMap[size]} fill="currentColor" />
    </div>
  );
};

/** Shared modal overlay shell with portal */
const ModalShell: React.FC<{ children: ReactNode }> = ({ children }) => {
  return createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      {children}
    </div>,
    document.body
  );
};

// ============================================================
// Form State (CreateEditModal)
// ============================================================

interface HabitFormState {
  name: string;
  frequency: string;
  goal: string;
  duration: string;
  customDays: string;
  group: string;
  autoPopupLog: boolean;
  checkInTime: string;
  startDate: string;
  errorMsg: string;
}

const INITIAL_FORM_STATE: HabitFormState = {
  name: '', frequency: 'everyday', goal: 'today',
  duration: '30days', customDays: '14', group: 'body',
  autoPopupLog: false, checkInTime: '08:00:00', startDate: '', errorMsg: '',
};

// ============================================================
// Sub-component: DateSwitcher
// ============================================================

interface DateSwitcherProps {
  currentDate: string;
  onChange: (date: string) => void;
}

const DateSwitcher: React.FC<DateSwitcherProps> = ({ currentDate, onChange }) => {
  const days = getDaysAround();

  return (
    <div className="flex items-center justify-between px-4 py-4 bg-white relative">
      <div className="flex gap-6 md:gap-8 overflow-x-auto w-full hide-scrollbar pb-1 justify-between px-2">
        {days.map((d) => {
          const isSelected = d.dateStr === currentDate;

          return (
            <div
              key={d.dateStr}
              onClick={() => onChange(d.dateStr)}
              className="flex flex-col items-center justify-center w-12 cursor-pointer transition-all duration-200 shrink-0 gap-1 group"
            >
              <span className={clsx("text-xs font-medium transition-colors", isSelected ? "text-blue-500 font-semibold" : "text-gray-400 group-hover:text-gray-600")}>
                {WEEK_DAYS[d.dayOfWeek]}
              </span>
              <span className={clsx("text-lg font-bold transition-transform group-hover:scale-110 duration-200", isSelected ? "text-blue-500 scale-110" : "text-gray-600")}>
                {d.dayNum}
              </span>
              <div className={clsx(
                "w-[18px] h-[18px] rounded-full border-2 mt-1 transition-all duration-200",
                isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200 group-hover:border-gray-300"
              )} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================
// Sub-component: OverviewCards (data-driven)
// ============================================================

// Stable empty references so query-cache misses don't churn memo deps.
const EMPTY_CHECKINS: HabitCheckIn[] = [];
const EMPTY_HABITS: Habit[] = [];

const OverviewCards: React.FC<{ habit: Habit }> = ({ habit }) => {
  const currentDate = useHabitStore(state => state.currentDate);
  const { data } = useHabitData();
  const checkIns = data?.checkIns ?? EMPTY_CHECKINS;

  const stats = useMemo(() => habitSelectors.getStats(checkIns, habit.id, currentDate), [checkIns, habit.id, currentDate]);

  return (
    <div className="grid grid-cols-2 gap-3 w-full">
      {STAT_CARDS.map(({ icon: Icon, bgClass, textClass, key, label, suffix }) => (
        <div key={key} className="bg-white rounded-xl p-3.5 shadow-sm border border-gray-50 flex items-center gap-3 transition-transform hover:-translate-y-0.5 duration-200">
          <div className={`w-10 h-10 rounded-full ${bgClass} flex items-center justify-center ${textClass} shrink-0`}>
            <Icon size={20} />
          </div>
          <div>
            <div className="text-xl font-bold text-gray-800">{stats[key]}{suffix}</div>
            <div className="text-xs text-gray-500 font-medium">{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================================================
// Sub-component: CalendarHeatmapComponent (Set-based lookup)
// ============================================================

const CalendarHeatmapComponent: React.FC<{ habit: Habit }> = ({ habit }) => {
  const { data } = useHabitData();
  const checkIns = data?.checkIns ?? EMPTY_CHECKINS;
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Pre-build a Set for O(1) check-in lookup instead of O(n) .some()
  const checkedInDates = useMemo(() => {
    const set = new Set<string>();
    checkIns.forEach(ci => {
      if (ci.habitId === habit.id && ci.completed) set.add(ci.date);
    });
    return set;
  }, [checkIns, habit.id]);

  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDay = new Date(year, month, 1);
    let startingDay = firstDay.getDay() - 1;
    if (startingDay === -1) startingDay = 6;

    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    const days = [];
    for (let i = 0; i < startingDay; i++) {
      days.push({
        date: new Date(year, month - 1, prevMonthTotalDays - startingDay + i + 1),
        isCurrentMonth: false
      });
    }
    for (let i = 1; i <= totalDays; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      });
    }
    const remainingCells = 42 - days.length;
    for (let i = 1; i <= remainingCells; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false
      });
    }
    return days;
  }, [currentMonth]);

  const handlePrevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  return (
    <div className="w-full flex flex-col items-center">
      <div className="flex items-center justify-between w-full mb-6 px-2">
        <button onClick={handlePrevMonth} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <ChevronLeft size={16} />
        </button>
        <span className="text-[15px] font-medium text-gray-800">
          {currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月
        </span>
        <button onClick={handleNextMonth} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 w-full text-center gap-y-4">
        {SHORT_WEEK_DAYS.map(day => (
          <div key={day} className="text-xs text-gray-500 font-medium mb-2">{day}</div>
        ))}

        {daysInMonth.map((dayInfo, idx) => {
          const checkedIn = checkedInDates.has(formatDateStr(dayInfo.date));
          const today = isToday(dayInfo.date);

          return (
            <div key={idx} className="flex flex-col items-center justify-center gap-1.5 group">
              <span className={clsx(
                "text-xs font-medium transition-colors",
                !dayInfo.isCurrentMonth ? "text-gray-300" :
                  today ? "text-blue-500 font-bold" : "text-gray-600"
              )}>
                {dayInfo.date.getDate()}
              </span>
              <div className={clsx(
                "w-6 h-6 rounded-full transition-all duration-300 transform group-hover:scale-110 flex items-center justify-center",
                checkedIn ? "bg-[#a8e063] shadow-sm shadow-[#a8e063]/50 scale-105" : "bg-[#f3f4f6]"
              )}>
                {checkedIn && <Check size={12} className="text-white stroke-[3]" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================
// Sub-component: CreateEditModal (aggregated form state)
// ============================================================

interface CreateEditModalProps {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (data: Partial<Habit>) => Promise<void>;
  initialData?: Habit | null;
}

const CreateEditModal: React.FC<CreateEditModalProps> = ({
  visible,
  onCancel,
  onSubmit,
  initialData
}) => {
  const [form, setForm] = useState<HabitFormState>(INITIAL_FORM_STATE);

  const updateField = <K extends keyof HabitFormState>(key: K, value: HabitFormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (visible && initialData) {
      const { duration, customDays } = parseDuration(initialData.duration || '30days');
      setForm({
        name: initialData.name || '',
        frequency: initialData.frequency || 'everyday',
        goal: initialData.goal || 'today',
        duration,
        customDays,
        group: initialData.group || 'body',
        autoPopupLog: initialData.autoPopupLog || false,
        checkInTime: initialData.checkInTime || '08:00:00',
        startDate: initialData.startDate || '',
        errorMsg: '',
      });
    } else if (visible) {
      const now = new Date();
      setForm({
        ...INITIAL_FORM_STATE,
        checkInTime: formatTimeStr(now),
        startDate: formatDateStr(now),
      });
    }
  }, [visible, initialData]);

  if (!visible) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      updateField('errorMsg', '请输入习惯名称');
      return;
    }

    const finalDuration = form.duration === 'custom' ? `custom:${form.customDays || '14'}` : form.duration;

    await onSubmit({
      name: form.name.trim(),
      frequency: form.frequency,
      goal: form.goal,
      duration: finalDuration,
      group: form.group,
      autoPopupLog: form.autoPopupLog,
      checkInTime: form.autoPopupLog ? form.checkInTime : undefined,
      startDate: form.startDate || undefined
    });
    onCancel();
  };

  return (
    <ModalShell>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-lg text-gray-800">
            {initialData ? '编辑习惯' : '添加习惯'}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex items-center gap-4 mb-2">
            <div className="relative cursor-pointer flex-shrink-0">
              <HabitAvatar size="lg" />
              <div className="absolute bottom-0 right-0 bg-white rounded-full p-1 shadow-sm border border-gray-100">
                <Edit2 size={12} className="text-gray-500" />
              </div>
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={form.name}
                onChange={(e) => {
                  updateField('name', e.target.value);
                  if (form.errorMsg) updateField('errorMsg', '');
                }}
                placeholder="每天进步一点点"
                className={`w-full h-12 px-4 rounded-xl border text-base outline-none transition-colors ${
                  form.errorMsg ? 'border-red-400 bg-red-50/50' : 'border-gray-200 focus:border-blue-500 bg-gray-50/30'
                }`}
              />
              {form.errorMsg && <p className="text-xs text-red-500 mt-1 pl-1">{form.errorMsg}</p>}
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-4 items-center gap-3">
              <label className="text-sm font-medium text-gray-700 text-right">频率</label>
              <select
                value={form.frequency}
                onChange={(e) => updateField('frequency', e.target.value)}
                className={`col-span-3 ${INPUT_CLASS}`}
              >
                {FREQUENCY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-4 items-center gap-3">
              <label className="text-sm font-medium text-gray-700 text-right">目标</label>
              <select
                value={form.goal}
                onChange={(e) => updateField('goal', e.target.value)}
                className={`col-span-3 ${INPUT_CLASS}`}
              >
                {GOAL_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-4 items-center gap-3">
              <label className="text-sm font-medium text-gray-700 text-right">开始日期</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => updateField('startDate', e.target.value)}
                className={`col-span-3 ${INPUT_CLASS}`}
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-3">
              <label className="text-sm font-medium text-gray-700 text-right flex items-center justify-end gap-1">
                <span>坚持时间</span>
              </label>
              <div className="col-span-3 flex items-center gap-2">
                <select
                  value={form.duration}
                  onChange={(e) => updateField('duration', e.target.value)}
                  className={`flex-1 ${INPUT_CLASS}`}
                >
                  {DURATION_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {form.duration === 'custom' && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={form.customDays}
                      onChange={(e) => updateField('customDays', e.target.value)}
                      className="w-20 h-10 px-2 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-blue-500"
                    />
                    <span className="text-sm text-gray-500">天</span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-3">
              <label className="text-sm font-medium text-gray-700 text-right">所属分组</label>
              <select
                value={form.group}
                onChange={(e) => updateField('group', e.target.value)}
                className={`col-span-3 ${INPUT_CLASS}`}
              >
                {GROUP_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-4 items-center gap-3 pt-2">
              <div />
              <label className="col-span-3 flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.autoPopupLog}
                  onChange={(e) => updateField('autoPopupLog', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>自动触发桌面系统提醒</span>
              </label>
            </div>

            {form.autoPopupLog && (
              <div className="grid grid-cols-4 items-center gap-3">
                <label className="text-sm font-medium text-gray-700 text-right">提醒时间</label>
                <input
                  type="time"
                  step="1"
                  value={form.checkInTime}
                  onChange={(e) => updateField('checkInTime', e.target.value)}
                  className={`col-span-3 ${INPUT_CLASS}`}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-[#4a72ff] hover:bg-blue-600 text-white text-sm font-medium transition-colors shadow-sm cursor-pointer"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
};

// ============================================================
// Sub-component: HabitSidebar
// ============================================================

interface HabitSidebarProps {
  habit: Habit;
  onClose: () => void;
}

const HabitSidebar: React.FC<HabitSidebarProps> = ({ habit, onClose }) => {
  const deleteHabitMutation = useDeleteHabitMutation();
  const updateHabitMutation = useUpdateHabitMutation();
  const { confirm: confirmDelete } = useConfirmDialog();

  const [isEditModalVisible, setIsEditModalVisible] = useState(false);

  const handleDelete = async () => {
    const confirmed = await confirmDelete({
      title: '删除习惯',
      description: '确定要删除这个习惯吗？该习惯的所有历史打卡记录也将被永久删除。',
      confirmText: '删除',
    });
    if (confirmed) {
      try {
        await deleteHabitMutation.mutateAsync(habit.id);
        onClose();
      } catch (err) {
        logError('habitPanel', 'failed to delete habit', err);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8f9fc]">
      <div className="h-[10%] min-h-[72px] flex items-center justify-between px-6 flex-shrink-0 pt-4">
        <div className="flex items-center gap-3">
          <HabitAvatar size="sm" />
          <h2 className="text-xl font-bold text-gray-800 truncate">{habit.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="p-2 text-gray-500 hover:text-gray-800 transition-colors cursor-pointer rounded-lg hover:bg-gray-200/50 outline-none">
                <MoreHorizontal size={24} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="min-w-[140px] bg-white rounded-xl p-1.5 shadow-lg border border-gray-100 z-50">
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg cursor-pointer outline-none"
                  onSelect={() => {
                    setTimeout(() => setIsEditModalVisible(true), 50);
                  }}
                >
                  <Edit2 size={14} /> 编辑
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg cursor-pointer outline-none"
                  onSelect={() => {
                    setTimeout(handleDelete, 50);
                  }}
                >
                  <Trash2 size={14} /> 删除
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-6">
        <div className="flex-shrink-0">
          <OverviewCards habit={habit} />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-50 p-4 pb-6 flex-shrink-0 mb-6">
          <CalendarHeatmapComponent habit={habit} />
        </div>
      </div>

      <CreateEditModal
        visible={isEditModalVisible}
        onCancel={() => setIsEditModalVisible(false)}
        onSubmit={async (data) => {
          if (data.name) {
            await updateHabitMutation.mutateAsync({ id: habit.id, payload: data });
          }
          setIsEditModalVisible(false);
        }}
        initialData={habit}
      />
    </div>
  );
};

// ============================================================
// Sub-component: HabitItem (Optimized Check-in Animation)
// ============================================================

interface HabitItemProps {
  habit: Habit;
  onClick: () => void;
}

const HabitItem: React.FC<HabitItemProps> = ({ habit, onClick }) => {
  const currentDate = useHabitStore(state => state.currentDate);
  const setCurrentDate = useHabitStore(state => state.setCurrentDate);
  const { data } = useHabitData();
  const checkIns = data?.checkIns ?? EMPTY_CHECKINS;
  const toggleCheckIn = useToggleCheckInMutation();

  const stats = useMemo(() => habitSelectors.getStats(checkIns, habit.id, currentDate), [checkIns, habit.id, currentDate]);

  const last7Days = useMemo(() => {
    const headerDays = getDaysAround();
    return headerDays.map(d => ({
      dateStr: d.dateStr,
      isCheckedIn: habitSelectors.getCheckInStatus(checkIns, habit.id, d.dateStr),
      isActiveDate: d.dateStr === currentDate
    }));
  }, [currentDate, checkIns, habit.id]);

  const handleDotClick = (e: React.MouseEvent, dateStr: string, isActiveDate: boolean) => {
    e.stopPropagation();
    if (!isActiveDate) {
      setCurrentDate(dateStr);
    }
    // Direct toggle check-in without modal popup
    const completed = !habitSelectors.getCheckInStatus(checkIns, habit.id, dateStr);
    toggleCheckIn.mutate({ habitId: habit.id, date: dateStr, completed });
  };

  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200 cursor-pointer group"
    >
      <div className="flex items-center gap-4">
        <HabitAvatar />

        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-800 text-base group-hover:text-blue-600 transition-colors">
              {habit.name}
            </h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400 font-medium mt-1">
            <span>已坚持 {stats.monthCheckIns} 天</span>
            <span>•</span>
            <span>习惯连续 {stats.currentStreak} 天</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {last7Days.map((day) => (
          <button
            key={day.dateStr}
            type="button"
            onClick={(e) => handleDotClick(e, day.dateStr, day.isActiveDate)}
            className={clsx(
              "w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 transform active:scale-75 cursor-pointer outline-none",
              day.isCheckedIn
                ? "bg-gradient-to-tr from-blue-500 to-[#4a72ff] text-white shadow-sm shadow-blue-500/40 scale-100"
                : "bg-gray-100 hover:bg-gray-200 text-transparent opacity-80 hover:opacity-100",
              day.isActiveDate && "ring-2 ring-blue-400 ring-offset-1 scale-105"
            )}
            title={
              day.isActiveDate
                ? `${day.dateStr} (点击${day.isCheckedIn ? '取消打卡' : '完成打卡'})`
                : `${day.dateStr} (点击切换日期并打卡)`
            }
          >
            <Check
              size={13}
              className={clsx(
                "transition-all duration-300 transform stroke-[3]",
                day.isCheckedIn ? "scale-100 opacity-100 rotate-0" : "scale-0 opacity-0 -rotate-45"
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
};

// ============================================================
// Sub-component: HabitList
// ============================================================

interface HabitListProps {
  onHabitClick: (habit: Habit) => void;
}

const HabitList: React.FC<HabitListProps> = ({ onHabitClick }) => {
  const currentDate = useHabitStore(state => state.currentDate);
  const { data } = useHabitData();
  const allHabits = data?.habits ?? EMPTY_HABITS;
  const habits = useMemo(() => habitSelectors.getHabitsForDate(allHabits, currentDate), [allHabits, currentDate]);

  if (habits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-4">
          <Smile size={32} />
        </div>
        <h3 className="text-base font-bold text-gray-700 mb-1">暂无习惯项目</h3>
        <p className="text-xs text-gray-400 max-w-xs">点击右上角的「+」图标创建你的第一个习惯</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
      {habits.map((habit) => (
        <HabitItem
          key={habit.id}
          habit={habit}
          onClick={() => onHabitClick(habit)}
        />
      ))}
    </div>
  );
};

// ============================================================
// Main Export: HabitPanel
// ============================================================

export const HabitPanel: React.FC = () => {
  const currentDate = useHabitStore(state => state.currentDate);
  const setCurrentDate = useHabitStore(state => state.setCurrentDate);
  const createHabitMutation = useCreateHabitMutation();
  const { data } = useHabitData();
  const habits = data?.habits ?? EMPTY_HABITS;
  const checkIns = data?.checkIns ?? EMPTY_CHECKINS;

  // Store IDs instead of objects — derive the actual Habit via useMemo
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const selectedHabit = useMemo(
    () => selectedHabitId ? habits.find(h => h.id === selectedHabitId) ?? null : null,
    [habits, selectedHabitId]
  );

  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);

  const notifiedSetRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Background timer for habit check-in pop-up reminders (30s interval)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const todayStr = formatDateStr(now);
      const currHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      habits.forEach(habit => {
        if (habit.autoPopupLog && habit.checkInTime) {
          const habitHHMM = habit.checkInTime.slice(0, 5);
          const notifyKey = `${todayStr}_${habit.id}_${habitHHMM}`;

          if (currHHMM === habitHHMM && !notifiedSetRef.current.has(notifyKey)) {
            const isCheckedIn = habitSelectors.getCheckInStatus(checkIns, habit.id, todayStr);
            if (!isCheckedIn) {
              notifiedSetRef.current.add(notifyKey);
              // Send desktop system notification directly (same as Pomodoro)
              sendDesktopNotification(
                '习惯打卡提醒 ⏰',
                `时间到了，别忘了完成打卡：「${habit.name}」！`
              );
            }
          }
        }
      });
    }, 30_000);

    return () => clearInterval(timer);
  }, [habits, checkIns]);

  const handleHabitClick = (habit: Habit) => setSelectedHabitId(habit.id);
  const handleCloseSidebar = () => setSelectedHabitId(null);

  return (
    <div className="flex w-full h-full bg-[#f8f9fc] relative overflow-hidden">
      {/* Main Content Area */}
      <div className="flex flex-col flex-1 w-full h-full transition-all duration-300">
        {/* Top Header & Date Switcher */}
        <div className="flex-shrink-0 bg-white z-20 shadow-sm border-b border-gray-100 flex flex-col pt-4">
          <div className="flex items-center justify-between px-6 pb-2">
            <div className="flex items-center gap-1 cursor-pointer">
              <h1 className="text-xl font-bold text-gray-800">习惯</h1>
              <ChevronDown size={20} className="text-gray-400" />
            </div>
            <div className="flex items-center gap-4 text-gray-600">
              <LayoutGrid size={20} className="cursor-pointer hover:text-gray-800" />
              <Plus
                size={24}
                className="cursor-pointer hover:text-gray-800"
                onClick={() => setIsCreateModalVisible(true)}
              />
              <MoreHorizontal size={20} className="cursor-pointer hover:text-gray-800" />
            </div>
          </div>
          <DateSwitcher currentDate={currentDate} onChange={setCurrentDate} />
        </div>

        {/* Bottom 70%: Habit List Area */}
        <div className="h-[70%] flex-1 bg-gray-50 relative z-10 overflow-hidden flex flex-col">
          <HabitList onHabitClick={handleHabitClick} />
        </div>
      </div>

      {/* Sidebar Overlay */}
      {selectedHabit && (
        <>
          <div
            className="absolute inset-0 bg-black/20 z-40 transition-opacity backdrop-blur-sm"
            onClick={handleCloseSidebar}
          />
          <div className="absolute top-0 right-0 h-full w-[480px] bg-white shadow-2xl z-50 transform transition-transform duration-300">
            <HabitSidebar habit={selectedHabit} onClose={handleCloseSidebar} />
          </div>
        </>
      )}

      <CreateEditModal
        visible={isCreateModalVisible}
        onCancel={() => setIsCreateModalVisible(false)}
        onSubmit={async (payload) => {
          await createHabitMutation.mutateAsync(payload);
        }}
      />
    </div>
  );
};
