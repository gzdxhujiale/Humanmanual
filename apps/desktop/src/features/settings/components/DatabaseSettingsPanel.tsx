import React from "react";
import { call } from "../../../lib/tauriClient";

function getDatabaseApi() {
  const db = window.aistudyDatabase;
  return {
    getTursoConfig: () => db?.getTursoConfig ? db.getTursoConfig() : call("db_get_turso_config"),
    saveTursoConfig: (config: any) => db?.saveTursoConfig ? db.saveTursoConfig(config) : call("db_save_turso_config", { config })
  };
}

export function DatabaseSettingsPanel() {
  const [config, setConfig] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    getDatabaseApi().getTursoConfig().then((cfg: any) => {
      setConfig(cfg || {});
      setLoading(false);
    }).catch((err: any) => {
      setMessage("获取 Turso 配置失败：" + (err?.message || err));
      setLoading(false);
    });
  }, []);

  const [syncing, setSyncing] = React.useState(false);

  const handleManualSync = async () => {
    setSyncing(true);
    setMessage("");
    try {
      const res = await call<{ mode: "remote" | "local"; ok: boolean; initError: string | null }>("db_sync_now");
      if (res.ok) {
        setMessage("已直连 Turso 云端，读写实时生效，无需手动同步。");
      } else if (res.initError) {
        setMessage("云端连接失败：" + res.initError + "（当前使用本地数据库）");
      } else {
        setMessage("当前为本地数据库模式，未配置 Turso 云端连接。");
      }
    } catch (err: any) {
      setMessage("同步过程出错：" + (err?.message || err));
    } finally {
      setSyncing(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await getDatabaseApi().saveTursoConfig(config);
      setMessage("Turso 配置已保存。请重启应用生效新同步设置！");
    } catch (err: any) {
      setMessage("保存失败：" + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setConfig((prev: any) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : type === "number" ? Number(value) : value
    }));
  };

  if (loading) return <div className="settings-panel"><p>加载 Turso 配置中...</p></div>;

  return (
    <div className="shortcut-settings-panel database-settings">
      <form onSubmit={handleSave} className="shortcut-settings-list">
        <article className="shortcut-settings-row db-connection-row">
          <div className="shortcut-settings-main">
            <strong>Turso Database URL</strong>
          </div>
          <input
            type="text"
            name="url"
            title="Turso Database URL"
            placeholder="libsql://your-database.turso.io"
            value={config?.url || ""}
            onChange={handleChange}
            className="db-connection-input host"
          />
        </article>
        <article className="shortcut-settings-row db-connection-row">
          <div className="shortcut-settings-main">
            <strong>Auth Token</strong>
          </div>
          <input
            type="password"
            name="authToken"
            title="Turso Auth Token"
            placeholder="eyJhbGci..."
            value={config?.authToken || ""}
            onChange={handleChange}
            className="db-connection-input password"
          />
        </article>
        <article className="shortcut-settings-row db-connection-row">
          <div className="shortcut-settings-main">
            <label htmlFor="syncOnStart" className="db-connection-label">启动时自动全量同步</label>
          </div>
          <input
            type="checkbox"
            id="syncOnStart"
            name="syncOnStart"
            title="Sync On Start"
            checked={config?.syncOnStart ?? true}
            onChange={handleChange}
            className="db-connection-checkbox"
          />
        </article>

        {message && (
          <p className={message.includes("失败") || message.includes("出错") ? "status-message error db-connection-status" : "update-status db-connection-status"}>
            {message}
          </p>
        )}

        <div className="shortcut-settings-actions" style={{ display: "flex", gap: "10px" }}>
          <button className="primary-button" type="submit" disabled={saving || syncing}>
            {saving ? "保存中..." : "保存 Turso 配置"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={handleManualSync}
            disabled={saving || syncing}
            style={{ padding: "8px 16px", borderRadius: "6px", cursor: syncing ? "not-allowed" : "pointer" }}
          >
            {syncing ? "同步中..." : "立即与云端同步"}
          </button>
        </div>
      </form>
    </div>
  );
}
