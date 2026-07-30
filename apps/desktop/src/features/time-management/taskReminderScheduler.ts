import dayjs from 'dayjs';
import { useTimeStore } from './timeManagementStore';
import { Task, parseReminder } from './timeManagementTypes';
import { requestNotificationPermission, sendDesktopNotification } from '../../lib/notifications';
import { logSilent } from '@humanmanual/core';

// ==========================================
// 任务提醒调度器（仅主窗口运行）
// 周期扫描带 reminder 的未完成任务，到点发送系统通知：
// - 提醒日 = 目标日期 − offsetDays，时刻为 reminder.time
// - 支持带 deadline、scheduledDate 或无具体日期的任务提醒
// - repeat=true 时从提醒日起到到期日每天提醒一次
// - 当天已提醒的任务用 localStorage 去重（重启不重复弹）
// ==========================================

const CHECK_INTERVAL_MS = 10_000;
const FIRED_KEY = 'humanmanual_task_reminder_fired_v1';
const FIRED_TTL_DAYS = 7;

/** `${taskId}@${YYYY-MM-DD}` -> 触发时间戳 */
type FiredMap = Record<string, number>;

function loadFired(): FiredMap {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveFired(map: FiredMap): void {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(map));
  } catch (e) {
    logSilent('taskReminderScheduler', 'failed to persist fired map', e);
  }
}

/** 获取任务的基础目标日期（优先使用 deadline，其次 scheduledDate，最后创建时间） */
export function getTaskTargetDate(task: Task): dayjs.Dayjs {
  if (task.deadline) return dayjs(task.deadline);
  if (task.scheduledDate) return dayjs(task.scheduledDate);
  return dayjs(task.createdAt);
}

/** 23:59 / 00:00 视为整日截止（与快捷编辑浮层的 deadline 语义一致）；移动端调度器复用同一文案 */
export function deadlineBody(task: Task, daysLeft: number): string {
  const targetDate = getTaskTargetDate(task);
  const hm = targetDate.format('HH:mm');
  const wholeDay = !task.deadline || hm === '23:59' || hm === '00:00';
  const when = daysLeft <= 0 ? '今天到期' : daysLeft === 1 ? '明天到期' : `${daysLeft} 天后到期`;
  const dateText = targetDate.format('M月D日') + (wholeDay ? '' : ` ${hm}`);
  return `「${task.title}」${when}（${dateText}）`;
}

function check(): void {
  const tasks = useTimeStore.getState().data.tasks;
  if (!tasks.length) return;

  const now = dayjs();
  const todayStart = now.startOf('day');
  const todayStr = todayStart.format('YYYY-MM-DD');
  const fired = loadFired();
  let dirty = false;

  for (const task of tasks) {
    if (task.completed) continue;
    const r = parseReminder(task.reminder);
    if (!r) continue;

    const targetDate = getTaskTargetDate(task);
    const deadlineDay = targetDate.startOf('day');
    const remindDay = deadlineDay.subtract(r.offsetDays, 'day');
    // 今天不在提醒窗口内：未到提醒日，或到期日已过
    if (todayStart.isBefore(remindDay) || todayStart.isAfter(deadlineDay)) continue;
    // 非持续提醒：只在提醒日当天触发
    if (!r.repeat && !todayStart.isSame(remindDay)) continue;

    const [h, m] = r.time.split(':').map(Number);
    const fireAt = todayStart.hour(h || 0).minute(m || 0);
    if (now.isBefore(fireAt)) continue;

    const key = `${task.id}@${todayStr}`;
    if (fired[key]) continue;
    fired[key] = Date.now();
    dirty = true;

    const daysLeft = deadlineDay.diff(todayStart, 'day');
    void sendDesktopNotification('⏰ 任务提醒', deadlineBody(task, daysLeft));
  }

  // 清理过期去重记录，避免 localStorage 无限增长
  const cutoff = todayStart.subtract(FIRED_TTL_DAYS, 'day');
  for (const key of Object.keys(fired)) {
    const date = key.split('@')[1];
    if (!date || dayjs(date).isBefore(cutoff)) {
      delete fired[key];
      dirty = true;
    }
  }

  if (dirty) saveFired(fired);
}

let timer: number | null = null;
let unsubscribeStore: (() => void) | null = null;

export function startTaskReminderScheduler(): void {
  if (timer !== null) return;
  void requestNotificationPermission();
  // 启动先同步数据并开启扫描；订阅 store 变化以便即时响应编辑
  void useTimeStore.getState().syncAllFromDB().then(check);
  unsubscribeStore = useTimeStore.subscribe((state, prevState) => {
    if (state.data.tasks !== prevState.data.tasks) {
      check();
    }
  });
  timer = window.setInterval(check, CHECK_INTERVAL_MS);
}

export function stopTaskReminderScheduler(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  if (unsubscribeStore) {
    unsubscribeStore();
    unsubscribeStore = null;
  }
}
