import { useEffect, useState, useRef, memo, useMemo } from 'react';
import { MoreHorizontal, LayoutTemplate } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../ui/button';
import { useTemplateData, useTemplateActions } from '../../../templates/useTemplateQuery';
import { TemplateModal } from '../../../templates/TemplateModal';
import { Template } from '../../../templates/templateTypes';
import { InteractivePlaceholder } from '../../lib/InteractivePlaceholder';
import { convertMarkdownToTipTapJson } from '../../jsonMarkdownAdapter';

import { RichTextProvider } from 'reactjs-tiptap-editor';
import { localeActions } from 'reactjs-tiptap-editor/locale-bundle';

// Set default locale to Chinese
localeActions.setLang('zh_CN');

// Base Kit
import Collaboration from '@tiptap/extension-collaboration';
import { Document } from '@tiptap/extension-document';
import { HardBreak } from '@tiptap/extension-hard-break';
import { ListItem } from '@tiptap/extension-list';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { TextStyle } from '@tiptap/extension-text-style';
import {
  Dropcursor,
  Gapcursor,
  Placeholder,
  TrailingNode,
} from '@tiptap/extensions';

// build extensions
import {
  Blockquote,
  RichTextBlockquote,
} from 'reactjs-tiptap-editor/blockquote';
import { Bold, RichTextBold } from 'reactjs-tiptap-editor/bold';
import {
  BulletList,
  RichTextBulletList,
} from 'reactjs-tiptap-editor/bulletlist';
import { Clear, RichTextClear } from 'reactjs-tiptap-editor/clear';
import { Code, RichTextCode } from 'reactjs-tiptap-editor/code';
import { CodeBlock, RichTextCodeBlock } from 'reactjs-tiptap-editor/codeblock';
import { Color, RichTextColor } from 'reactjs-tiptap-editor/color';
import {
  Column,
  ColumnNode,
  MultipleColumnNode,
  RichTextColumn,
} from 'reactjs-tiptap-editor/column';
import { Drawer, RichTextDrawer } from 'reactjs-tiptap-editor/drawer';
import { Emoji, RichTextEmoji } from 'reactjs-tiptap-editor/emoji';
import { ExportPdf, RichTextExportPdf } from 'reactjs-tiptap-editor/exportpdf';
import {
  FontFamily,
  RichTextFontFamily,
} from 'reactjs-tiptap-editor/fontfamily';
import { FontSize, RichTextFontSize } from 'reactjs-tiptap-editor/fontsize';
import { Heading, RichTextHeading } from 'reactjs-tiptap-editor/heading';
import { Highlight, RichTextHighlight } from 'reactjs-tiptap-editor/highlight';
import {
  History,
  RichTextRedo,
  RichTextUndo,
} from 'reactjs-tiptap-editor/history';
import {
  HorizontalRule,
  RichTextHorizontalRule,
} from 'reactjs-tiptap-editor/horizontalrule';
import { RichTextIframe } from 'reactjs-tiptap-editor/iframe';
import { CustomIframe } from './CustomIframe';

import { Indent, RichTextIndent } from 'reactjs-tiptap-editor/indent';
import { Italic, RichTextItalic } from 'reactjs-tiptap-editor/italic';
import {
  LineHeight,
  RichTextLineHeight,
} from 'reactjs-tiptap-editor/lineheight';
import { Link, RichTextLink } from 'reactjs-tiptap-editor/link';
import { MoreMark, RichTextMoreMark } from 'reactjs-tiptap-editor/moremark';
import {
  OrderedList,
  RichTextOrderedList,
} from 'reactjs-tiptap-editor/orderedlist';
import {
  RichTextSearchAndReplace,
  SearchAndReplace,
} from 'reactjs-tiptap-editor/searchandreplace';
import { RichTextStrike, Strike } from 'reactjs-tiptap-editor/strike';
import { RichTextTable, Table } from 'reactjs-tiptap-editor/table';
import { RichTextTaskList, TaskList } from 'reactjs-tiptap-editor/tasklist';
import { RichTextAlign, TextAlign } from 'reactjs-tiptap-editor/textalign';
import {
  RichTextTextDirection,
  TextDirection,
} from 'reactjs-tiptap-editor/textdirection';
import {
  RichTextUnderline,
  TextUnderline,
} from 'reactjs-tiptap-editor/textunderline';

