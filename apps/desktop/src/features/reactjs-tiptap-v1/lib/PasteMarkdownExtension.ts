import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { marked } from 'marked';
import { logWarn } from '@humanmanual/core';

function isMarkdownText(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  // Detect Markdown block patterns or inline markup
  const mdBlockRegex = /^(#{1,6}\s|>|\s*[-*+]\s|\s*\d+\.\s|\s*-\s*\[[ xX]\]|```|---|[*]{3}|_{3})/m;
  const mdInlineRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|`[^`]+`|\[.+\]\(.+\))/;
  return mdBlockRegex.test(text) || mdInlineRegex.test(text);
}

export const PasteMarkdownExtension = Extension.create({
  name: 'pasteMarkdownExtension',

  addProseMirrorPlugins() {
    const { editor } = this;

    return [
      new Plugin({
        key: new PluginKey('pasteMarkdownExtension'),
        props: {
          handlePaste(_view, event) {
            // Do not intercept paste if currently inside a code block or inline code
            if (editor.isActive('codeBlock') || editor.isActive('code')) {
              return false;
            }

            const text = event.clipboardData?.getData('text/plain');
            if (!text) return false;

            if (isMarkdownText(text)) {
              try {
                // Convert Markdown to clean GFM HTML and let TipTap natively insert rich content
                const htmlResult = marked.parse(text, { gfm: true, breaks: true });
                const html = typeof htmlResult === 'string' ? htmlResult : '';
                if (html) {
                  editor.commands.insertContent(html);
                  return true; // Intercept and finish paste handling
                }
              } catch (e) {
                logWarn('pasteMarkdown', 'failed to parse pasted markdown with marked', e);
              }
            }

            return false; // Fallback to normal paste
          },
        },
      }),
    ];
  },
});
