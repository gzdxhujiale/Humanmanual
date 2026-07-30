import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// DOM Element cache map by position & collapsed state to prevent re-creating DOM on every keystroke
const widgetDomCache = new Map<string, HTMLElement>();

export const CollapsibleList = Extension.create({
  name: 'collapsibleList',

  addGlobalAttributes() {
    return [
      {
        types: ['listItem', 'taskItem'],
        attributes: {
          collapsed: {
            default: false,
            parseHTML: element => element.getAttribute('data-collapsed') === 'true',
            renderHTML: attributes => {
              if (!attributes.collapsed) return {};
              return { 'data-collapsed': 'true' };
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey('collapsibleListPlugin');

    return [
      new Plugin({
        key: pluginKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];

            state.doc.descendants((node, pos) => {
              if (node.type.name === 'listItem' || node.type.name === 'taskItem') {
                let hasChildList = false;
                node.forEach(child => {
                  if (
                    child.type.name === 'bulletList' ||
                    child.type.name === 'orderedList' ||
                    child.type.name === 'taskList'
                  ) {
                    hasChildList = true;
                  }
                });

                if (hasChildList) {
                  const isCollapsed = Boolean(node.attrs.collapsed);
                  const cacheKey = `${pos}-${isCollapsed}`;
                  
                  const widget = Decoration.widget(
                    pos + 1,
                    (view) => {
                      let btn = widgetDomCache.get(cacheKey);
                      if (!btn) {
                        btn = document.createElement('span');
                        btn.className = `list-fold-btn ${isCollapsed ? 'collapsed' : 'expanded'}`;
                        btn.setAttribute('contenteditable', 'false');
                        btn.setAttribute('title', isCollapsed ? '展开子列表' : '收起子列表');
                        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="fold-chevron"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
                        
                        btn.addEventListener('mousedown', (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          
                          const { tr } = view.state;
                          tr.setNodeMarkup(pos, undefined, {
                            ...node.attrs,
                            collapsed: !isCollapsed,
                          });
                          view.dispatch(tr);
                        });

                        widgetDomCache.set(cacheKey, btn);
                      }
                      return btn;
                    },
                    {
                      side: -1,
                      key: `fold-widget-${cacheKey}`,
                      ignoreSelection: true,
                      stopEvent: () => true,
                    }
                  );

                  decorations.push(widget);
                }
              }
            });

            if (widgetDomCache.size > 200) {
              widgetDomCache.clear();
            }

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
