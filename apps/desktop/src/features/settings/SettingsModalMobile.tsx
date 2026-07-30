import { useState } from "react";
import { ClipboardList, Database, LayoutTemplate, RefreshCw, Sliders, X } from "lucide-react";
import { DatabaseSettingsPanel } from "./components/DatabaseSettingsPanel";
import { TemplateSettingsPanel } from "./components/TemplateSettingsPanel";
import { UpdateSettingsPanel } from "./components/UpdateSettingsPanel";
import { ListSettingsPanel } from "./components/ListSettingsPanel";
import { GeneralSettingsPanel } from "./components/GeneralSettingsPanel";
import { triggerHaptic } from "../../lib/haptics";

type SettingsTab = "general" | "templates" | "lists" | "database" | "update";

export function SettingsModalMobile({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "通用", icon: <Sliders size={16} /> },
    { id: "templates", label: "模板", icon: <LayoutTemplate size={16} /> },
    { id: "lists", label: "清单", icon: <ClipboardList size={16} /> },
    { id: "database", label: "数据库", icon: <Database size={16} /> },
    { id: "update", label: "更新", icon: <RefreshCw size={16} /> },
  ];

  return (
    <div
      className="mobile-settings-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "var(--surface-0)",
        display: "flex",
        flexDirection: "column",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* 移动端顶栏 Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid rgba(123,145,169,0.15)",
        }}
      >
        <span style={{ fontSize: "17px", fontWeight: 600, color: "var(--text-strong)" }}>偏好设置</span>
        <button
          type="button"
          onClick={() => {
            triggerHaptic("light");
            onClose();
          }}
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)" }}
        >
          <X size={20} />
        </button>
      </header>

      {/* 移动端 Tab 滚动导航 */}
      <nav
        style={{
          display: "flex",
          gap: "6px",
          padding: "8px 12px",
          borderBottom: "1px solid rgba(123,145,169,0.1)",
          overflowX: "auto",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              triggerHaptic("light");
              setActiveTab(tab.id);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              borderRadius: '20px',
              border: "none",
              background: activeTab === tab.id ? "var(--accent)" : "var(--surface-1)",
              color: activeTab === tab.id ? "#fff" : "var(--text-muted)",
              fontSize: "13px",
              fontWeight: 500,
              whiteSpace: "nowrap",
              cursor: "pointer",
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* 主面板内容 */}
      <main style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {activeTab === "general" && <GeneralSettingsPanel />}
        {activeTab === "lists" && <ListSettingsPanel />}
        {activeTab === "templates" && <TemplateSettingsPanel />}
        {activeTab === "database" && <DatabaseSettingsPanel />}
        {activeTab === "update" && <UpdateSettingsPanel />}
      </main>
    </div>
  );
}
