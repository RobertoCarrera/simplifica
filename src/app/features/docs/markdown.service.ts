import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Shape of a single heading extracted from a rendered article.
 * Used by the article component to drive the in-page ToC built in
 * Phase 4 (`<app-docs-article-shell>` reads `headings` from the
 * service via a query/host binding).
 */
export interface MarkdownHeading {
  id: string;
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * Result of rendering a markdown string. The component binds
 * `html` to `[innerHTML]` and `headings` to the ToC builder.
 * `htmlString` is the raw sanitised HTML (same content as `html`
 * but as a plain string) — exposed for tests and any caller that
 * needs to inspect / diff the output without going through the
 * Angular DomSanitizer `SafeValue` interface.
 */
export interface MarkdownRenderResult {
  html: SafeHtml;
  htmlString: string;
  headings: MarkdownHeading[];
}

/**
 * Strict DOMPurify allowlist. Keeps the markdown subset we care
 * about (headings, paragraphs, lists, code, tables, images, links,
 * callout wrappers) and explicitly FORBIDs everything dangerous
 * (script, iframe, event handlers, javascript: URLs).
 *
 * The list is intentionally narrower than the project's existing
 * `safeHtml` pipe — we don't need forms, inputs, or inline style
 * attributes here, and `target` / `rel` are force-rewritten below
 * for external links.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PURIFY_CONFIG: any = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'strong', 'em', 'b', 'i', 'del',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span', 'input',
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'alt', 'src', 'class', 'id',
    'target', 'rel', 'type', 'checked', 'disabled',
    'loading',
  ],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'style', 'link'],
  FORBID_ATTR: [
    'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur',
    'onchange', 'onsubmit', 'onkeydown', 'onkeyup', 'onkeypress',
  ],
};

/**
 * GitHub-like callout types we recognise in the source markdown.
 * Each maps to a CSS modifier class that picks the right colour
 * scheme. Unknown types fall back to `info`.
 */
const CALLOUT_TYPES = new Set(['info', 'warn', 'warning', 'tip', 'success', 'danger', 'note']);
const CALLOUT_TYPE_NORMALISED: Record<string, string> = {
  warning: 'warn',
  success: 'tip',
  note: 'info',
};

/**
 * `<MarkdownService>` — the trust boundary for `/docs` article
 * content. Renders `content_markdown` to sanitised HTML and
 * extracts the heading list used by the ToC.
 *
 * Pipeline:
 *  1. Pre-process GitHub-like callouts (`> [!INFO] ...`) into
 *     `<blockquote class="callout callout--info">…</blockquote>`
 *     so DOMPurify can whitelist them by tag without a custom hook.
 *  2. `marked` parses the (now-shaped) markdown to HTML.
 *  3. Rewrite external `<a>` links to open in a new tab with
 *     `rel="noopener noreferrer"`, and add `loading="lazy"` to
 *     images that are missing it.
 *  4. Slug + assign `id` to every H2/H3/H4 so the ToC anchor
 *     links work and we collect them for the sidebar.
 *  5. `DOMPurify.sanitize` with the strict allowlist above.
 *  6. Hand the result to Angular's `DomSanitizer.bypassSecurityTrustHtml`.
 *
 * IMPORTANT: this is the only place that ever calls
 * `bypassSecurityTrustHtml` for article content. Anything that
 * bypasses sanitisation is an XSS bug.
 *
 * SSR safety: `DOMPurify` and `marked` are pure JS and run fine
 * on the server, but DOMPurify defaults to a DOM-only config
 * when no `window` is present. The constructor pins the
 * `DOMPurify` global explicitly so the server bundle resolves
 * consistently; if the host app ever turns on SSR, the marked
 * call stays valid (it does not require `window`).
 */
@Injectable({ providedIn: 'root' })
export class MarkdownService {
  private sanitizer = inject(DomSanitizer);
  private platformId = inject(PLATFORM_ID);
  private marked: Marked;

  constructor() {
    // One Marked instance per service; render() is the only consumer.
    this.marked = new Marked({
      gfm: true,
      breaks: false,
      async: false,
      pedantic: false,
    });
  }

