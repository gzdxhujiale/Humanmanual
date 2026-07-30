import { logSilent } from '@humanmanual/core';

// ==========================================
// 屏幕常亮接缝（Screen Wake Lock API）
// 番茄钟专注/休息计时期间防止手机熄屏；Android WebView 84+ 原生支持，
// 不支持的环境静默降级。锁在页面退到后台时会被系统自动释放，
// 回到前台且仍处于计时中时自动重新申请。
// ==========================================

let sentinel: WakeLockSentinel | null = null;
let desired = false;
let visListenerInstalled = false;

async function acquire(): Promise<void> {
  if (!desired || sentinel) return;
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
      // 意外释放（如 stop→start 快速切换时旧锁延迟释放）且仍需要时重新申请
      if (desired && typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void acquire();
      }
    });
  } catch (e) {
    // 低电量模式等场景系统可能拒绝，属预期降级
    logSilent('wakeLock', 'screen wake lock request failed', e);
  }
}

export async function setKeepScreenOn(on: boolean): Promise<void> {
  desired = on;
  if (!visListenerInstalled && typeof document !== 'undefined') {
    visListenerInstalled = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void acquire();
    });
  }
  if (on) {
    await acquire();
  } else if (sentinel) {
    try {
      await sentinel.release();
    } catch (e) {
      logSilent('wakeLock', 'screen wake lock release failed', e);
    }
    sentinel = null;
  }
}
