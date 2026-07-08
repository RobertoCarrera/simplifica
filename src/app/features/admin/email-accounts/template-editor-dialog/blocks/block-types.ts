/**
 * Client-side mirror of the `Block` discriminated union from
 * `supabase/functions/_shared/email-templates.ts` (PR1-block-editor).
 *
 * Why mirror? The supabase functions live outside the Angular TS program
 * (`tsconfig.json` excludes `supabase/`), so Angular code can't import
 * the Edge-side type. The shapes MUST stay in sync — the snapshot test
 * `supabase/tests/snapshot_email_render.sql` is the cross-boundary
 * safety net that fails if SQL ≡ TS drift.
 *
 * Type-safety note: this is the SERIALIZED shape (what gets written to
 * `custom_blocks` JSONB and to `Block[]` form values). The in-memory
 * Reactive Forms `FormGroup` is typed more loosely — see BlockEditorComponent
 * §3 in design id 1946 for the rationale.
 */

export type BlockType = 'logo' | 'heading' | 'paragraph' | 'button';

export interface LogoProps {
  src: string;
  alt?: string;
  max_height?: number;
  max_width?: number;
}

export interface HeadingProps {
  text: string;
  level?: 1 | 2 | 3;
  color?: string;
  align?: 'left' | 'center' | 'right';
  font_size?: number;
}

export interface ParagraphProps {
  text: string;
  align?: 'left' | 'center' | 'right' | 'justify';
  color?: string;
  font_size?: number;
  italic?: boolean;
}

export interface ButtonProps {
  text?: string;
  url: string;
  background_color?: string;
  text_color?: string;
  padding?: number;
  border_radius?: number;
  align?: 'left' | 'center' | 'right';
}

interface BaseBlock<TType extends BlockType, TProps> {
  id: string;
  type: TType;
  version: 1;
  props: TProps;
}

export type LogoBlock = BaseBlock<'logo', LogoProps>;
export type HeadingBlock = BaseBlock<'heading', HeadingProps>;
export type ParagraphBlock = BaseBlock<'paragraph', ParagraphProps>;
export type ButtonBlock = BaseBlock<'button', ButtonProps>;
export type Block = LogoBlock | HeadingBlock | ParagraphBlock | ButtonBlock;

/** Default values used by the per-type factory in BlockEditorComponent. */
export const HEADING_DEFAULTS = {
  level: 1 as 1 | 2 | 3,
  text: '',
  color: '#111827',
  align: 'center' as 'left' | 'center' | 'right',
  font_size: 28, // h1 default; factories can override per level
} as const;

export const PARAGRAPH_DEFAULTS = {
  text: '',
  align: 'left' as 'left' | 'center' | 'right' | 'justify',
  color: '#374151',
  font_size: 16,
  italic: false,
} as const;

export const BUTTON_DEFAULTS = {
  text: 'Click aquí',
  url: '',
  background_color: '#4f46e5',
  text_color: '#FFFFFF',
  padding: 12,
  border_radius: 6,
  align: 'center' as 'left' | 'center' | 'right',
} as const;

export const LOGO_DEFAULTS = {
  alt: '',
  max_height: 80,
  max_width: 200,
} as const;