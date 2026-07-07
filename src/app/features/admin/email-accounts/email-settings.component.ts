import { Component, Input, OnInit, inject, signal, computed, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
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
import { AllEmailType } from '../../../email-samples';
import { TemplateEditorDialogComponent } from './template-editor-dialog/template-editor-dialog.component';

/**
 * Editor entry point: every email type is reachable, regardless of whether
 * a `company_email_settings` row already exists. Un-seeded types auto-UPSERT
 * the row on first pen click (PR2 spec #1876 "Editor opens for un-seeded type").
 */
type AllTypes = AllEmailType;

/**
 * Coarse-grained grouping for the settings list (PR2c polish). The 26
 * transactional types are surfaced in a fixed order so admins can locate
 * the template they need without scrolling a flat list of 26 rows.
 *
 * Labels live under `emailSettings.categories.<id>` in `src/assets/i18n/*`.
 */
type EmailCategory =
  | 'reservas'
  | 'facturacion'
  | 'consentimiento'
  | 'invitaciones'
  | 'credenciales'
  | 'notificaciones';

interface EmailCategoryGroup {
  readonly id: EmailCategory;
  readonly order: number;
}

const EMAIL_CATEGORIES: readonly EmailCategoryGroup[] = [
  { id: 'reservas',        order: 1 },
  { id: 'facturacion',     order: 2 },
  { id: 'consentimiento',  order: 3 },
  { id: 'invitaciones',    order: 4 },
  { id: 'credenciales',    order: 5 },
  { id: 'notificaciones',  order: 6 },
];

/**
 * Static, exhaustive map: every `AllEmailType` member maps to exactly one
 * category. Adding a new `AllEmailType` without a category assignment is a
 * compile-time error (TS `Record<AllTypes, EmailCategory>` exhaustiveness).
 */
const EMAIL_TYPE_CATEGORY: Record<AllTypes, EmailCategory> = {
  booking_confirmation:    'reservas',
  booking_reminder:        'reservas',
  booking_cancellation:    'reservas',
  booking_change:          'reservas',
  waitlist:                'reservas',
  invoice:                 'facturacion',
  quote:                   'facturacion',
  budget_created:          'facturacion',
  budget_reminder:         'facturacion',
  budget_overdue:          'facturacion',
  consent:                 'consentimiento',
  invite:                  'invitaciones',
  invite_owner:            'invitaciones',
  invite_admin:            'invitaciones',
  invite_member:           'invitaciones',
  invite_professional:     'invitaciones',
  invite_agent:            'invitaciones',
  invite_marketer:         'invitaciones',
  invite_client:           'invitaciones',
  password_reset:          'credenciales',
  magic_link:              'credenciales',
  welcome:                 'credenciales',
  staff_credentials:       'credenciales',
  inactive_notice:         'notificaciones',
  generic:                 'notificaciones',
  google_review:           'notificaciones',
};

@Component({
  selector: 'app-email-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoPipe],
  templateUrl: './email-settings.component.html',
  styleUrls: ['./email-settings.component.scss'],
})
export class EmailSettingsComponent implements OnInit {
  @Input() companyId: string | null = null;

  private emailService = inject(CompanyEmailService);
  private toast = inject(ToastService);
  private translocoService = inject(TranslocoService);
  private dialog = inject(Dialog);

  accounts: CompanyEmailAccount[] = [];
  settings: CompanyEmailSetting[] = [];
  loading = signal(false);
  saving = signal(false);

  /**
   * All 26 email types (PR1's 20-entry `EmailType` union + 6 system types
   * from `email-samples.json` / `AllEmailType`). Typed as `AllTypes` (alias
   * of `AllEmailType`) so the compiler enforces exhaustiveness against the
   * fixture matrix without modifying `company-email.models.ts`.
   *
   * Exposed as a signal so the categorized list (`categorizedTypes`) can be
   * a `computed()` that recomputes whenever the source list changes.
   */
  readonly emailTypes: Signal<readonly AllTypes[]> = signal<readonly AllTypes[]>([
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
    'invite_marketer',
    'google_review',
    'budget_created',
    'budget_reminder',
    'budget_overdue',
    'booking_change',
  ]);

  /**
   * The 26 types, bucketed by `EmailCategory` and emitted in the order
   * declared by `EMAIL_CATEGORIES` (Reservas → Notificaciones). Categories
   * with zero entries are filtered out so the template never renders an
   * empty header.
   */
  readonly categorizedTypes = computed(() => {
    const grouped: Record<EmailCategory, AllTypes[]> = {
      reservas: [],
      facturacion: [],
      consentimiento: [],
      invitaciones: [],
      credenciales: [],
      notificaciones: [],
    };
    for (const type of this.emailTypes()) {
      const cat = EMAIL_TYPE_CATEGORY[type];
      if (cat) {
        grouped[cat].push(type);
      }
    }
    return EMAIL_CATEGORIES
      .map((c) => ({ category: c.id, order: c.order, types: grouped[c.id] }))
      .filter((g) => g.types.length > 0);
  });

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
      this.toast.error(
        this.translocoService.translate('emailSettings.toast.errorLoading'),
        this.translocoService.translate('emailSettings.toast.errorLoadingMsg')
      );
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  getSettingForType(emailType: AllTypes): CompanyEmailSetting | undefined {
    return this.settings.find((s) => s.email_type === emailType);
  }

  getAccountForSetting(setting: CompanyEmailSetting): CompanyEmailAccount | undefined {
    return this.accounts.find((a) => a.id === setting.email_account_id);
  }

  getEmailTypeLabel(type: AllTypes): string {
    return EMAIL_TYPE_LABELS[type] || type;
  }

  getEmailTypeDescription(type: AllTypes): string {
    return EMAIL_TYPE_DESCRIPTIONS[type] || '';
  }

  async onAccountChange(emailType: AllTypes, accountId: string) {
    if (!this.companyId) return;

    this.saving.set(true);
    try {
      await firstValueFrom(
        this.emailService.updateSetting(this.companyId, emailType, accountId)
      );
      this.toast.success(
        this.translocoService.translate('emailSettings.toast.success'),
        this.translocoService.translate('emailSettings.toast.accountAssigned')
      );
      await this.loadData();
    } catch (err: any) {
      this.toast.error(
        this.translocoService.translate('emailSettings.toast.error'),
        this.translocoService.translate('emailSettings.toast.updateError')
      );
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
      this.toast.error(
        this.translocoService.translate('emailSettings.toast.error'),
        this.translocoService.translate('emailSettings.toast.toggleError')
      );
    }
  }

  /**
   * Pen-button handler. Opens the PR2a split-view editor dialog
   * (`TemplateEditorDialogComponent`) for the given type.
   *
   * Auto-UPSERT path (PR2 spec #1876 "Editor opens for un-seeded type"):
   * when no `company_email_settings` row exists for `(companyId, emailType)`
   * yet, call `emailService.upsertTemplate(...)` first to pre-seed the row
   * with `is_active=true, email_account_id=null`. The dialog then opens
   * with the freshly-created row as its `setting` input; on save it
   * `updateTemplate`s the same row (so no second row is created — confirmed
   * by `(company_id, email_type)` UNIQUE constraint from PR1).
   *
   * After the dialog closes successfully (result === true), refresh the
   * settings list so the new row shows up in the table with its toggle
   * wired up and an "assigned account" dropdown option.
   */
  async openTemplateEditor(type: EmailType): Promise<void> {
    if (!this.companyId) return;

    let setting = this.getSettingForType(type);
    if (!setting) {
      try {
        await firstValueFrom(
          this.emailService.upsertTemplate(this.companyId, type, {
            is_active: true,
            email_account_id: null,
          })
        );
        await this.loadData();
        setting = this.getSettingForType(type);
      } catch (err: any) {
        this.toast.error(
          this.translocoService.translate('emailSettings.toast.error'),
          this.translocoService.translate('emailSettings.toast.templateSaveError')
        );
        console.error('openTemplateEditor upsert failed', err);
        return;
      }
    }

    const sampleData = this.emailService.getSampleFor(type);
    const ref = this.dialog.open(TemplateEditorDialogComponent, {
      data: {
        companyId: this.companyId,
        emailType: type,
        setting,
        sampleData,
      },
      width: '1100px',
    });

    ref.closed.subscribe((reloaded) => {
      if (reloaded) {
        this.toast.success(
          this.translocoService.translate('emailSettings.toast.success'),
          this.translocoService.translate('emailSettings.toast.templateSaved')
        );
        void this.loadData();
      }
    });
  }

  trackByEmailType(index: number, type: AllTypes): string {
    return type;
  }
}