import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { logError, logSilent, logWarn } from "@humanmanual/core";

// ==========================================
// 系统通知共享工具（tauri-plugin-notification）
// 从 pomodoroStore 提取，供番茄钟 / 任务提醒等模块共用；
// 插件不可用时回退 Web Notification API。
// ==========================================

export const requestNotificationPermission = async () => {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === 'granted';
    }
  } catch (e) {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (err) {
        logSilent('notifications', 'web notification permission request failed', err);
      }
    }
  }
};

export const sendDesktopNotification = async (title: string, body: string) => {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === 'granted';
    }
    if (granted) {
      sendNotification({
        title,
        body,
      });
      return;
    }
  } catch (e) {
    logWarn('notifications', 'Tauri notification plugin failed, trying Web Notification fallback', e);
  }

  // Fallback to Web Notification API
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        tag: 'fishworker-desktop-notification',
      });
    } catch (e) {
      logError('notifications', 'failed to send desktop notification via Web API', e);
    }
  }
};
