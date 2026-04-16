import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
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
      this.toast.error('Error', 'No se pudieron cargar las cuentas de email');
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
    this.toast.success('Éxito', 'Cuenta guardada correctamente');
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
      this.toast.success('Éxito', 'Cuenta eliminada');
      this.showDeleteConfirm.set(false);
      this.accountToDelete = null;
      await this.loadAccounts();
    } catch (err: any) {
      this.toast.error('Error', 'No se pudo eliminar la cuenta');
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
      this.toast.success('Éxito', 'Cuenta principal actualizada');
      await this.loadAccounts();
    } catch (err: any) {
      this.toast.error('Error', 'No se pudo establecer como principal');
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
      this.toast.error('Error', 'No se pudo cambiar el estado');
      console.error(err);
    }
  }

  async verifyAccount(account: CompanyEmailAccount) {
    this.verifyingAccountId = account.id;
    try {
      const result = await firstValueFrom(this.emailService.verifyAccount(account.id));
      
      const spfOk = result.spf?.status === 'verified' || result.spf?.status === 'success';
      const dkimOk = result.dkim?.status === 'verified' || result.dkim?.status === 'success';
      const dmarcOk = result.dmarc?.status === 'verified' || result.dmarc?.status === 'success';

      if (spfOk && dkimOk && dmarcOk) {
        this.toast.success('Verificación completada', 'Todos los registros DNS están verificados');
      } else {
        let msg = 'Verificación parcial:\n';
        if (!spfOk) msg += `- SPF: ${result.spf?.status}\n`;
        if (!dkimOk) msg += `- DKIM: ${result.dkim?.status}\n`;
        if (!dmarcOk) msg += `- DMARC: ${result.dmarc?.status}\n`;
        msg += '\nConfigura los registros DNS en tu dominio.';
        this.toast.warning('Verificación parcial', msg);
      }

      await this.loadAccounts();
    } catch (err: any) {
      this.toast.error('Error', 'No se pudo verificar la cuenta');
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
      this.toast.success('Email de prueba enviado', 'Revisa la bandeja de entrada');
      this.closeTestEmailModal();
    } catch (err: any) {
      this.toast.error('Error', err.message || 'No se pudo enviar el email de prueba');
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
    if (!account.is_active) return 'Inactiva';
    if (account.is_verified) return 'Verificada';
    return 'Pendiente';
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
