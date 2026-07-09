/**
 * BlockEditorComponent (PR2a email-block-editor)
 *
 * Root of the Divi-style block editor. Replaces the TipTap + 4-field UI
 * inside TemplateEditorDialogComponent when the `emailBlockEditorEnabled`
 * feature flag is on. Ships behind the flag (OFF in prod by default per
 * design id 1946 §7.1) so the legacy path stays the production default
 * until PR2b adds the Logo/Paragraph/Button typed editors.
 *
 * Architecture mirrors design id 1946 §2.1 + §3:
 *   - FormArray<BlockFormGroup> for the block list
 *   - Per-type factory methods (insertHeadingBlock / insertParagraphBlock /
 *     insertButtonBlock / insertLogoBlock) — each builds a concrete set of
 *     FormControls in `props` per spec §3.
 *   - insertBlock(type, atIndex) dispatcher (switch on type)
 *   - Helpers: removeBlock(index, confirm), duplicateBlock(index),
 *     reorderBlocks(from, to).
 *   - Auto-seed on first open of un-customized setting (custom_blocks
 *     IS NULL AND custom_body_template IS NULL): fetch default HTML,
 *     parse via defaultHtmlToBlocks, populate with { emitEvent: false }.
 *   - Pipeline: blocksForm.valueChanges → debounce(250) → distinct(JSON.stringify)
 *     → switchMap → previewTemplate(..., { custom_blocks }).
 *
 * Error handling (per design §2.1):
 *   - err.code === '42501' → previewForbidden.set(true) (orange banner)
 *   - err.code === 'P0001' → previewError.set(parsed from err.details)
 *   - else → previewError.set(true)
 *
 * Save payload (flag-aware per design §2.0):
 *   - emits { subject, header, blocks: blocksForm.value, button_text: '' }
 *     — parent dialog handles persistence via updateCustomBlocks.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { debounceTime, distinctUntilChanged, filter, switchMap } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import {
  BlockFormGroup,
  BlockListComponent,
} from './block-list.component';
import { BlockEditorHeaderComponent } from './block-editor-header.component';
import { AddBlockDropdownComponent } from './add-block-dropdown.component';
import {
  Block,
  BlockType,
  HEADING_DEFAULTS,
  LOGO_DEFAULTS,
  PARAGRAPH_DEFAULTS,
  BUTTON_DEFAULTS,
} from './block-types';
import { CompanyEmailSetting, EmailType } from '../../../../models/company-email.models';
import {
  CompanyEmailService,
  ForbiddenPreviewError,
} from '../../../../services/company-email.service';
import { SafeHtmlPipe } from '../../../../core/pipes/safe-html.pipe';
import {
  TemplateEditorDialogData,
} from '../template-editor-dialog.component';

/** Save payload emitted from the block editor to its parent dialog. */
export interface BlockEditorSavePayload {
  subject: string;
  header: string;
  blocks: Block[];
  button_text: string;
}

/** Per-block validation error surfaced by the server (P0001). */
export interface BlockValidationError {
  blockIndex: number;
  blockType: string;
  prop: string;
}

