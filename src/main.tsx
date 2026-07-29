import "./patchEnv";
import React from "react";
import { createRoot } from "react-dom/client";
import {
  Clock,
  CalendarDays,
  CalendarCheck,
  ClipboardList,
  LayoutGrid,
  Navigation,
  Flame,
  Timer
} from "lucide-react";
import { AppLayout, MenuBar, MainContent, Toolbar } from "./components/layout/AppLayout";
import { useToolOrder } from "./components/layout/useToolOrder";
import type { ToolConfig } from "./components/layout/types";
import "./index.css";

const TodayPanel = React.lazy(() => import("./features/today/TodayPanel").then(m => ({ default: m.TodayPanel })));
const TimeManagementPanel = React.lazy(() => import("./features/time-management/TimeManagementPanel").then(m => ({ default: m.TimeManagementPanel })));
const DailyReviewPanel = React.lazy(() => import("./features/daily-review/DailyReviewPanel").then(m => ({ default: m.DailyReviewPanel })));
const SettingsModal = React.lazy(() => import("./features/settings/SettingsModal").then(m => ({ default: m.SettingsModal })));
const ListsPanel = React.lazy(() => import("./features/lists/ListsPanel").then(m => ({ default: m.ListsPanel })));
const MissionPanel = React.lazy(() => import("./features/mission/MissionPanel").then(m => ({ default: m.MissionPanel })));
const HabitPanel = React.lazy(() => import("./features/habit/HabitPanel").then(m => ({ default: m.HabitPanel })));
const PomodoroPanel = React.lazy(() => import("./features/pomodoro/PomodoroPanel").then(m => ({ default: m.PomodoroPanel })));

const SectionFallback = () => (
  <div className="flex items-center justify-center h-full w-full bg-gray-50/50 text-gray-400 text-sm">
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      <span>加载模块中...</span>
    </div>
  </div>
);

declare global {
  interface Window {
    aistudyClipboard?: {
      writeText: (text: string) => Promise<boolean>;
    };
  }
}

type AppErrorBoundaryState = {
  error: Error | null;
};

class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-error-fallback" role="alert">
          <strong>应用运行异常</strong>
          <span>页面暂时没有正常打开，可以先重新载入；详细信息会记录到报错日志。</span>
          <button type="button" onClick={() => window.location.reload()}>
            重新载入
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

type AppSection = "today" | "weekly-planning" | "four-quadrants" | "daily-review" | "habit" | "lists" | "mission" | "pomodoro";

// Static tool registry: ids/icons/preloaders live here, in default order.
// Persisted reordering only shuffles this array by id — the React.lazy
// components above are never recreated, so reordering can't retrigger
// chunk loading or remount panels.
const TOOL_REGISTRY: (ToolConfig & { preload: () => Promise<unknown> })[] = [
  { id: "today", name: "当日待办", icon: CalendarCheck, component: () => <></>, preload: () => import("./features/today/TodayPanel") },
  { id: "four-quadrants", name: "四象限工作台", icon: LayoutGrid, component: () => <></>, preload: () => import("./features/time-management/TimeManagementPanel") },
  { id: "pomodoro", name: "番茄专注", icon: Timer, component: () => <></>, preload: () => import("./features/pomodoro/PomodoroPanel") },
  { id: "daily-review", name: "每日复盘", icon: Clock, component: () => <></>, preload: () => import("./features/daily-review/DailyReviewPanel") },
  { id: "weekly-planning", name: "周计划", icon: CalendarDays, component: () => <></>, preload: () => import("./features/time-management/TimeManagementPanel") },
  { id: "mission", name: "人生罗盘", icon: Navigation, component: () => <></>, preload: () => import("./features/mission/MissionPanel") },
  { id: "habit", name: "习惯追踪", icon: Flame, component: () => <></>, preload: () => import("./features/habit/HabitPanel") },
  { id: "lists", name: "清单", icon: ClipboardList, component: () => <></>, preload: () => import("./features/lists/ListsPanel") },
];

const DEFAULT_TOOL_IDS = TOOL_REGISTRY.map((t) => t.id);

