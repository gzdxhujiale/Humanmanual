import dayjs from 'dayjs';

// ==========================================
// 移动端任务提醒调度器 (Expo / React Native)
// 提醒由系统通知到点投递，应用在后台/被杀后依然可达。
// ==========================================

export interface MobileTask {
  id: string;
  title: string;
  reminder?: string;
  deadline?: number | null;
  scheduledDate?: string | null;
  createdAt: number;
  completed: boolean;
}

/** `taskId@YYYY-MM-DD` -> 稳定的正 31 位通知 id（FNV-1a），重排时按 id 取消旧通知 */
export function notifId(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 1) || 1;
}

export function getTaskTargetDate(task: MobileTask): dayjs.Dayjs {
  if (task.deadline) return dayjs(task.deadline);
  if (task.scheduledDate) return dayjs(task.scheduledDate);
  return dayjs(task.createdAt);
}

export function deadlineBody(task: MobileTask, daysLeft: number): string {
  const targetDate = getTaskTargetDate(task);
  const hm = targetDate.format('HH:mm');
  const wholeDay = !task.deadline || hm === '23:59' || hm === '00:00';
  const when = daysLeft <= 0 ? '今天到期' : daysLeft === 1 ? '明天到期' : `${daysLeft} 天后到期`;
  const dateText = targetDate.format('M月D日') + (wholeDay ? '' : ` ${hm}`);
  return `「${task.title}」${when}（${dateText}）`;
}
