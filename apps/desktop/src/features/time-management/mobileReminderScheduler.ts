import dayjs from 'dayjs';
import { sendNotification, cancel, Schedule } from '@tauri-apps/plugin-notification';
import { useTimeStore } from './timeManagementStore';
import { Task, parseReminder } from './timeManagementTypes';
import { deadlineBody, getTaskTargetDate } from './taskReminderScheduler';
import { requestNotificationPermission } from '../../lib/notifications';
import { logSilent } from '@humanmanual/core';

// ==========================================
// 移动端任务提醒调度器
// Android 后台 WebView JS 会被冻结，桌面版的 30s 轮询在退后台后失效。
// 改用 tauri-plugin-notification 的 scheduled notification：
// 提醒由系统 AlarmManager 到点投递，应用在后台/被杀后依然可达。
// 策略：任务数据每次变化后全量重排——取消上一批已排通知，
// 重新排入未来 7 天内的提醒（提醒语义与桌面版 check() 完全一致）。
// ==========================================

const SCHEDULE_AHEAD_DAYS = 7;
const MAX_SCHEDULED = 48;
const RESYNC_DEBOUNCE_MS = 3_000;
const IDS_KEY = 'humanmanual_mobile_reminder_ids_v1';

/** `taskId@YYYY-MM-DD` -> 稳定的正 31 位通知 id（FNV-1a），重排时按 id 取消旧通知 */
function notifId(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 1) || 1;
}

interface UpcomingReminder {
  key: string;
  fireAt: Date;
  body: string;
}

/** 与桌面版 check() 同语义：提醒日 = 到期日 − offsetDays；repeat 时逐日直至到期日 */
function computeUpcoming(tasks: Task[]): UpcomingReminder[] {
  const now = dayjs();
  const todayStart = now.startOf('day');
  const horizon = todayStart.add(SCHEDULE_AHEAD_DAYS, 'day').endOf('day');
  const list: UpcomingReminder[] = [];

  for (const task of tasks) {
    if (task.completed) continue;
    const r = parseReminder(task.reminder);
    if (!r) continue;

    const targetDate = getTaskTargetDate(task);
    const deadlineDay = targetDate.startOf('day');
    const remindDay = deadlineDay.subtract(r.offsetDays, 'day');
    const [h, m] = r.time.split(':').map(Number);
    const lastDay = r.repeat ? deadlineDay : remindDay;

    for (let d = remindDay; !d.isAfter(lastDay); d = d.add(1, 'day')) {
      if (d.isBefore(todayStart) || d.isAfter(horizon)) continue;
      const fireAt = d.hour(h || 0).minute(m || 0).second(0).millisecond(0);
      if (!fireAt.isAfter(now)) continue; // 已过时刻交给前台轮询语义外，不再补发

      list.push({
        key: `${task.id}@${d.format('YYYY-MM-DD')}`,
        fireAt: fireAt.toDate(),
        body: deadlineBody(task, deadlineDay.diff(d, 'day')),
      });
    }
  }

  // Android 对未决通知数量有限制，按触发时间就近截断
  list.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  return list.slice(0, MAX_SCHEDULED);
}

/** 全量重排：取消上一批已排通知，重新排入当前任务集的未来提醒 */
export async function resyncMobileReminders(): Promise<void> {
  try {
    const prev: number[] = JSON.parse(localStorage.getItem(IDS_KEY) || '[]');
    if (prev.length) await cancel(prev);
  } catch (e) {
    logSilent('mobileReminderScheduler', 'cancel previous scheduled notifications failed', e);
  }

  const tasks = useTimeStore.getState().data.tasks;
  const upcoming = computeUpcoming(tasks);
  const ids: number[] = [];

  for (const u of upcoming) {
    const id = notifId(u.key);
    try {
      // allowWhileIdle=true：Doze 模式下也按时投递
      sendNotification({
        id,
        title: '⏰ 任务提醒',
        body: u.body,
        schedule: Schedule.at(u.fireAt, false, true),
      });
      ids.push(id);
    } catch (e) {
      logSilent('mobileReminderScheduler', 'schedule notification failed', e);
    }
  }

  try {
    localStorage.setItem(IDS_KEY, JSON.stringify(ids));
  } catch (e) {
    logSilent('mobileReminderScheduler', 'persist scheduled ids failed', e);
  }
}

let started = false;
let debounceTimer: number | null = null;

export function startMobileReminderScheduler(): void {
  if (started) return;
  started = true;

  void requestNotificationPermission();
  // 启动先拉全量任务再排期；之后任务集每次变化（增删改/完成）防抖重排
  void useTimeStore.getState().syncAllFromDB().then(() => resyncMobileReminders());
  useTimeStore.subscribe((state, prevState) => {
    if (state.data.tasks === prevState.data.tasks) return;
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      void resyncMobileReminders();
    }, RESYNC_DEBOUNCE_MS);
  });
}