// Slash Command
import {
  SlashCommand,
  SlashCommandList,
} from 'reactjs-tiptap-editor/slashcommand';

// Bubble
import {
  RichTextBubbleColumns,
  RichTextBubbleDrawer,
  RichTextBubbleIframe,
  RichTextBubbleLink,
  RichTextBubbleTable,
  RichTextBubbleText,
  RichTextBubbleMenuDragHandle,
  RichTextBubbleCodeBlock,
} from 'reactjs-tiptap-editor/bubble';
import { createLowlight, common } from 'lowlight';

import 'easydrawer/styles.css';
import 'reactjs-tiptap-editor/style.css';

import { Header } from './Header';
import { EditorContent, useEditor } from '@tiptap/react';
import { EMOJI_LIST } from './emojis';
import { CustomShortcuts } from '../../lib/CustomShortcuts';
import { CollapsibleList } from '../../lib/CollapsibleList';
import { Markdown } from 'tiptap-markdown';
import { PasteMarkdownExtension } from '../../lib/PasteMarkdownExtension';
import { IframePreviewClick } from '../../lib/IframePreviewClick';


function convertBase64ToBlob(base64: string) {
  const arr = base64.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

const lowlight = createLowlight(common);

const DocumentColumn = /* @__PURE__ */ Document.extend({
  content: '(block|columns)+',
});

const BaseKit = [
  DocumentColumn,
  Text,
  Dropcursor.configure({
    class: 'reactjs-tiptap-editor-theme',
    color: 'hsl(var(--primary))',
    width: 2,
  }),
  Gapcursor,
  HardBreak,
  Paragraph,
  TrailingNode,
  ListItem,
  TextStyle,
  Placeholder.configure({
    placeholder: "输入 '/' 弹出指令菜单...",
  }),
];

const extensions = [
  ...BaseKit,
  CustomShortcuts,
  CollapsibleList,
  History,
  SearchAndReplace,
  Clear,
  FontFamily,
  Heading,
  FontSize,
  Bold,
  Italic,
  TextUnderline,
  Strike,
  MoreMark,
  Emoji.configure({
    suggestion: {
      items: async ({ query }: any) => {
        const lowerCaseQuery = query?.toLowerCase();
        const results = EMOJI_LIST.filter(({ name }) =>
          name.toLowerCase().includes(lowerCaseQuery),
        );
        return results.slice(0, 20);
      },
    },
  }),
  Color,
  Highlight,
  BulletList,
  OrderedList,
  TextAlign,
  Indent,
  LineHeight,
  TaskList,
  Link,
  Blockquote,
  HorizontalRule,
  Code,
  CodeBlock.configure({
    lowlight,
  }),
  Column,
  ColumnNode,
  MultipleColumnNode,
  Table,
  CustomIframe,
  ExportPdf,
  TextDirection,
  Drawer.configure({
    upload: (file: any) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);

      return new Promise((resolve) => {
        setTimeout(() => {
          const blob = convertBase64ToBlob(reader.result as string);
          resolve(URL.createObjectURL(blob));
        }, 300);
      });
    },
  }),
  SlashCommand,
  Markdown,
  PasteMarkdownExtension,
  IframePreviewClick,
];

