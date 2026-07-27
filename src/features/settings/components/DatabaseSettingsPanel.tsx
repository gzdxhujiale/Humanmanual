import React from "react";
import { call } from "../../../lib/tauriClient";

function getDatabaseApi() {
  if (window.aistudyDatabase) return window.aistudyDatabase;
  return {
    getConfig: () => call("db_get_config"),
    saveConfig: (config: any) => call("db_save_config", { config })
  };
}

export function DatabaseSettingsPanel() {
  const [config, setConfig] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    getDatabaseApi().getConfig().then((cfg) => {
      setConfig(cfg);
      setLoading(false);
    }).catch(err => {
      setMessage("获取配置失败：" + (err.message || err));
      setLoading(false);
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await getDatabaseApi().saveConfig(config);
      setMessage("配置已保存。请重启应用以生效新连接！");
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

  if (loading) return <div className="settings-panel"><p>加载配置中...</p></div>;
  if (!config) return <div className="settings-panel"><p>无法加载配置，可能当前版本不支持。</p></div>;

  return (
    <div className="shortcut-settings-panel database-settings">
      <form onSubmit={handleSave} className="shortcut-settings-list">
        <article className="shortcut-settings-row db-connection-row">
          <div className="shortcut-settings-main">
            <strong>Host</strong>
          </div>
          <input type="text" name="host" title="Database Host" placeholder="Database Host" value={config.host || ""} onChange={handleChange} className="db-connection-input host" />
        </article>
        <article className="shortcut-settings-row db-connection-row">
          <div className="shortcut-settings-main">
            <strong>Port</strong>
          </div>
          <input type="number" name="port" title="Database Port" placeholder="Database Port" value={config.port || 3306} onChange={handleChange} className="db-connection-input port" />
        </article>
        <article className="shortcut-settings-row db-connection-row">
          <div className="shortcut-settings-main">
            <strong>User</strong>
          </div>
          <input type="text" name="user" title="Database User" placeholder="Database User" value={config.user || ""} onChange={handleChange} className="db-connection-input user" />
        </article>
        <article className="shortcut-settings-row db-connection-row">
          <div className="shortcut-settings-main">
            <strong>Password</strong>
          </div>
          <input type="password" name="password" title="Database Password" placeholder="Database Password" value={config.password || ""} onChange={handleChange} className="db-connection-input password" />
        </article>
        <article className="shortcut-settings-row db-connection-row">
          <div className="shortcut-settings-main">
            <label htmlFor="skipSchemaCreation" className="db-connection-label">跳过建表检查 (加速连接)</label>
          </div>
          <input type="checkbox" id="skipSchemaCreation" name="skipSchemaCreation" title="Skip Schema Creation" placeholder="Skip Schema Creation" checked={config.skipSchemaCreation || false} onChange={handleChange} className="db-connection-checkbox" />
        </article>

        {message && (
          <p className={message.includes("失败") ? "status-message error db-connection-status" : "update-status db-connection-status"}>
            {message}
          </p>
        )}

        <div className="shortcut-settings-actions">
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "保存中..." : "保存配置"}
          </button>
        </div>
      </form>
    </div>
  );
}
