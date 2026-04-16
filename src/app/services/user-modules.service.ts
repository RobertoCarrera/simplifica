import { Injectable } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { firstValueFrom, of, timeout, catchError, from } from 'rxjs';

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

  async listForCurrentUser(companyId?: string): Promise<UserModule[]> {
    // Race the RPC against an 8s timeout — if it hangs, return empty array
    // so the settings page can still render instead of blocking forever.
    try {
      const data = await firstValueFrom(
        from(
          this.sb.rpc('get_effective_modules', {
            p_input_company_id: companyId || null,
          }),
        ).pipe(
          timeout({ first: 8000, with: () => of(null) }),
          catchError(() => of(null)),
        ),
      );
      if (data === null) return []; // timeout fallback
      return ((data as any) || []).map((m: any) => ({
        id: m.key,
        user_id: 'current',
        module_key: m.key,
        status: m.enabled ? 'activado' : 'desactivado',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })) as UserModule[];
    } catch {
      return [];
    }
  }

  async upsertForUser(userId: string, moduleKey: string, status: ModuleStatus): Promise<void> {
    const { error } = await this.sb.rpc('upsert_user_module', {
      p_user_id: userId,
      p_module_key: moduleKey,
      p_status: status,
    });
    if (error) throw error;
  }
}
