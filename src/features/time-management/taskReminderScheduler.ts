import dayjs from 'dayjs';
import { useTimeStore } from './timeManagementStore';
import { Task, parseReminder } from './timeManagementTypes';
import { requestNotificationPermission, sendDesktopNotification } from '../../lib/notifications';
import { logSilent } from '../../lib/logger';

// ==========================================
// 任务提醒调度器（仅主窗口运行）
// 周期扫描带 reminder 的未完成任务，到点发送系统通知：
// - 提醒日 = 截止日 − offsetDays，时刻为 reminder.time
// - repeat=true 时从提醒日起到截止日每天提醒一次
// - 当天已提醒的任务用 localStorage 去重（重启不重复弹）
// ==========================================

const CHECK_INTERVAL_MS = 30_000;
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

/** 23:59 / 00:00 视为整日截止（与快捷编辑浮层的 deadline 语义一致）；移动端调度器复用同一文案 */
export function deadlineBody(task: Task, daysLeft: number): string {
  const dl = dayjs(task.deadline);
  const hm = dl.format('HH:mm');
  const wholeDay = hm === '23:59' || hm === '00:00';
  const when = daysLeft <= 0 ? '今天截止' : daysLeft === 1 ? '明天截止' : `${daysLeft} 天后截止`;
  const dateText = dl.format('M月D日') + (wholeDay ? '' : ` ${hm}`);
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
    if (task.completed || !task.deadline) continue;
    const r = parseReminder(task.reminder);
    if (!r) continue;

    const deadlineDay = dayjs(task.deadline).startOf('day');
    const remindDay = deadlineDay.subtract(r.offsetDays, 'day');
    // 今天不在提醒窗口内：未到提醒日，或截止日已过
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

export function startTaskReminderScheduler(): void {
  if (timer !== null) return;
  void requestNotificationPermission();
  // 主窗口启动时任务可能尚未从 DB 加载（面板未打开过），先拉一次再开始扫描
  void useTimeStore.getState().syncAllFromDB().then(check);
  timer = window.setInterval(check, CHECK_INTERVAL_MS);
}

export function stopTaskReminderScheduler(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}