  /**
   * Render markdown to a sanitised SafeHtml bundle. `md` is the
   * raw `content_markdown` from the database; never trust it.
   */
  render(md: string | null | undefined): MarkdownRenderResult {
    const empty: MarkdownRenderResult = { html: '', htmlString: '', headings: [] };
    if (!md || typeof md !== 'string') {
      return empty;
    }

    // 0. Extract Pandoc-style `{#id}` suffix from headings BEFORE
    //    marked sees them. Standard marked doesn't honour `{#id}`,
    //    so we strip it from the text and stash the id in a parallel
    //    array keyed by the heading's text. The markdown pipe and
    //    the in-page ToC rely on these explicit ids for stable
    //    anchor URLs even when the slugifier would normalise
    //    differently.
    const { md: stripped, explicitIds } = this.extractExplicitIds(md);

    // 1. Callouts: `> [!INFO] Texto…` (single line or multi-line block).
    const withCallouts = this.preprocessCallouts(stripped);

    // 2. Marked parse.
    const rawHtml = this.marked.parse(withCallouts, { async: false }) as string;

    // 3. External-link + image attribute rewrite (post-marked, pre-sanitise).
    const shaped = this.rewriteAnchorsAndImages(rawHtml);

    // 4. Slugify headings + collect ToC entries.
    const { html: withIds, headings } = this.assignHeadingIds(shaped, explicitIds);

    // 5. DOMPurify. On the server we skip (it needs a window); the
    //    client always re-renders so the page never shows raw HTML.
    if (!isPlatformBrowser(this.platformId)) {
      return { ...empty, headings };
    }
    const clean = DOMPurify.sanitize(withIds, PURIFY_CONFIG) as unknown as string;

    // 6. Trust the sanitised HTML.
    return {
      html: this.sanitizer.bypassSecurityTrustHtml(clean),
      htmlString: clean,
      headings,
    };
  }

