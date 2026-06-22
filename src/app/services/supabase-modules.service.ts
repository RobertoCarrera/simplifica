import { Injectable, inject, signal, Injector } from '@angular/core';
import { from, of, Observable, timeout, catchError } from 'rxjs';
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

/** Sidebar order entry shape (one per module_key) */
export interface SidebarOrderEntry {
  order: number;
  visible: boolean;
  devMode: boolean;
  visibleToClients: boolean;
  visibleToTeam: boolean;
}

const MODULES_CACHE_KEY = 'simplifica_modules_cache';

/**
 * Rafter v0.36 — perf: in-memory TTL for the effective-modules cache.
 * 27 components subscribe to `fetchEffectiveModules()` per session; the previous
 * implementation returned the cached value AND fired a background RPC on every
 * call, producing ~20 wasted RPCs/session. With a 60s TTL we still re-fetch
 * periodically (so role changes propagate within a minute) but every
 * subscribe-within-the-window is now free.
 */
const MODULES_CACHE_TTL_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class SupabaseModulesService {
  private supabaseClient = inject(SupabaseClientService);
  private rc = inject(RuntimeConfigService);
  // NOTE: AuthService is intentionally NOT injected here at construction time.
  // It would form a cycle with AuthService → SupabaseModulesService that
  // surfaces as NG0200 in browsers with strict DI (Vercel production build).
  // We resolve it lazily via Injector when actually needed.
  private injector = inject(Injector);
  /** Lazy getter to avoid circular dependency with AuthService at construction time. */
  private get authService(): AuthService {
    return this.injector.get(AuthService);
  }
  private get fnBase() {
    return (this.rc.get().edgeFunctionsBaseUrl || '').replace(/\/+$/, '');
  }

  // Cache in-memory to avoid repeated calls during a session
  private _modules = signal<EffectiveModule[] | null>(null);
  // Timestamp (Date.now()) of the last SUCCESSFUL fetch — used to gate the
  // background refresh and avoid firing an RPC on every cache-hit subscribe.
  private _modulesFetchedAt = 0;
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
   * Returns cached modules when fresh (within MODULES_CACHE_TTL_MS); otherwise
   * fetches from the server (deduped) and races against an 8s timeout.
   *
   * Rafter v0.36 — perf: the previous implementation returned the cached value
   * AND fired a background RPC on every cache-hit subscribe. That fired ~20
   * RPCs/session across the 27 call sites that subscribe during navigation.
   * Now: cache hits within the TTL return the cached value with NO network
   * call. The cache is rebuilt lazily on first stale-subscribe, and force-
   * refreshed via `forceRefreshModules()` for explicit user actions.
   */
  fetchEffectiveModules(): Observable<EffectiveModule[]> {
    const cached = this._modules();
    const cacheAge = Date.now() - this._modulesFetchedAt;
    if (cached && cacheAge < MODULES_CACHE_TTL_MS) {
      // Cache is fresh — return as-is, NO background refresh.
      return of(cached);
    }
    // Cache is stale or empty — trigger fetch (deduped) and return its observable.
    // Race against an 8s timeout so the UI never hangs on first paint; fall back
    // to the previous cached value (if any) on timeout/error to avoid an empty UI.
    return from(this._dedupedFetch()).pipe(
      timeout({ first: 8000, with: () => of(cached ?? ([] as EffectiveModule[])) }),
      catchError(() => of(cached ?? ([] as EffectiveModule[]))),
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
    // Source of truth: the active company from AuthService (the one the
    // sidebar switcher is showing). Falls back to sessionStorage only on
    // first paint, before the auth signal is hydrated. Passing null would
    // make the RPC's LIMIT 1 (no ORDER BY) return a non-deterministic
    // company — for users in multiple companies (e.g. Roberto in both
    // caibs and simplifica) that meant moduloProyectos could be hidden
    // even though Simplifica has it active.
    const authCompanyId = this.injector.get(AuthService).currentCompanyId?.() ?? null;
    let companyId: string | null = authCompanyId;
    if (!companyId) {
      const stored = sessionStorage.getItem('last_active_company_id');
      if (stored && stored !== 'undefined' && stored !== 'null') {
        companyId = stored;
      }
    }

    const { data: { user } } = await this.supabaseClient.instance.auth.getUser();
    const userId = user?.id;

    const { data, error } = await this.supabaseClient.instance.rpc('get_effective_modules', {
      p_input_company_id: companyId,
      p_auth_user_id: userId,
    });

    if (error) {
      console.error('Error fetching effective modules:', error);
      throw new Error(error.message || 'No se pudieron obtener los módulos');
    }

    const list = (data || []) as EffectiveModule[];
    this._modules.set(list);
    // Rafter v0.36 — perf: stamp the cache so subsequent subscribes within the
    // TTL window don't trigger another RPC.
    this._modulesFetchedAt = Date.now();

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
    // Rafter v0.36 — perf: reset the TTL stamp too so the next subscribe does
    // a fresh fetch instead of returning a sessionStorage-hydrated value past
    // its TTL window.
    this._modulesFetchedAt = 0;
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

  // ── Sidebar Navigation Order ─────────────────────────────────────────────

  /** Cached sidebar order entries (module_key → order, visible, devMode, visibleToClients, visibleToTeam) */
  private _sidebarOrder = signal<Map<string, SidebarOrderEntry>>(new Map());

  get sidebarOrderSignal() {
    return this._sidebarOrder.asReadonly();
  }

  /** Fetch sidebar order from DB and cache it (called on app init) */
  async fetchSidebarOrder(): Promise<void> {
    const { data, error } = await this.supabaseClient.instance
      .rpc('get_sidebar_navigation_order');
    if (error) {
      console.warn('Could not fetch sidebar order:', error.message);
      return;
    }
    const map = new Map<string, SidebarOrderEntry>();
    for (const row of (data || []) as {
      module_key: string;
      order_index: number;
      is_visible: boolean;
      is_dev_mode: boolean;
      visible_to_clients: boolean;
      visible_to_team: boolean;
    }[]) {
      map.set(row.module_key, {
        order: row.order_index,
        visible: row.is_visible,
        devMode: row.is_dev_mode ?? false,
        visibleToClients: row.visible_to_clients ?? true,
        visibleToTeam: row.visible_to_team ?? true,
      });
    }
    this._sidebarOrder.set(map);
  }

  /**
   * Get sort order for a sidebar module key.
   * Returns the custom order if set, or null (use id-based fallback).
   */
  getSidebarSortOrder(moduleKey: string): number | null {
    return this._sidebarOrder().get(moduleKey)?.order ?? null;
  }

  /**
   * Check if a sidebar item should be visible (generic — kept for backward compat).
   * Returns true if not explicitly hidden.
   */
  isSidebarItemVisible(moduleKey: string): boolean {
    const entry = this._sidebarOrder().get(moduleKey);
    return entry ? entry.visible : true;
  }

  /**
   * Check if a sidebar item is visible to clients.
   * Returns true by default (if no explicit entry).
   */
  isSidebarItemVisibleToClients(moduleKey: string): boolean {
    return this._sidebarOrder().get(moduleKey)?.visibleToClients ?? true;
  }

  /**
   * Check if a sidebar item is visible to team members (professional, marketer, admin, owner, super_admin).
   * Returns true by default (if no explicit entry).
   */
  isSidebarItemVisibleToTeam(moduleKey: string): boolean {
    return this._sidebarOrder().get(moduleKey)?.visibleToTeam ?? true;
  }

  /**
   * Check if a sidebar item is in DEV mode (superadmin-only).
   */
  isSidebarItemDevMode(moduleKey: string): boolean {
    return this._sidebarOrder().get(moduleKey)?.devMode ?? false;
  }

  /**
   * Upsert sidebar order entries (super_admin only).
   * @param entries Array of { module_key, order_index, is_visible, is_dev_mode, visible_to_clients, visible_to_team }
   */
  adminUpdateSidebarOrder(
    entries: {
      module_key: string;
      order_index: number;
      is_visible: boolean;
      is_dev_mode: boolean;
      visible_to_clients: boolean;
      visible_to_team: boolean;
    }[],
  ): Observable<{ success: boolean }> {
    return from(this.executeAdminUpdateSidebarOrder(entries));
  }

  private async executeAdminUpdateSidebarOrder(
    entries: {
      module_key: string;
      order_index: number;
      is_visible: boolean;
      is_dev_mode: boolean;
      visible_to_clients: boolean;
      visible_to_team: boolean;
    }[],
  ): Promise<{ success: boolean }> {
    const { error } = await this.supabaseClient.instance
      .rpc('admin_update_sidebar_navigation_order', { p_entries: entries });
    if (error) throw new Error(error.message || 'No se pudo actualizar el orden del sidebar');
    // Refresh cached order
    await this.fetchSidebarOrder();
    return { success: true };
  }

  // ── Legacy User Methods (kept for reference or cleanup later) ──────────────
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
