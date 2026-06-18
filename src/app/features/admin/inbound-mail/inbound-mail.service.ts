import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { from, Observable } from 'rxjs';

export type InboundStatus = 'pending' | 'verifying' | 'active' | 'failed' | 'inactive';

export interface InboundMailConfig {
  id: string;
  company_id: string;
  domain: string;
  status: InboundStatus;
  ses_rule_name: string | null;
  ses_rule_set_name: string | null;
  mx_record_value: string | null;
  mx_verified: boolean;
  last_provisioned_at: string | null;
  last_error: string | null;
  forward_unknown_to: string | null;
  reject_unknown: boolean;
  spam_action: 'mark' | 'quarantine' | 'reject';
  created_at: string;
  updated_at: string;
}

export interface InboundMailGlobalConfig {
  id: number;
  enabled: boolean;
  sandbox_mode: boolean;
  rule_set_name: string;
  lambda_function_name: string;
  s3_bucket: string;
  ses_region: string;
  default_mx_priority: number;
  max_domains_per_company: number;
  force_global_rule: boolean;
  auto_provision_on_domain_verify: boolean;
}

export interface AwsJob {
  id: string;
  job_type: string;
  company_id: string | null;
  domain: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'dead';
  attempts: number;
  last_error: string | null;
  run_at: string;
  completed_at: string | null;
  created_at: string;
}

/**
 * InboundMailService
 * ----------------------------------------------------------------
 * Centralizes all inbound mail provisioning actions for the Webmail:
 *  - Read/write the per-company config (inbound_mail_config)
 *  - Read the global config (inbound_mail_global_config)
 *  - Trigger /start, /disable, /status, /healthcheck via the
 *    ses-inbound-provision edge function
 *  - Read aws_jobs queue state for the superadmin dashboard
 */
@Injectable({ providedIn: 'root' })
export class InboundMailService {
  private supabase = inject(SupabaseClientService).instance;

  /** List all inbound configs for the current user's company */
  async listMyCompany(): Promise<InboundMailConfig[]> {
    const { data, error } = await this.supabase
      .from('inbound_mail_config')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as InboundMailConfig[];
  }

  /** Get one config by (companyId, domain) */
  async getOne(companyId: string, domain: string): Promise<InboundMailConfig | null> {
    const { data, error } = await this.supabase
      .from('inbound_mail_config')
      .select('*')
      .eq('company_id', companyId)
      .eq('domain', domain)
      .maybeSingle();
    if (error) throw error;
    return data as InboundMailConfig | null;
  }

  /** Update the owner-editable behavior fields of one config */
  async updateBehavior(
    companyId: string,
    domain: string,
    patch: {
      forward_unknown_to?: string | null;
      reject_unknown?: boolean;
      spam_action?: 'mark' | 'quarantine' | 'reject';
    },
  ): Promise<InboundMailConfig> {
    const { data, error } = await this.supabase
      .from('inbound_mail_config')
      .update(patch)
      .eq('company_id', companyId)
      .eq('domain', domain)
      .select()
      .single();
    if (error) throw error;
    return data as InboundMailConfig;
  }

  /** Trigger (re)provisioning of inbound mail for a domain */
  async startProvisioning(
    companyId: string,
    domain: string,
  ): Promise<{ success: boolean; status: InboundStatus; warnings?: string[]; error?: string }> {
    const { data, error } = await this.supabase.functions.invoke(
      'ses-inbound-provision/start',
      { body: { companyId, domain } },
    );
    if (error) throw error;
    return data?.data ?? data;
  }

  /** Disable (soft-delete) inbound for a domain */
  async disable(
    companyId: string,
    domain: string,
  ): Promise<{ success: boolean; status: InboundStatus }> {
    const { data, error } = await this.supabase.functions.invoke(
      'ses-inbound-provision/disable',
      { body: { companyId, domain } },
    );
    if (error) throw error;
    return data?.data ?? data;
  }

  /** Get the current state of one config (no AWS call) */
  async status(
    companyId: string,
    domain: string,
  ): Promise<InboundMailConfig | null> {
    return this.getOne(companyId, domain);
  }

  // ── Superadmin-only ─────────────────────────────────────────────────────

  async getGlobalConfig(): Promise<InboundMailGlobalConfig | null> {
    const { data, error } = await this.supabase
      .rpc('get_inbound_mail_global_config');
    if (error) throw error;
    return data as InboundMailConfig as unknown as InboundMailGlobalConfig | null;
  }

  async updateGlobalConfig(
    patch: Partial<InboundMailGlobalConfig>,
  ): Promise<InboundMailGlobalConfig> {
    const { data, error } = await this.supabase
      .from('inbound_mail_global_config')
      .update(patch)
      .eq('id', 1)
      .select()
      .single();
    if (error) throw error;
    return data as InboundMailGlobalConfig;
  }

  async runHealthcheck(): Promise<{
    ok: number; drifted: number; missing: number; details: any[];
  }> {
    const { data, error } = await this.supabase.functions.invoke(
      'ses-inbound-provision/healthcheck',
      { body: {} },
    );
    if (error) throw error;
    return data?.data ?? data;
  }

  async listAllConfigs(): Promise<InboundMailConfig[]> {
    const { data, error } = await this.supabase
      .from('inbound_mail_config')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as InboundMailConfig[];
  }

  async listAwsJobs(limit = 50): Promise<AwsJob[]> {
    const { data, error } = await this.supabase
      .from('aws_jobs')
      .select('id, job_type, company_id, domain, status, attempts, last_error, run_at, completed_at, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as AwsJob[];
  }

  /** Convert the service to an observable for reactive components */
  toObservable<T>(promise: Promise<T>): Observable<T> {
    return from(promise);
  }
}
