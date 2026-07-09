import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { DialogModule, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  switchMap,
  tap,
} from 'rxjs/operators';
import { CompanyEmailService, ForbiddenPreviewError } from '../../../../services/company-email.service';
import { ToastService } from '../../../../services/toast.service';
import { TranslocoService } from '@jsverse/transloco';
import {
  CompanyEmailSetting,
  EmailType,
  EMAIL_TYPE_LABELS,
} from '../../../../models/company-email.models';
import { SafeHtmlPipe } from '../../../../core/pipes/safe-html.pipe';
import { TiptapEditorComponent } from '../../../../shared/ui/tiptap-editor/tiptap-editor.component';
import { RuntimeConfigService } from '../../../../services/runtime-config.service';
import { BlockEditorComponent, BlockEditorSavePayload } from './blocks/block-editor.component';
import { Block } from './blocks/block-types';

/**
 * Inline JSON shape carried by the dialog. Mirrors design #1877 §2 — the
 * pen-click caller is responsible for resolving the `setting` (auto-UPSERT
 * when missing) before injecting the data, so the dialog can stay focused
 * on edit + preview, not row lifecycle.
 */
export interface TemplateEditorDialogData {
  companyId: string;
  emailType: EmailType;
  setting: CompanyEmailSetting | null;
  sampleData: Record<string, unknown>;
}

interface FormShape {
  subject: string;
  header: string;
  buttonText: string;
  body: string;
}

/**
 * Split-view editor dialog.
 *
 * Layout: 40% form (4 textareas) / 60% preview pane on `>=md` (≥768 px);
 * single column below. Sticks to the codebase's `ChangeDetectionStrategy.OnPush`
 * + `takeUntilDestroyed(this.destroyRef)` convention (see
 * `dashboard-analytics`, `project-dialog`, `mobile-bottom-nav`).
 *
 * Why `@angular/cdk/dialog` (not `@angular/material/dialog`)?
 *   `@angular/material` is not a dependency of this project (confirmed by
 *   the existing `send-confirmation-modal` comment and by `package.json`).
 *   `@angular/cdk/dialog` is the underlying primitive that `MatDialog` wraps
 *   — same architectural contract (programmatic open + injectable data +
 *   `.closed` Observable + ESC + backdrop close). Functional equivalent;
 *   see apply-progress for the deviation log.
 *
 * Preview pipeline invariants:
 *   - 250ms debounce + JSON.stringify-equal comparator (no dep needed).
 *   - switchMap cancels in-flight RPC on every new emission.
 *   - takeUntilDestroyed binds the subscription to the dialog lifecycle.
 *
 * Save re-entrancy: synchronous `saving.set(true)` BEFORE any `await` so the
 * second click inside the same CD tick is dropped.
 */
@Component({
  selector: 'app-template-editor-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DialogModule,
    TranslocoPipe,
    SafeHtmlPipe,
    TiptapEditorComponent,
    BlockEditorComponent,
  ],
  templateUrl: './template-editor-dialog.component.html',
  styleUrls: ['./template-editor-dialog.component.scss'],
})
export class TemplateEditorDialogComponent {
  private readonly companyEmailService = inject(CompanyEmailService);
  private readonly toast = inject(ToastService);
  private readonly translocoService = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialogRef = inject<DialogRef<TemplateEditorDialogResult>>(DialogRef);
  private readonly runtimeConfig = inject(RuntimeConfigService);
  readonly data = inject<TemplateEditorDialogData>(DIALOG_DATA);

  /**
   * Feature flag (PR2a email-block-editor): when true, the dialog renders
   * the new <app-block-editor> in place of the TipTap + 4-field legacy UI.
   * Default OFF in production per design id 1946 §7.1.
   */
  readonly blockEditorEnabled = computed<boolean>(
    () => this.runtimeConfig.get().features?.emailBlockEditorEnabled === true,
  );

  /** Preview pane HTML, sanitized via SafeHtmlPipe in the template. */
  readonly previewHtml = signal<string>('');

  /** Per-call debounce indicator (250 ms window). */
  readonly previewLoading = signal(false);

