import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { CompanyEmailService } from '../../../services/company-email.service';
import { ToastService } from '../../../services/toast.service';
import {
  CompanyEmailAccount,
  CreateEmailAccountDto,
  UpdateEmailAccountDto,
} from '../../../models/company-email.models';

type ActivationState = 'idle' | 'saving' | 'activating' | 'verifying' | 'success' | 'failed';

@Component({
  selector: 'app-email-account-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslocoPipe],
  templateUrl: './email-account-form.component.html',
  styleUrls: ['./email-account-form.component.scss'],
})
export class EmailAccountFormComponent implements OnInit, OnDestroy {
  @Input() account: CompanyEmailAccount | null = null;
  @Input() companyId: string | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<CompanyEmailAccount>();

  private emailService = inject(CompanyEmailService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);
  private translocoService = inject(TranslocoService);

  form!: FormGroup;
  isEditing = false;

  @Input() isSuperadmin = false;

  // Company's verified domains (from domains table)
  companyDomains = signal<{ id: string; domain: string; is_verified: boolean }[]>([]);
  loadingDomains = signal(false);

  // Activation flow
  activationState = signal<ActivationState>('idle');
  activationSteps = signal({
    domainCreated: false,
    dnsAdded: false,
    verifying: false,
  });
  verificationError = signal<string | null>(null);
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private createdAccountId: string | null = null;

  get saving() { return this.activationState() === 'saving'; }
  get isActivating() { return ['activating', 'verifying'].includes(this.activationState()); }
  get isSuccess() { return this.activationState() === 'success'; }
  get isFailed() { return this.activationState() === 'failed'; }

  ngOnInit() {
    this.isEditing = !!this.account;

    // Load company's verified domains for selector
    if (this.companyId) {
      this.loadCompanyDomains();
    }

    this.form = this.fb.group({
      provider_type: ['ses_shared'],
      domain: [
        this.account?.email ? this.account.email.split('@')[1] : '',
        [Validators.required, Validators.pattern(/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}\.[a-zA-Z]{2,}$/)],
      ],
      display_name: [
        this.account?.display_name || '',
        [Validators.required, Validators.maxLength(100)],
      ],
      // Google Workspace SMTP fields
      smtp_host: [''],
      smtp_port: [587],
      smtp_user: [''],
      smtp_password: [''],
    });

