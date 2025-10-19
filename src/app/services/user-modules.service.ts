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
    const { data, error } = await this.sb.from('v_current_user_modules').select('*');
    if (error) throw error;
    return data as UserModule[];
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
