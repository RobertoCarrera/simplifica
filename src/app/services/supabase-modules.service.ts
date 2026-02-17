import { Injectable, inject, signal } from '@angular/core';
import { from, Observable } from 'rxjs';
import { SupabaseClientService } from './supabase-client.service';
import { RuntimeConfigService } from './runtime-config.service';
import { AuthService } from './auth.service';

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
    // Get current active company context (using localStorage to avoid circular deps/injection context issues)
    let companyId = localStorage.getItem('last_active_company_id');

    // If client does not have companyId in localStorage (first login), p_input_company_id should be null
    // so RPC infers it from clients table.
    // However, if localStorage has 'undefined' or 'null' string, clean it.
    if (companyId === 'undefined' || companyId === 'null') {
      companyId = null;
    }

    const rpcInput = {
      p_input_company_id: null // FORCE NULL TO LET RPC INFER
    };
    
    // TEMPORAL DEBUG
    console.log('🔍 ModulesService: Calling RPC get_effective_modules with:', rpcInput);

    const { data, error } = await this.supabaseClient.instance.rpc('get_effective_modules', rpcInput);

    // TEMPORAL DEBUG
    console.log('🔍 ModulesService: Raw RPC Response:', { data, error });

    if (error) {
      console.error('Error fetching effective modules via RPC:', error);
      throw new Error(error.message || 'No se pudieron obtener los módulos');
    }
    console.log('🔍 ModulesService: RPC get_effective_modules result (Context: ' + companyId + '):', data);
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

  // Admin list companies with their modules
  adminListCompanies(): Observable<{ companies: any[] }> {
    return from(this.executeAdminListCompanies());
  }

  private async executeAdminListCompanies(): Promise<{ companies: any[] }> {
    const { data, error } = await this.supabaseClient.instance.rpc('admin_list_companies');
    if (error) {
      console.error('Error listing companies via RPC:', error);
      throw new Error(error.message || 'No se pudo obtener la lista de compañías via RPC');
    }
    return data as { companies: any[] };
  }

  // Admin set module status for a company
  adminSetCompanyModule(companyId: string, moduleKey: string, status: string): Observable<{ success: boolean }> {
    return from(this.executeAdminSetCompanyModule(companyId, moduleKey, status));
  }

  private async executeAdminSetCompanyModule(companyId: string, moduleKey: string, status: string): Promise<{ success: boolean }> {
    const { data, error } = await this.supabaseClient.instance.rpc('admin_set_company_module', {
      p_target_company_id: companyId,
      p_module_key: moduleKey,
      p_status: status
    });

    if (error) {
      console.error('Error setting company module :', error);
      throw new Error(error.message || 'No se pudo actualizar el módulo de la empresa');
    }
    return { success: true };
  }

  // Legacy User Methods (kept for reference or cleanup later)
  adminListUserModules(companyId?: string): Observable<{ users: any[]; modules: any[]; assignments: any[] }> {
    return from(this.executeAdminListUserModules(companyId));
  }

  private async executeAdminListUserModules(companyId?: string): Promise<{ users: any[]; modules: any[]; assignments: any[] }> {
    // implementation kept but likely unused in new UI
    const { data, error } = await this.supabaseClient.instance.rpc('admin_list_user_modules', {
      p_company_id: companyId || null
    });
    if (error) throw new Error(error.message);
    return data as any;
  }
}
