import { Injectable, inject } from '@angular/core';
import { from, Observable } from 'rxjs';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';

export type ConvertPolicy = 'manual' | 'automatic' | 'scheduled';

export interface AppSettings {
  id?: string;
  default_convert_policy?: ConvertPolicy;
  ask_before_convert?: boolean;
  enforce_globally?: boolean;
  default_invoice_delay_days?: number | null;
  updated_at?: string;
}

export interface CompanySettings {
  company_id: string;
  convert_policy?: ConvertPolicy | null;
  ask_before_convert?: boolean | null;
  enforce_company_defaults?: boolean | null;
  default_invoice_delay_days?: number | null;
  invoice_on_date?: string | null; // ISO date
  deposit_percentage?: number | null;
  updated_at?: string;
}

@Injectable({ providedIn: 'root' })
export class SupabaseSettingsService {
  private supabaseClient = inject(SupabaseClientService);
  private auth = inject(AuthService);

  // Global app settings (single row)
  getAppSettings(): Observable<AppSettings | null> {
    return from(this.executeGetAppSettings());
  }

  private async executeGetAppSettings(): Promise<AppSettings | null> {
    const client = this.supabaseClient.instance;
    const { data, error } = await client.from('app_settings').select('*').limit(1).maybeSingle();
    if (error) throw error;
    return (data || null) as AppSettings | null;
  }

  upsertAppSettings(values: Partial<AppSettings>): Observable<AppSettings> {
    return from(this.executeUpsertAppSettings(values));
  }

  private async executeUpsertAppSettings(values: Partial<AppSettings>): Promise<AppSettings> {
    const client = this.supabaseClient.instance;
    // Try fetch existing row
    const { data: existing } = await client.from('app_settings').select('*').limit(1).maybeSingle();
    if (existing) {
      const { data, error } = await client.from('app_settings').update({ ...values }).eq('id', existing.id).select('*').single();
      if (error) throw error;
      return data as AppSettings;
    } else {
      const { data, error } = await client.from('app_settings').insert({ ...values }).select('*').single();
      if (error) throw error;
      return data as AppSettings;
    }
  }

  // Company-level settings
  getCompanySettings(companyId?: string): Observable<CompanySettings | null> {
    return from(this.executeGetCompanySettings(companyId));
  }

  private async executeGetCompanySettings(companyId?: string): Promise<CompanySettings | null> {
    const cid = companyId || this.auth.companyId();
    if (!cid) throw new Error('No company ID available');
    const client = this.supabaseClient.instance;
    const { data, error } = await client.from('company_settings').select('*').eq('company_id', cid).maybeSingle();
    if (error && error.code !== 'PGRST116') throw error; // ignore not found
    return (data || { company_id: cid }) as CompanySettings;
  }

  upsertCompanySettings(values: Partial<CompanySettings>, companyId?: string): Observable<CompanySettings> {
    return from(this.executeUpsertCompanySettings(values, companyId));
  }

  private async executeUpsertCompanySettings(values: Partial<CompanySettings>, companyId?: string): Promise<CompanySettings> {
    const cid = companyId || this.auth.companyId();
    if (!cid) throw new Error('No company ID available');
    const client = this.supabaseClient.instance;
    const payload = { ...values, company_id: cid };
    const { data, error } = await client.from('company_settings').upsert(payload, { onConflict: 'company_id' }).select('*').single();
    if (error) throw error;
    return data as CompanySettings;
  }
}