// Preload all lazy modules during browser idle time after first paint.
// This mirrors what VS Code / Linear do: critical path loads fast, secondary
// chunks are quietly fetched in the background so navigation feels instant.
// Chunks are fetched following the user's persisted tool order, so the
// tools they placed on top are ready first.
function preloadAllModules(orderedIds: string[]) {
  const schedule = typeof requestIdleCallback !== "undefined"
    ? requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 200);

  schedule(() => {
    for (const id of orderedIds) {
      TOOL_REGISTRY.find((t) => t.id === id)?.preload();
    }
    import("./features/settings/SettingsModal");
  });
}

const StandaloneNoteWindow = React.lazy(() => import("./features/lists/StandaloneNoteWindow").then(m => ({ default: m.StandaloneNoteWindow })));
const DictionaryWindow = React.lazy(() => import("./features/dictionary/DictionaryWindow").then(m => ({ default: m.DictionaryWindow })));
const TaskQuickEditWindow = React.lazy(() => import("./features/time-management/TaskQuickEditWindow").then(m => ({ default: m.TaskQuickEditWindow })));

// 移动端专属宿主：子窗口能力缺失时在主窗口 DOM 内渲染同样的浮层
const QuickEditOverlayHost = React.lazy(() => import("./features/time-management/QuickEditOverlayHost").then(m => ({ default: m.QuickEditOverlayHost })));
const DictionaryOverlay = React.lazy(() => import("./features/dictionary/DictionaryOverlay").then(m => ({ default: m.DictionaryOverlay })));

import { useDictionaryHotkey } from "./features/dictionary/useDictionaryHotkey";
import { isMobilePlatform } from "./lib/platform";

