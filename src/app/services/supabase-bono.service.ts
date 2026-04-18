import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';
import { ClientBono, UseBonoResult, CreateBonoPayload } from '../models/bono.models';

@Injectable({ providedIn: 'root' })
export class SupabaseBonoService {
  private supabase = inject(SupabaseClientService).getClient();
  private auth = inject(AuthService);

  /**
   * Get all bonos for a client (filtered by company membership via RLS + RPC).
   */
  async getClientBonuses(clientId: string): Promise<ClientBono[]> {
    const { data, error } = await this.supabase
      .rpc('get_client_bonuses', { p_client_id: clientId });

    if (error) throw error;
    return (data ?? []) as ClientBono[];
  }

  /**
   * Create a new bono when a booking with a bono variant is confirmed + paid.
   */
  async createBono(payload: CreateBonoPayload): Promise<ClientBono> {
    const { data, error } = await this.supabase.rpc('create_client_bono', {
      p_client_id: payload.client_id,
      p_variant_id: payload.variant_id,
      p_service_id: payload.service_id,
      p_company_id: payload.company_id,
      p_sessions_total: payload.sessions_total,
      p_expires_at: payload.expires_at ?? null,
    });

    if (error) throw error;
    return data as ClientBono;
  }

  /**
   * Use / deduct sessions from a bono when a booking is confirmed.
   * Finds the oldest active bono with enough remaining sessions.
   */
  async useBono(
    clientId: string,
    variantId: string,
    serviceId: string,
    companyId: string,
    sessionsToUse = 1
  ): Promise<UseBonoResult> {
    const { data, error } = await this.supabase.rpc('use_client_bono', {
      p_client_id: clientId,
      p_variant_id: variantId,
      p_service_id: serviceId,
      p_company_id: companyId,
      p_sessions_to_use: sessionsToUse,
    });

    if (error) throw error;
    // RPC returns TABLE(...) — single row
    const row = Array.isArray(data) ? data[0] : data;
    return row as UseBonoResult;
  }
}
