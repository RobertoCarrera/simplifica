import { Injectable, inject } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseClientService } from './supabase-client.service';
import { RuntimeConfigService } from './runtime-config.service';
import { EMAIL_SAMPLES, EmailSampleEntry } from '../email-samples';
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
import type { Block } from '../features/admin/email-accounts/template-editor-dialog/blocks/block-types';

/**
 * Typed error surfaced by `previewTemplate` when the underlying RPC rejects
 * with Postgres `42501 insufficient_privilege`. The dialog's error handler
 * matches on `code === '42501'` (raw) before re-throwing as this class so
 * callers can branch on `err instanceof ForbiddenPreviewError`.
 */
export class ForbiddenPreviewError extends Error {
  override readonly name = 'ForbiddenPreviewError';
  constructor(public readonly original: unknown) {
    super('Forbidden to preview this template');
  }
}

/**
 * Optional per-type defaults passed to `upsertTemplate`. `email_account_id`
 * is nullable so the dialog can pre-seed an un-bound row when no account
 * has been assigned yet (the row becomes visible in the settings list
 * immediately and can be wired to an account later).
 */
export interface UpsertTemplateDefaults {
  is_active?: boolean;
  email_account_id?: string | null;
}

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

  /**
   * PR2a (email-block-editor): persist the typed block array as
   * `custom_blocks` JSONB. Called by the BlockEditorComponent's
   * auto-migrate flow (in PR2b) and by the `saved` event handler in
   * TemplateEditorDialogComponent. Does NOT touch the legacy
   * custom_body_template / custom_button_text columns — those stay
   * untouched for rollback safety per spec id 1945 §9.
   *
   * `settingId` is the company_email_settings.id row identifier
   * (caller supplies — typically from the dialog's `data.setting`).
   */
  updateCustomBlocks(
    settingId: string,
    blocks: Block[],
  ): Observable<CompanyEmailSetting> {
    return from(
      this.supabase
        .from('company_email_settings')
        .update({
          custom_blocks: blocks,
          updated_at: new Date().toISOString(),
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

  // ==========================================
  // PR2a — preview + auto-upsert + sample data
  // (email-customization-faithful-preview/pr2-editor)
  // ==========================================

  /**
   * Live-preview RPC consumer. Calls the SECURITY DEFINER RPC
   * `preview_email_template(...)` and unwraps the `table(html, sample_data)`
   * response into a single emission. Re-throws errors so the dialog can
   * branch on `err.code === '42501'` (typed `ForbiddenPreviewError`).
   */
  previewTemplate(
    companyId: string,
    emailType: EmailType,
    sampleData: Record<string, unknown>,
    customFields: {
      custom_subject?: string;
      custom_body?: string;
      custom_header?: string;
      custom_button_text?: string;
      custom_blocks?: Block[] | null;
    }
  ): Observable<{ html: string; sampleData: Record<string, unknown> }> {
    return from(
      this.supabase.rpc('preview_email_template', {
        p_company_id: companyId,
        p_email_type: emailType,
        p_sample_data: sampleData,
        p_custom_subject: customFields.custom_subject ?? null,
        p_custom_body: customFields.custom_body ?? null,
        p_custom_header: customFields.custom_header ?? null,
        p_custom_button_text: customFields.custom_button_text ?? null,
        p_custom_blocks: customFields.custom_blocks ?? null,
      })
    ).pipe(
      map((res) => {
        if (res.error) throw res.error;
        const rows = (res.data ?? []) as Array<{
          html: string;
          sample_data: Record<string, unknown>;
        }>;
        const first = rows[0];
        return {
          html: first?.html ?? '',
          sampleData: first?.sample_data ?? sampleData,
        };
      }),
      catchError((err) => {
        const code = (err as { code?: string } | null)?.code;
        if (code === '42501') {
          return throwError(() => new ForbiddenPreviewError(err));
        }
        // P0001 (Postgres raise_exception) — surface err.details so the
        // dialog can localize block-level validation errors. The dialog's
        // error handler parses err.details JSON for { block_index, block_type, prop }.
        if (code === 'P0001') {
          return throwError(() => err);
        }
        return throwError(() => err);
      })
    );
  }

  /**
   * PR2a (email-block-editor): fetch the per-type default HTML so the
   * BlockEditorComponent can auto-seed the canvas with parsed blocks on
   * first open. Calls the SECURITY DEFINER RPC `default_email_body(text)`
   * added in PR1 (migration lines 320-398).
   *
   * Single argument by design (Fix 6 in design id 1946): defaults are not
   * company-scoped, they depend only on the email type. The Angular client
   * parses the returned HTML into a Block[] via `defaultHtmlToBlocks()`.
   *
   * @param emailType one of the 26 EmailType values
   * @returns Observable<string> raw HTML string (parsed upstream)
   */
  getDefaultBody(emailType: EmailType): Observable<string> {
    return from(
      this.supabase.rpc('default_email_body', {
        p_email_type: emailType,
      })
    ).pipe(
      map((res) => {
        if (res.error) throw res.error;
        // RPC returns text directly; fall back to '' when null/undefined.
        return (res.data ?? '') as string;
      }),
      catchError((err) => throwError(() => err))
    );
  }

  /**
   * UPSERT wrapper for `(company_id, email_type)` rows. Defaults
   * `is_active = true` and `email_account_id = null` so the dialog can
   * pre-seed an un-bound row when the admin clicks the pen for a type
   * without an existing setting.
   *
   * Single-row select so consumers always receive a `CompanyEmailSetting`
   * (not an array).
   */
  upsertTemplate(
    companyId: string,
    emailType: EmailType,
    defaults: UpsertTemplateDefaults = {}
  ): Observable<CompanyEmailSetting> {
    const payload: Record<string, unknown> = {
      company_id: companyId,
      email_type: emailType,
      is_active: defaults.is_active ?? true,
      email_account_id: defaults.email_account_id ?? null,
    };

    return from(
      this.supabase
        .from('company_email_settings')
        .upsert(payload, { onConflict: 'company_id,email_type' })
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

  /**
   * Static re-export of the 26-entry sample-data matrix. The mirror lives
   * in `src/app/email-samples.ts` (TS port of `supabase/email-samples.json`).
   * `getSampleFor` returns the `sample_data` payload for a given type, or
   * `{}` when the type is unknown (defensive default — never throws).
   */
  readonly emailSamples: Readonly<Record<EmailType, EmailSampleEntry>> =
    EMAIL_SAMPLES as Readonly<Record<EmailType, EmailSampleEntry>>;

  getSampleFor(type: EmailType): Record<string, unknown> {
    const entry = EMAIL_SAMPLES[type];
    return (entry?.sample_data ?? {}) as Record<string, unknown>;
  }

  // ==========================================
  // GOOGLE OAUTH2
  // ==========================================

  /**
   * Get Google OAuth2 authorization URL for a given account.
   * GET /functions/v1/company-email-accounts/google-auth-url?account_id=X
   */
  getGoogleAuthUrl(accountId: string): Observable<string> {
    return from(this.getGoogleAuthUrlImpl(accountId));
  }

  private async getGoogleAuthUrlImpl(accountId: string): Promise<string> {
    const { data: { session } } = await this.supabase.auth.getSession();
    const token = session?.access_token;
    const url = `${this.edgeFunctionsBaseUrl}/company-email-accounts/google-auth-url?account_id=${accountId}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || json.message || 'Failed to get Google auth URL');
    return json.data.auth_url;
  }

  /**
   * Handle OAuth2 callback — exchange code for tokens.
   * POST /functions/v1/company-email-accounts/google-callback
   */
  handleOAuthCallback(code: string, state: string, accountId: string): Observable<void> {
    return from(this.handleOAuthCallbackImpl(code, state, accountId));
  }

  private async handleOAuthCallbackImpl(code: string, state: string, accountId: string): Promise<void> {
    const { data: { session } } = await this.supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`${this.edgeFunctionsBaseUrl}/company-email-accounts/google-callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ code, state, account_id: accountId }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || json.message || 'OAuth callback failed');
  }

  /**
   * Send a test email from a specific Google Workspace account.
   * POST /functions/v1/company-email-accounts/:id/test
   */
  testAccountEmail(
    accountId: string,
    recipientEmail: string
  ): Observable<{ success: boolean; error?: string }> {
    return from(this.testAccountEmailImpl(accountId, recipientEmail));
  }

  private async testAccountEmailImpl(
    accountId: string,
    recipientEmail: string
  ): Promise<{ success: boolean; error?: string }> {
    const { data: { session } } = await this.supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(
      `${this.edgeFunctionsBaseUrl}/company-email-accounts/${accountId}/test`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ recipient_email: recipientEmail }),
      }
    );
    const json = await res.json();
    if (!json.success) {
      return { success: false, error: json.error?.message || json.error || 'Test email failed' };
    }
    return { success: true };
  }
}
