import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../services/auth.service';
import { ToastService } from '../../../../services/toast.service';
import { CompanyEmailService } from '../../../../services/company-email.service';
import { CompanyEmailAccount } from '../../../../models/company-email.models';
import { EmailConfigService } from './email-config.service';

interface GoogleOAuthState {
  status: 'idle' | 'connecting' | 'connected' | 'error';
  errorMessage?: string;
  lastConnectedAt?: string;
}

type AuthTab = 'oauth2' | 'smtp';

@Component({
  selector: 'app-email-config',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './email-config.component.html',
  styleUrls: ['./email-config.component.scss'],
})
export class EmailConfigComponent implements OnInit {
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private emailService = inject(CompanyEmailService);
  private configService = inject(EmailConfigService);
  private translocoService = inject(TranslocoService);
  private fb = inject(FormBuilder);

  // ── State signals ────────────────────────────────────────────────
  accounts = signal<CompanyEmailAccount[]>([]);
  selectedAccount = signal<CompanyEmailAccount | null>(null);
  loadingAccounts = signal(false);

  // OAuth2 state per account
  oauthStates = signal<Record<string, GoogleOAuthState>>({});

  // Active auth tab
  activeTab = signal<AuthTab>('oauth2');

  // Test email
  testEmailModalOpen = signal(false);
  testEmailRecipient = signal('');
  sendingTestEmail = signal(false);

  // SMTP form
  smtpForm!: FormGroup;

  // ── Computed ────────────────────────────────────────────────────
  selectedAccountOAuthStatus = computed((): GoogleOAuthState => {
    const id = this.selectedAccount()?.id;
    return id ? (this.oauthStates()[id] ?? { status: 'idle' }) : { status: 'idle' };
  });

  googleWorkspaceAccounts = computed(() =>
    this.accounts().filter((a) => a.provider_type === 'google_workspace')
  );

  // ── Lifecycle ───────────────────────────────────────────────────
  async ngOnInit() {
    this.initSMTPForm();
    await this.loadAccounts();
  }

  private initSMTPForm() {
    this.smtpForm = this.fb.group({
      smtp_host: ['smtp-relay.gmail.com', Validators.required],
      smtp_port: [587, [Validators.required, Validators.min(1), Validators.max(65535)]],
      smtp_user: ['', Validators.required],
      smtp_password: ['', Validators.required],
    });
  }