function App() {
  const params = new URLSearchParams(window.location.search);
  const windowType = params.get('window');
  const isNoteWindow = windowType === 'note';
  const isDictionaryWindow = windowType === 'dictionary';
  const isQuickEditWindow = windowType === 'task-quick-edit';

  // Register the global-in-app Ctrl+L dictionary shortcut (works in every window).
  useDictionaryHotkey();

  // Persisted toolbar order: ids only; panels below stay hardcoded so
  // reordering never remounts them or refetches lazy chunks.
  const { orderedIds, setOrder } = useToolOrder(DEFAULT_TOOL_IDS);
  const orderedTools = React.useMemo(
    () => orderedIds.map((id) => TOOL_REGISTRY.find((t) => t.id === id)!).filter(Boolean),
    [orderedIds]
  );

  // The tool the user dragged to the top opens first. localStorage is read
  // synchronously, so orderedIds is already final on first render.
  const [activeSection, setActiveSection] = React.useState<AppSection>(
    () => (orderedIds[0] as AppSection) ?? "four-quadrants"
  );
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

  // Preload all chunks once on mount, during idle time, and initialize background auto-update check
  React.useEffect(() => {
    if (!isNoteWindow && !isQuickEditWindow) {
      preloadAllModules(orderedIds);
      import("./features/settings/updateStore").then(({ useUpdateStore }) => {
        useUpdateStore.getState().initBackgroundUpdate();
      });
      // 任务提醒调度器：桌面端已下沉移交至 Rust 后端 (reminder_scheduler.rs) 线程守护；
      // 移动端后台 JS 会被冻结，保持移动端系统级 scheduled notification (AlarmManager 到点投递)
      if (isMobilePlatform()) {
        import("./features/time-management/mobileReminderScheduler").then(({ startMobileReminderScheduler }) => {
          startMobileReminderScheduler();
        });
      }
      // 空闲预热任务快捷编辑子窗口（窗口池），首次打开即秒显；移动端无窗口池，跳过
      if (!isMobilePlatform()) {
        requestIdleCallback(() => {
          void import("./features/time-management/quickEditWindow").then(({ prewarmQuickEditWindow }) => {
            prewarmQuickEditWindow();
          });
        }, { timeout: 3000 });
      }
    }
  }, [isNoteWindow, isQuickEditWindow]);

  if (isQuickEditWindow) {
    // 任务快捷编辑透明子窗口：fallback 必须为空，保持背景透明
    return (
      <React.Suspense fallback={null}>
        <TaskQuickEditWindow />
      </React.Suspense>
    );
  }

  if (isDictionaryWindow) {
    return (
      <React.Suspense fallback={<SectionFallback />}>
        <DictionaryWindow />
      </React.Suspense>
    );
  }

  if (isNoteWindow) {
    return (
      <React.Suspense fallback={<SectionFallback />}>
        <StandaloneNoteWindow />
      </React.Suspense>
    );
  }

  // Blur any active element (e.g. TipTap editor) when switching sections to prevent aria-hidden focus retention warnings
  React.useEffect(() => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, [activeSection]);

  return (
    <>
      <AppLayout
        menuBar={<MenuBar />}
        toolbar={
          <Toolbar
            tools={orderedTools}
            activeToolId={activeSection}
            onToolSelect={(id) => setActiveSection(id as AppSection)}
            onSettingsClick={() => setIsSettingsOpen(true)}
            onReorder={setOrder}
          />
        }
        mainContent={
          <MainContent>
            {/* All panels are mounted immediately and hidden via display:none.
                This eliminates the "first-visit stutter" caused by on-demand
                lazy mounting. The Suspense boundary only covers the initial
                load of each lazy chunk — after that switching is instant. */}
            <React.Suspense fallback={<SectionFallback />}>
              <div
                inert={activeSection !== "today" ? true : undefined}
                style={{ display: activeSection === "today" ? "block" : "none", height: "100%" }}
              >
                <TodayPanel onNavigate={(id) => setActiveSection(id as AppSection)} />
              </div>
              <div
                inert={activeSection !== "pomodoro" ? true : undefined}
                style={{ display: activeSection === "pomodoro" ? "block" : "none", height: "100%" }}
              >
                <PomodoroPanel />
              </div>
              <div
                inert={activeSection !== "lists" ? true : undefined}
                style={{ display: activeSection === "lists" ? "block" : "none", height: "100%" }}
              >
                <ListsPanel />
              </div>
              <div
                inert={activeSection !== "weekly-planning" ? true : undefined}
                style={{ display: activeSection === "weekly-planning" ? "block" : "none", height: "100%" }}
              >
                <TimeManagementPanel mode="weekly" />
              </div>
              <div
                inert={activeSection !== "four-quadrants" ? true : undefined}
                style={{ display: activeSection === "four-quadrants" ? "block" : "none", height: "100%" }}
              >
                <TimeManagementPanel mode="daily" />
              </div>
              <div
                inert={activeSection !== "daily-review" ? true : undefined}
                style={{ display: activeSection === "daily-review" ? "block" : "none", height: "100%" }}
              >
                <DailyReviewPanel />
              </div>
              <div
                inert={activeSection !== "habit" ? true : undefined}
                style={{ display: activeSection === "habit" ? "block" : "none", height: "100%" }}
              >
                <HabitPanel />
              </div>
              <div
                inert={activeSection !== "mission" ? true : undefined}
                style={{ display: activeSection === "mission" ? "block" : "none", height: "100%" }}
              >
                <MissionPanel />
              </div>
            </React.Suspense>
          </MainContent>
        }
      />

      {isSettingsOpen ? (
        <React.Suspense fallback={null}>
          <SettingsModal onClose={() => setIsSettingsOpen(false)} />
        </React.Suspense>
      ) : null}

      {/* 移动端：快捷编辑浮层与词典浮层直接挂在主窗口 DOM */}
      {isMobilePlatform() ? (
        <React.Suspense fallback={null}>
          <QuickEditOverlayHost />
          <DictionaryOverlay />
        </React.Suspense>
      ) : null}
    </>
  );
}

import { ConfirmDialogProvider } from "./components/ui/ConfirmDeleteDialog";

// 快捷编辑子窗口：在首次渲染前同步打上透明背景标记，避免闪白
if (new URLSearchParams(window.location.search).get('window') === 'task-quick-edit') {
  document.documentElement.classList.add('tqe-window');
}

const rootContent = (
  <ConfirmDialogProvider>
    <App />
  </ConfirmDialogProvider>
);

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    {rootContent}
  </AppErrorBoundary>
);
