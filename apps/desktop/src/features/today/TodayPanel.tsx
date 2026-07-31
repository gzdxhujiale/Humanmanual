import React from "react";
import { useTimeManagementData, useTaskActions } from "../time-management/useTimeManagementQuery";
import type { Task } from "../time-management/timeManagementTypes";
import { openQuickEditWindow, requestQuickEditCloseLayer } from "../time-management/quickEditWindow";
import { useHabitData, useToggleCheckInMutation } from "../habit/useHabitQuery";
import type { Habit, HabitCheckIn } from "../habit/habitTypes";
import * as habitSelectors from "../habit/habitSelectors";
import { useDailyReviewData } from "../daily-review/useDailyReviewQuery";
import type { DailyReview } from "../daily-review/dailyReviewTypes";
import * as dailyReviewSelectors from "../daily-review/dailyReviewSelectors";
import { formatDateYMD, todayYMD } from "../../lib/dateUtils";
import "../time-management/timeManagement.css";
import "./today.css";

const EMPTY_TASKS: Task[] = [];
const EMPTY_HABITS: Habit[] = [];
const EMPTY_CHECKINS: HabitCheckIn[] = [];
const EMPTY_REVIEWS: DailyReview[] = [];

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const MONTH_LABELS = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];

const QUADRANT_CHIPS: Record<Task["quadrant"], { label: string; cls: string }> = {
  Q1: { label: "重要·紧急", cls: "q1" },
  Q2: { label: "重要", cls: "q2" },
  Q3: { label: "紧急", cls: "q3" },
  Q4: { label: "常规", cls: "q4" },
};

function dueLabel(deadline: number, now: number): { text: string; overdue: boolean } {
  if (deadline < now) {
    const mins = Math.floor((now - deadline) / 60000);
    const text = mins >= 60 ? `已逾期 ${Math.floor(mins / 60)}h` : `已逾期 ${Math.max(1, mins)}m`;
    return { text, overdue: true };
  }
  const d = new Date(deadline);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { text: `${hh}:${mm} 前`, overdue: false };
}

export interface TodayPanelProps {
  onNavigate?: (section: string) => void;
}

