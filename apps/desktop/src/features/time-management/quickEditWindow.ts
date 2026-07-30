import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow, currentMonitor, PhysicalPosition } from '@tauri-apps/api/window';
import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Task, QuadrantType } from './timeManagementTypes';
import type { TaskDraft } from './TaskQuickEdit';

// ==========================================
// ==========================================
// quickEditWindow — 主窗口侧控制器（窗口池版）
// 任务快捷编辑浮层承载在常驻的透明置顶子窗口中：
// 应用空闲时预热创建一次，之后打开=定位+init+show，
// 关闭=hide 复用，免去每次建窗/加载 bundle 的数百毫秒。
// 事件协议（负载带自增 session 防旧会话串话）：
//   popup → main: tqe:ready / tqe:shown / tqe:save / tqe:create / tqe:closed
//   main → popup: tqe:init / tqe:close-layer / tqe:close-all / tqe:ping
// ==========================================

// 子窗口逻辑尺寸：锚点映射到窗口内部固定点，左侧预留第二/三层（316 + 288 + 间距）展开空间
const POPUP_W = 1100;
const POPUP_H = 700;
const ANCHOR_X = 640;
const ANCHOR_Y = 36;
const POOL_LABEL = 'task-quick-edit';

export interface QuickEditWindowOptions {
  /** 编辑模式：传入既有任务 */
  task?: Task;
  /** 新建模式：目标象限 */
  quadrant?: QuadrantType;
  anchorEl: HTMLElement;
  onSave?: (taskId: string, updates: Partial<Task>, isHighFreq?: boolean) => void;
  onCreate?: (quadrant: QuadrantType, draft: TaskDraft) => void;
  /** 会话结束（浮层隐藏或窗口异常销毁）后回调，用于撤掉主窗口蒙版 */
  onClosed: () => void;
}

/** 事件负载里的 null 还原为 undefined（JSON 序列化会丢 undefined，用 null 表达"清除字段"） */
function fromWire(wire: Record<string, unknown>): Partial<Task> {
  return Object.fromEntries(
    Object.entries(wire).map(([k, v]) => [k, v === null ? undefined : v])
  ) as Partial<Task>;
}

// ---------- 池状态 ----------
let pool: WebviewWindow | null = null;
let poolReady: Promise<void> | null = null;
let readyResolve: (() => void) | null = null;
let readyReject: ((e: unknown) => void) | null = null;
let unlistenPoolFocus: UnlistenFn | null = null;
let listenersInstalled = false;
let sessionSeq = 0;
let current: { session: number; opts: QuickEditWindowOptions } | null = null;
// 本会话目标位置（物理像素）：首次 show 时 Windows 可能因 DPI 校正挪动窗口，收到 tqe:shown 后重申一次
let lastPos: { x: number; y: number } | null = null;

// ---------- 应用整体失焦检测 ----------
// 主窗口与子窗口都不在焦点上（切到其他程序）才整体关闭；
// 防抖等待焦点在两窗口间交接，且要求子窗口本会话获得过焦点，避免打开初期误关
let mainFocused = true;
let popupFocused = false;
let popupEverFocused = false;
let focusTimer: number | null = null;

function scheduleFocusCheck(): void {
  if (focusTimer !== null) window.clearTimeout(focusTimer);
  focusTimer = window.setTimeout(() => {
    focusTimer = null;
    if (!current || !popupEverFocused) return;
    if (!mainFocused && !popupFocused) void emitTo(POOL_LABEL, 'tqe:close-all');
  }, 120);
}

/** 会话结束的统一出口：撤蒙版；池窗口保留待复用 */
function endSession(session: number): void {
  if (current?.session !== session) return;
  const cur = current;
  current = null;
  cur.opts.onClosed();
}

// ---------- 常驻监听（只注册一次） ----------
async function installListeners(): Promise<void> {
  if (listenersInstalled) return;
  listenersInstalled = true;

  await Promise.all([
    listen('tqe:ready', () => {
      readyResolve?.();
      readyResolve = null;
      readyReject = null;
    }),
    listen<{ session: number; taskId: string; updates: Record<string, unknown>; isHighFreq?: boolean }>('tqe:save', (e) => {
      if (e.payload?.session !== current?.session) return;
      current?.opts.onSave?.(e.payload.taskId, fromWire(e.payload.updates), e.payload.isHighFreq);
    }),
    listen<{ session: number; draft: TaskDraft }>('tqe:create', (e) => {
      if (e.payload?.session !== current?.session) return;
      const q = current?.opts.quadrant;
      if (q) current?.opts.onCreate?.(q, e.payload.draft);
    }),
    listen<{ session: number }>('tqe:closed', (e) => {
      endSession(e.payload?.session ?? -1);
    }),
    // 子窗口首次 show 会触发 DPI 校正（隐藏期间 scale factor 可能过期），可能被系统挪位：显示后重申目标位置
    listen<{ session: number }>('tqe:shown', (e) => {
      if (e.payload?.session !== current?.session || !pool || !lastPos) return;
      void pool.setPosition(new PhysicalPosition(lastPos.x, lastPos.y)).catch(() => {});
    }),
    getCurrentWindow().onFocusChanged(({ payload }) => {
      mainFocused = payload;
      if (!payload) scheduleFocusCheck();
    }),
  ]);
}