const DEFAULT = `<h1 dir="auto" style="text-align: center;">Rich Text Editor</h1><p dir="auto" style="text-align: center;">A modern WYSIWYG rich text editor based on <a target="_blank" rel="noopener noreferrer nofollow" class="link" href="https://github.com/scrumpy/tiptap">tiptap</a> and <a target="_blank" rel="noopener noreferrer nofollow" class="link" href="https://ui.shadcn.com/">shadcn</a> for Reactjs</p><p dir="auto"></p><p dir="auto"><div class="image" style="text-align: center;"><img dir="auto" src="https://picsum.photos/1920/1080.webp?t=1" width="303" flipx="false" flipy="false" align="center" inline="false" style=""></div></p><h2 dir="auto">Features</h2><ul dir="auto"><li dir="auto"><p dir="auto">Use React, tailwindcss, <a target="_blank" rel="noopener noreferrer nofollow" class="link" href="https://ui.shadcn.com/">shadcn</a> components</p></li><li dir="auto"><p dir="auto">I18n support (vi, en, zh, pt, ...)</p></li><li dir="auto"><p dir="auto">Slash Commands (type <code>/</code> to show menu list)</p></li><li dir="auto"><p dir="auto">Multi Column</p></li><li dir="auto"><p dir="auto">Support emoji <span dir="auto" data-name="100" data-type="emoji">💯</span> (type <code>:</code> to show emoji list)</p></li><li dir="auto"><p dir="auto">Support iframe</p></li><li dir="auto"><p dir="auto">Support mermaid</p></li><li dir="auto"><p dir="auto">Support mention <span class="mention" data-type="mention" dir="auto" data-id="0" data-label="hunghg255" data-mention-suggestion-char="@">@hunghg255</span> (type <code>@</code> to show list)</p></li><li dir="auto"><p dir="auto">Suport katex math (<span class="katex" dir="auto" text="c%20%3D%20%5Cpm%5Csqrt%7Ba%5E2%20%2B%20b%5E2%7D" macros=""></span>)</p></li></ul><h2 dir="auto">Installation</h2><pre dir="auto"><code>pnpm install reactjs-tiptap-editor@latest</code></pre><p dir="auto"></p>;`;

const TOOLBAR_ITEMS = [
  { id: 'undo', component: <RichTextUndo /> },
  { id: 'redo', component: <RichTextRedo /> },
  { id: 'search', component: <RichTextSearchAndReplace /> },
  { id: 'clear', component: <RichTextClear /> },
  { id: 'fontFamily', component: <RichTextFontFamily /> },
  { id: 'heading', component: <RichTextHeading /> },
  { id: 'fontSize', component: <RichTextFontSize /> },
  { id: 'bold', component: <RichTextBold /> },
  { id: 'italic', component: <RichTextItalic /> },
  { id: 'underline', component: <RichTextUnderline /> },
  { id: 'strike', component: <RichTextStrike /> },
  { id: 'moreMark', component: <RichTextMoreMark /> },
  { id: 'emoji', component: <RichTextEmoji /> },
  { id: 'color', component: <RichTextColor /> },
  { id: 'highlight', component: <RichTextHighlight /> },
  { id: 'bulletList', component: <RichTextBulletList /> },
  { id: 'orderedList', component: <RichTextOrderedList /> },
  { id: 'align', component: <RichTextAlign /> },
  { id: 'indent', component: <RichTextIndent /> },
  { id: 'lineHeight', component: <RichTextLineHeight /> },
  { id: 'taskList', component: <RichTextTaskList /> },
  { id: 'link', component: <RichTextLink /> },
  { id: 'blockquote', component: <RichTextBlockquote /> },
  { id: 'hr', component: <RichTextHorizontalRule /> },
  { id: 'code', component: <RichTextCode /> },
  { id: 'codeBlock', component: <RichTextCodeBlock /> },
  { id: 'column', component: <RichTextColumn /> },
  { id: 'table', component: <RichTextTable /> },
  { id: 'iframe', component: <RichTextIframe /> },
  { id: 'exportPdf', component: <RichTextExportPdf /> },
  { id: 'direction', component: <RichTextTextDirection /> },
  { id: 'drawer', component: <RichTextDrawer /> },
];

