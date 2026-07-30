import { useEffect, useRef, useState } from 'react';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TaskQuickEditPopover, type TaskQuickEditHandle, type TaskDraft } from './TaskQuickEdit';
import type { Task, QuadrantType } from './timeManagementTypes';
import './timeManagement.css';

// ==========================================
// TaskQuickEditWindow — 常驻透明置顶子窗口根组件
// 由 quickEditWindow.ts 预热创建（?window=task-quick-edit）并复用：
// 每次收到 tqe:init（带自增 session）渲染一轮浮层并显示窗口，
// 关闭时先 hide 秒关、再回传事件并卸载浮层等待下次复用。
// ==========================================

interface TqeInitPayload {
  session: number;
  task: Task | null;
  quadrant: QuadrantType | null;
  anchor: { top: number; left: number; right: number; bottom: number; width: number };
}

/** Partial<Task> 里的 undefined 经 JSON 序列化会丢失，转为 null 表达"清除字段" */
function toWire(updates: Partial<Task>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(updates).map(([k, v]) => [k, v === undefined ? null : v])
  );
}

export function TaskQuickEditWindow() {
  const [init, setInit] = useState<TqeInitPayload | null>(null);
  const popRef = useRef<TaskQuickEditHandle>(null);

  useEffect(() => {
    document.documentElement.classList.add('tqe-window');
    const pending: Promise<UnlistenFn>[] = [
      listen<TqeInitPayload>('tqe:init', (e) => setInit(e.payload)),
      listen('tqe:close-layer', () => popRef.current?.closeTopLayer()),
      // 应用整体失焦（切到其他程序）：保存后完整关闭
      listen('tqe:close-all', () => popRef.current?.closeAll()),
      // 主窗口刷新后收养本窗口时的握手：补发就绪信号
      listen('tqe:ping', () => void emit('tqe:ready')),
    ];
    void emit('tqe:ready');
    return () => {
      pending.forEach(p => p.then(fn => fn()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 浮层就绪后再显示窗口，避免透明背景生效前闪白；
  // 显示完成后回传 tqe:shown，让主窗口重申位置（首次 show 可能被系统 DPI 校正挪位）
  useEffect(() => {
    if (!init) return;
    const win = getCurrentWindow();
    void win.show()
      .then(() => win.setFocus())
      .then(() => emit('tqe:shown', { session: init.session }))
      .catch(() => {});
  }, [init]);

  if (!init) return null;

  const session = init.session;
  return (
    <TaskQuickEditPopover
      ref={popRef}
      key={session}
      task={init.task ?? undefined}
      quadrant={init.quadrant ?? undefined}
      anchorRect={init.anchor}
      onSave={(taskId, updates, isHighFreq) => {
        void emit('tqe:save', { session, taskId, updates: toWire(updates), isHighFreq: isHighFreq ?? true });
      }}
      onCreate={(draft: TaskDraft) => {
        void emit('tqe:create', { session, draft });
      }}
      onClose={() => {
        // 先隐藏窗口（视觉秒关），保存事件已在此前发出；随后卸载浮层等待复用
        void getCurrentWindow().hide().catch(() => {});
        void emit('tqe:closed', { session });
        setInit(null);
      }}
    />
  );
}
