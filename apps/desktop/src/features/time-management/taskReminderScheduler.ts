import dayjs from 'dayjs';
import { Task } from './timeManagementTypes';

// ==========================================
// 任务提醒辅助函数
// 桌面端提醒由 Rust 后端 (reminder_scheduler.rs) 线程实时守护
// ==========================================

/** 获取任务的基础目标日期（优先使用 deadline，其次 scheduledDate，最后创建时间） */
export function getTaskTargetDate(task: Task): dayjs.Dayjs {
  if (task.deadline) return dayjs(task.deadline);
  if (task.scheduledDate) return dayjs(task.scheduledDate);
  return dayjs(task.createdAt);
}

/** 23:59 / 00:00 视为整日截止（与快捷编辑浮层的 deadline 语义一致） */
export function deadlineBody(task: Task, daysLeft: number): string {
  const targetDate = getTaskTargetDate(task);
  const hm = targetDate.format('HH:mm');
  const wholeDay = !task.deadline || hm === '23:59' || hm === '00:00';
  const when = daysLeft <= 0 ? '今天到期' : daysLeft === 1 ? '明天到期' : `${daysLeft} 天后到期`;
  const dateText = targetDate.format('M月D日') + (wholeDay ? '' : ` ${hm}`);
  return `「${task.title}」${when}（${dateText}）`;
}

