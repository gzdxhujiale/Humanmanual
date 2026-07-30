import { marked } from 'marked';

/**
 * Convert Markdown string to HTML or JSON structure using marked.
 */
export function convertMarkdownToTipTapJson(markdownStr: string): string {
  if (!markdownStr) return '';
  const trimmed = markdownStr.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fallback
    }
  }

  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return markdownStr;
  }

  try {
    const htmlResult = marked.parse(markdownStr, { gfm: true, breaks: true });
    return typeof htmlResult === 'string' ? htmlResult : markdownStr;
  } catch (e) {
    console.warn('Failed to parse Markdown using marked:', e);
    return markdownStr;
  }
}

/**
 * Convert TipTap JSON/HTML back to Markdown string.
 */
export function convertTipTapJsonToMarkdown(jsonStr: string): string {
  if (!jsonStr) return '';
  const trimmed = jsonStr.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return jsonStr;
  }

  try {
    const json = JSON.parse(trimmed);
    return renderNodeToMarkdown(json).trim();
  } catch {
    return jsonStr;
  }
}

function renderNodeToMarkdown(node: any): string {
  if (!node) return '';

  if (node.type === 'doc') {
    if (Array.isArray(node.content)) {
      return node.content.map(renderNodeToMarkdown).join('\n\n');
    }
    return '';
  }

  if (node.type === 'text') {
    let text = node.text || '';
    if (Array.isArray(node.marks)) {
      node.marks.forEach((mark: any) => {
        if (mark.type === 'bold') text = `**${text}**`;
        if (mark.type === 'italic') text = `*${text}*`;
        if (mark.type === 'strike') text = `~~${text}~~`;
        if (mark.type === 'code') text = `\`${text}\``;
        if (mark.type === 'link' && mark.attrs?.href) text = `[${text}](${mark.attrs.href})`;
      });
    }
    return text;
  }

  const childText = Array.isArray(node.content)
    ? node.content.map(renderNodeToMarkdown).join('')
    : '';

  switch (node.type) {
    case 'heading': {
      const level = node.attrs?.level || 1;
      const prefix = '#'.repeat(level);
      return `${prefix} ${childText}`;
    }
    case 'paragraph':
      return childText;
    case 'horizontalRule':
      return '---';
    case 'blockquote':
      return `> ${childText}`;
    case 'bulletList':
    case 'orderedList':
      return Array.isArray(node.content)
        ? node.content.map((item: any) => renderNodeToMarkdown(item)).join('\n')
        : childText;
    case 'listItem':
      return `- ${childText}`;
    case 'taskList':
      return Array.isArray(node.content)
        ? node.content.map((item: any) => renderNodeToMarkdown(item)).join('\n')
        : childText;
    case 'taskItem': {
      const checked = node.attrs?.checked ? 'x' : ' ';
      return `- [${checked}] ${childText}`;
    }
    case 'codeBlock': {
      const lang = node.attrs?.language || '';
      return `\`\`\`${lang}\n${childText}\n\`\`\``;
    }
    default:
      return childText;
  }
}