// ---------- 池窗口创建 / 预热 ----------
function attachPoolHandlers(webview: WebviewWindow, isNew: boolean): void {
  void webview.onFocusChanged(({ payload }) => {
    popupFocused = payload;
    if (payload) popupEverFocused = true;
    else scheduleFocusCheck();
  }).then(fn => { unlistenPoolFocus = fn; });

  if (isNew) {
    void webview.once('tauri://error', (e) => {
      console.error('[quick-edit] 子窗口创建失败', e);
      readyReject?.(e);
      readyResolve = null;
      readyReject = null;
      if (pool === webview) discardPool();
    });
  }
  // 被系统等外部途径直接销毁：标记池失效，下次打开时重建
  void webview.once('tauri://destroyed', () => {
    if (pool === webview) discardPool();
  });
}

function ensurePool(): Promise<void> {
  if (pool && poolReady) return poolReady;

  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  poolReady = ready;

  void (async () => {
    await installListeners();

    // 主窗口刷新（dev 重载）后池状态归零但子窗口仍存活：收养复用，避免同名创建冲突
    const existing = await WebviewWindow.getByLabel(POOL_LABEL).catch(() => null);
    if (existing) {
      pool = existing;
      void existing.hide().catch(() => {});
      attachPoolHandlers(existing, false);
      // 对方页面若早已就绪不会再发 ready，主动 ping 让其补发；若其也在重载中，挂载后会自行发 ready
      void emitTo(POOL_LABEL, 'tqe:ping');
      return;
    }

    const webview = new WebviewWindow(POOL_LABEL, {
      url: `${window.location.origin}/index.html?window=task-quick-edit`,
      title: '任务快捷编辑',
      x: 0,
      y: 0,
      width: POPUP_W,
      height: POPUP_H,
      resizable: false,
      decorations: false,
      transparent: true,
      shadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      visible: false, // 收到 init 渲染完浮层后自行 show，避免透明背景就绪前闪白
      focus: false,
    });
    pool = webview;
    attachPoolHandlers(webview, true);
  })();

  return ready;
}

function discardPool(): void {
  pool = null;
  poolReady = null;
  unlistenPoolFocus?.();
  unlistenPoolFocus = null;
  if (current) endSession(current.session);
}

/** 应用启动空闲时调用：提前付掉建窗与页面加载成本，首次打开即秒显 */
export function prewarmQuickEditWindow(): void {
  void ensurePool().catch(() => {});
}

/** 主窗口蒙版点击：让子窗口逐层关闭浮层 */
export function requestQuickEditCloseLayer(): void {
  if (current) {
    void emitTo(POOL_LABEL, 'tqe:close-layer');
  }
}

export async function openQuickEditWindow(opts: QuickEditWindowOptions): Promise<void> {

  // 上一会话仍开着则静默丢弃（不回调其 onClosed：面板已为新会话挂上蒙版，不能被撤掉）
  if (current) current = null;
  const session = ++sessionSeq;

  const readyP = ensurePool();

  // 锚点 → 屏幕逻辑坐标（innerPosition/monitor 为物理像素，需除以缩放系数）；几何查询并行发出
  const main = getCurrentWindow();
  const r = opts.anchorEl.getBoundingClientRect();
  const [factor, inner, mon] = await Promise.all([
    main.scaleFactor(),
    main.innerPosition(),
    currentMonitor().catch(() => null),
  ]);
  const anchorScreen = {
    x: inner.x / factor + r.left,
    y: inner.y / factor + r.top,
    w: r.width,
    h: r.height,
  };

  let winX = anchorScreen.x - ANCHOR_X;
  let winY = anchorScreen.y - ANCHOR_Y;
  if (mon) {
    const mx = mon.position.x / factor;
    const my = mon.position.y / factor;
    const mw = mon.size.width / factor;
    const mh = mon.size.height / factor;
    winX = Math.min(Math.max(winX, mx), Math.max(mx, mx + mw - POPUP_W));
    winY = Math.min(Math.max(winY, my), Math.max(my, my + mh - POPUP_H));
  }
  // 子窗口内部坐标系中的锚点矩形（浮层组件在其中自行定位、翻转、夹取）
  const localAnchor = {
    left: anchorScreen.x - winX,
    top: anchorScreen.y - winY,
    right: anchorScreen.x - winX + anchorScreen.w,
    bottom: anchorScreen.y - winY + anchorScreen.h,
    width: anchorScreen.w,
  };

  try {
    await readyP;
  } catch {
    opts.onClosed();
    return;
  }
  // 等待期间又发起了新的打开请求，本次作废
  if (session !== sessionSeq || !pool) {
    if (!pool) opts.onClosed();
    return;
  }

  current = { session, opts };
  popupEverFocused = false;
  // 用主窗口的缩放系数换算为物理坐标：子窗口隐藏期间的 scale factor 可能仍是默认值，
  // 走 LogicalPosition 会在首次打开时按错误系数换算导致位置偏移
  lastPos = { x: Math.round(winX * factor), y: Math.round(winY * factor) };
  await pool.setPosition(new PhysicalPosition(lastPos.x, lastPos.y)).catch(() => {});
  void emitTo(POOL_LABEL, 'tqe:init', {
    session,
    task: opts.task ?? null,
    quadrant: opts.quadrant ?? null,
    anchor: localAnchor,
  });
}
