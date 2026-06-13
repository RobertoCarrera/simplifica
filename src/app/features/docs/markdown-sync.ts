/**
 * HTML <-> Markdown sync for the docs admin editor.
 *
 * - markdownToTiptapHtml(md) renders a Markdown string to a Tiptap-friendly
 *   HTML fragment. We reuse the `marked` library (already a project dep) and
 *   then walk the resulting tree to keep only the tags Tiptap actually
 *   understands.
 *
 * - tiptapHtmlToMarkdown(html) is the inverse. It uses the browser's
 *   DOMParser to walk the tree and emit a small Markdown subset.
 *   Unrecognised tags are stripped (their text content is preserved).
 *
 * The supported node set is intentionally narrow — it matches the nodes the
 * existing seed articles use (see `20260611130001_docs_seed_articles.sql`
 * and `20260611130002_docs_seed_analytics_admin.sql`): headings 1-3, paragraphs,
 * unordered and ordered lists, list items, blockquote, pre/code, strong, em,
 * code, a, img, br.
 *
 * Both functions are pure (no Angular DI), so they are easy to unit-test.
 * The editor component is browser-only, so we can rely on DOMParser and
 * marked.parse synchronously.
 */
import { Marked } from 'marked';

const marked = new Marked({
  gfm: true,
  breaks: false,
});

/**
 * Tiptap HTML → Markdown subset.
 */
export function tiptapHtmlToMarkdown(html: string): string {
  if (!html) return '';
  // Tiptap wraps the content in a top-level block but never in a
  // body. We parse against a synthetic document so the fragment still works.
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';
  const blocks: string[] = [];
  for (const child of Array.from(root.children)) {
    const block = renderBlock(child as HTMLElement);
    if (block !== null) blocks.push(block);
  }
  return blocks.join('\n\n');
}

function renderBlock(el: HTMLElement): string | null {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'h1': return `# ${textOf(el)}`;
    case 'h2': return `## ${textOf(el)}`;
    case 'h3': return `### ${textOf(el)}`;
    case 'p': {
      const t = renderInline(el).trim();
      return t === '' ? null : t;
    }
    case 'ul': {
      const items: string[] = [];
      for (const li of Array.from(el.children)) {
        if (li.tagName.toLowerCase() !== 'li') continue;
        items.push(`- ${renderInline(li as HTMLElement).trim()}`);
      }
      return items.join('\n');
    }
    case 'ol': {
      const items: string[] = [];
      for (const li of Array.from(el.children)) {
        if (li.tagName.toLowerCase() !== 'li') continue;
        items.push(`1. ${renderInline(li as HTMLElement).trim()}`);
      }
      return items.join('\n');
    }
    case 'blockquote': {
      const inner = renderBlock(el.firstElementChild as HTMLElement) ?? textOf(el);
      return `> ${inner}`;
    }
    case 'pre': {
      const code = el.querySelector('code');
      const text = code ? textOf(code) : textOf(el);
      return `\`\`\`\n${text}\n\`\`\``;
    }
    default: {
      // Unknown block: drop the tag, keep the text on its own line.
      const t = textOf(el).trim();
      return t === '' ? null : t;
    }
  }
}

function renderInline(el: HTMLElement): string {
  let out = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const child = node as HTMLElement;
    const tag = child.tagName.toLowerCase();
    switch (tag) {
      case 'strong':
      case 'b':
        out += `**${renderInline(child)}**`;
        break;
      case 'em':
      case 'i':
        out += `*${renderInline(child)}*`;
        break;
      case 'code':
        out += `\`${textOf(child)}\``;
        break;
      case 'a': {
        const href = child.getAttribute('href') ?? '';
        out += `[${renderInline(child)}](${href})`;
        break;
      }
      case 'img': {
        const src = child.getAttribute('src') ?? '';
        const alt = child.getAttribute('alt') ?? '';
        out += `![${alt}](${src})`;
        break;
      }
      case 'br':
        out += '\n';
        break;
      default:
        out += renderInline(child);
        break;
    }
  }
  return out;
}

function textOf(el: HTMLElement): string {
  return (el.textContent ?? '').replace(/\u00a0/g, ' ');
}

/**
 * Markdown → Tiptap HTML.
 *
 * We use marked to do the heavy lifting, then run a sanitisation pass to
 * keep only the tags our Tiptap schema supports. The output is a fragment
 * (no body/html) suitable for loading into the editor.
 */
export function markdownToTiptapHtml(md: string): string {
  if (!md) return '';
  const raw = marked.parse(md, { async: false }) as string;
  const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';
  const out: string[] = [];
  for (const child of Array.from(root.children)) {
    const block = renderBlockToHtml(child as HTMLElement);
    if (block !== null) out.push(block);
  }
  return out.join('');
}

function renderBlockToHtml(el: HTMLElement): string | null {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'h1': return `<h1>${renderInlineToHtml(el)}</h1>`;
    case 'h2': return `<h2>${renderInlineToHtml(el)}</h2>`;
    case 'h3': return `<h3>${renderInlineToHtml(el)}</h3>`;
    case 'p': {
      const t = renderInlineToHtml(el).trim();
      return t === '' ? null : `<p>${t}</p>`;
    }
    case 'ul': {
      const items: string[] = [];
      for (const li of Array.from(el.children)) {
        if (li.tagName.toLowerCase() !== 'li') continue;
        items.push(`<li>${renderInlineToHtml(li as HTMLElement)}</li>`);
      }
      return `<ul>${items.join('')}</ul>`;
    }
    case 'ol': {
      const items: string[] = [];
      for (const li of Array.from(el.children)) {
        if (li.tagName.toLowerCase() !== 'li') continue;
        items.push(`<li>${renderInlineToHtml(li as HTMLElement)}</li>`);
      }
      return `<ol>${items.join('')}</ol>`;
    }
    case 'blockquote': return `<blockquote>${renderBlockToHtml(el.firstElementChild as HTMLElement) ?? `<p>${renderInlineToHtml(el)}</p>`}</blockquote>`;
    case 'pre': {
      const code = el.querySelector('code');
      const inner = code ? `<code>${textOf(code)}</code>` : textOf(el);
      return `<pre>${inner}</pre>`;
    }
    default: {
      const t = textOf(el).trim();
      return t === '' ? null : `<p>${t}</p>`;
    }
  }
}

function renderInlineToHtml(el: HTMLElement): string {
  let out = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += escapeHtml(node.textContent ?? '');
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const child = node as HTMLElement;
    const tag = child.tagName.toLowerCase();
    switch (tag) {
      case 'strong':
      case 'b':
        out += `<strong>${renderInlineToHtml(child)}</strong>`;
        break;
      case 'em':
      case 'i':
        out += `<em>${renderInlineToHtml(child)}</em>`;
        break;
      case 'code':
        out += `<code>${escapeHtml(textOf(child))}</code>`;
        break;
      case 'a': {
        const href = child.getAttribute('href') ?? '';
        out += `<a href="${escapeAttr(href)}">${renderInlineToHtml(child)}</a>`;
        break;
      }
      case 'img': {
        const src = child.getAttribute('src') ?? '';
        const alt = child.getAttribute('alt') ?? '';
        out += `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" />`;
        break;
      }
      case 'br':
        out += '<br />';
        break;
      default:
        out += renderInlineToHtml(child);
        break;
    }
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}