  /** Save re-entrancy guard — synchronous, see saveTemplate(). */
  readonly saving = signal(false);

  /** 42501 surfaces here for the preview-pane banner; cleared on next event. */
  readonly previewForbidden = signal(false);

  /** Generic preview-pane error (anything other than 42501). */
  readonly previewError = signal(false);

  readonly title = computed(
    () =>
      this.translocoService.translate('emailSettings.templateEditor.title') ||
      EMAIL_TYPE_LABELS[this.data.emailType] ||
      'Editar plantilla'
  );

  readonly form: FormGroup<{
    subject: FormControl<string>;
    header: FormControl<string>;
    buttonText: FormControl<string>;
    body: FormControl<string>;
  }> = new FormGroup({
    subject: new FormControl<string>(this.data.setting?.custom_subject_template ?? '', {
      nonNullable: true,
      validators: [Validators.maxLength(200)],
    }),
    header: new FormControl<string>(this.data.setting?.custom_header_template ?? '', {
      nonNullable: true,
      validators: [Validators.maxLength(2000)],
    }),
    buttonText: new FormControl<string>(this.data.setting?.custom_button_text ?? '', {
      nonNullable: true,
      validators: [Validators.maxLength(100)],
    }),
    body: new FormControl<string>(this.data.setting?.custom_body_template ?? '', {
      nonNullable: true,
      validators: [Validators.maxLength(50000)],
    }),
  });

  /**
   * JSON.stringify-equality comparator. Safe because form values are plain
   * strings (FormControl<string> with nonNullable). Pulling a deep-equal
   * lib for a 4-field form would be overkill — the comment notes a TODO(PR3+)
   * to revisit if the form grows.
   */
  private readonly formEqual = (a: FormShape, b: FormShape): boolean =>
    JSON.stringify(a) === JSON.stringify(b);