  /**
   * Convenience: render and return only the HTML. Most call sites
   * ignore the heading list; the article view uses both.
   */
  renderHtml(md: string | null | undefined): SafeHtml {
    return this.render(md).html;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Transform `> [!INFO] foo` (and multi-line continuations) into
   * `<blockquote class="callout callout--info">foo</blockquote>`
   * before marked sees the source. Marked would otherwise pass the
   * `> [!INFO]` literal through as text inside a regular blockquote.
   *
   * The transform is intentionally narrow: we only act on lines
   * that start with `> [!TYPE]` where TYPE is a known callout.
   * Everything else is left alone for marked to handle.
   */
  private preprocessCallouts(md: string): string {
    const lines = md.split('\n');
    const out: string[] = [];
    let buffer: { type: string; lines: string[] } | null = null;

    const flush = () => {
      if (!buffer) return;
      const inner = buffer.lines.join('\n').trim();
      out.push(`<blockquote class="callout callout--${buffer.type}">`);
      out.push('');
      out.push(inner);
      out.push('');
      out.push('</blockquote>');
      out.push('');
      buffer = null;
    };

    const CALLOUT_RE = /^>\s*\[!([A-Za-z]+)\]\s*(.*)$/;
    const CONTINUATION_RE = /^>\s?(.*)$/;

    for (const line of lines) {
      const calloutMatch = line.match(CALLOUT_RE);
      if (calloutMatch) {
        // Closing any previous callout before starting a new one.
        flush();
        const rawType = calloutMatch[1].toLowerCase();
        if (!CALLOUT_TYPES.has(rawType)) {
          // Unknown callout — render as regular blockquote.
          out.push(`> ${calloutMatch[2] ?? ''}`);
          continue;
        }
        const type = CALLOUT_TYPE_NORMALISED[rawType] ?? rawType;
        buffer = { type, lines: [calloutMatch[2] ?? ''] };
        continue;
      }
      const cont = line.match(CONTINUATION_RE);
      if (buffer && cont) {
        // Continuation of the callout (lines starting with `>`).
        buffer.lines.push(cont[1] ?? '');
        continue;
      }
      // Non-callout line: flush any pending callout first.
      flush();
      out.push(line);
    }
    flush();

    return out.join('\n');
  }

  /**
   * After marked runs, walk the HTML string once and:
   *  - tag external `<a>` links with `target="_blank" rel="noopener noreferrer"`
   *    (so JS injection via `target` is impossible: we set the value
   *    ourselves and let DOMPurify keep it on the allowlist).
   *  - ensure every `<img>` has `loading="lazy"`.
   *
   * The walk is regex-based because the input is well-formed HTML
   * (we control it via marked + DOMPurify downstream) and a full
   * DOMParser round-trip is unnecessary here.
   */
  private rewriteAnchorsAndImages(html: string): string {
    let out = html;

    // Anchors: keep href; add target+rel on external (http/https/mailto).
    out = out.replace(
      /<a\b([^>]*?)href=(["'])([^"']+)\2([^>]*)>/gi,
      (full, pre: string, q: string, href: string, post: string) => {
        const isExternal = /^(https?:|mailto:)/i.test(href);
        if (!isExternal) {
          return full;
        }
        // Strip any author-supplied target/rel and inject our own.
        const cleanedPre = pre.replace(/\s+(target|rel)=(["'])[^"']*\2/gi, '');
        const cleanedPost = post.replace(/\s+(target|rel)=(["'])[^"']*\2/gi, '');
        return `<a${cleanedPre} href=${q}${href}${q}${cleanedPost} target="_blank" rel="noopener noreferrer">`;
      },
    );

    // Images: ensure loading="lazy".
    out = out.replace(
      /<img\b([^>]*?)>/gi,
      (full, attrs: string) => {
        if (/\bloading\s*=/i.test(attrs)) {
          return full;
        }
        return `<img${attrs} loading="lazy">`;
      },
    );

    return out;
  }

  /**
   * Walk H2/H3/H4 tags, assign a slug id (if missing or duplicate),
   * and collect them for the ToC. H1 is skipped because the
   * article view renders the title separately and we don't want a
   * second H1 in the document outline.
   *
   * `explicitIds` is a parallel array of author-supplied ids (from
   * the `## Heading {#custom-id}` Pandoc syntax) indexed by the
   * order they appeared in the source markdown. We pop them off in
   * the same order the rendered headings arrive, so authors can pin
   * stable ids for cross-document links even when the slugifier
   * would normalise differently.
   */
  private assignHeadingIds(
    html: string,
    explicitIds: string[] = [],
  ): { html: string; headings: MarkdownHeading[] } {
    const headings: MarkdownHeading[] = [];
    const used = new Set<string>();
    let counter = 0;
    let explicitIdx = 0;

    const replaced = html.replace(
      /<(h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/gi,
      (_full, tag: string, attrs: string, inner: string) => {
        const level = Number(tag[1]) as 1 | 2 | 3 | 4 | 5 | 6;
        const text = this.stripTags(inner).trim();
        if (!text) {
          return _full;
        }
        if (level === 1) {
          // Skip the document H1 — title is rendered by the shell.
          return `<h1${attrs}>${inner}</h1>`;
        }
        // Reuse author-supplied id when it's safe (alphanumerics + dash).
        // Priority: 1) Pandoc `{#id}` extracted upstream, 2) id attribute
        // marked wrote, 3) our slugifier.
        const idMatch = attrs.match(/\bid\s*=\s*(["'])([^"']+)\1/i);
        let id = idMatch ? idMatch[2] : '';
        if (!id) {
          const explicit = explicitIds[explicitIdx++];
          if (explicit && /^[A-Za-z0-9_-]+$/.test(explicit)) {
            id = explicit;
          }
        }
        if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
          id = this.slugify(text);
        }
        // De-dup against existing ids in the document.
        let candidate = id;
        while (used.has(candidate) || !candidate) {
          counter += 1;
          candidate = `${id}-${counter}`;
        }
        used.add(candidate);
        // Always emit `id="..."` on the heading. If the source
        // already had an id, rewrite it; otherwise append ours.
        const newAttrs = /\bid\s*=\s*["']/i.test(attrs)
          ? attrs.replace(/\bid\s*=\s*(["'])[^"']*\1/i, `id="${candidate}"`)
          : `${attrs} id="${candidate}"`;
        headings.push({ id: candidate, text, level });
        return `<${tag}${newAttrs}>${inner}</${tag}>`;
      },
    );

    return { html: replaced, headings };
  }

  /**
   * Extract Pandoc-style `{#id}` suffixes from heading lines. Returns
   * the cleaned markdown (with the `{#id}` stripped) and a list of
   * explicit ids in the order they appeared (one entry per heading
   * that had an `{#id}` suffix). The regex is intentionally tight:
   * the `{#…}` must be at the end of a heading line and the id must
   * be slug-safe; anything else is left untouched so the slugifier
   * can take a second pass.
   */
  private extractExplicitIds(md: string): { md: string; explicitIds: string[] } {
    const explicitIds: string[] = [];
    const stripped = md.replace(
      /^(#{1,6})\s+(.+?)\s*\{#([A-Za-z0-9_-]+)\}\s*$/gm,
      (_full, hashes: string, text: string, id: string) => {
        explicitIds.push(id);
        return `${hashes} ${text}`;
      },
    );
    return { md: stripped, explicitIds };
  }

  private stripTags(s: string): string {
    return s.replace(/<[^>]+>/g, '');
  }

  private slugify(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'sec';
  }
}
