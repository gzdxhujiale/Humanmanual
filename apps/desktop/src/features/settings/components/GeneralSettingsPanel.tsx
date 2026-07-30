import { useState, useEffect } from 'react';
import { Power, Info } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { logWarn } from '@humanmanual/core';
import { usePreferencesStore } from '../preferencesStore';

export function GeneralSettingsPanel() {
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const { getPreference, setPreference } = usePreferencesStore();

  useEffect(() => {
    async function checkAutostart() {
      try {
        const enabled = await invoke<boolean>('plugin:autostart|is_enabled');
        setAutostartEnabled(enabled);
      } catch (e) {
        const prefVal = getPreference('app-autostart', 'false') === 'true';
        setAutostartEnabled(prefVal);
      } finally {
        setLoading(false);
      }
    }
    checkAutostart();
  }, [getPreference]);

  const handleToggleAutostart = async (checked: boolean) => {
    setLoading(true);
    try {
      if (checked) {
        await invoke('plugin:autostart|enable');
      } else {
        await invoke('plugin:autostart|disable');
      }
      setAutostartEnabled(checked);
      await setPreference('app-autostart', String(checked));
    } catch (e) {
      logWarn('settings', 'Tauri autostart plugin call failed, persisting in preferences', e);
      setAutostartEnabled(checked);
      await setPreference('app-autostart', String(checked));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-panel space-y-6 p-4">
      <div className="border border-gray-100 bg-white rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <Power size={20} />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 text-sm">开机自启动</h4>
              <p className="text-xs text-gray-500 mt-0.5">在计算机启动时自动运行应用</p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              disabled={loading}
              checked={autostartEnabled}
              onChange={(e) => handleToggleAutostart(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
          <Info size={16} className="text-gray-400 shrink-0 mt-0.5" />
          <span>开启后，电脑每次开机时程序将自动挂载到后台运行。</span>
        </div>
      </div>
    </div>
  );
}
