import React, { useState } from "react";
import { Settings, MoreHorizontal, X } from "lucide-react";
import type { ToolConfig } from "./types";
import { triggerHaptic } from "../../lib/haptics";

export interface MobileTabBarProps {
  tools: ToolConfig[];
  activeToolId: string;
  onToolSelect: (id: string) => void;
  onSettingsClick: () => void;
}

const PRIMARY_MOBILE_IDS = ['today', 'four-quadrants', 'pomodoro', 'lists'];

export const MobileTabBar: React.FC<MobileTabBarProps> = ({
  tools,
  activeToolId,
  onToolSelect,
  onSettingsClick,
}) => {
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
