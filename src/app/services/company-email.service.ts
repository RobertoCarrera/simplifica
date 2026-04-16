import { Injectable, inject } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseClientService } from './supabase-client.service';
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

  createAccount(account: CreateEmailAccountDto): Observable<CompanyEmailAccount> {
    return from(
      this.supabase.from('company_email_accounts').insert(account).select().single()
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

  verifyAccount(id: string): Observable<VerificationResult> {
    return from(
      this.supabase.rpc('verify_company_email_account', { p_account_id: id })
    ).pipe(
      map((res) => {
        if (res.error) throw res.error;
        return res.data as VerificationResult;
      }),
      catchError((err) => throwError(() => err))
    );
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
    bodyTemplate: string
  ): Observable<CompanyEmailSetting> {
    return from(
      this.supabase
        .from('company_email_settings')
        .update({
          custom_subject_template: subjectTemplate,
          custom_body_template: bodyTemplate,
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
