import { Injectable, inject } from '@angular/core';
import { from, Observable } from 'rxjs';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

export type ConvertPolicy = 'manual' | 'automatic' | 'scheduled';

export interface AppSettings {
  id?: string;
  default_convert_policy?: ConvertPolicy;
  ask_before_convert?: boolean;
  enforce_globally?: boolean;
  default_invoice_delay_days?: number | null;
  // Global tax defaults
  default_prices_include_tax?: boolean | null;
  default_iva_enabled?: boolean | null;
  default_iva_rate?: number | null; // 0, 4, 10, 21
  default_irpf_enabled?: boolean | null;
  default_irpf_rate?: number | null; // e.g., 7, 15
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
  // Company tax settings (override globals when set)
  prices_include_tax?: boolean | null;
  iva_enabled?: boolean | null;
  iva_rate?: number | null; // 0, 4, 10, 21
  irpf_enabled?: boolean | null;
  irpf_rate?: number | null; // e.g., 7, 15
  updated_at?: string;
}

@Injectable({ providedIn: 'root' })
export class SupabaseSettingsService {
  private supabaseClient = inject(SupabaseClientService);
  private auth = inject(AuthService);
  private get fnBase() { return (environment.edgeFunctionsBaseUrl || '').replace(/\/+$/, ''); }

  // Global app settings (single row)
  getAppSettings(): Observable<AppSettings | null> {
    return from(this.executeGetAppSettings());
  }

  private async executeGetAppSettings(): Promise<AppSettings | null> {
    const client = this.supabaseClient.instance;
    const { data: { session } } = await client.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`${this.fnBase}/app-settings`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_action: 'get_app' })
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) throw new Error(json?.error || 'No se pudieron obtener los ajustes');
    return (json.app || null) as AppSettings | null;
  }

  upsertAppSettings(values: Partial<AppSettings>): Observable<AppSettings> {
    return from(this.executeUpsertAppSettings(values));
  }

  private async executeUpsertAppSettings(values: Partial<AppSettings>): Promise<AppSettings> {
    const client = this.supabaseClient.instance;
    const { data: { session } } = await client.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`${this.fnBase}/app-settings`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_action: 'upsert_app', values })
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) throw new Error(json?.error || 'No se pudieron guardar los ajustes');
    return json.app as AppSettings;
  }

  // Company-level settings
  getCompanySettings(companyId?: string): Observable<CompanySettings | null> {
    return from(this.executeGetCompanySettings(companyId));
  }

  private async executeGetCompanySettings(companyId?: string): Promise<CompanySettings | null> {
    const cid = companyId || this.auth.companyId();
    if (!cid) throw new Error('No company ID available');
    const client = this.supabaseClient.instance;
    const { data: { session } } = await client.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`${this.fnBase}/app-settings`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_action: 'get_company', company_id: cid })
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) throw new Error(json?.error || 'No se pudieron obtener los ajustes de empresa');
    return (json.company || { company_id: cid }) as CompanySettings;
  }

  upsertCompanySettings(values: Partial<CompanySettings>, companyId?: string): Observable<CompanySettings> {
    return from(this.executeUpsertCompanySettings(values, companyId));
  }

  private async executeUpsertCompanySettings(values: Partial<CompanySettings>, companyId?: string): Promise<CompanySettings> {
    const cid = companyId || this.auth.companyId();
    if (!cid) throw new Error('No company ID available');
    const client = this.supabaseClient.instance;
    const { data: { session } } = await client.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`${this.fnBase}/app-settings`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_action: 'upsert_company', company_id: cid, values })
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) throw new Error(json?.error || 'No se pudieron guardar los ajustes de empresa');
    return json.company as CompanySettings;
  }
}
