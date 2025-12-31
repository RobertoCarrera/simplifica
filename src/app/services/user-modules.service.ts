import { Injectable } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { SupabaseClient } from '@supabase/supabase-js';

export type ModuleStatus = 'activado' | 'desactivado' | 'en_desarrollo';

export interface UserModule {
  id: string;
  user_id: string;
  module_key: string;
  status: ModuleStatus;
  created_at: string;
  updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class UserModulesService {
  private sb: SupabaseClient;
  constructor(sbClient: SupabaseClientService) {
    this.sb = sbClient.instance;
  }

  async listForCurrentUser(): Promise<UserModule[]> {
    // FIX: v_current_user_modules does not exist in baseline schema.
    // Use the RPC 'get_effective_modules' which is the source of truth for user modules.
    const { data, error } = await this.sb.rpc('get_effective_modules');
    if (error) throw error;

    // Map EffectiveModule result to UserModule structure to maintain compatibility
    return (data || []).map((m: any) => ({
      id: m.key, // fallback id
      user_id: 'current', // placeholder
      module_key: m.key,
      status: m.enabled ? 'activado' : 'desactivado',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })) as UserModule[];
  }

  async upsertForUser(userId: string, moduleKey: string, status: ModuleStatus): Promise<void> {
    const { error } = await this.sb.rpc('upsert_user_module', {
      p_user_id: userId,
      p_module_key: moduleKey,
      p_status: status
    });
    if (error) throw error;
  }
}