    // Show/hide SMTP fields based on provider type
    this.form.get('provider_type')?.valueChanges.subscribe((type) => {
      const smtpFields = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password'];
      if (type === 'google_workspace') {
        smtpFields.forEach(f => this.form.get(f)?.enable());
      } else {
        smtpFields.forEach(f => this.form.get(f)?.disable());
      }
    });
  }

  ngOnDestroy() {
    this.stopPolling();
  }

  private async loadCompanyDomains() {
    if (!this.companyId) return;
    this.loadingDomains.set(true);
    try {
      const domains = await this.emailService.getCompanyDomains(this.companyId);
      this.companyDomains.set(domains);
    } catch (err: any) {
      console.warn('Could not load company domains:', err.message);
      // Non-fatal — user can still type domain manually
    } finally {
      this.loadingDomains.set(false);
    }
  }

  async onSubmit() {
    if (!this.form.valid || !this.companyId) return;

    this.activationState.set('saving');
    try {
      const formValue = this.form.value;
      const domain = formValue.domain.trim().toLowerCase();
      const providerType = formValue.provider_type || 'ses_shared';

      if (this.isEditing && this.account) {
        const updates: UpdateEmailAccountDto = {
          email: `noreply@${domain}`,
          display_name: formValue.display_name,
        };
        const updated = await firstValueFrom(
          this.emailService.updateAccount(this.account.id, updates)
        );
        this.toast.success(this.translocoService.translate('emailAccountForm.toast.accountUpdated'), this.translocoService.translate('emailAccountForm.toast.accountUpdatedMsg'));
        this.saved.emit(updated);
        this.close.emit();
      } else {
        const newAccount: CreateEmailAccountDto = {
          domain,
          display_name: formValue.display_name,
          provider_type: providerType,
        };

        // Google Workspace: include SMTP credentials
        if (providerType === 'google_workspace') {
          newAccount.smtp_host = formValue.smtp_host;
          newAccount.smtp_port = formValue.smtp_port || 587;
          newAccount.smtp_user = formValue.smtp_user;
          newAccount.smtp_password = formValue.smtp_password;
        }

        const created = await firstValueFrom(
          this.emailService.createAccount(newAccount, this.companyId)
        );
        this.createdAccountId = created.id;

        // ses_iam needs IAM provisioning + DNS verification
        if (providerType === 'ses_iam') {
          this.toast.success(this.translocoService.translate('emailAccountForm.toast.accountCreated'), this.translocoService.translate('emailAccountForm.toast.provisioningMsg'));
          this.saved.emit(created);
          this.activationState.set('activating');
          this.activationSteps.set({ domainCreated: false, dnsAdded: false, verifying: false });
          this.startActivation(domain);
        } else if (providerType === 'google_workspace') {
          // Google Workspace: encrypt SMTP password then mark as ready
          try {
            await this.emailService.provisionGoogleWorkspace(created.id, formValue.smtp_password);
            this.toast.success(this.translocoService.translate('emailAccountForm.toast.success'), this.translocoService.translate('emailAccountForm.toast.googleConfigured'));
            this.saved.emit(created);
            this.activationState.set('success');
            this.close.emit();
          } catch (err: any) {
            this.toast.error(this.translocoService.translate('emailAccountForm.toast.error'), this.translocoService.translate('emailAccountForm.toast.googleConfigError', { error: err.message }));
            this.activationState.set('idle');
          }
        } else {
          // ses_shared: domain verification needed
          this.toast.success(this.translocoService.translate('emailAccountForm.toast.success'), this.translocoService.translate('emailAccountForm.toast.accountCreatedMsg'));
          this.saved.emit(created);
          this.activationState.set('activating');
          this.activationSteps.set({ domainCreated: false, dnsAdded: false, verifying: false });
          this.startActivation(domain);
        }
      }
    } catch (err: any) {
      this.toast.error(this.translocoService.translate('emailAccountForm.toast.error'), err.message ? this.translocoService.translate('emailAccountForm.toast.saveErrorMsg', { error: err.message }) : this.translocoService.translate('emailAccountForm.toast.saveError'));
      console.error(err);
      this.activationState.set('idle');
    }
  }

  private async startActivation(domain: string) {
    if (!this.createdAccountId || !this.companyId) return;

    const providerType = this.form?.value?.provider_type || 'ses_shared';

    try {
      // Step 1: For ses_iam, provision dedicated IAM user first
      if (providerType === 'ses_iam') {
        this.activationSteps.update(s => ({ ...s, domainCreated: true }));
        await this.emailService.provisionIamUser(this.createdAccountId, domain, this.companyId);
      } else {
        // Step 1: Domain created in SES
        this.activationSteps.update(s => ({ ...s, domainCreated: true }));
      }

      // Step 2: DNS records added (happens in Edge Function)
      this.activationSteps.update(s => ({ ...s, dnsAdded: true }));
      this.activationState.set('verifying');

      // Call Edge Function to start provisioning (SES + Route53 DNS)
      await this.emailService.startEmailActivation(this.createdAccountId, domain, this.companyId);

      // Start polling for status
      this.startPolling(domain);
    } catch (err: any) {
      this.verificationError.set(err.message ? this.translocoService.translate('emailAccountForm.activationErrorDetail', { error: err.message }) : this.translocoService.translate('emailAccountForm.activationError'));
      this.activationState.set('failed');
    }
  }

  private startPolling(domain: string) {
    this.stopPolling();
    let pollCount = 0;

    this.pollingInterval = setInterval(async () => {
      pollCount++;

      if (pollCount >= 30) {
        // 5 minutes exceeded
        this.stopPolling();
        this.verificationError.set(this.translocoService.translate('emailAccountForm.verificationTimeout'));
        this.activationState.set('failed');
        return;
      }

      try {
        const status = await this.emailService.getEmailActivationStatus(this.companyId!, this.createdAccountId!);

        if (status.data?.verification_status === 'verified') {
          this.stopPolling();
          this.activationState.set('success');
        } else if (status.data?.verification_status === 'failed') {
          this.stopPolling();
          this.verificationError.set(status.data?.verified_error ? this.translocoService.translate('emailAccountForm.verificationFailedDetail', { error: status.data.verified_error }) : this.translocoService.translate('emailAccountForm.verificationFailed'));
          this.activationState.set('failed');
        }
        // Otherwise keep polling (still 'verifying' or 'pending')
      } catch (err: any) {
        console.warn('Polling error:', err);
      }
    }, 10000); // Poll every 10 seconds
  }

  private stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  retryActivation() {
    this.verificationError.set(null);
    const domain = this.form.get('ses_from_email')?.value || this.form.get('email')?.value;
    if (domain && this.createdAccountId && this.companyId) {
      this.activationState.set('activating');
      this.activationSteps.set({ domainCreated: false, dnsAdded: false, verifying: false });
      this.startActivation(domain);
    }
  }

  onClose() {
    this.stopPolling();
    this.close.emit();
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.form.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }
}
