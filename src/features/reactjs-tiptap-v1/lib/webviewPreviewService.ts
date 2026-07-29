import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

/**
 * 格式化并校验 URL，确保拥有 http/https 协议前缀
 */
export function formatPreviewUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * 根据 URL 生成符合 Tauri Window Label 要求的安全名称（仅含英文字母、数字、下划线、连字符）
 */
export function generateSafeWindowLabel(url: string): string {
  const cleanUrl = url.replace(/^https?:\/\//i, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const truncated = cleanUrl.slice(0, 40);
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }
  const positiveHash = Math.abs(hash).toString(36);
  return `web_preview_${truncated}_${positiveHash}`;
}

/**
 * 尝试提取域名用于窗口标题
 */
export function extractDomain(url: string): string {
  try {
    const formatted = formatPreviewUrl(url);
    const parsed = new URL(formatted);
    return parsed.hostname;
  } catch {
    return '网页预览';
  }
}

/**
 * 打开独立的 Tauri Webview 网页预览窗口
 * 规避控制台的 X-Frame-Options: SAMEORIGIN / CSP 跨域嵌套拦截
 */
export async function openWebviewPreviewWindow(
  rawUrl: string,
  customTitle?: string
): Promise<void> {
  const url = formatPreviewUrl(rawUrl);
  if (!url) return;

  const domain = extractDomain(url);
  const title = customTitle || `网页预览 - ${domain}`;
  const safeLabel = generateSafeWindowLabel(url);

  try {
    // 检查是否已有对应 URL 的预览窗口存在
    const existingWindow = await WebviewWindow.getByLabel(safeLabel).catch(() => null);
    if (existingWindow) {
      await existingWindow.setFocus();
      return;
    }

    // 创建原生 Webview 独立窗口，不受 <iframe> 同源限制
    const webview = new WebviewWindow(safeLabel, {
      url,
      title,
      width: 1000,
      height: 720,
      minWidth: 500,
      minHeight: 400,
      resizable: true,
      focus: true,
      center: true,
    });

    webview.once('tauri://created', () => {
      console.log(`Webview preview window created for ${url}`);
    });

    webview.once('tauri://error', (e) => {
      console.warn(`Failed to create Tauri WebviewWindow for ${url}, falling back to window.open:`, e);
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  } catch (err) {
    console.warn('Tauri WebviewWindow API unavailable, falling back to window.open:', err);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
