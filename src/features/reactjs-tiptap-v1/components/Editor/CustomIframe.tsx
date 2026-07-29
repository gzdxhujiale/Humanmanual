import React, { useState } from 'react';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Iframe as BaseIframe } from 'reactjs-tiptap-editor/iframe';
import { ExternalLink, Globe, ShieldAlert, RefreshCw } from 'lucide-react';
import { openWebviewPreviewWindow, extractDomain } from '../../lib/webviewPreviewService';
import { Button } from '../ui/button';

/**
 * 判断 URL 是否属于常见的专门允许跨域内嵌的 Embed 链接
 */
function isKnownEmbedUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('player.bilibili.com') ||
    lower.includes('youtube.com/embed') ||
    lower.includes('youtube-nocookie.com/embed') ||
    lower.includes('player.vimeo.com') ||
    lower.includes('music.163.com/outchain') ||
    (lower.includes('codepen.io') && lower.includes('/embed/')) ||
    lower.includes('figma.com/embed') ||
    lower.includes('maps.google.')
  );
}

export const IframeNodeView: React.FC<any> = (props) => {
  const { node } = props;
  const src = node.attrs?.src || '';
  const domain = extractDomain(src);

  // 如果已知是专用 embed 链接，默认渲染 iframe；如果是普通网页（如 bing.com），默认呈现优雅卡片
  const isEmbed = isKnownEmbedUrl(src);
  const [forceIframe, setForceIframe] = useState(isEmbed);

  const handleOpenPreview = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openWebviewPreviewWindow(src);
  };

  return (
    <NodeViewWrapper className="iframe-node-view-container my-3 select-none">
      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground shadow-sm hover:border-primary/50 transition-all">
        {/* 顶部控制与指示栏 */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b border-border text-xs">
          <div className="flex items-center gap-2 overflow-hidden mr-2">
            <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="font-semibold text-foreground truncate">{domain}</span>
            <span className="text-muted-foreground truncate hidden sm:inline">{src}</span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => setForceIframe(!forceIframe)}
              className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
              title={forceIframe ? "切换至预览卡片模式" : "尝试内置 <iframe /> 嵌入"}
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              <span>{forceIframe ? "卡片模式" : "尝试嵌入"}</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={handleOpenPreview}
              className="h-6 px-2 text-xs gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 shrink-0 font-medium"
              title="在独立的 Tauri 原生 Webview 窗口中预览（不受同源限制）"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>独立窗口预览</span>
            </Button>
          </div>
        </div>

        {/* 框架主体 */}
        <div className="relative w-full aspect-video min-h-[220px] max-h-[460px] bg-zinc-950/5 dark:bg-zinc-50/5 flex flex-col items-center justify-center">
          {forceIframe ? (
            <iframe
              src={src}
              className="w-full h-full border-0"
              allowFullScreen
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-6 text-center gap-2 text-muted-foreground">
              <ShieldAlert className="w-9 h-9 text-amber-500/90 mb-1" />
              <p className="text-sm font-semibold text-foreground">目标网站已开启同源安全保护 (X-Frame-Options)</p>
              <p className="text-xs max-w-md leading-relaxed text-muted-foreground">
                像 <code className="text-foreground font-mono">{domain}</code> 这样的常规网页不允许直接在编辑器内嵌渲染。请点击下方按钮唤起独立桌面窗口预览：
              </p>
              <Button
                size="sm"
                onClick={handleOpenPreview}
                className="mt-2 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                <span>在独立窗口中打开 {domain}</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export const CustomIframe = BaseIframe.extend({
  addNodeView() {
    return ReactNodeViewRenderer(IframeNodeView);
  },
});