const RichTextToolbar = memo(({ onOpenTemplate }: { onOpenTemplate?: () => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const itemWidthsRef = useRef<number[] | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(TOOLBAR_ITEMS.length);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number;

    const calculateVisibleItems = () => {
      const containerWidth = container.clientWidth;
      if (containerWidth <= 0) return;

      let widths = itemWidthsRef.current;
      if (!widths || widths.some(w => w <= 0)) {
        if (measureRef.current) {
          const measureChildren = Array.from(measureRef.current.children) as HTMLElement[];
          if (measureChildren.length > 0) {
            const measured = measureChildren.map(
              (child) => child.getBoundingClientRect().width || child.offsetWidth || 32
            );
            if (measured.every(w => w > 0)) {
              widths = measured;
              itemWidthsRef.current = measured;
            } else {
              widths = measured;
            }
          }
        }
      }

      if (!widths || widths.length === 0) return;

      const gap = 4;
      const MORE_BUTTON_WIDTH = 36;
      const TEMPLATE_BUTTON_WIDTH = onOpenTemplate ? 72 : 0;
      const totalItems = TOOLBAR_ITEMS.length;

      let totalWidthNeeded = TEMPLATE_BUTTON_WIDTH;
      for (let i = 0; i < widths.length; i++) {
        totalWidthNeeded += widths[i] + (i > 0 ? gap : 0);
      }

      if (totalWidthNeeded <= containerWidth) {
        setVisibleCount(totalItems);
        return;
      }

      const availableWidth = containerWidth - MORE_BUTTON_WIDTH - TEMPLATE_BUTTON_WIDTH - gap * 2;
      let currentWidth = 0;
      let count = 0;

      for (let i = 0; i < widths.length; i++) {
        const itemWidth = widths[i];
        const widthWithThisItem = currentWidth + (i > 0 ? gap : 0) + itemWidth;

        if (widthWithThisItem <= availableWidth) {
          currentWidth = widthWithThisItem;
          count++;
        } else {
          break;
        }
      }

      setVisibleCount(Math.max(1, count));
    };

    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(calculateVisibleItems);
    });

    resizeObserver.observe(container);
    calculateVisibleItems();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [onOpenTemplate]);

  const visibleItems = TOOLBAR_ITEMS.slice(0, visibleCount);
  const overflowItems = TOOLBAR_ITEMS.slice(visibleCount);

  return (
    <div className="relative w-full !border-b !border-solid !border-border bg-[var(--surface-0,#f4f6f8)]">
      <div
        ref={measureRef}
        className="absolute top-0 left-0 flex items-center gap-1 opacity-0 pointer-events-none -z-50 whitespace-nowrap"
        aria-hidden="true"
      >
        {TOOLBAR_ITEMS.map((item) => (
          <div key={item.id} className="inline-flex items-center shrink-0">
            {item.component}
          </div>
        ))}
      </div>

      <div
        ref={containerRef}
        className="flex items-center !p-1 gap-1 flex-nowrap w-full overflow-hidden"
      >
        {visibleItems.map((item) => (
          <div key={item.id} className="inline-flex items-center shrink-0">
            {item.component}
          </div>
        ))}

        <div className="ml-auto flex items-center gap-1 shrink-0">
          {onOpenTemplate && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 border border-dashed border-blue-300/80 hover:border-blue-400 bg-blue-50/40 hover:bg-blue-50 dark:bg-blue-950/20"
              title="使用模板"
              onClick={onOpenTemplate}
              type="button"
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              <span>模板</span>
            </Button>
          )}

          {overflowItems.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  title="更多工具"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-[360px] sm:w-[420px] max-w-[calc(100vw-32px)] p-2 flex flex-wrap items-center gap-1 shadow-xl border border-border bg-white dark:bg-zinc-900 z-[1100]"
              >
                {overflowItems.map((item) => (
                  <div key={item.id} className="inline-flex items-center shrink-0">
                    {item.component}
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    </div>
  );
});

const RichTextOverlayBubbles = () => (
  <>
    <RichTextBubbleColumns />
    <RichTextBubbleDrawer />
    <RichTextBubbleIframe />
    <RichTextBubbleLink />
    <RichTextBubbleTable />
    <RichTextBubbleText />
    <RichTextBubbleCodeBlock />
    <SlashCommandList />
    <RichTextBubbleMenuDragHandle />
  </>
);

export interface ReactjsTiptapEditorProps {
  content?: string;
  initialContent?: string;
  onChange?: (content: string) => void;
  editable?: boolean;
  className?: string;
  showHeader?: boolean;
  showToolbar?: boolean;
  enableCustomTemplates?: boolean;
  supportCustomTemplates?: boolean;
  enableTemplates?: boolean;
  supportTemplates?: boolean;
  templateButtonColor?: string;
  collaborationDoc?: any;
  collaborationField?: string;
}

function sanitizeAttrs(node: any): any {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(sanitizeAttrs);
  const out: any = {};
  for (const k of Object.keys(node)) {
    if (k === 'attrs' && node[k] && typeof node[k] === 'object') {
      const cleanAttrs: any = {};
      for (const ak of Object.keys(node[k])) {
        if (node[k][ak] !== null && node[k][ak] !== undefined) {
          cleanAttrs[ak] = node[k][ak];
        }
      }
      out[k] = cleanAttrs;
    } else {
      out[k] = sanitizeAttrs(node[k]);
    }
  }
  return out;
}

const parseContent = (content?: any) => {
  if (!content) return '';
  if (typeof content === 'object') return sanitizeAttrs(content);
  if (typeof content !== 'string') return String(content);
  const trimmed = content.trim();

  // 1. TipTap JSON string
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      return sanitizeAttrs(parsed);
    } catch {
      // Fallback if not valid JSON
    }
  }

  // 2. HTML string
  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return content;
  }

  // 3. Markdown string or plain text
  return convertMarkdownToTipTapJson(content);
};