@Component({
  selector: 'app-block-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    SafeHtmlPipe,
    BlockListComponent,
    BlockEditorHeaderComponent,
    AddBlockDropdownComponent,
  ],
  template: `
    <div class="be-root" data-testid="block-editor">
      <div class="be-toolbar">
        <app-add-block-dropdown
          [hasLogoUrl]="hasLogoUrl()"
          (add)="onAddBlock($event)"
        ></app-add-block-dropdown>
      </div>

      <app-block-list
        [formArray]="blocksForm"
        [hasLogoUrl]="hasLogoUrl()"
        (edit)="onEditBlock($event)"
        (duplicate)="onDuplicateBlock($event)"
        (delete)="onDeleteBlock($event)"
      ></app-block-list>

      @if (expandedIndex() !== null) {
        <div class="be-expanded" data-testid="block-editor-expanded">
          <app-block-editor-header
            [formGroup]="expandedGroup()!"
            [primaryColor]="primaryColor()"
          ></app-block-editor-header>
        </div>
      }

      @if (previewForbidden()) {
        <p class="be-banner be-banner--warn" data-testid="block-preview-forbidden">
          No tienes permiso para previsualizar esta plantilla
        </p>
      } @else if (previewError() !== null) {
        <p class="be-banner be-banner--error" data-testid="block-preview-error">
          Bloque {{ previewError()!.blockIndex + 1 }} ({{ previewError()!.blockType }}):
          propiedad «{{ previewError()!.prop }}» inválida.
        </p>
      } @else if (previewLoading() && !previewHtml()) {
        <p class="be-loading" data-testid="block-preview-loading">
          Actualizando previsualización…
        </p>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .be-root { display: flex; flex-direction: column; gap: 12px; }
    .be-toolbar { display: flex; justify-content: flex-start; }
    .be-expanded {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 4px;
      background: #fff;
    }
    .be-banner {
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 13px;
      margin: 0;
    }
    .be-banner--warn { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
    .be-banner--error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
    .be-loading { color: #6b7280; font-size: 13px; padding: 4px 0; }
  `],
})
export class BlockEditorComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly companyEmail = inject(CompanyEmailService);
  private readonly destroyRef = inject(DestroyRef);

  // Inputs from the parent dialog.
  readonly data = input.required<TemplateEditorDialogData>();
  readonly setting = input<CompanyEmailSetting | null>(null);

  // Subject + cabecera are owned by the parent dialog (decision 1 in
  // spec id 1945). We mirror them here so the preview pipeline can fire.
  readonly subject = input<string>('');
  readonly header = input<string>('');

  // Logo URL availability drives the AddBlockDropdown disabled state.
  readonly hasLogoUrl = input<boolean>(false);
  readonly primaryColor = input<string | null>(null);

  // Save output — parent dialog persists to custom_blocks.
  readonly saved = output<BlockEditorSavePayload>();

  // Signals for template state.
  readonly previewHtml = signal<string>('');
  readonly previewLoading = signal<boolean>(false);
  readonly previewForbidden = signal<boolean>(false);
  readonly previewError = signal<BlockValidationError | null>(null);

  // Expansion state for inline editor.
  readonly expandedIndex = signal<number | null>(null);
  readonly expandedGroup = computed<BlockFormGroup | null>(() => {
    const idx = this.expandedIndex();
    if (idx === null || idx < 0 || idx >= this.blocksForm.controls.length) return null;
    return this.blocksForm.at(idx) as BlockFormGroup;
  });

  /** The FormArray — created empty; auto-seed populates on init. */
  readonly blocksForm: FormArray<BlockFormGroup> = this.fb.array<BlockFormGroup>([]);

  constructor() {
    this.wirePreviewPipeline();
    void this.runAutoSeed();
  }

  // ── Public actions ────────────────────────────────────────────────────

  /** Dispatcher from AddBlockDropdown → per-type factory. */
  onAddBlock(type: BlockType): void {
    this.insertBlock(type);
    // Auto-expand the newly added row so the user can edit immediately.
    this.expandedIndex.set(this.blocksForm.controls.length - 1);
  }

  onEditBlock(index: number): void {
    this.expandedIndex.set(this.expandedIndex() === index ? null : index);
  }

  onDuplicateBlock(index: number): void {
    this.duplicateBlock(index);
  }

  onDeleteBlock(index: number): void {
    this.removeBlock(index, false);
  }

  /** Save — caller wires to updateCustomBlocks. */
  save(): void {
    this.blocksForm.markAllAsTouched();
    this.saved.emit({
      subject: this.subject(),
      header: this.header(),
      blocks: this.blocksForm.value as unknown as Block[],
      button_text: '',
    });
  }

  // ── Per-type factories (§3 of design) ─────────────────────────────────

  private insertHeadingBlock(atIndex?: number): BlockFormGroup {
    const id = crypto.randomUUID();
    const props = this.fb.group<Record<string, AbstractControl<unknown>>>({
      level: this.fb.control<1 | 2 | 3>(HEADING_DEFAULTS.level, {
        nonNullable: true,
        validators: [Validators.required],
      }),
      text: this.fb.control(HEADING_DEFAULTS.text, {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(200)],
      }),
      color: this.fb.control(HEADING_DEFAULTS.color, {
        nonNullable: true,
        validators: [Validators.pattern(/^#[0-9A-Fa-f]{6}$/)],
      }),
      align: this.fb.control<'left' | 'center' | 'right'>(HEADING_DEFAULTS.align, {
        nonNullable: true,
      }),
      font_size: this.fb.control(HEADING_DEFAULTS.font_size, {
        nonNullable: true,
        validators: [Validators.min(12), Validators.max(72)],
      }),
    });
    const group = this.fb.group({
      id: this.fb.control(id, { validators: [Validators.required] }),
      type: this.fb.control<BlockType>('heading', { nonNullable: true }),
      version: this.fb.control<1>(1, { nonNullable: true }),
      props,
    });
    if (atIndex == null) this.blocksForm.push(group);
    else this.blocksForm.insert(atIndex, group);
    return group as unknown as BlockFormGroup;
  }

  private insertParagraphBlock(atIndex?: number): BlockFormGroup {
    const id = crypto.randomUUID();
    const props = this.fb.group<Record<string, AbstractControl<unknown>>>({
      text: this.fb.control(PARAGRAPH_DEFAULTS.text, {
        nonNullable: true,
        validators: [Validators.maxLength(5000)],
      }),
      align: this.fb.control<'left' | 'center' | 'right' | 'justify'>(
        PARAGRAPH_DEFAULTS.align,
        { nonNullable: true },
      ),
      color: this.fb.control(PARAGRAPH_DEFAULTS.color, {
        nonNullable: true,
        validators: [Validators.pattern(/^#[0-9A-Fa-f]{6}$/)],
      }),
      font_size: this.fb.control(PARAGRAPH_DEFAULTS.font_size, {
        nonNullable: true,
        validators: [Validators.min(12), Validators.max(32)],
      }),
      italic: this.fb.control(PARAGRAPH_DEFAULTS.italic, { nonNullable: true }),
    });
    const group = this.fb.group({
      id: this.fb.control(id, { validators: [Validators.required] }),
      type: this.fb.control<BlockType>('paragraph', { nonNullable: true }),
      version: this.fb.control<1>(1, { nonNullable: true }),
      props,
    });
    if (atIndex == null) this.blocksForm.push(group);
    else this.blocksForm.insert(atIndex, group);
    return group as unknown as BlockFormGroup;
  }

  private insertButtonBlock(atIndex?: number): BlockFormGroup {
    const id = crypto.randomUUID();
    const props = this.fb.group<Record<string, AbstractControl<unknown>>>({
      text: this.fb.control(BUTTON_DEFAULTS.text, {
        nonNullable: true,
        validators: [Validators.maxLength(100)],
      }),
      url: this.fb.control(BUTTON_DEFAULTS.url, {
        nonNullable: true,
        validators: [Validators.maxLength(2000)],
      }),
      background_color: this.fb.control(BUTTON_DEFAULTS.background_color, {
        nonNullable: true,
        validators: [Validators.pattern(/^#[0-9A-Fa-f]{6}$/)],
      }),
      text_color: this.fb.control(BUTTON_DEFAULTS.text_color, {
        nonNullable: true,
        validators: [Validators.pattern(/^#[0-9A-Fa-f]{6}$/)],
      }),
      padding: this.fb.control(BUTTON_DEFAULTS.padding, {
        nonNullable: true,
        validators: [Validators.min(4), Validators.max(32)],
      }),
      border_radius: this.fb.control(BUTTON_DEFAULTS.border_radius, {
        nonNullable: true,
        validators: [Validators.min(0), Validators.max(24)],
      }),
      align: this.fb.control<'left' | 'center' | 'right'>(BUTTON_DEFAULTS.align, {
        nonNullable: true,
      }),
    });
    const group = this.fb.group({
      id: this.fb.control(id, { validators: [Validators.required] }),
      type: this.fb.control<BlockType>('button', { nonNullable: true }),
      version: this.fb.control<1>(1, { nonNullable: true }),
      props,
    });
    if (atIndex == null) this.blocksForm.push(group);
    else this.blocksForm.insert(atIndex, group);
    return group as unknown as BlockFormGroup;
  }

  private insertLogoBlock(atIndex?: number, src = ''): BlockFormGroup {
    const id = crypto.randomUUID();
    // src is derived from brand (companies.v_logo_url) — not a
    // user-editable FormControl per spec §3.
    const props = this.fb.group<Record<string, AbstractControl<unknown>>>({
      src: this.fb.control(src, { nonNullable: true }),
      alt: this.fb.control(LOGO_DEFAULTS.alt, {
        nonNullable: true,
        validators: [Validators.maxLength(200)],
      }),
      max_height: this.fb.control(LOGO_DEFAULTS.max_height, {
        nonNullable: true,
        validators: [Validators.min(20), Validators.max(200)],
      }),
      max_width: this.fb.control(LOGO_DEFAULTS.max_width, {
        nonNullable: true,
        validators: [Validators.min(50), Validators.max(600)],
      }),
    });
    const group = this.fb.group({
      id: this.fb.control(id, { validators: [Validators.required] }),
      type: this.fb.control<BlockType>('logo', { nonNullable: true }),
      version: this.fb.control<1>(1, { nonNullable: true }),
      props,
    });
    if (atIndex == null) this.blocksForm.push(group);
    else this.blocksForm.insert(atIndex, group);
    return group as unknown as BlockFormGroup;
  }

  /** Dispatcher: switch on type → delegate to per-type factory. */
  insertBlock(type: BlockType, atIndex?: number): BlockFormGroup {
    switch (type) {
      case 'heading':
        return this.insertHeadingBlock(atIndex);
      case 'paragraph':
        return this.insertParagraphBlock(atIndex);
      case 'button':
        return this.insertButtonBlock(atIndex);
      case 'logo':
        return this.insertLogoBlock(atIndex);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  removeBlock(index: number, _confirm = true): void {
    if (index < 0 || index >= this.blocksForm.controls.length) return;
    this.blocksForm.removeAt(index);
    if (this.expandedIndex() === index) this.expandedIndex.set(null);
  }

  duplicateBlock(index: number): void {
    if (index < 0 || index >= this.blocksForm.controls.length) return;
    const src = this.blocksForm.at(index).value as Block;
    const newId = crypto.randomUUID();
    // Build a copy via the per-type factory at the position right after src.
    const copy = this.insertBlock(src.type, index + 1);
    copy.patchValue({
      id: newId,
      type: src.type,
      version: 1,
      props: structuredClone(src.props),
    });
  }

  /** Replace FormArray contents (for auto-seed / auto-migrate flows). */
  private populateBlocks(blocks: Block[], opts: { emitEvent: boolean }): void {
    // Clear current FormArray without firing valueChanges.
    while (this.blocksForm.controls.length > 0) {
      this.blocksForm.removeAt(0, { emitEvent: false });
    }
    // Push each block via the matching factory to keep typing concrete.
    for (const b of blocks) {
      const group = this.insertBlock(b.type);
      group.patchValue({ id: b.id, type: b.type, version: 1, props: b.props }, {
        emitEvent: opts.emitEvent,
      });
    }
  }

  // ── Preview pipeline ─────────────────────────────────────────────────

  private wirePreviewPipeline(): void {
    this.blocksForm.valueChanges
      .pipe(
        debounceTime(250),
        // Drop undefined envelopes from control resets.
        filter((v) => v !== undefined && v !== null),
        distinctUntilChanged<unknown>((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        // Reset transient UI state on every emission.
        switchMap(() => {
          this.previewLoading.set(true);
          this.previewError.set(null);
          this.previewForbidden.set(false);
          return this.companyEmail.previewTemplate(
            this.data().companyId,
            this.data().emailType as EmailType,
            this.data().sampleData,
            {
              custom_subject: this.subject(),
              custom_blocks: (this.blocksForm.value as unknown as Block[]) ?? [],
              custom_body: null,
              custom_header: this.header(),
              custom_button_text: '',
            },
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          this.previewHtml.set(result.html ?? '');
          this.previewLoading.set(false);
        },
        error: (err: unknown) => {
          this.previewLoading.set(false);
          this.handlePreviewError(err);
        },
      });
  }

  private handlePreviewError(err: unknown): void {
    const e = err as { code?: string; details?: string; message?: string } | null;
    if (err instanceof ForbiddenPreviewError) {
      this.previewForbidden.set(true);
      return;
    }
    if (e?.code === '42501') {
      this.previewForbidden.set(true);
      return;
    }
    if (e?.code === 'P0001') {
      // err.details may be JSON like: { message, block_index, block_type, prop }
      try {
        const parsed = JSON.parse(e.details ?? '{}') as Partial<BlockValidationError> & {
          message?: string;
        };
        this.previewError.set({
          blockIndex: Number(parsed.blockIndex ?? parsed.block_index ?? -1),
          blockType: String(parsed.blockType ?? parsed.block_type ?? ''),
          prop: String(parsed.prop ?? parsed.message ?? ''),
        });
      } catch {
        this.previewError.set({ blockIndex: -1, blockType: '', prop: e.message ?? '' });
      }
      return;
    }
    // Fallback: generic error banner.
    this.previewError.set({ blockIndex: -1, blockType: '', prop: '' });
  }

  // ── Auto-seed (decision 3 of spec id 1945) ───────────────────────────

  /**
   * If both `custom_blocks` and `custom_body_template` are NULL,
   * fetch the per-type default HTML and parse it into a Block[].
   * Best-effort: failures are swallowed; the preview pipeline already
   * reflects the default HTML via the SQL renderer's per-type default
   * branch.
   *
   * Uses { emitEvent: false } so the FormArray mutation does NOT fire
   * the preview pipeline (the parent's valueChanges is already wired
   * to render the default via the RPC).
   */
  private async runAutoSeed(): Promise<void> {
    const setting = this.setting();
    if (!setting) return;
    if (setting.custom_blocks != null) {
      // Already populated — hydrate the FormArray from saved blocks.
      const blocks = setting.custom_blocks as unknown as Block[];
      this.populateBlocks(blocks ?? [], { emitEvent: false });
      return;
    }
    if (setting.custom_body_template != null && setting.custom_body_template !== '') {
      // Legacy setting — auto-migrate is PR2b. For PR2a we leave the
      // FormArray empty; the parent's TipTap+body field still holds the
      // legacy content (rendered via custom_body precedence).
      return;
    }
    try {
      const html = await firstValueFrom(
        this.companyEmail.getDefaultBody(this.data().emailType as EmailType),
      );
      if (!html) return;
      const parsed = defaultHtmlToBlocks(html, this.primaryColor());
      this.populateBlocks(parsed, { emitEvent: false });
      this.expandedIndex.set(0);
    } catch {
      // Best-effort: leave FormArray empty.
    }
  }
}

/**
 * Parse the per-type default HTML returned by `default_email_body(text)`
 * into a Block[] using regex heuristics. Single source of truth lives
 * in supabase/functions/_shared/email-templates.ts (the SQL default is
 * emitted with #4f46e5 primary, no logo).
 *
 * Failure modes (per spec id 1945 §5):
 *   - No recognized patterns → return [single ParagraphBlock with raw inner text]
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

function makeParagraphBlock(text: string): Block {
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