import { Injectable } from '@angular/core';
import { SimpleSupabaseService } from './simple-supabase.service';
import { SupabaseClient } from '@supabase/supabase-js';

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
    const { error } = await this.supabase
      .from('service_units')
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq('id', id);

    if (error) throw new Error(error.message);
  }
}
