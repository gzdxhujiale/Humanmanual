import React from "react";
import type { ToolConfig } from "./types";
import { isMobilePlatform } from "../../lib/platform";
import { DesktopMenuBar, DesktopToolbar, type ToolbarProps } from "./DesktopLayout";
import { MobileTabBar } from "./MobileLayout";
import "./AppLayout.css";

export type { ToolbarProps, ToolConfig };

export const MenuBar: React.FC = () => {
  // 移动端由系统接管窗口生命周期，无需自绘标题栏与窗控按钮
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
