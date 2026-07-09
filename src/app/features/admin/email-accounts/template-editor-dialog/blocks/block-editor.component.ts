/**
 * BlockEditorComponent (PR-wysiwyg email-block-editor)
 *
 * Root of the Divi-style block editor in WYSIWYG mode. The
 * BlockListComponent owns per-row expansion (each row renders its
 * block visually; click expands the inline editor; "Done" or
 * click-outside collapses). This component no longer renders an
 * `app-block-editor-header` separately — each row does that itself.
 *
 * What this component DOES own:
 *   - The FormArray<BlockFormGroup> (per-type factory methods).
 *   - The expansion state, by stable block id (delegated via the
 *     `blockList` ref so auto-seed can expand the first block).
 *   - The auto-seed / auto-migrate flows.
 *   - The blocks → preview RPC pipeline (debounce + distinct + swtchMap).
 *
 * Architecture mirrors design id 1946 §2.1 + §3 for the per-type
 * factories, save payload, and error handling. The WYSIWYG canvas
 * is owned by BlockRowComponent and BlockListComponent (this commit
 * set refactored the round list into a true WYSIWYG surface).
 *
 * Plain HTML + custom CSS — no Angular Material dependency.
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
  viewChild,
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
import {
  BlockFormGroup,
  BlockListComponent,
} from './block-list.component';
import { AddBlockDropdownComponent } from './add-block-dropdown.component';
import {
  Block,
  BlockType,
  HEADING_DEFAULTS,
  LOGO_DEFAULTS,
  PARAGRAPH_DEFAULTS,
  BUTTON_DEFAULTS,
} from './block-types';
import { defaultHtmlToBlocks, makeParagraphBlock } from './block-parser';
import { autoMigrate, AutoMigrateResult } from './auto-migrate';
import { CompanyEmailSetting, EmailType } from '../../../../../models/company-email.models';
import {
  CompanyEmailService,
  ForbiddenPreviewError,
} from '../../../../../services/company-email.service';
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
    BlockListComponent,
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
        #blockList
        [formArray]="blocksForm"
        [primaryColor]="primaryColor()"
        [hasLogoUrl]="hasLogoUrl()"
        (duplicate)="onDuplicateBlock($event)"
        (delete)="onDeleteBlock($event)"
      ></app-block-list>

      @if (previewForbidden()) {
        <p class="be-banner be-banner--warn" data-testid="block-preview-forbidden">
          No tienes permiso para previsualizar esta plantilla
        </p>
      } @else if (previewError() !== null) {
        <p class="be-banner be-banner--error" data-testid="block-preview-error">
          @if (previewError()!.blockIndex >= 0) {
            Bloque {{ previewError()!.blockIndex + 1 }} ({{ previewError()!.blockType }}):
            propiedad «{{ previewError()!.prop }}» inválida.
          } @else {
            No se pudo cargar la previsualización
          }
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

  /**
   * PR2b: surfaces a one-shot event when the auto-migrate flow produced
   * a fallback (single ParagraphBlock with the first 5000 chars of the
   * legacy body). The parent dialog listens to this and shows a yellow
   * MatSnackBar / banner so the user knows their template was truncated.
   */
  readonly migrationFallback = output<{ reason: 'parse-error' | 'too-large' }>();

  // Signals for preview pipeline.
  readonly previewHtml = signal<string>('');
  readonly previewLoading = signal<boolean>(false);
  readonly previewForbidden = signal<boolean>(false);
  readonly previewError = signal<BlockValidationError | null>(null);

  /** Optional view-child handle on the BlockListComponent so auto-seed
   *  can call `expandById()` on the list without coupling the editor
   *  to the list's internal signal. */
  private readonly blockListRef = viewChild<BlockListComponent>('blockList');

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
    const newGroup = this.blocksForm.at(this.blocksForm.controls.length - 1) as BlockFormGroup;
    const newId = newGroup.controls.id.value as string;
    this.blockListRef()?.expandById(newId);
  }

  onDuplicateBlock(index: number): void {
    this.duplicateBlock(index);
  }

  onDeleteBlock(index: number): void {
    this.removeBlock(index);
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
    const id: string = crypto.randomUUID();
    const props = this.fb.group<Record<string, AbstractControl<unknown>>>({
      level: this.fb.control<1 | 2 | 3>(HEADING_DEFAULTS.level, [
        Validators.required,
      ]),
      text: this.fb.control(HEADING_DEFAULTS.text, [
        Validators.required,
        Validators.maxLength(200),
      ]),
      color: this.fb.control(HEADING_DEFAULTS.color, [
        Validators.pattern(/^#[0-9A-Fa-f]{6}$/),
      ]),
      align: this.fb.control<'left' | 'center' | 'right'>(HEADING_DEFAULTS.align),
      font_size: this.fb.control(HEADING_DEFAULTS.font_size, [
        Validators.min(12),
        Validators.max(72),
      ]),
    });
    const group = this.fb.group({
      id: this.fb.control<string>(id, [Validators.required]),
      type: this.fb.control<BlockType>('heading'),
      version: this.fb.control<1>(1),
      props,
    });
    if (atIndex == null) this.blocksForm.push(group);
    else this.blocksForm.insert(atIndex, group);
    return group as unknown as BlockFormGroup;
  }

  private insertParagraphBlock(atIndex?: number): BlockFormGroup {
    const id: string = crypto.randomUUID();
    const props = this.fb.group<Record<string, AbstractControl<unknown>>>({
      text: this.fb.control(PARAGRAPH_DEFAULTS.text, [Validators.maxLength(5000)]),
      align: this.fb.control<'left' | 'center' | 'right' | 'justify'>(
        PARAGRAPH_DEFAULTS.align,
      ),
      color: this.fb.control(PARAGRAPH_DEFAULTS.color, [
        Validators.pattern(/^#[0-9A-Fa-f]{6}$/),
      ]),
      font_size: this.fb.control(PARAGRAPH_DEFAULTS.font_size, [
        Validators.min(12),
        Validators.max(32),
      ]),
      italic: this.fb.control(PARAGRAPH_DEFAULTS.italic),
    });
    const group = this.fb.group({
      id: this.fb.control<string>(id, [Validators.required]),
      type: this.fb.control<BlockType>('paragraph'),
      version: this.fb.control<1>(1),
      props,
    });
    if (atIndex == null) this.blocksForm.push(group);
    else this.blocksForm.insert(atIndex, group);
    return group as unknown as BlockFormGroup;
  }

  private insertButtonBlock(atIndex?: number): BlockFormGroup {
    const id: string = crypto.randomUUID();
    const props = this.fb.group<Record<string, AbstractControl<unknown>>>({
      text: this.fb.control(BUTTON_DEFAULTS.text, [Validators.maxLength(100)]),
      url: this.fb.control(BUTTON_DEFAULTS.url, [Validators.maxLength(2000)]),
      background_color: this.fb.control(BUTTON_DEFAULTS.background_color, [
        Validators.pattern(/^#[0-9A-Fa-f]{6}$/),
      ]),
      text_color: this.fb.control(BUTTON_DEFAULTS.text_color, [
        Validators.pattern(/^#[0-9A-Fa-f]{6}$/),
      ]),
      padding: this.fb.control(BUTTON_DEFAULTS.padding, [
        Validators.min(4),
        Validators.max(32),
      ]),
      border_radius: this.fb.control(BUTTON_DEFAULTS.border_radius, [
        Validators.min(0),
        Validators.max(24),
      ]),
      align: this.fb.control<'left' | 'center' | 'right'>(BUTTON_DEFAULTS.align),
    });
    const group = this.fb.group({
      id: this.fb.control<string>(id, [Validators.required]),
      type: this.fb.control<BlockType>('button'),
      version: this.fb.control<1>(1),
      props,
    });
    if (atIndex == null) this.blocksForm.push(group);
    else this.blocksForm.insert(atIndex, group);
    return group as unknown as BlockFormGroup;
  }

  private insertLogoBlock(atIndex?: number, src = ''): BlockFormGroup {
    const id: string = crypto.randomUUID();
    const props = this.fb.group<Record<string, AbstractControl<unknown>>>({
      src: this.fb.control(src),
      alt: this.fb.control(LOGO_DEFAULTS.alt, [Validators.maxLength(200)]),
      max_height: this.fb.control(LOGO_DEFAULTS.max_height, [
        Validators.min(20),
        Validators.max(200),
      ]),
      max_width: this.fb.control(LOGO_DEFAULTS.max_width, [
        Validators.min(50),
        Validators.max(600),
      ]),
    });
    const group = this.fb.group({
      id: this.fb.control<string>(id, [Validators.required]),
      type: this.fb.control<BlockType>('logo'),
      version: this.fb.control<1>(1),
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
    // Capture the id BEFORE removeAt so we can clear the expansion
    // state if the removed block was the active one (collapse, not
    // re-point at the next row).
    const removedId = (this.blocksForm.at(index) as BlockFormGroup).controls.id.value as string;
    this.blocksForm.removeAt(index);
    const list = this.blockListRef();
    if (list) list.expandById(list.expandedBlockId() === removedId ? null : null);
  }

  duplicateBlock(index: number): void {
    if (index < 0 || index >= this.blocksForm.controls.length) return;
    const src = this.blocksForm.at(index).value as unknown as Block;
    const newId: string = crypto.randomUUID();
    // Build a copy via the per-type factory at the position right after src.
    const copy = this.insertBlock(src.type, index + 1);
    copy.patchValue({
      id: newId,
      type: src.type,
      version: 1,
      props: structuredClone(src.props) as unknown as Record<string, unknown>,
    });
    // Auto-expand the new copy so the user can tweak immediately.
    this.blockListRef()?.expandById(newId);
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
      group.patchValue(
        {
          id: b.id,
          type: b.type,
          version: 1,
          props: b.props as unknown as Record<string, unknown>,
        },
        { emitEvent: opts.emitEvent },
      );
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
        const parsed = JSON.parse(e.details ?? '{}') as Record<string, unknown> & {
          message?: string;
        };
        this.previewError.set({
          blockIndex: Number(
            (parsed['blockIndex'] as unknown) ?? parsed['block_index'] ?? -1,
          ),
          blockType: String(
            (parsed['blockType'] as unknown) ?? parsed['block_type'] ?? '',
          ),
          prop: String(
            (parsed['prop'] as unknown) ?? parsed['message'] ?? '',
          ),
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
   * PR2b auto-seed + auto-migrate flow. Three branches:
   *
   *  1. `custom_blocks != null` — already populated. Hydrate the
   *     FormArray from the saved blocks and return.
   *  2. `custom_blocks == null` AND `custom_body_template != null` —
   *     LEGACY setting. Run the auto-migrate helper (parse the legacy
   *     HTML → Block[] → persist to custom_blocks). Surface a
   *     `migrationFallback` event when the helper had to fall back to
   *     a single ParagraphBlock.
   *  3. `custom_blocks == null` AND `custom_body_template == null` —
   *     fresh / un-customized setting. Auto-seed: fetch the per-type
   *     default HTML, parse it, populate the FormArray.
   *
   * All three branches use `{ emitEvent: false }` so the FormArray
   * mutation does NOT fire the preview pipeline (the parent's
   * valueChanges is already wired to render via the RPC).
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
    if (
      setting.custom_body_template != null &&
      setting.custom_body_template !== ''
    ) {
      // Legacy setting — run the auto-migrate flow.
      const result: AutoMigrateResult = await autoMigrate(
        setting,
        this.primaryColor(),
        this.companyEmail,
      );
      this.populateBlocks(result.blocks, { emitEvent: false });
      if (result.fallbackApplied) {
        this.migrationFallback.emit({ reason: 'parse-error' });
      }
      if (result.blocks.length > 0) {
        const firstId = (this.blocksForm.at(0) as BlockFormGroup).controls.id.value as string;
        this.blockListRef()?.expandById(firstId);
      }
      return;
    }
    try {
      const html = await firstValueFrom(
        this.companyEmail.getDefaultBody(this.data().emailType as EmailType),
      );
      if (!html) return;
      const parsed = defaultHtmlToBlocks(html, this.primaryColor());
      this.populateBlocks(parsed, { emitEvent: false });
      const firstId = (this.blocksForm.at(0) as BlockFormGroup).controls.id.value as string;
      this.blockListRef()?.expandById(firstId);
    } catch {
      // Best-effort: leave FormArray empty.
    }
  }
}

/**
 * PR2b note: the `defaultHtmlToBlocks` parser and `makeParagraphBlock`
 * helper used to live here. They were extracted to `./block-parser.ts`
 * so the auto-migrate flow in `./auto-migrate.ts` can use the SAME
 * parser (spec id 1945 §9 explicitly requires this — duplicating the
 * logic would be a maintenance hazard). The named exports above are
 * re-exported from `./block-parser.ts` for backward compatibility with
 * the existing tests (block-editor.component.spec.ts imports
 * `defaultHtmlToBlocks` from this file).
 */
export { defaultHtmlToBlocks, makeParagraphBlock } from './block-parser';