  constructor() {
    this.form.valueChanges
      .pipe(
        debounceTime(250),
        // Drop `null` envelopes from control resets — guards against the
        // initial `valueChanges` emission with a `null` field on edge
        // platforms. Does NOT filter content truthiness (controls are typed
        // `FormControl<string>` and pre-populated with `''`).
        filter((v): v is FormShape => !!v),
        distinctUntilChanged<FormShape>(this.formEqual),
        tap(() => {
          this.previewLoading.set(true);
          this.previewError.set(false);
          this.previewForbidden.set(false);
        }),
        switchMap((v) =>
          this.companyEmailService.previewTemplate(
            this.data.companyId,
            this.data.emailType,
            this.data.sampleData,
            {
              custom_subject: v.subject,
              custom_header: v.header,
              custom_button_text: v.buttonText,
              custom_body: v.body,
            }
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (result) => {
          this.previewHtml.set(result.html ?? '');
          this.previewLoading.set(false);
        },
        error: (err: unknown) => {
          this.previewLoading.set(false);
          if (err instanceof ForbiddenPreviewError) {
            this.previewForbidden.set(true);
          } else {
            this.previewError.set(true);
          }
        },
      });

    // Seed the body textarea with the rendered default HTML when no
    // `custom_body` is saved, so the user edits from a real starting point
    // instead of a blank wall. Best-effort: errors are swallowed inside
    // and the preview pane already reflects the default via the pipeline.
    void this.seedFromDefaultIfEmpty();

    // Fetch the initial preview explicitly. The form.valueChanges pipeline
    // doesn't replay its current value to new subscribers, so without this
    // the preview pane would stay empty until the user typed something.
    // We fire one explicit previewTemplate call with the form's current
    // values to guarantee the preview shows the rendered default HTML on
    // dialog open, regardless of whether seedFromDefaultIfEmpty succeeds.
    queueMicrotask(() => this.form.patchValue(this.form.getRawValue(), { emitEvent: true }));
  }

  /**
   * PR2b cleanup note: the prior `fetchInitialPreview` debug helper and
   * all `[TEMPLATE-EDITOR]` console.log instrumentation have been
   * removed. The dialog now relies on:
   *   1. the form.valueChanges → previewTemplate pipeline (subscribed
   *      in the constructor) for the debounced live preview, and
   *   2. `seedFromDefaultIfEmpty` for the best-effort one-shot seed
   *      on first open of an un-customized setting.
   */
  private async seedFromDefaultIfEmpty(): Promise<void> {
    const setting = this.data.setting;
    const hasSavedBody = !!(setting?.custom_body_template ?? '').trim();
    const hasSavedSubject = !!(setting?.custom_subject_template ?? '').trim();
    const hasSavedButtonText = !!(setting?.custom_button_text ?? '').trim();
    if (hasSavedBody && hasSavedSubject && hasSavedButtonText) return;

    try {
      const result = await firstValueFrom(
        this.companyEmailService.previewTemplate(
          this.data.companyId,
          this.data.emailType,
          this.data.sampleData,
          {
            custom_subject: '',
            custom_header: '',
            custom_button_text: '',
            custom_body: '',
          }
        )
      );
      const extracted = this.extractFromDefaultHtml(result.html ?? '');
      const patch: Partial<FormShape> = {};
      if (!hasSavedBody && extracted.body) patch.body = extracted.body;
      if (!hasSavedSubject && extracted.subject) patch.subject = extracted.subject;
      if (!hasSavedButtonText && extracted.buttonText) patch.buttonText = extracted.buttonText;
      if (Object.keys(patch).length > 0) {
        this.form.patchValue(patch, { emitEvent: false });
      }
      // Reuse the same RPC response to populate the preview pane so the
      // right side is not empty after the seed (the form pipeline uses
      // emitEvent: false above to avoid a duplicate round-trip, so it
      // won't fire on its own).
      this.previewHtml.set(result.html ?? '');
    } catch (err) {
      console.error('TemplateEditorDialog.seedFromDefaultIfEmpty', err);
      // best-effort: preview pane still shows the default via the pipeline
    }
  }

  /**
   * Pull the editable pieces out of the rendered default HTML returned
   * by `preview_email_template`:
   *
   *   1. Inner `<body>...</body>` — the RPC emits a full
   *      `<!DOCTYPE><html>...<body>...</body></html>` document.
   *   2. Cut off everything from the compliance `<hr>` marker (emitted
   *      by `append_compliance_footer(text, uuid, text)` in the Postgres
   *      function) onwards — that block is rendered automatically and
   *      should not be part of the editable body.
   *   3. First `<h1>` text → `subject` (per-type title rendered into
   *      the email body, e.g. "Bienvenida a Simplifica").
   *   4. First `<a>` whose `style` contains `background:` → the CTA
   *      button text (the templates emit a single anchor with a
   *      coloured background as the call-to-action button).
   */
  private extractFromDefaultHtml(html: string): { body: string; subject: string; buttonText: string } {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let inner = bodyMatch ? bodyMatch[1] : html;
    const footerIdx = inner.indexOf(
      '<hr style="border:none;border-top:1px solid #e5e7eb'
    );
    if (footerIdx !== -1) {
      inner = inner.substring(0, footerIdx);
    }

    const subjectMatch = inner.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const subject = subjectMatch
      ? subjectMatch[1].replace(/<[^>]+>/g, '').trim()
      : '';

    const buttonMatch = inner.match(
      /<a[^>]+style="[^"]*background:[^"]*"[^>]*>([^<]+)<\/a>/i
    );
    const buttonText = buttonMatch ? buttonMatch[1].trim() : '';

    return { body: inner.trim(), subject, buttonText };
  }

  /**
   * Save handler with synchronous re-entrancy guard.
   *
   * The synchronous `if (this.saving()) return; saving.set(true);` block
   * closes the gap between two fast clicks (Angular CD has not run yet, so
   * [disabled] still reads `false`). The spec uses two `click()` calls in
   * the same `fakeAsync` tick to assert only one RPC fires.
   */
  async saveTemplate(): Promise<void> {
    if (this.saving()) return;
    if (this.form.invalid) return;

    this.saving.set(true);
    try {
      const setting = this.data.setting;
      if (!setting) {
        // Defensive: caller should have pre-seeded via `upsertTemplate`.
        this.toast.error(
          this.translocoService.translate('emailSettings.toast.error') || 'Error',
          this.translocoService.translate('emailSettings.templateEditor.toast.saveError')
            || 'No se puede guardar: falta fila de configuración'
        );
        return;
      }
      const v = this.form.value;
      await firstValueFrom(
        this.companyEmailService.updateTemplate(
          setting.id,
          v.subject ?? '',
          v.body ?? '',
          v.header ?? '',
          v.buttonText ?? ''
        )
      );
      this.toast.success(
        this.translocoService.translate('emailSettings.toast.success') || 'OK',
        this.translocoService.translate('emailSettings.templateEditor.toast.saved')
          || 'Plantilla guardada'
      );
      this.dialogRef.close(true);
    } catch (err) {
      console.error('TemplateEditorDialog.saveTemplate', err);
      this.toast.error(
        this.translocoService.translate('emailSettings.toast.error') || 'Error',
        this.translocoService.translate('emailSettings.templateEditor.toast.saveError')
          || 'Error al guardar la plantilla'
      );
    } finally {
      this.saving.set(false);
    }
  }

  /** Cancel — close with `false` so the caller knows no save happened. */
  close(reload = false): void {
    this.dialogRef.close(reload);
  }

  /**
   * PR2a block editor save handler. Persists via `updateCustomBlocks`
   * (sets custom_blocks JSONB; leaves custom_body_template /
   * custom_button_text untouched per spec id 1945 §9 rollback-safety).
   *
   * Re-entrancy: same synchronous `saving.set(true)` guard as the
   * legacy saveTemplate path — two fast clicks resolve to one RPC.
   */
  async onBlockSave(payload: BlockEditorSavePayload): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      const setting = this.data.setting;
      if (!setting) {
        this.toast.error(
          this.translocoService.translate('emailSettings.toast.error') || 'Error',
          this.translocoService.translate('emailSettings.templateEditor.toast.saveError')
            || 'No se puede guardar: falta fila de configuración',
        );
        return;
      }
      // Persist subject + cabecera via the legacy updateTemplate path
      // (custom_subject_template + custom_header_template) and the
      // blocks via updateCustomBlocks (custom_blocks JSONB). Both
      // columns live on the same row so we serialize them.
      await firstValueFrom(
        this.companyEmailService.updateTemplate(
          setting.id,
          payload.subject,
          // custom_body_template: untouched on the blocks path.
          // Sending the existing value preserves any prior text for
          // potential rollback to the legacy UI.
          setting.custom_body_template ?? '',
          payload.header,
          // button_text: untouched on the blocks path.
          setting.custom_button_text ?? '',
        ),
      );
      await firstValueFrom(
        this.companyEmailService.updateCustomBlocks(setting.id, payload.blocks),
      );
      this.toast.success(
        this.translocoService.translate('emailSettings.toast.success') || 'OK',
        this.translocoService.translate('emailSettings.templateEditor.toast.saved')
          || 'Plantilla guardada',
      );
      this.dialogRef.close(true);
    } catch (err) {
      console.error('TemplateEditorDialog.onBlockSave', err);
      this.toast.error(
        this.translocoService.translate('emailSettings.toast.error') || 'Error',
        this.translocoService.translate('emailSettings.templateEditor.toast.saveError')
          || 'Error al guardar la plantilla',
      );
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * PR2b (email-block-editor): surface a yellow warning snackbar when
   * the auto-migrate flow applied its 50000-char fallback (single
   * ParagraphBlock with the first 5000 chars of the legacy body).
   * The remainder of the legacy HTML stays in `custom_body_template`
   * for manual recovery. The user can read the legacy content from
   * the legacy admin path until the deprecation banner PR3 ships.
   */
  onMigrationFallback(_payload: { reason: 'parse-error' | 'too-large' }): void {
    this.toast.warning(
      this.translocoService.translate('emailSettings.toast.warning') || 'Aviso',
      this.translocoService.translate('emailSettings.templateEditor.toast.migrationFallback')
        || 'Hemos convertido tu plantilla anterior en un único bloque de párrafo. El contenido completo sigue disponible en el editor clásico.',
    );
  }
}

export type TemplateEditorDialogResult = boolean;
