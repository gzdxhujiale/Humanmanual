import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { openWebviewPreviewWindow } from './webviewPreviewService';

export const IframePreviewClick = Extension.create({
  name: 'iframePreviewClick',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('iframePreviewClickPlugin'),
        props: {
          handleClickOn(_view, _pos, node, _nodePos, event) {
            if (node.type.name === 'iframe' && node.attrs?.src) {
              const target = event.target as HTMLElement;
              // 点击 iframe 或点击带提示的交互区域时唤起独立原生 Webview 预览窗口
              if (
                target &&
                (target.tagName === 'IFRAME' ||
                  target.closest('.iframe-wrapper') ||
                  target.closest('[data-type="iframe"]'))
              ) {
                // 如果是双击或者按住 Alt/Ctrl 点击，强行唤起 WebviewWindow 独立预览
                if (event.detail === 2 || event.altKey || event.ctrlKey || event.metaKey) {
                  event.preventDefault();
                  openWebviewPreviewWindow(node.attrs.src);
                  return true;
                }
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});
