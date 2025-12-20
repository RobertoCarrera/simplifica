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
  // Global tax defaults
  default_prices_include_tax?: boolean | null;
  default_iva_enabled?: boolean | null;
  default_iva_rate?: number | null; // 0, 4, 10, 21
  default_irpf_enabled?: boolean | null;
  default_irpf_rate?: number | null; // e.g., 7, 15
  default_auto_send_quote_email?: boolean | null;
  default_auto_convert_on_client_accept?: boolean | null; // Auto-finalize when client accepts request
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
  auto_send_quote_email?: boolean | null;
  auto_convert_on_client_accept?: boolean | null; // Auto-finalize when client accepts request
  allow_direct_contracting?: boolean | null; // New automation setting
  copy_features_between_variants?: boolean | null; // New automation setting
  ticket_stage_on_delete?: string | null; // UUID
  ticket_stage_on_staff_reply?: string | null; // UUID
  ticket_stage_on_client_reply?: string | null; // UUID
  // Advanced Ticket Configs
  ticket_client_view_estimated_hours?: boolean | null;
  ticket_client_can_close?: boolean | null;
  ticket_client_can_create_devices?: boolean | null;
  ticket_default_internal_comment?: boolean | null;
  ticket_auto_assign_on_reply?: boolean | null;
  allow_local_payment?: boolean | null; // Allow clients to select "pay in person/cash" option
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
    const { data, error } = await client
      .from('app_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching app settings (using defaults):', error);
      // Return sensible defaults if user doesn't have permission or other error
      return {
        default_prices_include_tax: true,
        default_iva_enabled: true,
        default_iva_rate: 21,
        default_irpf_enabled: false,
        default_irpf_rate: 15
      };
    }
    return data as AppSettings | null;
  }

  upsertAppSettings(values: Partial<AppSettings>): Observable<AppSettings> {
    return from(this.executeUpsertAppSettings(values));
  }

  private async executeUpsertAppSettings(values: Partial<AppSettings>): Promise<AppSettings> {
    const client = this.supabaseClient.instance;
    const existing = await this.executeGetAppSettings();

    let result;
    if (existing?.id) {
      result = await client
        .from('app_settings')
        .update(values)
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      result = await client
        .from('app_settings')
        .insert(values)
        .select()
        .single();
    }

    if (result.error) throw result.error;
    return result.data as AppSettings;
  }

  // Company-level settings
  getCompanySettings(companyId?: string): Observable<CompanySettings | null> {
    return from(this.executeGetCompanySettings(companyId));
  }

  private async executeGetCompanySettings(companyId?: string): Promise<CompanySettings | null> {
    const cid = companyId || this.auth.companyId();
    if (!cid) return null;

    const client = this.supabaseClient.instance;
    const { data, error } = await client
      .from('company_settings')
      .select('*')
      .eq('company_id', cid)
      .maybeSingle();

    if (error) {
      console.error('Error fetching company settings:', error);
      return null;
    }
    return data as CompanySettings | null;
  }

  updateCompanySettings(values: Partial<CompanySettings>, companyId?: string): Observable<CompanySettings> {
    return this.upsertCompanySettings(values, companyId);
  }

  upsertCompanySettings(values: Partial<CompanySettings>, companyId?: string): Observable<CompanySettings> {
    return from(this.executeUpsertCompanySettings(values, companyId));
  }

  private async executeUpsertCompanySettings(values: Partial<CompanySettings>, companyId?: string): Promise<CompanySettings> {
    const cid = companyId || this.auth.companyId();
    if (!cid) throw new Error('No company ID available');

    const client = this.supabaseClient.instance;

    // Filter out deposit_percentage and updated_at (fields that don't exist or are auto-managed)
    const { deposit_percentage, updated_at, ...cleanValues } = values as any;

    // First, check if a row exists
    const { data: existing, error: checkError } = await client
      .from('company_settings')
      .select('company_id')
      .eq('company_id', cid)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking company settings:', checkError);
    }

    if (existing) {
      // Row exists, do UPDATE without .select() to avoid 406
      const { error: updateError } = await client
        .from('company_settings')
        .update(cleanValues)
        .eq('company_id', cid);

      if (updateError) throw updateError;

      // Fetch the updated row separately
      const { data: updated, error: fetchError } = await client
        .from('company_settings')
        .select('*')
        .eq('company_id', cid)
        .single();

      if (fetchError) throw fetchError;
      return updated as CompanySettings;
    } else {
      // Row doesn't exist, do INSERT
      const { data: inserted, error: insertError } = await client
        .from('company_settings')
        .insert({ ...cleanValues, company_id: cid })
        .select()
        .single();

      if (insertError) throw insertError;
      return inserted as CompanySettings;
    }
  }

  /**
   * Obtiene la política de conversión efectiva para una empresa.
   * Prioriza company_settings sobre app_settings.
   */
  async getEffectiveConvertPolicy(companyId?: string): Promise<{
    policy: ConvertPolicy;
    askBeforeConvert: boolean;
    delayDays: number | null;
    invoiceOnDate: string | null;
  }> {
    const appSettings = await this.executeGetAppSettings();
    const companySettings = await this.executeGetCompanySettings(companyId);

    // Check if global enforcement is enabled
    const enforceGlobally = appSettings?.enforce_globally ?? false;

    // If enforcing globally, ignore company overrides
    if (enforceGlobally) {
      return {
        policy: appSettings?.default_convert_policy ?? 'manual',
        askBeforeConvert: appSettings?.ask_before_convert ?? true,
        delayDays: appSettings?.default_invoice_delay_days ?? null,
        invoiceOnDate: null
      };
    }

    // Otherwise, company settings take precedence if set
    return {
      policy: companySettings?.convert_policy ?? appSettings?.default_convert_policy ?? 'manual',
      askBeforeConvert: companySettings?.ask_before_convert ?? appSettings?.ask_before_convert ?? true,
      delayDays: companySettings?.default_invoice_delay_days ?? appSettings?.default_invoice_delay_days ?? null,
      invoiceOnDate: companySettings?.invoice_on_date ?? null
    };
  }

  /**
   * Obtiene la configuración efectiva de presupuestos
   */
  async getEffectiveQuoteSettings(companyId?: string): Promise<{
    autoSendEmail: boolean;
    autoConvertOnClientAccept: boolean;
  }> {
    const appSettings = await this.executeGetAppSettings();
    const companySettings = await this.executeGetCompanySettings(companyId);

    const enforceGlobally = appSettings?.enforce_globally ?? false;

    if (enforceGlobally) {
      return {
        autoSendEmail: appSettings?.default_auto_send_quote_email ?? false,
        autoConvertOnClientAccept: appSettings?.default_auto_convert_on_client_accept ?? true
      };
    }

    return {
      autoSendEmail: companySettings?.auto_send_quote_email ?? appSettings?.default_auto_send_quote_email ?? false,
      autoConvertOnClientAccept: companySettings?.auto_convert_on_client_accept ?? appSettings?.default_auto_convert_on_client_accept ?? true
    };
  }
}
