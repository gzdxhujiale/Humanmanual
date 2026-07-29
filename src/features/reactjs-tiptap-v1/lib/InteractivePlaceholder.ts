import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface InteractivePlaceholderOptions {
  placeholderText?: string;
  templateButtonText?: string;
  templateButtonColor?: string;
  onOpenTemplate?: () => void;
}

export const InteractivePlaceholder = Extension.create<InteractivePlaceholderOptions>({
  name: 'interactivePlaceholder',

  addOptions() {
    return {
      placeholderText: '记录你的想法，或 ',
      templateButtonText: '使用模板',
      templateButtonColor: undefined,
      onOpenTemplate: undefined,
    };
  },

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey('interactivePlaceholderPlugin');

    return [
      new Plugin({
        key: pluginKey,
        props: {
          decorations: (state) => {
            const { doc } = state;

            // Check if document is empty (1 paragraph node with empty text)
            const isDocEmpty =
              doc.childCount === 1 &&
              doc.firstChild?.type.name === 'paragraph' &&
              doc.firstChild.content.size === 0;

            if (!isDocEmpty) {
              return DecorationSet.empty;
            }

            const widget = Decoration.widget(
              1,
              () => {
                const container = document.createElement('span');
                container.className = 'interactive-placeholder-widget';
                container.setAttribute('contenteditable', 'false');
                container.style.color = 'var(--text-faint, #94a3b8)';
                container.style.fontSize = '15px';
                container.style.lineHeight = '1.7';
                container.style.userSelect = 'none';
                container.style.pointerEvents = 'none';

                const textSpan = document.createElement('span');
                textSpan.textContent = this.options.placeholderText || '记录你的想法，或 ';

                const btn = document.createElement('span');
                btn.className = 'interactive-placeholder-btn';
                btn.textContent = this.options.templateButtonText || '使用模板';
                btn.style.color = this.options.templateButtonColor || '#1f6fd1';
                btn.style.cursor = 'pointer';
                btn.style.pointerEvents = 'auto';

                btn.addEventListener('mousedown', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  this.options.onOpenTemplate?.();
                });

                container.appendChild(textSpan);
                container.appendChild(btn);
                return container;
              },
              { side: -1, ignoreSelection: true, key: 'interactive-placeholder-widget' }
            );

            return DecorationSet.create(doc, [widget]);
          },
        },
      }),
    ];
  },
});