function debounce(func: any, wait: number) {
  let timeout: any;
  return function (this: any, ...args: any[]) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

export function Editor({
  content: valueProp,
  initialContent,
  onChange,
  editable = true,
  className = '',
  showHeader = false,
  showToolbar = true,
  enableCustomTemplates,
  supportCustomTemplates,
  enableTemplates,
  supportTemplates,
  templateButtonColor,
  collaborationDoc,
  collaborationField = 'default',
}: ReactjsTiptapEditorProps = {}) {
  const hasTemplateSupport = Boolean(
    enableCustomTemplates || supportCustomTemplates || enableTemplates || supportTemplates
  );

  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  const templates = useTemplateData().data ?? [];
  const { updateTemplate, deleteTemplate } = useTemplateActions();

  // Store last emitted content to avoid feedback loops and unnecessary setContent calls
  const lastEmittedValueRef = useRef<string>('');

  // Ref to hold the debounced export function
  const debouncedExportRef = useRef<((ed: any) => void) | null>(null);

  useEffect(() => {
    debouncedExportRef.current = debounce((ed: any) => {
      if (!ed || ed.isDestroyed) return;
      const jsonStr = JSON.stringify(ed.getJSON());
      lastEmittedValueRef.current = jsonStr;
      onChange?.(jsonStr);
    }, 300);
  }, [onChange]);

  // Determine initial content on mount
  const initialContentRef = useRef<any>(null);
  if (initialContentRef.current === null) {
    const raw = valueProp !== undefined ? valueProp : (initialContent !== undefined ? initialContent : DEFAULT);
    initialContentRef.current = parseContent(raw);
  }

  const editorExtensions = useMemo(() => {
    const list = [...extensions];
    if (hasTemplateSupport) {
      list.push(
        InteractivePlaceholder.configure({
          templateButtonColor,
          onOpenTemplate: () => setIsTemplateModalOpen(true),
        })
      );
    }
    if (collaborationDoc) {
      list.push(
        Collaboration.configure({
          document: collaborationDoc,
          field: collaborationField,
        })
      );
    }
    return list;
  }, [hasTemplateSupport, templateButtonColor, collaborationDoc, collaborationField]);

  const editor = useEditor({
    textDirection: 'auto',
    content: initialContentRef.current,
    extensions: editorExtensions as any[],
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      // Defer JSON serialization and parent notification to the debounced handler
      // Zero React state updates on keypress = 0 re-renders of Toolbar/Editor
      debouncedExportRef.current?.(ed);
    },
  });

  useEffect(() => {
    localeActions.setLang('zh_CN');
  }, []);

  useEffect(() => {
    (window as any).editor = editor;
  }, [editor]);

  useEffect(() => {
    if (editor && !editor.isDestroyed && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  const isFirstSyncRef = useRef<boolean>(true);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    // Skip redundant setContent on initial mount because useEditor already loaded initialContent
    // This prevents TipTap's setContent from resetting selection and scrolling to the bottom on open
    if (isFirstSyncRef.current) {
      isFirstSyncRef.current = false;
      const raw = valueProp !== undefined ? valueProp : initialContent;
      if (raw !== undefined) {
        const parsed = parseContent(raw);
        lastEmittedValueRef.current = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
      }
      return;
    }

    const targetContent = valueProp !== undefined ? valueProp : initialContent;
    if (targetContent === undefined) return;

    // Fast-path: if the content coming from parent is what we just exported, ignore it
    if (lastEmittedValueRef.current && targetContent === lastEmittedValueRef.current) {
      return;
    }

    const parsed = parseContent(targetContent);
    const currentJSON = JSON.stringify(editor.getJSON());
    const newJSON = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    if (currentJSON !== newJSON) {
      editor.commands.setContent(parsed);
      lastEmittedValueRef.current = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    }
  }, [editor, valueProp, initialContent]);

  const handleSelectTemplate = (template: Template) => {
    if (!editor || editor.isDestroyed) return;
    const parsed = parseContent(template.content);
    editor.commands.setContent(parsed);
    const jsonStr = JSON.stringify(editor.getJSON());
    lastEmittedValueRef.current = jsonStr;
    onChange?.(jsonStr);
    setIsTemplateModalOpen(false);
  };

  if (!editor) {
    return null;
  }

  return (
    <>
      {showHeader && (
        <div className="border-b border-border shadow-md">
          <div className="w-full max-w-[1200px] p-4 mx-[auto] my-0">
            <Header />
          </div>
        </div>
      )}

      <div className={`w-full h-full flex flex-col min-h-0 relative ${className}`}>
        <RichTextProvider editor={editor as any}>
          <div className="overflow-hidden rounded-[0.5rem] bg-[var(--surface-1,#fafbfc)] !border !border-border flex flex-col h-full flex-1 min-h-0 relative">
            <div className="flex w-full flex-col h-full flex-1 min-h-0 relative">
              {showToolbar && (
                <RichTextToolbar
                  onOpenTemplate={hasTemplateSupport ? () => setIsTemplateModalOpen(true) : undefined}
                />
              )}

              <EditorContent editor={editor} className="flex-1 overflow-y-auto min-h-0" />

              <RichTextOverlayBubbles />
            </div>
          </div>
        </RichTextProvider>

        {hasTemplateSupport && isTemplateModalOpen && (
          <TemplateModal
            templates={templates}
            onSelect={handleSelectTemplate}
            onClose={() => setIsTemplateModalOpen(false)}
            onEdit={(id, name, templateContent) => updateTemplate(id, { name, content: templateContent })}
            onDelete={(id) => deleteTemplate(id)}
          />
        )}
      </div>
    </>
  );
}

export default Editor;