  // ── Data loading ────────────────────────────────────────────────
  async loadAccounts() {
    const profile = await firstValueFrom(this.auth.userProfile$);
    const companyId = profile?.company_id;
    if (!companyId) return;

    this.loadingAccounts.set(true);
    try {
      const accounts = await firstValueFrom(
        this.configService.getGoogleWorkspaceAccounts(companyId)
      );
      this.accounts.set(accounts);

      // Auto-select first account if none selected
      if (!this.selectedAccount() && accounts.length > 0) {
        this.selectedAccount.set(accounts[0]);
      }

      // Initialize OAuth states
      const states: Record<string, GoogleOAuthState> = {};
      for (const account of accounts) {
        const isOAuth = account.auth_method === 'oauth2' && !!account.oauth_refresh_token;
        states[account.id] = isOAuth
          ? { status: 'connected', lastConnectedAt: account.updated_at }
          : { status: 'idle' };
      }
      this.oauthStates.set(states);
    } catch (err: unknown) {
      this.toast.error(
        this.translocoService.translate('emailConfig.toast.errorLoading'),
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      this.loadingAccounts.set(false);
    }
  }

  // ── OAuth2 Flow ─────────────────────────────────────────────────
  async connectWithGoogle(account: CompanyEmailAccount) {
    this.oauthStates.update((s) => ({
      ...s,
      [account.id]: { status: 'connecting' as const },
    }));

    try {
      await this.configService.openGoogleOAuthPopup(account.id);
      // Success — reload account to get updated state
      await this.loadAccounts();
      this.oauthStates.update((s) => ({
        ...s,
        [account.id]: {
          status: 'connected' as const,
          lastConnectedAt: new Date().toISOString(),
        },
      }));
      this.toast.success(
        this.translocoService.translate('emailConfig.toast.oauthConnected'),
        this.translocoService.translate('emailConfig.toast.oauthConnectedMsg')
      );
    } catch (err: unknown) {
      this.toast.error(
        this.translocoService.translate('emailConfig.toast.errorSettingPrimary'),
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // ── SMTP Configuration ──────────────────────────────────────────
  async saveSMTPConfig(account: CompanyEmailAccount) {
    if (!this.smtpForm.valid) return;

    const { smtp_host, smtp_port, smtp_user, smtp_password } = this.smtpForm.value;
    this.sendingTestEmail.set(true);

    try {
      // Provision encrypts and stores the password
      await this.emailService.provisionGoogleWorkspace(account.id, smtp_password);
      // Update other SMTP fields
      await firstValueFrom(
        this.emailService.updateAccount(account.id, {
          smtp_host,
          smtp_port,
          smtp_user,
        })
      );
      this.toast.success(
        this.translocoService.translate('emailConfig.toast.smtpSaved'),
        this.translocoService.translate('emailConfig.toast.smtpSavedMsg')
      );
      await this.loadAccounts();
    } catch (err: unknown) {
      this.toast.error(
        this.translocoService.translate('emailConfig.toast.oauthError'),
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      this.sendingTestEmail.set(false);
    }
  }

  // ── Test Email ──────────────────────────────────────────────────
  openTestEmailModal() {
    this.testEmailRecipient.set('');
    this.testEmailModalOpen.set(true);
  }

  closeTestEmailModal() {
    this.testEmailModalOpen.set(false);
    this.testEmailRecipient.set('');
  }

  async sendTestEmail() {
    const account = this.selectedAccount();
    const recipient = this.testEmailRecipient();
    if (!account || !recipient) return;

    this.sendingTestEmail.set(true);
    try {
      const result = await firstValueFrom(
        this.configService.testAccountEmail(account.id, recipient)
      );
      if (result.success) {
        this.toast.success(
          this.translocoService.translate('emailConfig.toast.testEmailSent'),
          `Sent to ${recipient}`
        );
        this.closeTestEmailModal();
      } else {
        this.toast.error(
          this.translocoService.translate('emailConfig.toast.testEmailFailed'),
          result.error || 'Unknown error'
        );
      }
    } catch (err: unknown) {
      this.toast.error(
        this.translocoService.translate('emailConfig.toast.testEmailFailed'),
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      this.sendingTestEmail.set(false);
    }
  }

  // ── Primary Account ─────────────────────────────────────────────
  async setAsPrimary(account: CompanyEmailAccount) {
    const profile = await firstValueFrom(this.auth.userProfile$);
    const companyId = profile?.company_id;
    if (!companyId) return;

    try {
      await firstValueFrom(
        this.emailService.setPrimaryAccount(account.id, companyId)
      );
      this.toast.success(
        this.translocoService.translate('emailConfig.toast.primaryUpdated'),
        ''
      );
      await this.loadAccounts();
    } catch (err: unknown) {
      this.toast.error(
        this.translocoService.translate('emailConfig.toast.errorSavingSmtp'),
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────
  selectAccount(account: CompanyEmailAccount) {
    this.selectedAccount.set(account);
  }

  getAuthMethodBadgeClass(authMethod: string | undefined): string {
    return authMethod === 'oauth2'
      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
  }

  getAuthMethodLabel(authMethod: string | undefined): string {
    return authMethod === 'oauth2' ? 'Gmail API' : 'SMTP';
  }

  getOAuthStatusIcon(status: GoogleOAuthState['status'] | undefined): string {
    switch (status) {
      case 'connected':
        return 'fa-check-circle text-green-500';
      case 'connecting':
        return 'fa-spinner fa-spin text-yellow-500';
      case 'error':
        return 'fa-times-circle text-red-500';
      default:
        return 'fa-question-circle text-gray-400';
    }
  }

  trackByAccountId(index: number, account: CompanyEmailAccount): string {
    return account.id;
  }
}