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
  readonly data = inject<TemplateEditorDialogData>(DIALOG_DATA);

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
}

export type TemplateEditorDialogResult = boolean;
