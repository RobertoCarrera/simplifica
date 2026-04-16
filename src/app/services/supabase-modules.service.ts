import { Injectable, inject, signal } from '@angular/core';
import { from, of, Observable, timeout, catchError } from 'rxjs';
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

const MODULES_CACHE_KEY = 'simplifica_modules_cache';

@Injectable({ providedIn: 'root' })
export class SupabaseModulesService {
  private supabaseClient = inject(SupabaseClientService);
  private rc = inject(RuntimeConfigService);
  private get fnBase() {
    return (this.rc.get().edgeFunctionsBaseUrl || '').replace(/\/+$/, '');
  }

  // Cache in-memory to avoid repeated calls during a session
  private _modules = signal<EffectiveModule[] | null>(null);
  // Dedup: prevent concurrent identical RPC calls
  private _pendingFetch: Promise<EffectiveModule[]> | null = null;

  get modulesSignal() {
    return this._modules.asReadonly();
  }

  /**
   * Returns whether a module is enabled for the current user/company.
   * - `null`  → modules not loaded yet (signal is null)
   * - `true`  → module exists and is enabled
   * - `false` → module is disabled OR does not exist for this user/company
   */
  isModuleEnabled(key: string): boolean | null {
    const modules = this._modules();
    if (modules === null) return null;
    const module = modules.find((m) => m.key === key);
    return module ? module.enabled : false;
  }

  constructor() {
    // Restore from sessionStorage for instant sidebar render
    try {
      const cached = sessionStorage.getItem(MODULES_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as EffectiveModule[];
        if (Array.isArray(parsed)) this._modules.set(parsed);
      }
    } catch {
      /* ignore parse errors */
    }
  }

  private async requireAccessToken(): Promise<string> {
    const client = this.supabaseClient.instance;

    // Session restoration can be async on app startup; retry briefly to avoid spurious 401s.
    let token: string | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const {
        data: { session },
      } = await client.auth.getSession();
      token = session?.access_token;
      if (token) return token;

      // Try refresh once, then small backoff
      if (attempt === 0) {
        try {
          await client.auth.refreshSession();
        } catch {
          /* ignore */
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }

    throw new Error('No hay sesión activa. Vuelve a iniciar sesión.');
  }

  /**
   * Returns cached modules immediately if available, then refreshes from server in background.
   * On first load (no cache), fetches from server.
   */
  fetchEffectiveModules(): Observable<EffectiveModule[]> {
    const cached = this._modules();
    if (cached) {
      // Return cached data immediately, refresh in background (deduped)
      this._dedupedFetch().catch(() => {});
      return of(cached);
    }
    // Race the RPC against an 8s timeout so the UI never hangs
    return from(this._dedupedFetch()).pipe(
      timeout({ first: 8000, with: () => of([] as EffectiveModule[]) }),
      catchError(() => of([] as EffectiveModule[])),
    );
  }

  /** Force a fresh fetch from the server (bypasses cache) */
  forceRefreshModules(): Observable<EffectiveModule[]> {
    return from(this._dedupedFetch());
  }

  /** Deduplicates concurrent calls — only one RPC in-flight at a time */
  private _dedupedFetch(): Promise<EffectiveModule[]> {
    if (this._pendingFetch) return this._pendingFetch;
    this._pendingFetch = this.executeFetchEffectiveModules().finally(() => {
      this._pendingFetch = null;
    });
    return this._pendingFetch;
  }

  private async executeFetchEffectiveModules(): Promise<EffectiveModule[]> {
    let companyId = sessionStorage.getItem('last_active_company_id');
    if (companyId === 'undefined' || companyId === 'null') {
      companyId = null;
    }

    const { data, error } = await this.supabaseClient.instance.rpc('get_effective_modules', {
      p_input_company_id: companyId,
    });

    if (error) {
      console.error('Error fetching effective modules:', error);
      throw new Error(error.message || 'No se pudieron obtener los módulos');
    }

    const list = (data || []) as EffectiveModule[];
    this._modules.set(list);

    // Persist to sessionStorage for instant restore on next navigation
    try {
      sessionStorage.setItem(MODULES_CACHE_KEY, JSON.stringify(list));
    } catch {
      /* quota */
    }

    return list;
  }

  /** Clear cached modules (call on logout or company switch) */
  clearCache() {
    this._modules.set(null);
    try {
      sessionStorage.removeItem(MODULES_CACHE_KEY);
    } catch {
      /* ignore */
    }
  }

  adminSetUserModule(
    targetUserId: string,
    moduleKey: string,
    status: 'activado' | 'desactivado',
  ): Observable<{ success: boolean }> {
    return from(this.executeAdminSetUserModule(targetUserId, moduleKey, status));
  }

  private async executeAdminSetUserModule(
    targetUserId: string,
    moduleKey: string,
    status: 'activado' | 'desactivado',
  ): Promise<{ success: boolean }> {
    const { data, error } = await this.supabaseClient.instance.rpc('admin_set_user_module', {
      p_target_user_id: targetUserId,
      p_module_key: moduleKey,
      p_status: status,
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
  adminSetCompanyModule(
    companyId: string,
    moduleKey: string,
    status: string,
  ): Observable<{ success: boolean }> {
    return from(this.executeAdminSetCompanyModule(companyId, moduleKey, status));
  }

  private async executeAdminSetCompanyModule(
    companyId: string,
    moduleKey: string,
    status: string,
  ): Promise<{ success: boolean }> {
    const { data, error } = await this.supabaseClient.instance.rpc('admin_set_company_module', {
      p_target_company_id: companyId,
      p_module_key: moduleKey,
      p_status: status,
    });

    if (error) {
      console.error('Error setting company module :', error);
      throw new Error(error.message || 'No se pudo actualizar el módulo de la empresa');
    }
    return { success: true };
  }

  // Legacy User Methods (kept for reference or cleanup later)
  adminListUserModules(
    companyId?: string,
  ): Observable<{ users: any[]; modules: any[]; assignments: any[] }> {
    return from(this.executeAdminListUserModules(companyId));
  }

  private async executeAdminListUserModules(
    companyId?: string,
  ): Promise<{ users: any[]; modules: any[]; assignments: any[] }> {
    // implementation kept but likely unused in new UI
    const { data, error } = await this.supabaseClient.instance.rpc('admin_list_user_modules', {
      p_company_id: companyId || null,
    });
    if (error) throw new Error(error.message);
    return data as any;
  }
}
