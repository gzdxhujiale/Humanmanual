import React, { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ToolConfig } from "./types";
import { isMobilePlatform } from "../../lib/platform";
import { DesktopMenuBar, DesktopToolbar, type ToolbarProps } from "./DesktopLayout";
import { MobileTabBar } from "./MobileLayout";
import { useTimeStore } from "../../features/time-management/timeManagementStore";
import { useListsStore } from "../../features/lists/listsStore";
import { useHabitStore } from "../../features/habit/habitStore";
import { useDailyReviewStore } from "../../features/daily-review/dailyReviewStore";
import { usePomodoroStore } from "../../features/pomodoro/pomodoroStore";
import "./AppLayout.css";

export type { ToolbarProps, ToolConfig };

export const MenuBar: React.FC = () => {
  if (isMobilePlatform()) return null;
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
      void useTimeStore.getState().syncAllFromDB();
      void useListsStore.getState().init();
      void useHabitStore.getState().loadAll();
      void useDailyReviewStore.getState().syncAllFromDB();
      void usePomodoroStore.getState().syncAllFromDB();
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);

  return (
    <div className={`app-layout${isMobilePlatform() ? " is-mobile" : ""}`}>
      <div className="app-layout-toolbar">{toolbar}</div>
      <div className="app-layout-body">
        <div className="app-layout-menubar">{menuBar}</div>
        <div className="app-layout-main">{mainContent}</div>
      </div>
    </div>
  );
};

export const Toolbar: React.FC<ToolbarProps> = (props) => {
  if (isMobilePlatform()) {
    return <MobileTabBar {...props} />;
  }
  return <DesktopToolbar {...props} />;
};
