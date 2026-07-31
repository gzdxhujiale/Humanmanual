import React, { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@humanmanual/core";
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
  const queryClient = useQueryClient();
  useEffect(() => {
    const unlistenPromise = listen("db:synced", () => {
      // TanStack Query-owned modules: refetch through the cache.
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.habits.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyReviews.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.lists.all });
      // Store-owned modules still reload imperatively.
      import("../../features/pomodoro/pomodoroStore").then(m => void m.usePomodoroStore.getState().syncAllFromDB());
    });
    return () => {
      unlistenPromise.then((unlisten: () => void) => unlisten()).catch(() => {});
    };
  }, [queryClient]);

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
