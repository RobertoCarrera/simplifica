import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { CompanyEmailService } from '../../../services/company-email.service';
import {
  CompanyEmailAccount,
  CompanyEmailSetting,
  CompanyEmailLog,
  EmailLogFilters,
  EmailType,
  EMAIL_TYPE_LABELS,
  CreateEmailAccountDto,
  UpdateEmailAccountDto,
} from '../../../models/company-email.models';
import { EmailAccountFormComponent } from './email-account-form.component';
import { EmailSettingsComponent } from './email-settings.component';
import { EmailLogsComponent } from './email-logs.component';
import { EmailBrandingComponent } from './email-branding.component';

type Tab = 'accounts' | 'settings' | 'logs' | 'branding';

@Component({
  selector: 'app-email-accounts',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    EmailAccountFormComponent,
    EmailSettingsComponent,
    EmailLogsComponent,
    EmailBrandingComponent,
  ],
  templateUrl: './email-accounts.component.html',
  styleUrls: ['./email-accounts.component.scss'],
})
export class EmailAccountsComponent implements OnInit {
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private emailService = inject(CompanyEmailService);
  private translocoService = inject(TranslocoService);

  // Tabs
  activeTab: Tab = 'accounts';

  // Accounts state
  accounts: CompanyEmailAccount[] = [];
  loadingAccounts = signal(false);
  companyId: string | null = null;

  // Test email modal
  showTestEmailModal = signal(false);
  testEmailForm: FormGroup;
  sendingTestEmail = signal(false);

  // Delete confirmation
  accountToDelete: CompanyEmailAccount | null = null;
  showDeleteConfirm = signal(false);
  deletingAccount = signal(false);

  // Account being edited
  accountToEdit: CompanyEmailAccount | null = null;
  showAccountForm = signal(false);

  // Verify loading
  verifyingAccountId: string | null = null;

  constructor(private fb: FormBuilder) {
    this.testEmailForm = this.fb.group({
      recipientEmail: ['', [Validators.required, Validators.email]],
    });
  }

  async ngOnInit() {
    const profile = await firstValueFrom(this.auth.userProfile$);
    this.companyId = profile?.company_id || null;

    if (this.companyId) {
      await this.loadAccounts();
    }
  }

  // ==========================================
  // DATA LOADING
  // ==========================================

  async loadAccounts() {
    if (!this.companyId) return;

    this.loadingAccounts.set(true);
    try {
      this.accounts = await firstValueFrom(
        this.emailService.getAccounts(this.companyId)
      );
    } catch (err: any) {
      this.toast.error(this.translocoService.translate('emailAccounts.toast.errorLoadingAccounts'), this.translocoService.translate('emailAccounts.toast.errorLoadingAccountsMsg'));
      console.error(err);
    } finally {
      this.loadingAccounts.set(false);
    }
  }

  // ==========================================
  // ACCOUNT ACTIONS
  // ==========================================

  openAddAccountModal() {
    this.accountToEdit = null;
    this.showAccountForm.set(true);
  }

  openEditAccountModal(account: CompanyEmailAccount) {
    this.accountToEdit = account;
    this.showAccountForm.set(true);
  }

  onAccountFormClose() {
    this.showAccountForm.set(false);
    this.accountToEdit = null;
  }

  async onAccountSaved(account: CompanyEmailAccount) {
    this.showAccountForm.set(false);
    this.accountToEdit = null;
    await this.loadAccounts();
    this.toast.success(this.translocoService.translate('emailAccounts.toast.accountSaved'), this.translocoService.translate('emailAccounts.toast.accountSavedMsg'));
  }

  confirmDeleteAccount(account: CompanyEmailAccount) {
    this.accountToDelete = account;
    this.showDeleteConfirm.set(true);
  }

  async deleteAccount() {
    if (!this.accountToDelete) return;

    this.deletingAccount.set(true);
    try {
      await firstValueFrom(this.emailService.deleteAccount(this.accountToDelete.id));
      this.toast.success(this.translocoService.translate('emailAccounts.toast.accountDeleted'), this.translocoService.translate('emailAccounts.toast.accountDeletedMsg'));
      this.showDeleteConfirm.set(false);
      this.accountToDelete = null;
      await this.loadAccounts();
    } catch (err: any) {
      this.toast.error(this.translocoService.translate('emailAccounts.toast.errorDeletingAccount'), err.message || this.translocoService.translate('emailAccounts.toast.accountDeletedMsg'));
      console.error(err);
    } finally {
      this.deletingAccount.set(false);
    }
  }

