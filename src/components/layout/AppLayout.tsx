import React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, X, Settings } from "lucide-react";
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

export const Toolbar: React.FC<ToolbarProps> = ({ tools, activeToolId, onToolSelect, onSettingsClick, onReorder }) => {
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
