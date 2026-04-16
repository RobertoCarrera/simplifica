import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CompanyEmailService } from '../../../services/company-email.service';
import { ToastService } from '../../../services/toast.service';
import {
  CompanyEmailAccount,
  CompanyEmailSetting,
  EmailType,
  EMAIL_TYPE_LABELS,
  EMAIL_TYPE_DESCRIPTIONS,
} from '../../../models/company-email.models';
import { EmailPreviewComponent } from './email-preview.component';

@Component({
  selector: 'app-email-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, EmailPreviewComponent],
  templateUrl: './email-settings.component.html',
  styleUrls: ['./email-settings.component.scss'],
})
export class EmailSettingsComponent implements OnInit {
  @Input() companyId: string | null = null;

  private emailService = inject(CompanyEmailService);
  private toast = inject(ToastService);

  accounts: CompanyEmailAccount[] = [];
  settings: CompanyEmailSetting[] = [];
  loading = signal(false);
  saving = signal(false);

  // All available email types
  emailTypes: EmailType[] = [
    'booking_confirmation',
    'invoice',
    'quote',
    'consent',
    'invite',
    'invite_owner',
    'invite_admin',
    'invite_member',
    'invite_professional',
    'invite_agent',
    'invite_client',
    'waitlist',
    'inactive_notice',
    'generic',
    'booking_reminder',
    'booking_cancellation',
    'password_reset',
    'magic_link',
    'welcome',
    'staff_credentials',
  ];

  // Preview modal
  showPreviewModal = signal(false);
  previewEmailType: EmailType | null = null;

  // Template editor modal
  showTemplateModal = signal(false);
  editingTemplate: CompanyEmailSetting | null = null;
  editingEmailType: EmailType | null = null;
  templateSubject = '';
  templateBody = '';
  templateHeader = '';
  templateButtonText = '';
  savingTemplate = signal(false);

  async ngOnInit() {
    if (this.companyId) {
      await this.loadData();
    }
  }

  async loadData() {
    if (!this.companyId) return;

    this.loading.set(true);
    try {
      const [accounts, settings] = await Promise.all([
        firstValueFrom(this.emailService.getAccounts(this.companyId)),
        firstValueFrom(this.emailService.getSettings(this.companyId)),
      ]);

      // Filter to only active and verified accounts
      this.accounts = accounts.filter((a) => a.is_active && a.is_verified);
      this.settings = settings;
    } catch (err: any) {
      this.toast.error('Error', 'No se pudieron cargar los ajustes');
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  getSettingForType(emailType: EmailType): CompanyEmailSetting | undefined {
    return this.settings.find((s) => s.email_type === emailType);
  }

  getAccountForSetting(setting: CompanyEmailSetting): CompanyEmailAccount | undefined {
    return this.accounts.find((a) => a.id === setting.email_account_id);
  }

  getEmailTypeLabel(type: EmailType): string {
    return EMAIL_TYPE_LABELS[type] || type;
  }

  getEmailTypeDescription(type: EmailType): string {
    return EMAIL_TYPE_DESCRIPTIONS[type] || '';
  }

  async onAccountChange(emailType: EmailType, accountId: string) {
    if (!this.companyId) return;

    this.saving.set(true);
    try {
      await firstValueFrom(
        this.emailService.updateSetting(this.companyId, emailType, accountId)
      );
      this.toast.success('Éxito', 'Cuenta asignada correctamente');
      await this.loadData();
    } catch (err: any) {
      this.toast.error('Error', 'No se pudo actualizar');
    } finally {
      this.saving.set(false);
    }
  }

  async onToggleSetting(setting: CompanyEmailSetting) {
    try {
      await firstValueFrom(
        this.emailService.toggleSetting(setting.id, !setting.is_active)
      );
      await this.loadData();
    } catch (err: any) {
      this.toast.error('Error', 'No se pudo cambiar el estado');
    }
  }

  openPreview(emailType: EmailType) {
    this.previewEmailType = emailType;
    this.showPreviewModal.set(true);
  }

  closePreview() {
    this.showPreviewModal.set(false);
    this.previewEmailType = null;
  }

  openTemplateEditor(emailType: EmailType) {
    const setting = this.getSettingForType(emailType);
    if (!setting) return;
    this.editingTemplate = setting;
    this.editingEmailType = emailType;
    this.templateSubject = setting.custom_subject_template || '';
    this.templateBody = setting.custom_body_template || '';
    this.templateHeader = setting.custom_header_template || '';
    this.templateButtonText = setting.custom_button_text || '';
    this.showTemplateModal.set(true);
  }

  closeTemplateEditor() {
    this.showTemplateModal.set(false);
    this.editingTemplate = null;
    this.editingEmailType = null;
    this.templateSubject = '';
    this.templateBody = '';
    this.templateHeader = '';
    this.templateButtonText = '';
  }

  async saveTemplate() {
    if (!this.editingTemplate) return;

    this.savingTemplate.set(true);
    try {
      await firstValueFrom(
        this.emailService.updateTemplate(
          this.editingTemplate.id,
          this.templateSubject,
          this.templateBody,
          this.templateHeader,
          this.templateButtonText,
        )
      );
      this.toast.success('Éxito', 'Plantilla guardada correctamente');
      await this.loadData();
      this.closeTemplateEditor();
    } catch (err: any) {
      this.toast.error('Error', 'No se pudo guardar la plantilla');
    } finally {
      this.savingTemplate.set(false);
    }
  }

  trackByEmailType(index: number, type: EmailType): string {
    return type;
  }
}
