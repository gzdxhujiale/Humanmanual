import { create } from 'zustand';
import type { Task, QuadrantType } from './timeManagementTypes';
import type { TaskDraft, TaskQuickEditHandle } from './TaskQuickEdit';

// ==========================================
// quickEditOverlayStore — 移动端快捷编辑浮层状态
// 移动端没有子窗口池，TaskQuickEditPopover 直接挂在主窗口 DOM
// （portal 到 body，z-index 1050+ 高于 .tqe-mask 的 1040）。
// quickEditWindow.ts 在 isMobilePlatform() 时把打开请求写入本 store，
// QuickEditOverlayHost 负责渲染；蒙版点击经 closeQuickEditOverlayTopLayer 逐层关闭。
// ==========================================

export interface QuickEditOverlayRequest {
  session: number;
  task?: Task;
  quadrant?: QuadrantType;
  anchorRect: { top: number; left: number; right: number; bottom: number; width: number };
  onSave?: (taskId: string, updates: Partial<Task>, isHighFreq?: boolean) => void;
  onCreate?: (quadrant: QuadrantType, draft: TaskDraft) => void;
  onClosed: () => void;
}

interface QuickEditOverlayState {
  request: QuickEditOverlayRequest | null;
  open: (req: Omit<QuickEditOverlayRequest, 'session'>) => void;
  /** 浮层自行关闭（最后一层收起）后由 Host 调用：撤掉调用方蒙版 */
  close: () => void;
}

let sessionSeq = 0;
let handle: TaskQuickEditHandle | null = null;

/** Host 挂载浮层后注册命令式句柄，卸载时传 null */
export function registerQuickEditOverlayHandle(h: TaskQuickEditHandle | null): void {
  handle = h;
}

/** 主窗口蒙版点击：逐层关闭（与桌面版 tqe:close-layer 同语义） */
export function closeQuickEditOverlayTopLayer(): void {
  handle?.closeTopLayer();
}

export const useQuickEditOverlayStore = create<QuickEditOverlayState>((set, get) => ({
  request: null,
  open: (req) => {
    // 上一会话仍开着则静默顶掉（不回调其 onClosed，与桌面版语义一致）
    set({ request: { ...req, session: ++sessionSeq } });
  },
  close: () => {
    const cur = get().request;
    if (!cur) return;
    set({ request: null });
    cur.onClosed();
  },
}));
