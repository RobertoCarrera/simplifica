import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import {
  CompanyEmailService,
  ForbiddenPreviewError,
} from '../../../services/company-email.service';
import { ToastService } from '../../../services/toast.service';
import { EmailType, EMAIL_TYPE_LABELS } from '../../../models/company-email.models';
import { SafeHtmlPipe } from '../../../core/pipes/safe-html.pipe';

@Component({
  selector: 'app-email-preview',
  standalone: true,
  imports: [CommonModule, SafeHtmlPipe],
  templateUrl: './email-preview.component.html',
  styleUrls: ['./email-preview.component.scss'],
})
export class EmailPreviewComponent implements OnInit {
  @Input() companyId: string | null = null;
  @Input() emailType: EmailType | null = null;
  // Pre-existing in the base branch — naming an output `close` clashes with
  // the `close` DOM event. The companion `email-account-form.component.ts`
  // uses the same name (project-wide pattern). Renaming would force a
  // parent-binding change beyond the PR2d scope, so the rule is silenced
  // locally.
  // eslint-disable-next-line @angular-eslint/no-output-native
  @Output() close = new EventEmitter<void>();

  private emailService = inject(CompanyEmailService);
  private toast = inject(ToastService);

  htmlContent = signal<string>('');
  loading = signal(true);

  get emailTypeLabel(): string {
    return this.emailType ? EMAIL_TYPE_LABELS[this.emailType] || this.emailType : '';
  }

  async ngOnInit() {
    if (this.companyId && this.emailType) {
      await this.loadPreview();
    }
  }

  /**
   * Faithful preview: loads the saved `company_email_settings` row (if any)
   * so the RPC receives the persisted custom subject/body/header/button_text,
   * then calls the new `preview_email_template` SECURITY DEFINER RPC with the
   * per-type sample data. The RPC renders the per-type defaults (logo,
   * branding colors, RGPD footer, interpolated `{{vars}}`) so the modal
   * shows a real preview instead of an empty string when no custom body is
   * saved.
   *
   * Surfaces `ForbiddenPreviewError` (Postgres 42501) inline with an amber
   * banner so the user understands the rejection is a permissions issue,
   * not a broken template.
   */
  async loadPreview() {
    if (!this.companyId || !this.emailType) return;

    this.loading.set(true);
    try {
      const saved = await firstValueFrom(this.emailService.getSettings(this.companyId));
      const setting = saved.find((s) => s.email_type === this.emailType);
      const customFields = setting
        ? {
            custom_subject: setting.custom_subject_template ?? undefined,
            custom_body: setting.custom_body_template ?? undefined,
            custom_header: setting.custom_header_template ?? undefined,
            custom_button_text: setting.custom_button_text ?? undefined,
          }
        : {};
      const sampleData = this.emailService.getSampleFor(this.emailType);
      const { html } = await firstValueFrom(
        this.emailService.previewTemplate(
          this.companyId,
          this.emailType,
          sampleData,
          customFields
        )
      );
      this.htmlContent.set(html);
    } catch (err) {
      if (err instanceof ForbiddenPreviewError) {
        this.htmlContent.set(
          '<div class="p-4 text-amber-700 bg-amber-50 border border-amber-200 rounded">' +
            'No tienes permiso para previsualizar esta plantilla (42501).' +
            '</div>'
        );
      } else {
        this.toast.error('Error', 'No se pudo cargar la vista previa');
        this.htmlContent.set('<p class="text-red-500">Error al cargar la previsualización</p>');
      }
    } finally {
      this.loading.set(false);
    }
  }

  onClose() {
    this.close.emit();
  }
}