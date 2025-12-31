import { Injectable, inject, signal } from '@angular/core';
import { from, Observable } from 'rxjs';
import { SupabaseClientService } from './supabase-client.service';
import { RuntimeConfigService } from './runtime-config.service';

export interface EffectiveModule {
  key: string;
  name: string;
  description?: string | null;
  category?: string | null;
  position?: number;
  enabled: boolean;
}

@Injectable({ providedIn: 'root' })
export class SupabaseModulesService {
  private supabaseClient = inject(SupabaseClientService);
  private rc = inject(RuntimeConfigService);
  private get fnBase() { return (this.rc.get().edgeFunctionsBaseUrl || '').replace(/\/+$/, ''); }

  // Cache in-memory to avoid repeated calls during a session
  private _modules = signal<EffectiveModule[] | null>(null);

  get modulesSignal() { return this._modules.asReadonly(); }

  private async requireAccessToken(): Promise<string> {
    const client = this.supabaseClient.instance;

    // Session restoration can be async on app startup; retry briefly to avoid spurious 401s.
    let token: string | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: { session } } = await client.auth.getSession();
      token = session?.access_token;
      if (token) return token;

      // Try refresh once, then small backoff
      if (attempt === 0) {
        try { await client.auth.refreshSession(); } catch { /* ignore */ }
      }
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }

    throw new Error('No hay sesión activa. Vuelve a iniciar sesión.');
  }

  fetchEffectiveModules(): Observable<EffectiveModule[]> {
    return from(this.executeFetchEffectiveModules());
  }

  private async executeFetchEffectiveModules(): Promise<EffectiveModule[]> {
    // Now using RPC for better local/prod compatibility and performance
    const { data, error } = await this.supabaseClient.instance.rpc('get_effective_modules');
    if (error) {
      console.error('Error fetching effective modules via RPC:', error);
      throw new Error(error.message || 'No se pudieron obtener los módulos');
    }
    console.log('🔍 ModulesService: RPC get_effective_modules result:', data);
    const list = (data || []) as EffectiveModule[];
    this._modules.set(list);
    return list;
  }

  adminSetUserModule(targetUserId: string, moduleKey: string, status: 'activado' | 'desactivado'): Observable<{ success: boolean }> {
    return from(this.executeAdminSetUserModule(targetUserId, moduleKey, status));
  }

  private async executeAdminSetUserModule(targetUserId: string, moduleKey: string, status: 'activado' | 'desactivado'): Promise<{ success: boolean }> {
    const { data, error } = await this.supabaseClient.instance.rpc('admin_set_user_module', {
      p_target_user_id: targetUserId,
      p_module_key: moduleKey,
      p_status: status
    });

    if (error) {
      console.error('Error setting user module via RPC:', error);
      throw new Error(error.message || 'No se pudo actualizar el módulo del usuario via RPC');
    }
    return { success: true };
  }

  // Admin list matrix of users, modules and assignments
  adminListUserModules(ownerId?: string): Observable<{ users: any[]; modules: any[]; assignments: any[] }> {
    return from(this.executeAdminListUserModules(ownerId));
  }

  private async executeAdminListUserModules(ownerId?: string): Promise<{ users: any[]; modules: any[]; assignments: any[] }> {
    const { data, error } = await this.supabaseClient.instance.rpc('admin_list_user_modules', {
      p_owner_id: ownerId || null
    });

    if (error) {
      console.error('Error listing user modules via RPC:', error);
      throw new Error(error.message || 'No se pudo obtener la matriz de módulos via RPC');
    }

    // RPC returns { users: [...], modules: [...], assignments: [...] } directly
    return data as { users: any[]; modules: any[]; assignments: any[] };
  }

  // List all owners (platform-level admin use)
  adminListOwners(): Observable<{ owners: any[] }> {
    return from(this.executeAdminListOwners());
  }

  private async executeAdminListOwners(): Promise<{ owners: any[] }> {
    const token = await this.requireAccessToken();
    const url = new URL(`${this.fnBase}/admin-list-user-modules`);
    url.searchParams.set('owners', '1');
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': this.rc.get().supabase.anonKey,
      }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'No se pudo obtener la lista de owners');
    return { owners: json?.owners || [] };
  }
}
