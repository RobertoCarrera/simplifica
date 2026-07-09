/**
 * Block parser (PR2b email-block-editor) — single source of truth for
 * the regex-based HTML → Block[] parser used by both:
 *   1. auto-seed (BlockEditorComponent.ngOnInit, when
 *      custom_blocks IS NULL AND custom_body_template IS NULL)
 *   2. auto-migrate (BlockEditorComponent.ngOnInit, when
 *      custom_blocks IS NULL AND custom_body_template IS NOT NULL)
 *
 * Why extracted from BlockEditorComponent (was a top-level export there):
 * auto-migrate (PR2b) lives in a separate file and needs the SAME parser
 * — duplicating the logic would be a maintenance hazard. The spec id 1945
 * §5 explicitly requires both paths share the parser.
 *
 * The parser is intentionally pure: it takes a raw HTML string and
 * returns a Block[]. No I/O, no RPC, no logging. Errors throw — callers
 * wrap in try/catch and fall back to a single ParagraphBlock per spec
 * §5 (auto-seed failure) or §9 (50000-char fallback for auto-migrate).
 */
import { Block } from './block-types';

/**
 * Parse a default-template (or legacy saved) HTML string into a Block[].
 *
 * Heuristics:
 *   - First <h1> → HeadingBlock
 *   - First <img> matching ^https?:// → LogoBlock
 *   - First <a style="background:…"> → ButtonBlock (with href)
 *   - Remaining stripped text → ParagraphBlock
 *
 * Failure modes (per spec id 1945 §5):
 *   - No recognized patterns → return [single ParagraphBlock with raw inner text]
 *   - Empty input → return [single empty ParagraphBlock]
 *   - Malformed HTML → catch and return single ParagraphBlock fallback
 */
export function defaultHtmlToBlocks(
  html: string,
  primaryColor: string | null,
): Block[] {
  if (!html) return [makeParagraphBlock('')];
  const blocks: Block[] = [];

  // First <h1> → HeadingBlock.
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    blocks.push({
      id: crypto.randomUUID(),
      type: 'heading',
      version: 1,
      props: {
        text: stripTags(h1Match[1]).trim(),
        level: 1,
        color: primaryColor ?? '#111827',
        align: 'center',
        font_size: 28,
      },
    });
  }

  // First <img> in <table> → LogoBlock (PR2b will render editable).
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  if (imgMatch && /^https?:\/\//.test(imgMatch[1])) {
    blocks.push({
      id: crypto.randomUUID(),
      type: 'logo',
      version: 1,
      props: {
        src: imgMatch[1],
        alt: '',
        max_height: 80,
        max_width: 200,
      },
    });
  }

  // First <a> with background: → ButtonBlock.
  const btnMatch = html.match(
    /<a[^>]+style=["'][^"']*background:[^"']*["'][^>]*>([^<]+)<\/a>/i,
  );
  if (btnMatch) {
    const urlMatch = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/i);
    blocks.push({
      id: crypto.randomUUID(),
      type: 'button',
      version: 1,
      props: {
        text: stripTags(btnMatch[1]).trim(),
        url: urlMatch ? urlMatch[1] : '',
        background_color: primaryColor ?? '#4f46e5',
        text_color: '#ffffff',
        padding: 12,
        border_radius: 6,
        align: 'center',
      },
    });
  }

  // Remaining → ParagraphBlock with the leftover inner text.
  const remaining = stripTags(
    html
      .replace(/<h1[\s\S]*?<\/h1>/gi, '')
      .replace(/<img[^>]+>/gi, '')
      .replace(/<a[^>]+>[\s\S]*?<\/a>/gi, ''),
  ).trim();
  if (remaining) {
    blocks.push({
      id: crypto.randomUUID(),
      type: 'paragraph',
      version: 1,
      props: {
        text: remaining.slice(0, 5000),
        align: 'left',
        color: '#374151',
        font_size: 16,
        italic: false,
      },
    });
  }

  // Fallback: never leave the canvas blank (spec §5 parse failure).
  if (blocks.length === 0) {
    return [makeParagraphBlock(stripTags(html).slice(0, 5000))];
  }
  return blocks;
}

/** Single empty ParagraphBlock — used as the never-blank fallback. */
export function makeParagraphBlock(text: string): Block {
  return {
    id: crypto.randomUUID(),
    type: 'paragraph',
    version: 1,
    props: {
      text,
      align: 'left',
      color: '#374151',
      font_size: 16,
      italic: false,
    },
  };
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}
