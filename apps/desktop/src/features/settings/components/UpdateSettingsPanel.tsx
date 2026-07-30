import React, { useState } from "react";
import { 
  CheckCircle2, 
  Download, 
  RefreshCw, 
  Sparkles, 
  AlertCircle, 
  ExternalLink,
  HardDriveDownload,
  RotateCw
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useUpdateStore } from "../updateStore";

const GithubIcon = ({ size = 20, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function UpdateSettingsPanel() {
  const {
    currentVersion,
    latestRelease,
    updateStatus,
    statusMessage,
    lastCheckedTime,
    downloadProgress,
    autoUpdateEnabled,
    githubRepo,
    setAutoUpdateEnabled,
    setGithubRepo,
    checkUpdate,
    downloadAndInstall
  } = useUpdateStore();

  const [editingRepo, setEditingRepo] = useState(githubRepo);
  const [repoSavedMsg, setRepoSavedMsg] = useState("");

  const handleRepoSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await setGithubRepo(editingRepo);
    setRepoSavedMsg("仓库路径已保存");
    setTimeout(() => setRepoSavedMsg(""), 3000);
  };

  const handleOpenLink = async (url: string) => {
    try {
      await openUrl(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  const handleRestart = async () => {
    try {
      // Relaunch the Tauri app so the already-downloaded update is applied.
      // A plain window.location.reload() only refreshes the webview and never installs the update.
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (err) {
      console.error("Relaunch failed, falling back to webview reload:", err);
      window.location.reload();
    }
  };

  const isChecking = updateStatus === "checking";
  const isDownloading = updateStatus === "downloading";
  const isAvailable = updateStatus === "available";
  const isReady = updateStatus === "ready_to_restart";
  const isLatest = updateStatus === "up-to-date";
  const isError = updateStatus === "error";

  const getHeroClass = () => {
    if (isReady || isAvailable) return "windows-update-hero available";
    if (isLatest) return "windows-update-hero latest";
    return "windows-update-hero";
  };

  return (
    <div className="update-panel">
      {/* 1. Header Banner / Hero Card */}
      <div className={getHeroClass()}>
        <div className="windows-update-main">
          <div className="windows-update-mark">
            {isChecking && <RefreshCw size={42} className="animate-spin text-accent" />}
            {isDownloading && <Download size={42} className="animate-bounce text-accent" />}
            {isReady && <Sparkles size={42} className="text-emerald-600" />}
            {isLatest && <CheckCircle2 size={42} className="text-emerald-600" />}
            {isAvailable && <Download size={42} className="text-blue-600" />}
            {isError && <AlertCircle size={42} className="text-red-500" />}
            {updateStatus === "idle" && <GithubIcon size={42} className="text-gray-400" />}
          </div>

          <div className="windows-update-copy">
            <h3>
              {isChecking && "正在检查更新..."}
              {isDownloading && "正在后台静默下载更新包..."}
              {isReady && "更新已就绪，重启应用以完成升级"}
              {isLatest && "当前已是最新版本"}
              {isAvailable && `发现新版本 ${latestRelease?.tagName || ""}`}
              {isError && "检查更新遇到了问题"}
              {updateStatus === "idle" && `人类使用手册 v${currentVersion}`}
            </h3>

            <p>
              {isReady ? (
                "应用最新版本已成功下载在本地，随时重启即可应用新特性。"
              ) : isAvailable ? (
                `当前版本: v${currentVersion} ➔ 最新版本: ${latestRelease?.tagName || "未知"}`
              ) : (
                `当前版本: v${currentVersion}`
              )}
            </p>

            {lastCheckedTime && (
              <p className="update-check-time">
                上次检查时间：{lastCheckedTime}
              </p>
            )}

            {statusMessage && !isChecking && (
              <p className={`update-status ${isError ? "text-red-500 font-medium" : ""}`}>
                {statusMessage}
              </p>
            )}
          </div>
        </div>

        <div className="shortcut-settings-actions">
          {isReady ? (
            <button 
              type="button" 
              className="primary-button update-check-button flex items-center gap-1.5"
              onClick={handleRestart}
            >
              <RotateCw size={15} />
              <span>重启应用</span>
            </button>
          ) : isAvailable ? (
            <button 
              type="button" 
              className="primary-button update-check-button flex items-center gap-1.5"
              disabled={isDownloading}
              onClick={() => downloadAndInstall()}
            >
              <Download size={15} />
              <span>{isDownloading ? "下载中..." : "立即下载安装"}</span>
            </button>
          ) : (
            <button 
              type="button" 
              className="primary-button update-check-button flex items-center gap-1.5"
              disabled={isChecking || isDownloading}
              onClick={() => checkUpdate(false)}
            >
              <RefreshCw size={15} className={isChecking ? "animate-spin" : ""} />
              <span>{isChecking ? "检查中..." : "检查更新"}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Download Progress Bar Component */}
      {isDownloading && downloadProgress && (
        <div className="update-download-progress">
          <div className="update-progress-heading">
            <span>正在后台静默下载更新包...</span>
            <strong>{downloadProgress.percentage}%</strong>
          </div>
          <div className="update-progress-track">
            <span style={{ width: `${downloadProgress.percentage}%` }} />
          </div>
          <div className="update-progress-meta">
            <span>
              {formatBytes(downloadProgress.downloadedBytes)} / {formatBytes(downloadProgress.totalBytes)}
            </span>
            <span>请保持网络通畅，下载完成后将自动提醒重启</span>
          </div>
        </div>
      )}

      {/* 3. Automatic Update Preference Options */}
      <h4 className="settings-section-label">更新设置与偏好配置</h4>
      
      <div className="update-options">
        <label className="update-option-row">
          <div className="update-option-icon">
            <Sparkles size={20} />
          </div>
          <div className="update-option-copy">
            <strong>后台自动静默更新 (默认开启)</strong>
            <span>启动应用或有新版本发布时在后台自动静默下载，并在完成后提示重启应用</span>
          </div>
          <input 
            type="checkbox" 
            className="w-5 h-5 accent-blue-600 cursor-pointer"
            checked={autoUpdateEnabled}
            onChange={(e) => setAutoUpdateEnabled(e.target.checked)}
          />
        </label>

        <form onSubmit={handleRepoSave} className="update-option-row flex-wrap">
          <div className="update-option-icon">
            <GithubIcon size={20} />
          </div>
          <div className="update-option-copy">
            <strong>GitHub Release 仓库源</strong>
            <span>用于检索发布版本与拉取 Release 资源的源仓库 (格式: owner/repo)</span>
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="text" 
              className="px-3 py-1.5 border border-slate-200 rounded-md text-xs font-mono w-52 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none"
              value={editingRepo}
              onChange={(e) => setEditingRepo(e.target.value)}
              placeholder="owner/repo"
            />
            <button type="submit" className="px-3 py-1.5 border border-slate-200 hover:border-blue-400 rounded-md text-xs font-medium bg-white text-slate-700 hover:text-blue-600">
              保存
            </button>
          </div>
          {repoSavedMsg && (
            <div className="w-full text-right text-xs text-emerald-600 font-medium pt-1">
              {repoSavedMsg}
            </div>
          )}
        </form>
      </div>

      {/* 4. Release Notes & Assets Detail Card */}
      {latestRelease && (
        <>
          <h4 className="settings-section-label mt-2">最新版本日志与资源 (GitHub Release)</h4>
          <div className="release-card">
            <div className="release-card-heading">
              <div>
                <strong className="text-slate-800 text-sm font-bold block">
                  {latestRelease.name || latestRelease.tagName}
                </strong>
                <span className="text-slate-500 text-xs">
                  发布日期：{latestRelease.publishedAt}
                </span>
              </div>
              <button 
                type="button"
                className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
                onClick={() => handleOpenLink(latestRelease.htmlUrl)}
              >
                <span>在 GitHub 查看</span>
                <ExternalLink size={13} />
              </button>
            </div>

            <div className="release-notes max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-xs text-slate-700 bg-white/60 p-3 rounded border border-slate-100">
              {latestRelease.body}
            </div>

            {latestRelease.assets.length > 0 && (
              <div className="release-asset space-y-2 mt-3 pt-3 border-t border-slate-200/60">
                <div className="text-xs font-semibold text-slate-700">可下载资源：</div>
                <div className="grid grid-cols-1 gap-2">
                  {latestRelease.assets.map((asset, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between p-2 rounded border border-slate-200/80 bg-white hover:bg-slate-50 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <HardDriveDownload size={15} className="text-slate-500 flex-shrink-0" />
                        <span className="truncate font-mono font-medium text-slate-800">{asset.name}</span>
                        <span className="text-slate-400 flex-shrink-0">({formatBytes(asset.size)})</span>
                      </div>
                      <button
                        type="button"
                        className="px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50 border border-blue-200 rounded font-medium cursor-pointer transition-colors flex-shrink-0"
                        onClick={() => handleOpenLink(asset.downloadUrl)}
                      >
                        下载文件
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
