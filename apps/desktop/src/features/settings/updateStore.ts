import { create } from 'zustand';
import { getVersion } from '@tauri-apps/api/app';
import { sendNotification, isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import { usePreferencesStore } from './preferencesStore';
import { logError, logSilent, logWarn } from '@humanmanual/core';

export type Update = any;

async function safeCheckTauriUpdate(): Promise<any> {
  try {
    const updaterModule = await import('@tauri-apps/plugin-updater');
    if (updaterModule && typeof updaterModule.check === 'function') {
      return await updaterModule.check();
    }
  } catch {
    // Ignore fallback errors when latest.json or release is not yet published on GitHub
  }
  return null;
}

export interface ReleaseAsset {
  name: string;
  downloadUrl: string;
  size: number;
}

export interface GithubReleaseInfo {
  tagName: string;
  version: string;
  name: string;
  body: string;
  publishedAt: string;
  htmlUrl: string;
  assets: ReleaseAsset[];
}

export type UpdateStatus = 
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'ready_to_restart'
  | 'error';

export interface DownloadProgress {
  percentage: number;
  downloadedBytes: number;
  totalBytes: number;
}

interface UpdateState {
  currentVersion: string;
  latestRelease: GithubReleaseInfo | null;
  updateStatus: UpdateStatus;
  statusMessage: string;
  lastCheckedTime: string | null;
  downloadProgress: DownloadProgress | null;
  autoUpdateEnabled: boolean;
  githubRepo: string;
  tauriUpdateInstance: Update | null;

  setAutoUpdateEnabled: (enabled: boolean) => Promise<void>;
  setGithubRepo: (repo: string) => Promise<void>;
  checkUpdate: (isSilent?: boolean) => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  initBackgroundUpdate: () => Promise<void>;
}

// Compare semver version strings (e.g. "1.0.1" > "1.0.0")
export function compareVersions(v1: string, v2: string): number {
  const normalize = (v: string) => v.replace(/^v/i, '').trim().split('.').map(n => parseInt(n, 10) || 0);
  const p1 = normalize(v1);
  const p2 = normalize(v2);
  const len = Math.max(p1.length, p2.length);

  for (let i = 0; i < len; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

const DEFAULT_REPO = 'gzdxhujiale/Humanmanual';

export const useUpdateStore = create<UpdateState>((set, get) => ({
  currentVersion: '1.0.0',
  latestRelease: null,
  updateStatus: 'idle',
  statusMessage: '',
  lastCheckedTime: null,
  downloadProgress: null,
  autoUpdateEnabled: true,
  githubRepo: DEFAULT_REPO,
  tauriUpdateInstance: null,

  setAutoUpdateEnabled: async (enabled: boolean) => {
    set({ autoUpdateEnabled: enabled });
    await usePreferencesStore.getState().setPreference('auto-update-enabled', enabled ? 'true' : 'false');
  },

  setGithubRepo: async (repo: string) => {
    const cleanRepo = repo.trim() || DEFAULT_REPO;
    set({ githubRepo: cleanRepo });
    await usePreferencesStore.getState().setPreference('github-repo', cleanRepo);
  },

  checkUpdate: async (isSilent: boolean = false) => {
    if (get().updateStatus === 'checking' || get().updateStatus === 'downloading') return;

    set({
      updateStatus: 'checking',
      statusMessage: isSilent ? '' : '正在检查 GitHub Release 最新版本...',
      downloadProgress: null
    });

    const nowStr = new Date().toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    let currentVer = get().currentVersion;
    try {
      const ver = await getVersion();
      if (ver) {
        currentVer = ver;
        set({ currentVersion: ver });
      }
    } catch {
      // Fallback if not running inside Tauri webview
    }

    const repo = get().githubRepo || DEFAULT_REPO;

    try {
      // 1. First attempt check via Tauri Plugin Updater if configured
      let tauriUpdate: Update | null = null;
      try {
        tauriUpdate = await safeCheckTauriUpdate();
      } catch (err) {
        logWarn('updateStore', 'Tauri updater check returned warning/fallback', err);
      }

      // 2. Query GitHub Releases API directly for detailed release notes & assets
      const cleanRepoName = repo.replace(/^https?:\/\/github\.com\//i, '').replace(/\/$/i, '');
      const githubUrl = `https://api.github.com/repos/${cleanRepoName}/releases/latest`;

      let releaseInfo: GithubReleaseInfo | null = null;
      let apiNote = '';

      try {
        const resp = await fetch(githubUrl, {
          headers: { 'Accept': 'application/vnd.github.v3+json' }
        });

        if (resp.ok) {
          const data = await resp.json();
          releaseInfo = {
            tagName: data.tag_name || '',
            version: (data.tag_name || '').replace(/^v/i, ''),
            name: data.name || data.tag_name || '新版本',
            body: data.body || '无更新说明',
            publishedAt: data.published_at ? new Date(data.published_at).toLocaleDateString('zh-CN') : '',
            htmlUrl: data.html_url || `https://github.com/${cleanRepoName}/releases`,
            assets: (data.assets || []).map((a: any) => ({
              name: a.name,
              downloadUrl: a.browser_download_url,
              size: a.size
            }))
          };
        } else if (resp.status === 404) {
          apiNote = ' (GitHub 仓库暂未发布 Release)';
        } else if (resp.status === 403) {
          apiNote = ' (GitHub API 触发访问频次限制)';
        }
      } catch (e) {
        logWarn('updateStore', 'GitHub API fetch release warning', e);
      }

      // If Tauri plugin updater found an update OR GitHub API found a newer tag
      const latestVer = tauriUpdate?.version || releaseInfo?.version || currentVer;
      const isNewer = compareVersions(latestVer, currentVer) > 0;

      if (isNewer || tauriUpdate?.available) {
        set({
          latestRelease: releaseInfo || {
            tagName: `v${latestVer}`,
            version: latestVer,
            name: `版本 v${latestVer}`,
            body: tauriUpdate?.body || '包含性能优化与已知问题修复。',
            publishedAt: nowStr,
            htmlUrl: `https://github.com/${cleanRepoName}/releases`,
            assets: []
          },
          tauriUpdateInstance: tauriUpdate,
          updateStatus: 'available',
          statusMessage: `发现新版本 v${latestVer}！`,
          lastCheckedTime: nowStr
        });

        // Trigger automatic silent update if enabled
        if (get().autoUpdateEnabled) {
          logSilent('updateStore', 'new version detected, starting silent background download');
          await get().downloadAndInstall();
        }
      } else {
        set({
          updateStatus: 'up-to-date',
          statusMessage: '当前已是最新版本！' + apiNote,
          lastCheckedTime: nowStr,
          tauriUpdateInstance: null
        });
      }
    } catch (err: any) {
      logError('updateStore', 'check update failed', err);
      set({
        updateStatus: 'error',
        statusMessage: isSilent ? '' : `检查更新失败: ${err?.message || err || '网络异常'}`,
        lastCheckedTime: nowStr
      });
    }
  },

  downloadAndInstall: async () => {
    const { tauriUpdateInstance, latestRelease } = get();

    set({
      updateStatus: 'downloading',
      statusMessage: '正在后台下载更新包...',
      downloadProgress: { percentage: 0, downloadedBytes: 0, totalBytes: 100 }
    });

    try {
      if (tauriUpdateInstance) {
        let downloaded = 0;
        let total = 0;
        await tauriUpdateInstance.downloadAndInstall((event: any) => {
          switch (event.event) {
            case 'Started':
              total = event.data.contentLength || 100;
              set({ downloadProgress: { percentage: 0, downloadedBytes: 0, totalBytes: total } });
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              const pct = total > 0 ? Math.min(Math.round((downloaded / total) * 100), 99) : 50;
              set({ downloadProgress: { percentage: pct, downloadedBytes: downloaded, totalBytes: total } });
              break;
            case 'Finished':
              set({ downloadProgress: { percentage: 100, downloadedBytes: total, totalBytes: total } });
              break;
          }
        });

        set({
          updateStatus: 'ready_to_restart',
          statusMessage: `新版本 ${latestRelease?.tagName || ''} 已完成静默下载，重启应用即可完成升级！`
        });

        // Send OS Desktop Notification
        try {
          let permissionGranted = await isPermissionGranted();
          if (!permissionGranted) {
            const permission = await requestPermission();
            permissionGranted = permission === 'granted';
          }
          if (permissionGranted) {
            sendNotification({
              title: '软件更新就绪',
              body: `应用新版本 (${latestRelease?.tagName || '最新版'}) 已自动静默下载完成，重启应用即可完成升级！`
            });
          }
        } catch (e) {
          logWarn('updateStore', 'failed to send desktop update notification', e);
        }
      } else {
        // Fallback when latest.json manifest is not present: open browser for actual asset download
        const asset = latestRelease?.assets?.find(a =>
          a.name.endsWith('.msi') || a.name.endsWith('.exe') || a.name.endsWith('.setup.exe')
        ) || latestRelease?.assets[0];
        const downloadUrl = asset?.downloadUrl || latestRelease?.htmlUrl || `https://github.com/${get().githubRepo}/releases`;

        try {
          const { openUrl } = await import('@tauri-apps/plugin-opener');
          await openUrl(downloadUrl);
        } catch {
          window.open(downloadUrl, '_blank');
        }

        set({
          updateStatus: 'available',
          statusMessage: `已在浏览器打开安装包下载页面 (${asset?.name || 'GitHub Release'})，请在下载完成后运行安装包完成升级。`,
          downloadProgress: null
        });
      }
    } catch (err: any) {
      logError('updateStore', 'download update failed', err);
      set({
        updateStatus: 'error',
        statusMessage: `更新下载失败: ${err?.message || err || '文件下载异常'}`
      });
    }
  },

  initBackgroundUpdate: async () => {
    try {
      const ver = await getVersion();
      if (ver) set({ currentVersion: ver });
    } catch {
      // Fallback
    }

    const autoEnabledStr = usePreferencesStore.getState().getPreference('auto-update-enabled', 'true');
    const isAuto = autoEnabledStr !== 'false';
    
    const savedRepo = usePreferencesStore.getState().getPreference('github-repo', DEFAULT_REPO);

    set({
      autoUpdateEnabled: isAuto,
      githubRepo: savedRepo || DEFAULT_REPO
    });

    // Run silent check in background on startup
    if (isAuto) {
      setTimeout(() => {
        get().checkUpdate(true);
      }, 3000);
    }
  }
}));