  async setAsPrimary(account: CompanyEmailAccount) {
    if (!this.companyId) return;

    try {
      await firstValueFrom(
        this.emailService.setPrimaryAccount(account.id, this.companyId)
      );
      this.toast.success(this.translocoService.translate('emailAccounts.toast.primaryUpdated'), '');
      await this.loadAccounts();
    } catch (err: any) {
      this.toast.error(this.translocoService.translate('emailAccounts.toast.errorSettingPrimary'), '');
      console.error(err);
    }
  }

  async toggleAccountActive(account: CompanyEmailAccount) {
    try {
      await firstValueFrom(
        this.emailService.updateAccount(account.id, { is_active: !account.is_active })
      );
      await this.loadAccounts();
    } catch (err: any) {
      this.toast.error(this.translocoService.translate('emailAccounts.toast.errorChangingStatus'), '');
      console.error(err);
    }
  }

  async verifyAccount(account: CompanyEmailAccount) {
    if (!this.companyId) return;
    this.verifyingAccountId = account.id;
    try {
      const result = await this.emailService.getEmailActivationStatus(this.companyId, account.id);

      const status = result.data?.verification_status;
      if (status === 'verified') {
        this.toast.success(this.translocoService.translate('emailAccounts.toast.verificationComplete'), this.translocoService.translate('emailAccounts.toast.verificationCompleteMsg'));
      } else if (status === 'verifying') {
        this.toast.info(this.translocoService.translate('emailAccounts.toast.verificationInProgress'), this.translocoService.translate('emailAccounts.toast.verificationInProgressMsg'));
      } else {
        this.toast.warning(this.translocoService.translate('emailAccounts.toast.verificationPending'), this.translocoService.translate('emailAccounts.toast.verificationPendingMsg'));
      }
      await this.loadAccounts();
    } catch (err: any) {
      this.toast.error(this.translocoService.translate('emailAccounts.toast.errorVerifying'), '');
      console.error(err);
    } finally {
      this.verifyingAccountId = null;
    }
  }

  // ==========================================
  // TEST EMAIL
  // ==========================================

  openTestEmailModal(account: CompanyEmailAccount) {
    this.accountToEdit = account;
    this.testEmailForm.reset();
    this.showTestEmailModal.set(true);
  }

  closeTestEmailModal() {
    this.showTestEmailModal.set(false);
    this.testEmailForm.reset();
    this.accountToEdit = null;
  }

  async sendTestEmail() {
    if (!this.testEmailForm.valid || !this.accountToEdit) return;

    this.sendingTestEmail.set(true);
    try {
      await firstValueFrom(
        this.emailService.sendTestEmail(
          this.accountToEdit.id,
          this.testEmailForm.value.recipientEmail
        )
      );
      this.toast.success(this.translocoService.translate('emailAccounts.toast.testEmailSent'), this.translocoService.translate('emailAccounts.toast.testEmailSentMsg'));
      this.closeTestEmailModal();
    } catch (err: any) {
      this.toast.error(this.translocoService.translate('emailAccounts.toast.errorSendingTest'), err.message || this.translocoService.translate('emailAccounts.toast.errorSendingTestMsg'));
    } finally {
      this.sendingTestEmail.set(false);
    }
  }

  // ==========================================
  // HELPERS
  // ==========================================

  getStatusBadgeClass(account: CompanyEmailAccount): string {
    if (!account.is_active) {
      return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
    }
    if (account.is_verified) {
      return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
    }
    return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
  }

  getStatusLabel(account: CompanyEmailAccount): string {
    if (!account.is_active) return this.translocoService.translate('emailAccounts.status.inactive');
    if (account.is_verified) return this.translocoService.translate('emailAccounts.status.verified');
    return this.translocoService.translate('emailAccounts.status.pending');
  }

  getVerificationIcon(account: CompanyEmailAccount): string {
    if (!account.is_active) return 'fa-ban';
    if (account.is_verified) return 'fa-check-circle';
    return 'fa-clock';
  }

  getEmailTypeLabel(type: EmailType): string {
    return EMAIL_TYPE_LABELS[type] || type;
  }

  trackByAccountId(index: number, account: CompanyEmailAccount): string {
    return account.id;
  }
}
