import { Injectable, inject } from '@angular/core';
import { SimpleSupabaseService } from './simple-supabase.service';
import type { Database } from './supabase-db.types';
import { SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export interface UnitOfMeasure {
  id: string;
  name: string;
  code: string; // canonical identifier used in services.unit_type for backward compatibility
  description?: string;
  is_active: boolean;
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class SupabaseUnitsService {
  private supabase: SupabaseClient;

  constructor(private simple: SimpleSupabaseService) {
    this.supabase = this.simple.getClient();
  }

  private get currentCompanyId(): string | null {
    return this.simple.currentCompanyId;
  }

  async listUnits(includeInactive = false): Promise<UnitOfMeasure[]> {
    // Use Edge Function to get properly filtered units (respecting hidden_units)
    const { units, error } = await this.getConfigUnits();
    if (error) {
      console.warn('Error fetching config units, falling back to direct query:', error);
      // Fallback to direct query if Edge Function fails
      return this.listUnitsDirectQuery(includeInactive);
    }

    // Filter by active status if needed
    let result = units || [];
    if (!includeInactive) {
      result = result.filter(u => u.is_active !== false);
    }

    // Filter out hidden units
    result = result.filter(u => !u.is_hidden);

    return result;
  }

  // Direct database query (fallback)
  private async listUnitsDirectQuery(includeInactive = false): Promise<UnitOfMeasure[]> {
    let query = this.supabase
      .from('service_units')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true } as any);

    const companyId = this.currentCompanyId;
    if (companyId) {
      // Show both global (null company_id) and company-specific
      query = query.or(`company_id.is.null,company_id.eq.${companyId}`);
    }

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as UnitOfMeasure[];
  }

  async getActiveUnits(): Promise<UnitOfMeasure[]> {
    return this.listUnits(false);
  }

  async createUnit(input: { name: string; code: string; description?: string; is_active?: boolean; company_id?: string | null }): Promise<UnitOfMeasure> {
    // allow caller to explicitly set company_id; otherwise use currentCompanyId or null
    const companyIdToUse = input.company_id !== undefined ? input.company_id : (this.currentCompanyId || null);
    const payload: any = {
      name: input.name,
      code: input.code,
      description: input.description || null,
      is_active: input.is_active ?? true,
      company_id: companyIdToUse
    };

    const { data, error } = await this.supabase
      .from('service_units')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return data as UnitOfMeasure;
  }

  async updateUnit(id: string, updates: Partial<Omit<UnitOfMeasure, 'id' | 'created_at' | 'updated_at'>>): Promise<UnitOfMeasure> {
    const payload: any = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.code !== undefined) payload.code = updates.code;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.is_active !== undefined) payload.is_active = updates.is_active;

    const { data, error } = await this.supabase
      .from('service_units')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return data as UnitOfMeasure;
  }

  async softDeleteUnit(id: string): Promise<void> {
    // Hard delete to match stages behavior for company-specific items
    const { error } = await this.supabase
      .from('service_units')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  }

  // RPC-backed config units (generic with is_hidden)
  async getConfigUnits(): Promise<{ units: Array<UnitOfMeasure & { is_hidden?: boolean }>; error?: any }> {
    const { data, error } = await this.supabase.rpc('get_config_units');

    if (error) {
      console.error('Error fetching config units via RPC:', error);
      return { units: [], error };
    }

    return { units: (data as any[]) || [] };
  }

  // Hide generic unit via RPC
  async hideGenericUnit(unitId: string): Promise<{ error?: any }> {
    const { error } = await this.supabase.rpc('toggle_unit_visibility', {
      p_unit_id: unitId,
      p_operation: 'hide'
    });

    if (error) return { error };
    return {};
  }

  // Unhide generic unit via RPC
  async unhideGenericUnit(unitId: string): Promise<{ error?: any }> {
    const { error } = await this.supabase.rpc('toggle_unit_visibility', {
      p_unit_id: unitId,
      p_operation: 'unhide'
    });

    if (error) return { error };
    return {};
  }
}
