import React, { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ToolConfig } from "./types";
import { DesktopMenuBar, DesktopToolbar, type ToolbarProps } from "./DesktopLayout";
import "./AppLayout.css";

export type { ToolbarProps, ToolConfig };

export const MenuBar: React.FC = () => {
  return <DesktopMenuBar />;
};

export const MainContent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <main className="custom-main-content">{children}</main>;
};

export const AppLayout: React.FC<{
  menuBar: React.ReactNode;
  toolbar: React.ReactNode;
  mainContent: React.ReactNode;
}> = ({ menuBar, toolbar, mainContent }) => {
  useEffect(() => {
    const unlistenPromise = listen("db:synced", () => {
      import("../../features/time-management/timeManagementStore").then(m => void m.useTimeStore.getState().syncAllFromDB());
      import("../../features/lists/listsStore").then(m => void m.useListsStore.getState().init());
      import("../../features/habit/habitStore").then(m => void m.useHabitStore.getState().loadAll());
      import("../../features/daily-review/dailyReviewStore").then(m => void m.useDailyReviewStore.getState().syncAllFromDB());
      import("../../features/pomodoro/pomodoroStore").then(m => void m.usePomodoroStore.getState().syncAllFromDB());
    });
    return () => {
      unlistenPromise.then((unlisten: () => void) => unlisten()).catch(() => {});
    };
  }, []);

  return (
    <div className="app-layout">
      <div className="app-layout-toolbar">{toolbar}</div>
      <div className="app-layout-body">
        <div className="app-layout-menubar">{menuBar}</div>
        <div className="app-layout-main">{mainContent}</div>
      </div>
    </div>
  );
};

export const Toolbar: React.FC<ToolbarProps> = (props) => {
  return <DesktopToolbar {...props} />;
};
