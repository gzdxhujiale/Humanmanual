import React, { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, X, Settings, MoreHorizontal } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ToolConfig } from "./types";
import { isMobilePlatform } from "../../lib/platform";
import { triggerHaptic } from "../../lib/haptics";
import "./AppLayout.css";

export const MenuBar: React.FC = () => {
  const minimizeWindow = () => {
    getCurrentWindow().minimize();
  };

  const closeWindow = () => {
    getCurrentWindow().close();
  };

  // 移动端由系统接管窗口生命周期，无需自绘标题栏与窗控按钮
  if (isMobilePlatform()) return null;

  return (
    <div className="custom-menubar" data-tauri-drag-region>
      <div className="menubar-title" data-tauri-drag-region>
      </div>
      <div className="menubar-controls">
        <button className="menubar-btn" onClick={minimizeWindow} aria-label="Minimize">
          <Minus size={16} />
        </button>
        <button className="menubar-btn close-btn" onClick={closeWindow} aria-label="Close">
          <X size={16} />
        </button>
      </div>
    </div>
  );
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

interface ToolbarProps {
  tools: ToolConfig[];
  activeToolId: string;
  onToolSelect: (id: string) => void;
  onSettingsClick: () => void;
  onReorder?: (ids: string[]) => void;
}

const SortableToolButton: React.FC<{
  tool: ToolConfig;
  active: boolean;
  onSelect: (id: string) => void;
}> = ({ tool, active, onSelect }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tool.id });
  const Icon = tool.icon;
  return (
    <button
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
        touchAction: "none",
      }}
      className={`toolbar-btn ${active ? "active" : ""}`}
      title={tool.name}
      aria-label={tool.name}
      aria-current={active ? "page" : undefined}
      type="button"
      onClick={() => onSelect(tool.id)}
      {...attributes}
      {...listeners}
    >
      <Icon size={19} strokeWidth={1.9} />
    </button>
  );
};

const PRIMARY_MOBILE_IDS = ['today', 'four-quadrants', 'pomodoro', 'lists'];

const MobileTabBar: React.FC<ToolbarProps> = ({ tools, activeToolId, onToolSelect, onSettingsClick }) => {
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // 保障顺序按用户配置或默认配置，前 4 个核心工具与更多工具拆分
  const primaryTools = tools.filter((t) => PRIMARY_MOBILE_IDS.includes(t.id));
  const moreTools = tools.filter((t) => !PRIMARY_MOBILE_IDS.includes(t.id));

  const getShortName = (id: string, fullName: string) => {
    switch (id) {
      case 'today': return '待办';
      case 'four-quadrants': return '四象限';
      case 'pomodoro': return '番茄';
      case 'lists': return '清单';
      case 'weekly-planning': return '周计划';
      case 'daily-review': return '复盘';
      case 'habit': return '习惯';
      case 'mission': return '罗盘';
      default: return fullName.slice(0, 4);
    }
  };

  const isMoreActive = moreTools.some((t) => t.id === activeToolId);

  return (
    <nav className="mobile-tabbar" aria-label="Mobile Bottom Navigation">
      <div className="mobile-tabbar-inner">
        {primaryTools.map((tool) => {
          const Icon = tool.icon;
          const active = activeToolId === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              className={`mobile-tab-btn ${active ? 'active' : ''}`}
              onClick={() => {
                triggerHaptic('light');
                onToolSelect(tool.id);
              }}
              aria-label={tool.name}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={20} className="mobile-tab-icon" />
              <span className="mobile-tab-label">{getShortName(tool.id, tool.name)}</span>
            </button>
          );
        })}

        <button
          type="button"
          className={`mobile-tab-btn ${isMoreActive || isMoreOpen ? 'active' : ''}`}
          onClick={() => {
            triggerHaptic('medium');
            setIsMoreOpen(true);
          }}
          aria-label="更多功能"
        >
          <MoreHorizontal size={20} className="mobile-tab-icon" />
          <span className="mobile-tab-label">更多</span>
        </button>
      </div>

      {isMoreOpen && (
        <div className="mobile-more-backdrop" onClick={() => setIsMoreOpen(false)}>
          <div className="mobile-more-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-more-handle-bar">
              <div className="mobile-more-handle" />
            </div>
            <div className="mobile-more-header">
              <span className="mobile-more-title">更多功能</span>
              <button
                type="button"
                className="mobile-more-close"
                onClick={() => setIsMoreOpen(false)}
                aria-label="关闭"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mobile-more-grid">
              {moreTools.map((tool) => {
                const Icon = tool.icon;
                const active = activeToolId === tool.id;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    className={`mobile-more-card ${active ? 'active' : ''}`}
                    onClick={() => {
                      triggerHaptic('light');
                      onToolSelect(tool.id);
                      setIsMoreOpen(false);
                    }}
                  >
                    <div className="mobile-more-card-icon">
                      <Icon size={22} />
                    </div>
                    <span className="mobile-more-card-name">{tool.name}</span>
                  </button>
                );
              })}
              <button
                type="button"
                className="mobile-more-card settings-card"
                onClick={() => {
                  triggerHaptic('light');
                  onSettingsClick();
                  setIsMoreOpen(false);
                }}
              >
                <div className="mobile-more-card-icon">
                  <Settings size={22} />
                </div>
                <span className="mobile-more-card-name">偏好设置</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export const Toolbar: React.FC<ToolbarProps> = (props) => {
  const { tools, activeToolId, onToolSelect, onSettingsClick, onReorder } = props;

  if (isMobilePlatform()) {
    return <MobileTabBar {...props} />;
  }

  // Require 8px of movement before a drag starts so plain clicks still select tools.
  // On touch screens require a long-press instead, so swipe-scrolling the tab bar never triggers a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;
    const ids = tools.map((t) => t.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  };

  return (
    <aside className="custom-toolbar" >
      <nav className="toolbar-nav" aria-label="Main Navigation">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={tools.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {tools.map((tool) => (
              <SortableToolButton
                key={tool.id}
                tool={tool}
                active={activeToolId === tool.id}
                onSelect={onToolSelect}
              />
            ))}
          </SortableContext>
        </DndContext>
      </nav>
      <button
        className="toolbar-btn settings-btn"
        title="Settings"
        aria-label="Settings"
        type="button"
        onClick={onSettingsClick}
      >
        <Settings size={18} strokeWidth={1.9} />
      </button>
    </aside>
  );
};

