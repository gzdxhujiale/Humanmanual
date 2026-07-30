export interface Template {
  id: string;
  name: string;
  content: string;
}

export const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 'tpl-1',
    name: '会议纪要',
    content: JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '主题：', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph', content: [{ type: 'text', text: '时间：', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph', content: [{ type: 'text', text: '与会人：', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: '会议目标：', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: '预期成果与关键节点：', marks: [{ type: 'bold' }] }] }
      ]
    })
  },
  {
    id: 'tpl-2',
    name: '阅读笔记',
    content: JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '书名：', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph', content: [{ type: 'text', text: '作者：', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: '灵感摘要：', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: '读后感悟：', marks: [{ type: 'bold' }] }] }
      ]
    })
  },
  {
    id: 'tpl-3',
    name: '每周工作总结',
    content: JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '本周工作目标及完成度：', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: '本周最有成就感的事情：', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: '本周遇到的工作上的阻碍：', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: '总结与反思：', marks: [{ type: 'bold' }] }] }
      ]
    })
  }
];

export function getTemplatePreviewText(content: string): string {
  if (!content) return '';
  const trimmed = content.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const json = JSON.parse(trimmed);
      const extractText = (node: any): string => {
        if (!node) return '';
        if (node.text) return node.text;
        if (Array.isArray(node.content)) {
          return node.content.map(extractText).join(' ');
        }
        return '';
      };
      return extractText(json).trim();
    } catch {
      return content.replace(/<[^>]+>/g, '');
    }
  }
  return content.replace(/<[^>]+>/g, '');
}

