import { Injectable, inject } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseClientService } from './supabase-client.service';
import { RuntimeConfigService } from './runtime-config.service';
import {
  CompanyEmailAccount,
  CompanyEmailSetting,
  CompanyEmailLog,
  VerificationResult,
  EmailLogFilters,
  CreateEmailAccountDto,
  UpdateEmailAccountDto,
  EmailType,
} from '../models/company-email.models';

@Injectable({ providedIn: 'root' })
export class CompanyEmailService {
  private sbClient = inject(SupabaseClientService);
  private supabase = this.sbClient.instance;
  private cfg = inject(RuntimeConfigService);
  private supabaseUrl = this.cfg.get().supabase.url;
  private edgeFunctionsBaseUrl = this.cfg.get().edgeFunctionsBaseUrl;

  // ==========================================
  // ACCOUNTS
  // ==========================================

  getAccounts(companyId: string): Observable<CompanyEmailAccount[]> {
    return from(
      this.supabase
        .from('company_email_accounts')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
    ).pipe(
      map((res) => {
        if (res.error) throw res.error;
        return res.data as CompanyEmailAccount[];
      }),
      catchError((err) => throwError(() => err))
    );
  }

  createAccount(account: CreateEmailAccountDto, companyId: string): Observable<CompanyEmailAccount> {
    const record: any = {
      company_id: companyId,
      email: `noreply@${account.domain}`,
      display_name: account.display_name,
      ses_from_email: `noreply@${account.domain}`,
      provider: 'ses',
      provider_type: account.provider_type ?? 'ses_shared',
      is_verified: false,
      is_active: true,
    };

    // Google Workspace SMTP fields (password encrypted separately via provisionGoogleWorkspace)
    if (account.provider_type === 'google_workspace') {
      record.smtp_host = account.smtp_host ?? null;
      record.smtp_port = account.smtp_port ?? 587;
      record.smtp_user = account.smtp_user ?? null;
      // Don't store plaintext password — provisionGoogleWorkspace will encrypt it
      record.smtp_encrypted_password = null;
    }

    return from(
      this.supabase.from('company_email_accounts').insert(record).select().single()
    ).pipe(
      map((res) => {
        if (res.error) throw res.error;
        return res.data as CompanyEmailAccount;
      }),
      catchError((err) => throwError(() => err))
    );
  }

