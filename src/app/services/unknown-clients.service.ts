import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Row from public.v_clientes_desconocidos.
 * Mirrors the view definition in migration
 * 20260618000026_cliente_desconocido_audit.sql.
 */
export interface UnknownClientRow {
  client_id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  cliente_creado: string;
  booking_id: string | null;
  booking_start: string | null;
  booking_status: string | null;
  professional_id: string | null;
  profesional: string | null;
  dias_sin_reclamar: number;
  claimed_at: string | null;
  claimed_by_user_id: string | null;
  merged_with_client_id: string | null;
  archived_reason: string | null;
  archived_at: string | null;
}

export interface ClaimClientParams {
  p_unknown_client_id: string;
  p_real_client_id?: string | null;
  p_real_name?: string | null;
  p_real_email?: string | null;
  p_real_phone?: string | null;
  p_notes?: string | null;
}

/**
 * Service for the "Cliente Desconocido" reclamation flow.
 *
 * Backed by:
 *   - public.v_clientes_desconocidos  (read-only view)
 *   - public.claim_unknown_client()   (SECURITY DEFINER RPC)
 *   - public.client_unclaimed_days()  (helper)
 */
@Injectable({ providedIn: 'root' })
export class UnknownClientsService {
  private sbClient = inject(SupabaseClientService);
  private authService = inject(AuthService);
  private supabase: SupabaseClient = this.sbClient.instance;

  /**
   * Load the list of pending Desconocido clients for the current company.
   * Filtering by company_id is delegated to the SECURITY INVOKER view +
   * RLS — we just pass the company as an extra safety belt.
   */
  async listPending(companyId?: string | null): Promise<UnknownClientRow[]> {
    const cid = companyId ?? this.authService.companyId();
    let query = this.supabase
      .from('v_clientes_desconocidos')
      .select('*')
      .order('cliente_creado', { ascending: false });

    if (cid) {
      query = query.eq('company_id', cid);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`v_clientes_desconocidos: ${error.message}`);
    }
    return (data ?? []) as UnknownClientRow[];
  }

  /**
   * Count the pending Desconocido clients (for dashboard widget KPI).
   */
  async countPending(companyId?: string | null): Promise<number> {
    const cid = companyId ?? this.authService.companyId();
    let query = this.supabase
      .from('v_clientes_desconocidos')
      .select('client_id', { count: 'exact', head: true });

    if (cid) {
      query = query.eq('company_id', cid);
    }

    const { count, error } = await query;
    if (error) {
      console.error('countPending v_clientes_desconocidos', error);
      return 0;
    }
    return count ?? 0;
  }

  /**
   * Live-search a real client within the current company, by name/email/phone.
   * Used in the claim modal's autocomplete.
   *
   * Excludes the Desconocido itself and any soft-deleted records.
   */
  async searchRealClients(
    search: string,
    excludeClientId?: string,
    limit = 10,
  ): Promise<{ id: string; name: string; email: string | null; phone: string | null }[]> {
    const cid = this.authService.companyId();
    if (!cid) return [];

    const term = search.trim();
    if (term.length < 2) return [];

    const escaped = term.replace(/[%_]/g, (m) => `\\${m}`);
    const pattern = `%${escaped}%`;

    let query = this.supabase
      .from('clients')
      .select('id, name, email, phone')
      .eq('company_id', cid)
      .is('deleted_at', null)
      .or(`name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
      .order('name', { ascending: true })
      .limit(limit);

    if (excludeClientId) {
      query = query.neq('id', excludeClientId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('searchRealClients', error);
      return [];
    }
    return (data ?? []) as { id: string; name: string; email: string | null; phone: string | null }[];
  }

  /**
   * Days the given Desconocido client has been unclaimed.
   */
  async unclaimedDays(clientId: string): Promise<number | null> {
    const { data, error } = await this.supabase.rpc('client_unclaimed_days', {
      p_client_id: clientId,
    });
    if (error) {
      console.error('client_unclaimed_days', error);
      return null;
    }
    return typeof data === 'number' ? data : null;
  }

  /**
   * Invoke the claim_unknown_client() RPC.
   * Returns the final client id (same as the real client if MERGE mode,
   * or the Desconocido itself if CONVERT mode).
   */
  async claim(params: ClaimClientParams): Promise<string> {
    const { data, error } = await this.supabase.rpc('claim_unknown_client', {
      p_unknown_client_id: params.p_unknown_client_id,
      p_real_client_id: params.p_real_client_id ?? null,
      p_real_name: params.p_real_name ?? null,
      p_real_email: params.p_real_email ?? null,
      p_real_phone: params.p_real_phone ?? null,
      p_notes: params.p_notes ?? null,
    });
    if (error) {
      throw new Error(error.message);
    }
    return data as string;
  }
}