export function TodayPanel({ onNavigate }: TodayPanelProps) {
  const { data: timeData } = useTimeManagementData();
  const tasks = timeData?.tasks ?? EMPTY_TASKS;
  const { updateTask } = useTaskActions();

  const { data: habitData } = useHabitData();
  const habits = habitData?.habits ?? EMPTY_HABITS;
  const checkIns = habitData?.checkIns ?? EMPTY_CHECKINS;
  const toggleCheckIn = useToggleCheckInMutation();

  const { data: reviewsData } = useDailyReviewData();
  const reviews = reviewsData ?? EMPTY_REVIEWS;

  const [showDone, setShowDone] = React.useState(false);
  const [quickEditOpen, setQuickEditOpen] = React.useState(false);
  const [meterReady, setMeterReady] = React.useState(false);

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setMeterReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const [, forceTick] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    const timer = setInterval(forceTick, 60_000);
    return () => clearInterval(timer);
  }, []);

  const now = Date.now();
  const today = todayYMD();
  const todayDate = new Date();

  const dueTasks = React.useMemo(
    () => tasks.filter((t) => t.deadline !== undefined && formatDateYMD(new Date(t.deadline)) === today),
    [tasks, today]
  );
  const pendingTasks = dueTasks.filter((t) => !t.completed);
  const doneTasks = dueTasks.filter((t) => t.completed);

  void checkIns;
  void reviews;
  const todayHabits = React.useMemo(
    () => habitSelectors.getHabitsForDate(habits, today),
    [habits, today]
  );
  const uncheckedHabits = todayHabits.filter((h) => !habitSelectors.getCheckInStatus(checkIns, h.id, today));
  const checkedHabits = todayHabits.filter((h) => habitSelectors.getCheckInStatus(checkIns, h.id, today));

  const reviewWritten = dailyReviewSelectors.getAllReviews(reviews).some((r) => r.date === today);

  const totalCount = dueTasks.length + todayHabits.length + 1;
  const remaining = pendingTasks.length + uncheckedHabits.length + (reviewWritten ? 0 : 1);
  const clearedPct = Math.round(((totalCount - remaining) / totalCount) * 100);
  const segWidth = (count: number) => (meterReady ? `${(count / totalCount) * 100}%` : "0");

  const handleToggleTask = (task: Task) => {
    const isCompleted = !task.completed;
    updateTask(task.id, {
      completed: isCompleted,
      completedAt: isCompleted ? Date.now() : undefined,
    }, false);
  };

  const openTaskQuickEdit = (task: Task, anchor: HTMLElement) => {
    setQuickEditOpen(true);
    void openQuickEditWindow({
      task,
      anchorEl: anchor,
      onSave: (taskId, updates, isHighFreq) => updateTask(taskId, updates, isHighFreq),
      onClosed: () => setQuickEditOpen(false),
    });
  };

  const renderTaskItem = (task: Task) => {
    const chip = QUADRANT_CHIPS[task.quadrant];
    const due = !task.completed && task.deadline !== undefined ? dueLabel(task.deadline, now) : null;
    return (
      <div
        key={task.id}
        className={`today-task-item${task.completed ? " done" : ""}`}
        onClick={(e) => openTaskQuickEdit(task, e.currentTarget)}
      >
        <button
          type="button"
          className="today-checkbox"
          role="checkbox"
          aria-checked={task.completed}
          aria-label={task.completed ? `取消完成：${task.title}` : `完成：${task.title}`}
          onClick={(e) => {
            e.stopPropagation();
            handleToggleTask(task);
          }}
        />
        <span className="today-task-title">{task.title}</span>
        <span className={`today-q-chip ${chip.cls}`}>{chip.label}</span>
        {due ? <span className={`today-task-due${due.overdue ? " overdue" : ""}`}>{due.text}</span> : null}
      </div>
    );
  };

  return (
    <div className="today-panel desktop">
      <header className="today-header">
        <div className="today-date-leaf" aria-hidden="true">
          <div className="day-num">{todayDate.getDate()}</div>
          <div className="day-meta">
            {MONTH_LABELS[todayDate.getMonth()]} · {WEEKDAY_LABELS[todayDate.getDay()]}
          </div>
        </div>
        <div className="today-header-main">
          <div className="today-remain-line">
            {remaining === 0 ? (
              <h1>今日已清空</h1>
            ) : (
              <h1>
                今天还剩 <span className="remain-count">{remaining}</span> 件事
              </h1>
            )}
            <span className="percent">已清空 {clearedPct}%</span>
          </div>
          <div
            className="today-burn-meter"
            role="img"
            aria-label={`今日剩余：任务${pendingTasks.length}件、习惯${uncheckedHabits.length}项、复盘${reviewWritten ? "已写" : "未写"}`}
          >
            <div className="seg tasks" style={{ width: segWidth(pendingTasks.length) }} />
            <div className="seg habits" style={{ width: segWidth(uncheckedHabits.length) }} />
            <div className="seg review" style={{ width: segWidth(reviewWritten ? 0 : 1) }} />
          </div>
          <div className="today-meter-legend">
            <span className="lg"><span className="dot t" />今日到期任务 <b>{pendingTasks.length}</b></span>
            <span className="lg"><span className="dot h" />待打卡习惯 <b>{uncheckedHabits.length}</b></span>
            <span className="lg"><span className="dot r" />复盘 <b>{reviewWritten ? "已写" : "未写"}</b></span>
          </div>
        </div>
      </header>

      {remaining === 0 ? (
        <div className="today-all-clear">
          <div className="leaf-torn">🍃</div>
          <h2>今日已清空</h2>
          <p>
            {dueTasks.length} 项任务 · {checkedHabits.length} 次打卡 · {reviewWritten ? "1 篇复盘" : "复盘"}
            ，都完成了。剩下的时间是你自己的。
          </p>
        </div>
      ) : (
        <div className="today-body">
          <div className="today-col-main">
            <div className="today-section-title">
              <span className="src-dot" style={{ background: "var(--accent)" }} />
              今日到期 <span className="count">{pendingTasks.length} 项</span>
            </div>
            {pendingTasks.length === 0 ? (
              <div className="today-empty-tasks">今天没有待办的到期任务</div>
            ) : (
              <div className="today-task-list">{pendingTasks.map(renderTaskItem)}</div>
            )}

            {doneTasks.length > 0 ? (
              <>
                <button
                  type="button"
                  className={`today-done-toggle${showDone ? " open" : ""}`}
                  onClick={() => setShowDone((v) => !v)}
                >
                  <span className="tri">▶</span> 已完成 {doneTasks.length} 项
                </button>
                {showDone ? <div className="today-task-list">{doneTasks.map(renderTaskItem)}</div> : null}
              </>
            ) : null}
          </div>

          <div className="today-col-side">
            <div className="today-side-card">
              <div className="today-section-title">
                <span className="src-dot" style={{ background: "var(--green)" }} />
                习惯打卡 <span className="count">{checkedHabits.length} / {todayHabits.length}</span>
              </div>
              {todayHabits.length === 0 ? (
                <div className="today-empty-habits">今天没有需要打卡的习惯</div>
              ) : (
                <>
                  {uncheckedHabits.map((habit) => (
                    <div key={habit.id} className="today-habit-row">
                      <span className="today-habit-name">{habit.name}</span>
                      <span className="today-habit-streak">连续 {habitSelectors.getStats(checkIns, habit.id, today).currentStreak} 天</span>
                      <button type="button" className="today-btn-check" onClick={() => toggleCheckIn.mutate({ habitId: habit.id, date: today, completed: true })}>
                        打卡
                      </button>
                    </div>
                  ))}
                  {checkedHabits.map((habit) => (
                    <div key={habit.id} className="today-habit-row done">
                      <span className="today-habit-name">{habit.name}</span>
                      <span className="today-habit-streak">连续 {habitSelectors.getStats(checkIns, habit.id, today).currentStreak} 天</span>
                      <span className="today-habit-done-mark" aria-label="已打卡">✓</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className={`today-side-card today-review-card${reviewWritten ? " written" : ""}`}>
              <div className="today-section-title">
                <span className="src-dot" style={{ background: "var(--violet)" }} />
                每日复盘
              </div>
              {reviewWritten ? (
                <p className="today-review-text">今天的复盘已经写好了 ✓</p>
              ) : (
                <>
                  <p className="today-review-text">今天的复盘还没写。花 5 分钟回顾一下，明天会更清楚该做什么。</p>
                  <button type="button" className="today-btn-review" onClick={() => onNavigate?.("daily-review")}>
                    去写复盘 →
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {quickEditOpen && <div className="tqe-mask" onMouseDown={requestQuickEditCloseLayer} aria-hidden />}
    </div>
  );
}
