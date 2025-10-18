import { Injectable, inject } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface TicketStage {
  id: string;
  name: string;
  position: number;
  color: string;
  company_id: string | null; // NULL = generic/system stage
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  is_hidden?: boolean; // Indica si el estado genérico está oculto para la empresa actual
}

export interface HiddenStage {
  id: string;
  company_id: string;
  stage_id: string;
  hidden_at: string;
  hidden_by: string | null;
}

export interface CreateStagePayload {
  name: string;
  position: number;
  color: string;
}

export interface UpdateStagePayload {
  name?: string;
  position?: number;
  color?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseTicketStagesService {
  private supabase: SupabaseClient;
  private authService = inject(AuthService);
  private cachedCompanyId: string | null = null;

  constructor() {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey
    );
  }

  /**
   * Resolve the current user's company_id reliably.
   * It first tries AuthService.userProfile, and if it's not available yet,
   * it falls back to querying the users table using the authenticated user's id.
   * The value is cached for subsequent calls during the session.
   */
  private async resolveCompanyId(): Promise<string | null> {
    // Return cached value if present
    if (this.cachedCompanyId) return this.cachedCompanyId;

    // Try to get from AuthService profile
    const fromProfile = this.authService.userProfile?.company_id || null;
    if (fromProfile) {
      this.cachedCompanyId = fromProfile;
      return fromProfile;
    }

    // Fallback: get auth user and query users table by auth_user_id
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await this.supabase
        .from('users')
        .select('company_id')
        .eq('auth_user_id', user.id)
        .single();

      if (error) {
        console.error('Error resolving company_id from users table:', error);
        return null;
      }

      this.cachedCompanyId = data?.company_id ?? null;
      return this.cachedCompanyId;
    } catch (e) {
      console.error('Exception resolving company_id:', e);
      return null;
    }
  }

  /**
   * Get all available stages for the current user's company
   * Includes both generic stages (company_id IS NULL) and company-specific stages
   */
  async getStages(): Promise<{ data: TicketStage[] | null; error: any }> {
    try {
      const { data, error } = await this.supabase
        .from('ticket_stages')
        .select('*')
        .is('deleted_at', null)
        .order('position', { ascending: true });

      if (error) {
        console.error('Error fetching stages:', error);
        return { data: null, error };
      }

      return { data, error: null };
    } catch (error) {
      console.error('Exception fetching stages:', error);
      return { data: null, error };
    }
  }

  /**
   * Get only generic (system-wide) stages
   * Includes information about which ones are hidden for the current company
   */
  async getGenericStages(): Promise<{ data: TicketStage[] | null; error: any }> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (!session?.access_token) {
        return { data: null, error: { message: 'No active session' } };
      }

      // Llamar a la Edge Function get-config-stages para unificar lógica
      const response = await fetch(
        `${environment.supabase.url}/functions/v1/get-config-stages`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();
      if (!response.ok) {
        console.error('Error fetching config stages via function:', result);
        return { data: null, error: result?.error || result };
      }

      const stages: TicketStage[] = result?.stages || [];
      return { data: stages, error: null };
    } catch (error) {
      console.error('Exception fetching generic stages:', error);
      return { data: null, error };
    }
  }

  /**
   * Reorder generic (system) stages per company via Edge Function overlay.
   * stageIds must be the full ordered list of generic stage IDs.
   */
  async reorderGenericStages(stageIds: string[]): Promise<{ error: any; data?: any }> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (!session?.access_token) return { error: { message: 'No active session' } };

      const resp = await fetch(`${environment.supabase.url}/functions/v1/reorder-stages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stage_ids: stageIds })
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) return { error: json?.error || json };
      return { error: null, data: json };
    } catch (e) {
      return { error: e };
    }
  }

  /**
   * Get only company-specific stages for the current user's company
   */
  async getCompanyStages(): Promise<{ data: TicketStage[] | null; error: any }> {
    try {
      const companyId = await this.resolveCompanyId();
      
      if (!companyId) {
        return { data: [], error: null };
      }

      const { data, error } = await this.supabase
        .from('ticket_stages')
        .select('*')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('position', { ascending: true });

      if (error) {
        console.error('Error fetching company stages:', error);
        return { data: null, error };
      }

      return { data, error: null };
    } catch (error) {
      console.error('Exception fetching company stages:', error);
      return { data: null, error };
    }
  }

  /**
   * Create a new company-specific stage
   * Note: Only company-specific stages can be created (not generic stages)
   */
  async createStage(payload: CreateStagePayload): Promise<{ data: TicketStage | null; error: any }> {
    try {
      const companyId = this.authService.userProfile?.company_id;
      
      if (!companyId) {
        return { 
          data: null, 
          error: { message: 'No company_id found for current user' } 
        };
      }

      const { data, error } = await this.supabase
        .from('ticket_stages')
        .insert({
          ...payload,
          company_id: companyId,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating stage:', error);
        return { data: null, error };
      }

      return { data, error: null };
    } catch (error) {
      console.error('Exception creating stage:', error);
      return { data: null, error };
    }
  }

  /**
   * Update a company-specific stage
   * Note: Generic stages (company_id IS NULL) cannot be updated
   */
  async updateStage(stageId: string, payload: UpdateStagePayload): Promise<{ data: TicketStage | null; error: any }> {
    try {
      const { data, error } = await this.supabase
        .from('ticket_stages')
        .update(payload)
        .eq('id', stageId)
        .select()
        .single();

      if (error) {
        console.error('Error updating stage:', error);
        return { data: null, error };
      }

      return { data, error: null };
    } catch (error) {
      console.error('Exception updating stage:', error);
      return { data: null, error };
    }
  }

  /**
   * Soft delete a company-specific stage
   * Note: Generic stages (company_id IS NULL) cannot be deleted
   */
  async deleteStage(stageId: string): Promise<{ error: any }> {
    try {
      // Hard delete: remove the record entirely
      const { error } = await this.supabase
        .from('ticket_stages')
        .delete()
        .eq('id', stageId);

      if (error) {
        console.error('Error deleting stage:', error);
        return { error };
      }

      return { error: null };
    } catch (error) {
      console.error('Exception deleting stage:', error);
      return { error };
    }
  }

  /**
   * Check if a stage is generic (system-wide) or company-specific
   */
  isGenericStage(stage: TicketStage): boolean {
    return stage.company_id === null;
  }

  /**
   * Check if a stage belongs to the current user's company
   */
  isCompanyStage(stage: TicketStage): boolean {
    const companyId = this.authService.userProfile?.company_id;
    return stage.company_id === companyId;
  }

  /**
   * Hide a generic stage for the current company
   * Uses Edge Function for validation and RLS bypass
   */
  async hideGenericStage(stageId: string): Promise<{ error: any; data?: any }> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      
      if (!session?.access_token) {
        return { error: { message: 'No active session' } };
      }

      // Call Edge Function
      const response = await fetch(
        `${environment.supabase.url}/functions/v1/hide-stage`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            p_stage_id: stageId,
            p_operation: 'hide'
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        console.error('Error hiding stage:', result);
        return { error: result.error || result };
      }

      return { error: null, data: result.result };
    } catch (error) {
      console.error('Exception hiding stage:', error);
      return { error };
    }
  }

  /**
   * Unhide (show) a generic stage for the current company
   * Uses Edge Function for validation and RLS bypass
   */
  async unhideGenericStage(stageId: string): Promise<{ error: any; data?: any }> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      
      if (!session?.access_token) {
        return { error: { message: 'No active session' } };
      }

      // Call Edge Function
      const response = await fetch(
        `${environment.supabase.url}/functions/v1/hide-stage`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            p_stage_id: stageId,
            p_operation: 'unhide'
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        console.error('Error unhiding stage:', result);
        return { error: result.error || result };
      }

      return { error: null, data: result.result };
    } catch (error) {
      console.error('Exception unhiding stage:', error);
      return { error };
    }
  }

  /**
   * Get all visible stages for the current company
   * (Generic stages not hidden + company-specific stages)
   */
  async getVisibleStages(companyIdOverride?: string): Promise<{ data: TicketStage[] | null; error: any }> {
    try {
      const companyId = companyIdOverride || await this.resolveCompanyId();
      if (!companyId) return { data: [], error: null };

      // 1) Obtener estados genéricos anotados (is_hidden) vía Edge Function para evitar RLS en hidden_stages
      const { data: { session } } = await this.supabase.auth.getSession();
      if (!session?.access_token) {
        return { data: null, error: { message: 'No active session' } };
      }

      const url = `${environment.supabase.url}/functions/v1/get-config-stages` + (companyId ? `?company_id=${encodeURIComponent(companyId)}` : '');
      const efResp = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });
      const efJson = await efResp.json().catch(() => ({}));
      if (!efResp.ok) {
        console.error('get-config-stages failed:', efJson);
        return { data: null, error: efJson?.error || efJson };
      }
      const genericWithFlags: TicketStage[] = Array.isArray(efJson?.stages) ? efJson.stages : [];
      const visibleGenerics = genericWithFlags.filter(s => !s.is_hidden);

      // 2) Obtener estados específicos de empresa
      const { data: companyStages, error: compErr } = await this.supabase
        .from('ticket_stages')
        .select('*')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('position', { ascending: true });
      if (compErr) {
        console.error('Error fetching company stages:', compErr);
        return { data: null, error: compErr };
      }

      // 3) Combinar y ordenar por posición
      const combined = [...visibleGenerics, ...(companyStages || [])]
        .sort((a: any, b: any) => (Number(a?.position ?? 0) - Number(b?.position ?? 0)));

      return { data: combined, error: null };
    } catch (error) {
      console.error('Exception fetching visible stages:', error);
      return { data: null, error };
    }
  }
}