  updateAccount(
    id: string,
    updates: UpdateEmailAccountDto
  ): Observable<CompanyEmailAccount> {
    return from(
      this.supabase
        .from('company_email_accounts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map((res) => {
        if (res.error) throw res.error;
        return res.data as CompanyEmailAccount;
      }),
      catchError((err) => throwError(() => err))
    );
  }

  deleteAccount(id: string): Observable<void> {
    return from(
      this.supabase.from('company_email_accounts').delete().eq('id', id)
    ).pipe(
      map((res) => {
        if (res.error) throw res.error;
      }),
      catchError((err) => throwError(() => err))
    );
  }

  verifyAccount(id: string): Observable<any> {
    // Uses getEmailActivationStatus via Edge Function
    // The caller should use getEmailActivationStatus(companyId, id) directly
    // This method kept for backwards compatibility — redirects to Edge Function
    return from(Promise.reject(new Error('Use getEmailActivationStatus(companyId, accountId) instead')));
  }

  /**
   * Start email domain activation (SES + Route53 provisioning).
   * POST /functions/v1/ses-domain-verification/start
   */
  async startEmailActivation(accountId: string, domain: string, companyId: string): Promise<any> {
    const url = `${this.edgeFunctionsBaseUrl}/ses-domain-verification/start`;
    const { data: { session } } = await this.supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ accountId, domain, companyId }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || json.message || 'Activation failed');
    return json;
  }

  /**
   * Provision an isolated IAM user for dedicated SES sending.
   * POST /functions/v1/aws-iam-provision
   */
  async provisionIamUser(accountId: string, domain: string, companyId: string): Promise<any> {
    const url = `${this.edgeFunctionsBaseUrl}/aws-iam-provision`;
    const { data: { session } } = await this.supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ emailAccountId: accountId, domain, companyId }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || json.message || 'IAM provisioning failed');
    return json;
  }

  /**
   * Provision Google Workspace: encrypts SMTP password and stores it.
   * POST /functions/v1/google-workspace-provision
   */
  async provisionGoogleWorkspace(accountId: string, smtpPassword: string): Promise<any> {
    const url = `${this.edgeFunctionsBaseUrl}/google-workspace-provision`;
    const { data: { session } } = await this.supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ emailAccountId: accountId, smtpPassword }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || json.message || 'Google Workspace provisioning failed');
    return json;
  }

  /**
   * Get email activation status (polls SES verification status).
   * GET /functions/v1/ses-domain-verification?companyId=X&accountId=Y
   */
  async getEmailActivationStatus(companyId: string, accountId: string): Promise<any> {
    const url = `${this.edgeFunctionsBaseUrl}/ses-domain-verification?companyId=${companyId}&accountId=${accountId}`;
    const { data: { session } } = await this.supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Status check failed');
    return json;
  }

  setPrimaryAccount(id: string, companyId: string): Observable<void> {
    return from(
      this.supabase.rpc('set_primary_email_account', {
        p_account_id: id,
        p_company_id: companyId,
      })
    ).pipe(
      map((res) => {
        if (res.error) throw res.error;
      }),
      catchError((err) => throwError(() => err))
    );
  }

   /**
    * List Route53 hosted zones (superadmin only).
    * GET /functions/v1/company-email-accounts/route53-domains
    */
  async getRoute53Domains(): Promise<{ name: string; zoneId: string }[]> {
    const { data: { session } } = await this.supabase.auth.getSession();
    const token = session?.access_token ?? '';
    const res = await fetch(`${this.edgeFunctionsBaseUrl}/company-email-accounts/route53-domains`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Error fetching Route53 domains');
    return json.data ?? [];
  }

  /**
   * Get company's verified domains from the domains table.
   * Used as domain selector in email account creation.
   */
  async getCompanyDomains(companyId: string): Promise<{ id: string; domain: string; is_verified: boolean }[]> {
    const { data, error } = await this.supabase
      .from('domains')
      .select('id, domain, is_verified')
      .eq('company_id', companyId)
      .eq('is_verified', true)
      .order('domain');
    if (error) throw error;
    return data ?? [];
  }

  // ==========================================
  // SETTINGS
  // ==========================================

  getSettings(companyId: string): Observable<CompanyEmailSetting[]> {
    return from(
      this.supabase
        .from('company_email_settings')
        .select('*')
        .eq('company_id', companyId)
    ).pipe(
      map((res) => {
        if (res.error) throw res.error;
        return res.data as CompanyEmailSetting[];
      }),
      catchError((err) => throwError(() => err))
    );
  }

  updateSetting(
    companyId: string,
    emailType: EmailType,
    accountId: string
  ): Observable<CompanyEmailSetting> {
    return from(
      this.supabase
        .from('company_email_settings')
        .upsert(
          {
            company_id: companyId,
            email_type: emailType,
            email_account_id: accountId,
          },
          { onConflict: 'company_id,email_type' }
        )
        .select()
        .single()
    ).pipe(
      map((res) => {
        if (res.error) throw res.error;
        return res.data as CompanyEmailSetting;
      }),
      catchError((err) => throwError(() => err))
    );
  }

  updateTemplate(
    settingId: string,
    subjectTemplate: string,
    bodyTemplate: string,
    headerTemplate?: string,
    buttonText?: string,
  ): Observable<CompanyEmailSetting> {
    return from(
      this.supabase
        .from('company_email_settings')
        .update({
          custom_subject_template: subjectTemplate,
          custom_body_template: bodyTemplate,
          custom_header_template: headerTemplate ?? null,
          custom_button_text: buttonText ?? null,
        })
        .eq('id', settingId)
        .select()
        .single()
    ).pipe(
      map((res) => {
        if (res.error) throw res.error;
        return res.data as CompanyEmailSetting;
      }),
      catchError((err) => throwError(() => err))
    );
  }

  toggleSetting(
    settingId: string,
    isActive: boolean
  ): Observable<CompanyEmailSetting> {
    return from(
      this.supabase
        .from('company_email_settings')
        .update({ is_active: isActive })
        .eq('id', settingId)
        .select()
        .single()
    ).pipe(
      map((res) => {
        if (res.error) throw res.error;
        return res.data as CompanyEmailSetting;
      }),
      catchError((err) => throwError(() => err))
    );
  }

  // ==========================================
  // LOGS
  // ==========================================

  getLogs(companyId: string, filters?: EmailLogFilters): Observable<CompanyEmailLog[]> {
    let query = this.supabase
      .from('company_email_logs')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
      .order('sent_at', { ascending: false });

    if (filters?.start_date) {
      query = query.gte('sent_at', filters.start_date);
    }
    if (filters?.end_date) {
      query = query.lte('sent_at', filters.end_date);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.email_type) {
      query = query.eq('email_type', filters.email_type);
    }
    if (filters?.page && filters?.page_size) {
      const from = (filters.page - 1) * filters.page_size;
      query = query.range(from, from + filters.page_size - 1);
    } else {
      query = query.range(0, 49); // Default 50 items
    }

    return from(query).pipe(
      map((res) => {
        if (res.error) throw res.error;
        return res.data as CompanyEmailLog[];
      }),
      catchError((err) => throwError(() => err))
    );
  }

  // ==========================================
  // TEST & PREVIEW
  // ==========================================

  sendTestEmail(accountId: string, toEmail: string): Observable<void> {
    return from(
      this.supabase.rpc('send_test_company_email', {
        p_account_id: accountId,
        p_to_email: toEmail,
      })
    ).pipe(
      map((res) => {
        if (res.error) throw res.error;
      }),
      catchError((err) => throwError(() => err))
    );
  }

  getEmailTemplatePreview(
    companyId: string,
    emailType: string
  ): Observable<string> {
    return from(
      this.supabase.rpc('get_email_template_preview', {
        p_company_id: companyId,
        p_email_type: emailType,
      })
    ).pipe(
      map((res) => {
        if (res.error) throw res.error;
        return res.data as string;
      }),
      catchError((err) => throwError(() => err))
    );
  }
}
