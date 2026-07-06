import { Injectable, inject, signal, NgZone, Injector } from '@angular/core';
import { SupabaseModulesService } from './supabase-modules.service';
import { Router } from '@angular/router';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { RuntimeConfigService } from './runtime-config.service';
import { SupabaseClientService } from './supabase-client.service';
import { environment } from '../../environments/environment';
import { clearAalCache } from '../guards/auth.guard';
import {
  normalizeOnboardingSubmissionData,
  type OnboardingSubmissionData,
} from './onboarding-policy';

// AppUser refleja la fila de public.users + datos de compañía
export interface AppUser {
  id: string;              // id interno de public.users (no auth id), or client id for portal users
  auth_user_id: string;    // id de auth.users
  email: string;
  name?: string | null;
  surname?: string | null; // Added surname
  role: 'super_admin' | 'owner' | 'admin' | 'supervisor' | 'member' | 'client' | 'professional' | 'none';
  active: boolean;
  company_id?: string | null;
  permissions?: any;
  // Campos derivados
  full_name?: string | null; // compatibilidad legacy (sidebar, etc.)
  company?: Company | null;
  // Client portal specific
  client_id?: string | null; // Only set for portal clients - the id from clients table
  is_super_admin?: boolean; // Global admin flag from public.users.app_role
  app_role_id?: string; // Reference to app_roles table
  onboarding_completed?: boolean; // True after completing profile + TOTP (for owners/admins)
  favorite_company_id?: string | null;
  favorite_professional_id?: string | null
}


// Joined data from company_members view or fetch
export interface CompanyMembership {
  id: string; // company_members.id
  user_id: string;
  company_id: string;
  role: 'super_admin' | 'owner' | 'admin' | 'supervisor' | 'member' | 'client' | 'professional';
  status: string;
  created_at: string;
  company?: Company;
}

export interface Company {
  id: string;
  name: string;
  slug: string | null;
  nif?: string | null; // NIF/CIF de la empresa (obligatorio para facturación)
  is_active: boolean;
  settings?: any;
  subscription_tier?: string | null;
  max_users?: number | null;
  logo_url?: string | null;
}

export interface LinkedProfessional {
  id: string;
  display_name: string;
  title?: string | null;
  company_id: string;
  company_name?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient;
  private router = inject(Router);
  private static initializationStarted = false; // Guard para evitar múltiples inicializaciones
  private registrationInProgress = new Set<string>(); // Para evitar registros duplicados
  // Fix #8: Store visibilitychange handler reference for potential cleanup
  private visibilityChangeHandler: (() => void) | null = null;
  // F-4.2 Rafter v0.30: BroadcastChannel to sync logout across tabs.
  // Created lazily in the constructor (BroadcastChannel is undefined in SSR
  // and older browsers). Same channel name across all tabs — when one tab
  // posts {type:'logout'}, the others navigate to /login.
  private authBroadcast: BroadcastChannel | null = null;
  // F-4.2 Rafter v0.30: Lock to prevent feedback loops when the listener
  // receives its own broadcast and triggers a second logout(). Set when the
  // current tab initiated the logout; cleared on init or after navigate.
  private _logoutInProgress = false;

  // Signals para estado reactivo
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  private userProfileSubject = new BehaviorSubject<AppUser | null>(null);
  private loadingSubject = new BehaviorSubject<boolean>(true);
  /** Guard against concurrent setCurrentUser calls (initializeAuth vs onAuthStateChange race). */
  private setCurrentUserPromise: Promise<void> | null = null;
  private ngZone = inject(NgZone);
  // NOTE: SupabaseModulesService is intentionally NOT injected at construction time.
  // It would form a cycle with SupabaseModulesService → AuthService that surfaces
  // as NG0200 in browsers with strict DI (Vercel production build). We resolve it
  // lazily via Injector when actually needed.
  private injector = inject(Injector);
  /** Lazy getter to avoid circular dependency with SupabaseModulesService at construction time. */
  private get modulesService(): SupabaseModulesService {
    return this.injector.get(SupabaseModulesService);
  }
  /** True while _doSetCurrentUser runs after cache hydration — prevents re-blocking the sidebar. */
  private _hydratedFromCache = false;
  /** True only for the first setCurrentUser call of a session (with or without cache).
   *  Used to run favorite-profile auto-select exactly once on initial load, not on
   *  tab resume, manual company switch, or other re-invocations. */
  private _isFirstSessionLoad = true;

  // Observables públicos
  currentUser$ = this.currentUserSubject.asObservable();
  userProfile$ = this.userProfileSubject.asObservable();
  loading$ = this.loadingSubject.asObservable();

  // Signals
  isAuthenticated = signal<boolean>(false);
  isAdmin = signal<boolean>(false);
  isSuperAdmin = signal<boolean>(false);
  userRole = signal<string>('');
  companyId = signal<string>('');
  userProfileSignal = signal<AppUser | null>(null);

  // Multi-Tenancy State
  companyMemberships = signal<CompanyMembership[]>([]);
  currentCompanyId = signal<string | null>(null);

  // Professional Mode State (owner/admin switching to act as a professional)
  linkedProfessionals = signal<LinkedProfessional[]>([]);
  isInProfessionalMode = signal<boolean>(false);
  activeProfessionalId = signal<string | null>(null);
  /** Company the active professional belongs to. Populated from linkedProfessionals
   *  AND persisted to sessionStorage so it survives page reloads before the async
   *  linkedProfessionals query completes (race-condition prevention). */
  activeProfessionalCompanyId = signal<string | null>(null);

  // Favorite profile selection — persisted to DB, user can star one company or professional
  favoriteCompanyId = signal<string | null>(null);
  favoriteProfessionalId = signal<string | null>(null);

  private _originalRole: string = '';
  private _originalIsAdmin: boolean = false;

  private runtimeConfig = inject(RuntimeConfigService);

  constructor(private sbClient: SupabaseClientService) {
    // Validar que las variables de entorno estén configuradas
    const cfg = this.runtimeConfig.get();
    if (!cfg?.supabase?.url || !cfg?.supabase?.anonKey) {
      console.error('❌ SUPABASE CONFIGURATION ERROR:');
      console.error('Las variables de entorno de Supabase no están configuradas.');
      console.error('En Vercel Dashboard, configura:');
      console.error('- SUPABASE_URL: Tu URL de Supabase');
      console.error('- SUPABASE_ANON_KEY: Tu Anon Key de Supabase');
      throw new Error('Supabase configuration missing');
    }

    // Usar instancia centralizada en vez de createClient local
    this.supabase = this.sbClient.instance;

    // Evitar múltiples inicializaciones
    if (!AuthService.initializationStarted) {
      AuthService.initializationStarted = true;
      if (!environment.production) { console.log('🔐 AuthService: Inicializando por primera vez...'); }

      // Inicializar estado de autenticación
      this.initializeAuth();

      // Escuchar cambios de sesión (solo una vez)
      this.supabase.auth.onAuthStateChange((event, session) => {
        if (!environment.production) { console.log('🔐 AuthService: Auth state change:', event); }
        this.handleAuthStateChange(event, session);
      });
      // Setup inactivity timeout to auto-signout after configurable period
      this.setupInactivityTimeout();

      // Fix #8: Store handler reference to allow cleanup and prevent duplicate listeners.
      // Pause auto-refresh when tab is hidden to prevent multi-tab token race conditions
      // since we have locks disabled in SupabaseClientService.
      //
      // Rafter v0.36 — perf: on tab resume we ONLY verify the JWT is still valid
      // (getSession is a local decode, no DB roundtrip). We do NOT re-run
      // setCurrentUser on every focus — the cached profile tree (auth.userProfile$)
      // is still valid and re-hydrating it would issue 2-3 nested-embed queries
      // (users + clients w/ company_members/companies/app_roles) per tab return.
      // The previous implementation also called getSession() twice for no reason.
      this.visibilityChangeHandler = async () => {
        if (document.hidden) {
          if (!environment.production) { console.log('⏸️ Pausing auth auto-refresh (tab hidden)'); }
          this.supabase.auth.stopAutoRefresh();
        } else {
          if (!environment.production) { console.log('▶️ Resuming auth auto-refresh (tab visible)'); }
          this.supabase.auth.startAutoRefresh();
          // Single lightweight session check — no profile re-fetch.
          // getSession() is a local JWT decode (no DB roundtrip). Only act if
          // the session is actually gone (e.g. cross-tab logout invalidated it
          // or the token expired while paused).
          const { data } = await this.supabase.auth.getSession();
          if (!data.session) {
            if (!environment.production) { console.log('⚠️ No session on tab resume — logging out'); }
            await this.logout();
          }
        }
      };
      document.addEventListener('visibilitychange', this.visibilityChangeHandler);

      // F-4.2 Rafter v0.30: subscribe to cross-tab logout broadcasts.
      // When one tab signs out, all open tabs navigate to /login and their
      // local state is cleared. Without this, the user could remain
      // authenticated in a sibling tab that still holds the cached profile.
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          this.authBroadcast = new BroadcastChannel('simplifica-auth');
          this.authBroadcast.onmessage = (event) => {
            const data = (event && event.data) as { type?: string } | undefined;
            if (data?.type !== 'logout') return;
            // Guard against feedback loops: this tab is mid-logout, or the
            // user has never authenticated on this tab. The local logout()
            // already ran clearUserData() before posting, so isAuthenticated()
            // is false here. If it's already false, this tab has nothing to do.
            if (!this.isAuthenticated() && !this.currentUserSubject.value) return;
            if (!this.ngZone) {
              this.router.navigate(['/login']);
              return;
            }
            this.ngZone.run(() => {
              if (!environment.production) { console.log('🔐 AuthService: cross-tab logout broadcast received'); }
              this.clearUserData();
              this.router.navigate(['/login']);
            });
          };
        } catch (e) {
          // BroadcastChannel construction can throw in restricted contexts;
          // degrade silently — the within-tab logout still works.
          if (!environment.production) { console.warn('⚠️ BroadcastChannel unavailable:', e); }
          this.authBroadcast = null;
        }
      }
    } else {
      if (!environment.production) { console.log('🔐 AuthService: Ya inicializado, reutilizando instancia'); }
      this.loadingSubject.next(false);
    }
  }

  // Inactivity timeout: default to 30 minutes (in ms). Reset on user interactions.
  private inactivityTimeoutMs = 30 * 60 * 1000;
  private inactivityTimer: any = null;

  private setupInactivityTimeout() {
    // Run everything outside Angular's zone so that:
    //  - mousemove/click events don't create Zone.js macro tasks on every movement
    //  - clearTimeout/setTimeout don't pollute zone stability
    //  - the 30-minute pending timer never shows as a "pending zone task"
    const reset = () => {
      try { if (this.inactivityTimer) clearTimeout(this.inactivityTimer); } catch (e) { }
      this.inactivityTimer = setTimeout(() => {
        // Re-enter the Angular zone so router & signals react correctly
        this.ngZone.run(async () => {
          try { await this.logout(); } catch (e) { }
        });
      }, this.inactivityTimeoutMs);
    };

    this.ngZone.runOutsideAngular(() => {
      // Reset on user interactions
      ['click', 'mousemove', 'keydown', 'touchstart'].forEach(evt => {
        window.addEventListener(evt, () => {
          if (!document.hidden) reset();
        }, { passive: true });
      });

      // Initialize timer
      reset();
    });
  }

  // Exponer cliente supabase directamente para componentes de callback/reset
  get client() { return this.supabase; }

  // --------------------------------------------------------------------------------
  // BIOMETRIC / PASSKEY AUTHENTICATION
  // --------------------------------------------------------------------------------

  async enrollPasskey(friendlyName: string = 'Biometría/Huella') {
    // Requires registered user with active session
    // Uses standard WebAuthn enrollment from Supabase MFA API
    // NOTE: This usually requires "Enable WebAuthn" in the Supabase Project Dashboard
    
    try {
        const { data, error } = await this.supabase.auth.mfa.enroll({
          factorType: 'webauthn',
          friendlyName
        });
        
        if (error) {
          console.warn('⚠️ Fallo al enrolar biometría (mfa.enroll):', error);
          if (error.message?.includes('disabled') || error.message?.includes('not supported')) {
            throw new Error('SERVER_WEBAUTHN_DISABLED');
          }
          throw error;
        }

        return data;
    } catch (err: any) {
        if (err.message === 'SERVER_WEBAUTHN_DISABLED') throw err;
        // Fallback for generic errors
        console.warn('⚠️ Error general enroll biometría:', err);
        throw new Error('Error técnico al registrar biometría: ' + (err.message || 'Desconocido'));
    }
  }

  async listFactors() {
    const { data, error } = await this.supabase.auth.mfa.listFactors();
    if (error) throw error;
    return data;
  }

  /** Generate new MFA backup codes (returns plaintext, DB stores hashes) */
  async generateBackupCodes(): Promise<{ codes: string[]; error?: string }> {
    try {
      const { data, error } = await this.supabase.rpc('generate_mfa_backup_codes', { p_count: 8 });
      if (error) return { codes: [], error: error.message };
      return { codes: data || [] };
    } catch (e: any) {
      return { codes: [], error: e.message };
    }
  }

  /** Verify a backup code (marks as used if valid) */
  async verifyBackupCode(code: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.rpc('verify_mfa_backup_code', { p_code: code });
      if (error) return false;
      return !!data;
    } catch {
      return false;
    }
  }

  async unenrollFactor(factorId: string) {
    const { data, error } = await this.supabase.auth.mfa.unenroll({ factorId });
    if (error) throw error;
    return data;
  }

  /**
   * Silently clean up stale unverified TOTP factors.
   * Called from initializeAuth() after profile load — prevents 422 errors
   * when the user later hits a route that requires AAL2 verification.
   *
   * Stale factors happen when enrollment is abandoned (QR scanned but code
   * never entered). They appear in listFactors() with status='unverified'
   * and cause /auth/v1/factors/{id}/verify to return 422.
   */
  private async cleanupStaleTotpFactors(): Promise<void> {
    try {
      const { data } = await this.supabase.auth.mfa.listFactors();
      const allTotp = (data?.totp ?? []) as Array<{
        id: string;
        status: string;
      }>;
      const unverified = allTotp.filter((f) => f.status === "unverified");
      for (const f of unverified) {
        try {
          await this.supabase.auth.mfa.unenroll({ factorId: f.id });
        } catch {
          // Silently ignore — the factor may already be gone
        }
      }
    } catch {
      // Silently ignore — listFactors may fail if not authenticated
    }
  }

  /**
   * Enroll a new TOTP factor. Cleans up any existing unverified factor first
   * to handle the case where the user abandoned a previous enrollment attempt.
   */
  async enrollTotp(friendlyName: string = 'Aplicación de autenticación') {
    // Clean up any existing unverified TOTP factor first so Supabase doesn't reject
    // with "A factor with this friendly name already exists for this user".
    // TypeScript typing for listFactors() marks totp[] as verified-only, but unverified
    // factors can exist when enrollment was abandoned — use unsafe cast to access them.
    const { data: factors } = await this.supabase.auth.mfa.listFactors();
    const allTotp = factors?.totp as Array<{ id: string; status: string; friendly_name?: string }> | undefined;
    const unverifiedTotp = (allTotp ?? []).find(f => f.status === 'unverified');
    if (unverifiedTotp) {
      try {
        await this.supabase.auth.mfa.unenroll({ factorId: unverifiedTotp.id });
      } catch {
        // Ignore unenroll errors — proceed to enroll regardless.
      }
    }

    const { data, error } = await this.supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName,
    });
    if (error) throw error;
    return data as { id: string; totp: { qr_code: string; secret: string; uri: string } };
  }

  async challengeAndVerifyTotp(factorId: string, code: string) {
    const { data, error } = await this.supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) throw error;
    return data;
  }

  async signInWithPasskey(email?: string) {
    // Generic Passkey login
    try {
        const auth = this.supabase.auth as any;
        
        // Comprobación de capacidad del cliente JS
        if (typeof auth.signInWithWebAuthn !== 'function') {
           console.warn('⚠️ signInWithWebAuthn method missing. Supabase JS Client version might be outdated or shimmed.');
           return { success: false, error: 'CLIENT_UNSUPPORTED' };
        }

        const { data, error } = await auth.signInWithWebAuthn({
          email
        });

        if (error) {
             console.warn('⚠️ Supabase WebAuthn login error:', error);
             if (error.message?.includes('not found') || error.message?.includes('Credential')) {
                 return { success: false, error: 'CREDENTIAL_NOT_FOUND' };
             }
             return { success: false, error: error.message };
        }
        
        return { success: true, data };
    } catch (error: any) {
        console.warn('⚠️ Exception logging in with passkey:', error);
        return { success: false, error: error.message || 'Error de autenticación' };
    }
  }

  // Método auxiliar para operaciones que requieren sesión válida
  private async retryWithSession<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Verificar sesión antes de cada intento
        const { data: { session } } = await this.supabase.auth.getSession();

        if (!session || !session.access_token) {
          console.warn(`🔄 No valid session on attempt ${attempt}, waiting...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));

          // Intentar refrescar la sesión
          await this.supabase.auth.refreshSession();
          continue;
        }

        return await operation();
      } catch (error: any) {
        const isAuthError = error?.message?.includes('JWT') ||
          error?.message?.includes('authorization') ||
          error?.code === '401';

        if (isAuthError && attempt < maxRetries) {
          console.warn(`🔄 Auth error on attempt ${attempt}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }

        throw error;
      }
    }

    throw new Error('Failed to execute operation with valid session after retries');
  }

  // Método auxiliar para reintentar operaciones que fallan por NavigatorLockAcquireTimeoutError
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        const isLockError = error?.message?.includes('NavigatorLockAcquireTimeoutError') ||
          error?.name?.includes('NavigatorLockAcquireTimeoutError');

        if (isLockError && attempt < maxRetries) {
          console.warn(`🔄 Lock error on attempt ${attempt}, retrying in ${baseDelay * attempt}ms...`);
          await new Promise(resolve => setTimeout(resolve, baseDelay * attempt));
          continue;
        }

        // Si no es error de lock o se agotaron los reintentos, re-lanzar el error
        throw error;
      }
    }

    // Esto nunca debería ejecutarse, pero TypeScript lo requiere
    throw new Error('Unexpected error in retryWithBackoff');
  }

  private static readonly APP_USER_CACHE_KEY = 'simplifica_app_user_cache';

  /**
   * C-5: localStorage key for the in-flight PKCE-style state nonce.
   * We store the state when the auth flow is initiated (magic link or signup
   * confirmation) and validate it on the callback. The entry has a TTL — after
   * expiry it's ignored. This blocks session-fixation attacks where an attacker
   * crafts a URL with their own auth tokens and tricks the victim into visiting.
   *
   * NOTE: stored in localStorage (NOT sessionStorage) because clicking the
   * magic-link email opens a NEW tab — sessionStorage is per-tab, so any value
   * written in the originating tab would be invisible to the callback. CSRF
   * protection is preserved because the victim's localStorage has no matching
   * entry (or it's expired/mismatched).
   */
  private static readonly AUTH_FLOW_STATE_KEY = 'simplifica_auth_flow_state';
  private static readonly AUTH_FLOW_STATE_TTL_MS = 10 * 60 * 1000; // 10 min

  /**
   * C-5: Generate a fresh state nonce for an outgoing auth flow and persist it
   * in localStorage with a timestamp. Returns the nonce so the caller can
   * include it in the email redirect URL. The callback component retrieves +
   * removes this entry via consumeAuthFlowState().
   */
  private generateAuthFlowState(flow: 'magic_link' | 'email_confirm'): string {
    const nonce =
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36));
    try {
      localStorage.setItem(
        AuthService.AUTH_FLOW_STATE_KEY,
        JSON.stringify({ nonce, flow, createdAt: Date.now() }),
      );
    } catch {
      // localStorage unavailable — degrade silently; callback will treat
      // missing state as an old flow and fall back to warning + allow.
    }
    return nonce;
  }

  /**
   * C-5: Consume and validate the state returned in the auth callback URL.
   * Returns true if a valid (non-expired, matching) state was found, false
   * otherwise. Removes the entry on any outcome (one-time use).
   *
   * Behavior matrix:
   *   - state in URL AND localStorage AND match + not expired → true (allow)
   *   - state in URL AND localStorage AND mismatch/expired    → false (REJECT)
   *   - state in URL but NOT in localStorage                  → false (REJECT — attack)
   *   - state NOT in URL                                      → null (degraded mode,
   *                                                            let caller decide)
   */
  consumeAuthFlowState(
    stateFromUrl: string | null,
    expectedFlow?: 'magic_link' | 'email_confirm',
  ): boolean | null {
    if (!stateFromUrl) return null;

    let raw: string | null = null;
    try {
      raw = localStorage.getItem(AuthService.AUTH_FLOW_STATE_KEY);
      // Always remove — one-time use
      localStorage.removeItem(AuthService.AUTH_FLOW_STATE_KEY);
    } catch {
      return false;
    }

    if (!raw) return false;

    try {
      const parsed = JSON.parse(raw) as {
        nonce: string;
        flow: string;
        createdAt: number;
      };
      const expired = Date.now() - parsed.createdAt > AuthService.AUTH_FLOW_STATE_TTL_MS;
      if (expired) return false;
      if (expectedFlow && parsed.flow !== expectedFlow) return false;
      return parsed.nonce === stateFromUrl;
    } catch {
      return false;
    }
  }

  /** C-5: Clear any pending auth-flow state (used on explicit logout). */
  clearAuthFlowState(): void {
    try {
      localStorage.removeItem(AuthService.AUTH_FLOW_STATE_KEY);
    } catch {
      /* ignore */
    }
  }

  private async initializeAuth() {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();

      if (session?.user) {
        // Attempt instant hydration from sessionStorage cache to avoid blank screen.
        // The real DB fetch still runs to pick up any changes.
        const hydrated = this._hydrateFromCache(session.user.id);

        if (hydrated) {
          // Sidebar can render immediately — real fetch runs in background
          await this.setCurrentUser(session.user);
        } else {
          // First load (no cache) — blocking fetch as before
          await this.setCurrentUser(session.user);
        }

        // Clean up stale TOTP factors silently (fire-and-forget).
        // Unverified factors happen when enrollment is abandoned
        // (scanned QR but never entered code). They cause 422 errors
        // when the user later tries to verify.
        this.cleanupStaleTotpFactors();
      } else {
        this.clearUserData();
      }
    } catch (error) {
      console.warn('⚠️ Error initializing auth:', error);
    } finally {
      if (!this.setCurrentUserPromise) {
        this.loadingSubject.next(false);
      }
    }
  }

  /**
   * Try to restore AppUser + memberships from sessionStorage.
   * Returns true if hydration succeeded (signals populated, loading=false).
   *
   * H-2: Cache TTL reduced from 5min to 30s to limit the window of stale-role
   * data after a server-side role change (demotion, removal, etc.). The real
   * DB fetch still runs after this and updates signals + cache on success.
   * On DB fetch failure the cache is invalidated (see _doSetCurrentUser).
   */
  private _hydrateFromCache(authId: string): boolean {
    try {
      const raw = sessionStorage.getItem(AuthService.APP_USER_CACHE_KEY);
      if (!raw) return false;

      const cached = JSON.parse(raw) as { authId: string; appUser: AppUser; memberships: CompanyMembership[]; ts: number };

      // Reject if cache is for a different user or older than 30 seconds
      // (was 5 min — H-2 audit fix: shorter window so a server-side role
      // change is picked up on the next load).
      if (cached.authId !== authId) return false;
      if (Date.now() - cached.ts > 30 * 1000) return false;

      // Hydrate all signals instantly
      this.isAuthenticated.set(true);
      this.userProfileSubject.next(cached.appUser);
      this.userProfileSignal.set(cached.appUser);
      this.userRole.set(cached.appUser.role);
      this.isSuperAdmin.set(cached.appUser.role === 'super_admin' || !!cached.appUser.is_super_admin);
      this.isAdmin.set(['admin', 'owner', 'super_admin', 'supervisor'].includes(cached.appUser.role));
      this.companyMemberships.set(cached.memberships);
      if (cached.appUser.company_id) {
        this.companyId.set(cached.appUser.company_id);
        this.currentCompanyId.set(cached.appUser.company_id);
      }

      // Release loading IMMEDIATELY — sidebar renders NOW
      this.loadingSubject.next(false);

      if (!environment.production) { console.log('⚡ AuthService: Hydrated from cache (instant sidebar)'); }
      this._hydratedFromCache = true;

      // Restore professional mode if it was active in the previous session
      this._reapplyProfessionalModeIfNeeded();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * H-2: Explicitly remove the user cache entry. Called when we know the
   * cached data is stale (DB fetch failed, role change detected, etc.) so
   * the next reload doesn't render with the old data.
   */
  private _invalidateUserCache(): void {
    try {
      sessionStorage.removeItem(AuthService.APP_USER_CACHE_KEY);
    } catch { /* ignore */ }
  }

  /** Persist AppUser + memberships to sessionStorage for instant next-load hydration. */
  private _persistToCache(authId: string, appUser: AppUser, memberships: CompanyMembership[]) {
    try {
      sessionStorage.setItem(AuthService.APP_USER_CACHE_KEY, JSON.stringify({
        authId,
        appUser,
        memberships,
        ts: Date.now()
      }));
    } catch { /* quota */ }
  }

  private async handleAuthStateChange(event: string, session: Session | null) {
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
      // F-4.2 Rafter v0.30: a fresh session means any prior "this tab
      // initiated logout" guard is stale. Reset so future cross-tab logout
      // broadcasts (from a different tab) are processed normally.
      this._logoutInProgress = false;
      await this.setCurrentUser(session.user);
    } else if (event === 'SIGNED_OUT') {
      // Fix #4: Clear auth state immediately on SIGNED_OUT to prevent guards from
      // allowing access during the debounce window. Then verify after 800ms — if the
      // session is still active (spurious event), reload the user profile.
      this.clearUserData();
      setTimeout(async () => {
        const { data } = await this.supabase.auth.getSession();
        if (data.session?.user) {
          // Spurious SIGNED_OUT — session still valid, restore profile
          if (!environment.production) { console.log('↩️ Spurious SIGNED_OUT — restoring session'); }
          await this.setCurrentUser(data.session.user);
        }
        // If no session: clearUserData already ran, nothing more to do
      }, 800);
    }
  }

  private setCurrentUser(user: User): Promise<void> {
    // Guard against concurrent calls (e.g. initializeAuth races onAuthStateChange).
    // If already running, return the existing promise instead of starting a new one.
    if (this.setCurrentUserPromise) {
      return this.setCurrentUserPromise;
    }
    this.setCurrentUserPromise = this._doSetCurrentUser(user);
    return this.setCurrentUserPromise;
  }

  private async _doSetCurrentUser(user: User) {
    // Only block the UI if we don't have cached data already displayed
    if (!this._hydratedFromCache) {
      this.loadingSubject.next(true);
    }
    this.currentUserSubject.next(user);
    this.isAuthenticated.set(true);

    try {
    // Verificar si ya existe el usuario antes de llamar ensureAppUser
    const existingAppUser = await this.fetchAppUserByAuthId(user.id, user.email);

    // Evitar creación automática durante el flujo de invitación (/invite):
    // En este flujo, la creación/enlace del usuario la realiza el RPC accept_company_invitation.
    const onInviteFlow = typeof window !== 'undefined' && window.location.pathname.startsWith('/invite');
    if (!existingAppUser && !onInviteFlow) {
      if (!environment.production) { console.log('User not found in app database, creating...'); }
      try {
        await this.ensureAppUser(user);
      } catch (error) {
        console.warn('⚠️ Error ensuring app user exists:', error);
        // No propagar el error para evitar bloqueos en login
      }
    }

      // Cargar datos finales
      let appUser = existingAppUser || await this.fetchAppUserByAuthId(user.id, user.email);
      if (appUser) {
        const syncedOnboardingProfile = await this.syncOnboardingProfileFromMetadata(user, appUser);
        if (syncedOnboardingProfile) {
          appUser = await this.fetchAppUserByAuthId(user.id, user.email) || appUser;
        }

        // H-2: Detect role change between cache and DB. If the user was
        // demoted / promoted / had role permissions changed since the cache
        // was written, log a warning and invalidate the cache so the next
        // reload uses the fresh DB value. This catches stale cache reads
        // before guards / UI build on the old role.
        const previousRole = this.userRole();
        if (this._hydratedFromCache && previousRole && previousRole !== appUser.role) {
          if (!environment.production) {
            console.warn(
              `⚠️ [AuthService] Role changed (cache=${previousRole} → db=${appUser.role}); invalidating cache`,
            );
          }
          this._invalidateUserCache();
        }

        this.userProfileSubject.next(appUser);
        this.userProfileSignal.set(appUser);
        this.userRole.set(appUser.role);

        // CORRECCIÓN SEGURIDAD DOMINIOS:
        // isSuperAdmin SOLO debe ser true si el app_role es super_admin (global).
        // The is_super_admin profile flag is informational only — using it
        // here would let an owner with a stray flag bypass module-level
        // gating in the sidebar. The flag remains for RPC-level audit, not
        // for UI bypasses.
        this.isSuperAdmin.set(appUser.role === 'super_admin');
        
        if (appUser.company_id) {
          this.companyId.set(appUser.company_id);
          this.currentCompanyId.set(appUser.company_id);
        }

        // isAdmin es para permisos de compañía (Owners/Admins)
        this.isAdmin.set(['admin', 'owner', 'super_admin', 'supervisor'].includes(appUser.role));

        // Re-apply professional mode if the user had it active before this auth refresh
        this._reapplyProfessionalModeIfNeeded();

        // Populate favorite signals from user data
        this.favoriteCompanyId.set(appUser.favorite_company_id ?? null);
        this.favoriteProfessionalId.set(appUser.favorite_professional_id ?? null);

        // Auto-select favorite profile on the very first setCurrentUser of the session
        // (with or without cache). Skipped on subsequent calls (tab resume, manual switch,
        // email confirm, etc.) to avoid overriding the user's current selection.
        if (this._isFirstSessionLoad) {
          this._autoSelectFavoriteProfile(appUser);
          this._isFirstSessionLoad = false;
        }

        // Audit: log successful authentication
        this.logAuthEvent('LOGIN', { role: appUser.role, company_id: appUser.company_id });

        // Pre-fetch modules so sidebar has them ready on mount (fire-and-forget)
        this.injector.get(SupabaseModulesService).fetchEffectiveModules().subscribe();
      } else {
      if (!onInviteFlow) {
        console.warn('appUser is null - userProfileSubject NOT updated');
      }
    }
  } catch (error) {
    // H-2: If the DB fetch fails after we hydrated from cache, the cache is
    // almost certainly stale (network outage, server down, schema drift, etc.).
    // Invalidate it so the next reload attempts a clean fetch instead of
    // re-hydrating potentially-incorrect values into the signals.
    if (this._hydratedFromCache) {
      console.warn(
        '⚠️ [AuthService] DB fetch failed after cache hydration — invalidating cache to avoid stale state on next load',
        error,
      );
      this._invalidateUserCache();
    }
    throw error;
  } finally {
    // Always release promise and loading state, even if an error occurs
    this.setCurrentUserPromise = null;
    this._hydratedFromCache = false;
    this.loadingSubject.next(false);
  }
  }

  private async syncOnboardingProfileFromMetadata(authUser: User, appUser: AppUser): Promise<boolean> {
    const metadata = (authUser.user_metadata ?? {}) as Record<string, unknown>;
    const submission = normalizeOnboardingSubmissionData(metadata['onboarding_profile']);
    const userFields = Object.keys(submission.user).length;
    const clientFields = Object.keys(submission.client).length;
    const companyFields = Object.keys(submission.company).length;

    if (!userFields && !clientFields && !companyFields) {
      return false;
    }

    const rawStatus = typeof metadata['onboarding_sync_status'] === 'object' && metadata['onboarding_sync_status'] !== null
      ? (metadata['onboarding_sync_status'] as Record<string, unknown>)
      : {};
    const syncStatus = {
      user: rawStatus['user'] === true,
      client: rawStatus['client'] === true,
      company: rawStatus['company'] === true,
    };

    let didSync = false;
    const nextSyncStatus = { ...syncStatus };

    if (!syncStatus.user && userFields > 0) {
      const userUpdates: Record<string, string> = {};
      if (submission.user.name) userUpdates['name'] = submission.user.name;
      if (submission.user.surname) userUpdates['surname'] = submission.user.surname;

      if (Object.keys(userUpdates).length > 0) {
        const { error } = await this.supabase
          .from('users')
          .update(userUpdates)
          .eq('auth_user_id', authUser.id);
        if (!error) {
          nextSyncStatus.user = true;
          didSync = true;
        } else {
          console.warn('⚠️ Error syncing onboarding user fields:', error);
        }
      } else {
        nextSyncStatus.user = true;
      }
    }

    if (!syncStatus.company && companyFields > 0) {
      if (!submission.company.company_nif) {
        nextSyncStatus.company = true;
      } else if (appUser.role === 'owner' && appUser.company_id) {
        const { error } = await this.supabase
          .from('companies')
          .update({ nif: submission.company.company_nif.toUpperCase() })
          .eq('id', appUser.company_id);
        if (error) {
          console.warn('⚠️ Error syncing onboarding company fields:', error);
        } else {
          nextSyncStatus.company = true;
          didSync = true;
        }
      }
    }

    if (!syncStatus.client && clientFields > 0 && appUser.client_id) {
      const clientUpdates: Record<string, string> = {};
      if (submission.client.phone) clientUpdates['phone'] = submission.client.phone;
      if (submission.client.dni) clientUpdates['dni'] = submission.client.dni.toUpperCase();
      if (submission.client.billing_email) clientUpdates['billing_email'] = submission.client.billing_email;
      if (submission.client.website) clientUpdates['website'] = submission.client.website;
      if (submission.client.business_name) clientUpdates['business_name'] = submission.client.business_name;
      if (submission.client.trade_name) clientUpdates['trade_name'] = submission.client.trade_name;

      if (Object.keys(clientUpdates).length > 0) {
        const { error } = await this.supabase
          .from('clients')
          .update(clientUpdates)
          .eq('id', appUser.client_id);
        if (!error) {
          nextSyncStatus.client = true;
          didSync = true;
        } else {
          console.warn('⚠️ Error syncing onboarding client fields:', error);
        }
      } else {
        nextSyncStatus.client = true;
      }
    }

    if (
      nextSyncStatus.user !== syncStatus.user ||
      nextSyncStatus.client !== syncStatus.client ||
      nextSyncStatus.company !== syncStatus.company
    ) {
      await this.supabase.auth.updateUser({
        data: {
          onboarding_profile: submission,
          onboarding_sync_status: nextSyncStatus,
          onboarding_last_synced_at: new Date().toISOString(),
        },
      });
    }

    return didSync;
  }

  /**
   * Waits for the user profile to be loaded (or for the auth system to settle).
   * Resolves immediately if profile is already available.
   * Resolves to null on timeout (10s) to prevent hanging the UI.
   * Use this after setSession() / login to ensure the guard has profile data before navigating.
   */
  waitForProfile(timeoutMs = 10000): Promise<AppUser | null> {
    if (this.userProfileSignal()) {
      return Promise.resolve(this.userProfileSignal());
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        subscription.unsubscribe();
        resolve(null);
      }, timeoutMs);
      const subscription = this.userProfile$.subscribe((profile) => {
        if (profile !== null) {
          clearTimeout(timer);
          subscription.unsubscribe();
          resolve(profile);
        }
      });
    });
  }

  private clearUserData() {
    this.currentUserSubject.next(null);
    this.userProfileSubject.next(null);
    this.userProfileSignal.set(null);
    this.isAuthenticated.set(false);
    this.isAdmin.set(false);
    this.isSuperAdmin.set(false);
    this.userRole.set('');
    this.companyId.set('');
    // Clear professional mode state
    this.linkedProfessionals.set([]);
    this.isInProfessionalMode.set(false);
    this.activeProfessionalId.set(null);
    this._originalRole = '';
    this._originalIsAdmin = false;
    try { sessionStorage.removeItem('simplifica_professional_mode'); } catch { /* */ }
    // Clear cached modules so sidebar rebuilds on next login / company switch
    try { sessionStorage.removeItem('simplifica_modules_cache'); } catch { /* ignore */ }
    try { sessionStorage.removeItem(AuthService.APP_USER_CACHE_KEY); } catch { /* ignore */ }
    // Reset so the next login runs favorite-profile auto-select on first setCurrentUser.
    this._isFirstSessionLoad = true;
  }

  // Obtiene datos del usuario y sus membresías (Unified Owner + Client)
  private async fetchAppUserByAuthId(authId: string, emailCandidate?: string): Promise<AppUser | null> {
    try {
      const { internalUser, clientRecords } = await this._fetchCoreUserData(authId);

      let allMemberships = this._fetchAndBuildMemberships(internalUser, clientRecords);
      this.companyMemberships.set(allMemberships);
      
      if (allMemberships.length === 0) {
        allMemberships = this._handleNoMemberships(allMemberships, internalUser);
        this.companyMemberships.set(allMemberships);
      }

      const activeMembership = this._determineActiveMembership(allMemberships);

      let appUser: AppUser | null;

      if (activeMembership) {
        appUser = this._buildAppUserForContext(activeMembership, internalUser, clientRecords);
      } else {
        appUser = this._createSuperAdminOrFallbackUser(internalUser);
      }

      // Update State Signals
      if (appUser) {
        this.currentCompanyId.set(appUser.company_id || null);
        this.companyId.set(appUser.company_id || '');
        if (appUser.company_id) {
            try { sessionStorage.setItem('last_active_company_id', appUser.company_id); } catch { /* quota */ }
        } else {
            try { sessionStorage.removeItem('last_active_company_id'); } catch { /* */ }
        }

        // Persist for instant hydration on next page load
        this._persistToCache(authId, appUser, allMemberships);

        // Load professional profiles linked to this user (fire-and-forget — non-blocking)
        if (internalUser?.id) {
          this.supabase
            .from('professionals')
            .select('id, display_name, title, company_id')
            .eq('user_id', internalUser.id)
            .eq('is_active', true)
            .then(({ data: profs }) => {
              const linked = (profs || []).map((p: any) => {
                const mem = allMemberships.find((m: any) => m.company_id === p.company_id);
                return {
                  id: p.id,
                  display_name: p.display_name,
                  title: p.title ?? null,
                  company_id: p.company_id,
                  company_name: mem?.company?.name || '',
                } as LinkedProfessional;
              });
              this.linkedProfessionals.set(linked);

              // Auto-set activeProfessionalId for native professional users.
              // Owners switching to pro mode use switchToProfessionalProfile() instead.
              if (
                this.userRole() === 'professional' &&
                !this.isInProfessionalMode() &&
                !this.activeProfessionalId()
              ) {
                const currentCompany = this.currentCompanyId();
                const matchingProf = linked.find(p => p.company_id === currentCompany);
                if (matchingProf) {
                  this.activeProfessionalId.set(matchingProf.id);
                }
              }
            });
        }
      }
      
      // SECURITY: No email-based bypass. Super-admin status is read from
      // public.users.app_role_id joining to public.app_roles.name = 'super_admin'.
      // If appUser is null here, the user cannot log in as super-admin.
      return appUser;

    } catch (error) {
      console.warn('⚠️ [AuthService] Error in fetchAppUserByAuthId:', error);
      // SECURITY: No email-based bypass on exception. Return null so the
      // caller treats the user as unauthenticated. Super-admin status
      // must come from the DB-backed app_role join.
      return null;
    }
  }

  // SWITCH COMPANY CONTEXT
  async switchCompany(targetCompanyId: string): Promise<boolean> {
    const memberships = this.companyMemberships();
    const target = memberships.find(m => m.company_id === targetCompanyId);

    if (!target || target.status !== 'active') {
      console.warn('Cannot switch to company: membership not found or inactive');
      return false;
    }

    // Exit professional mode before switching company — the re-auth flow would
    // re-apply it from sessionStorage otherwise, trapping the user in pro mode.
    if (this.isInProfessionalMode()) {
      this.isInProfessionalMode.set(false);
      this.activeProfessionalId.set(null);
      this.userRole.set(this._originalRole || 'owner');
      this.isAdmin.set(this._originalIsAdmin);
      this._originalRole = '';
      this._originalIsAdmin = false;
      try { sessionStorage.removeItem('simplifica_professional_mode'); } catch { /* */ }
    }

    // Audit: log company switch
    this.logAuthEvent('COMPANY_SWITCH', { target_company_id: targetCompanyId, from_company_id: this.companyId() });

    // CRITICAL: invalidate the module-effective cache so the sidebar refetches
    // for the new company. Without this, the user would keep seeing the
    // old company's modules in the sidebar after a company switch.
    this.modulesService.clearCache();

    try { sessionStorage.setItem('last_active_company_id', targetCompanyId); } catch { /* quota */ }

    // Reload User Profile in the service
    const currentUser = this.currentUserSubject.value;
    if (currentUser) {
      await this.setCurrentUser(currentUser);
      // Navigate to the intermediate component to trigger a clean state refresh
      this.router.navigate(['/switching-company']);
      return true;
    }
    return false;
  }

  // PROFESSIONAL MODE — allows owner/admin to act as a professional
  switchToProfessionalProfile(professionalId: string): void {
    // Navigate FIRST so the new component instance starts fresh,
    // then update signals after navigation completes to avoid
    // stale/hydration glitches (e.g. calendar flickering on profile switch).
    this.router.navigate(['/reservas']).then(() => {
      this._originalRole = this.userRole();
      this._originalIsAdmin = this.isAdmin();
      this.isInProfessionalMode.set(true);
      this.activeProfessionalId.set(professionalId);
      this.userRole.set('professional');
      this.isAdmin.set(false);
      // Cache the company so callUpsertClientRpc can resolve it even before
      // the async linkedProfessionals query completes after a page reload.
      const prof = this.linkedProfessionals().find(p => p.id === professionalId);
      const companyId = prof?.company_id ?? null;
      this.activeProfessionalCompanyId.set(companyId);
      try {
        sessionStorage.setItem('simplifica_professional_mode', JSON.stringify({
          professionalId,
          originalRole: this._originalRole,
          companyId,
        }));
      } catch { /* quota */ }
    });
  }

  exitProfessionalMode(): void {
    this.isInProfessionalMode.set(false);
    this.activeProfessionalId.set(null);
    this.activeProfessionalCompanyId.set(null);
    this.userRole.set(this._originalRole || 'owner');
    this.isAdmin.set(this._originalIsAdmin);
    this._originalRole = '';
    this._originalIsAdmin = false;
    try { sessionStorage.removeItem('simplifica_professional_mode'); } catch { /* */ }
    this.router.navigate(['/inicio']);
  }

  /** Re-query professionals linked to the current user and update the signal.
   *  Call this after saving a professional that was just linked to the current user. */
  async refreshLinkedProfessionals(): Promise<void> {
    const userId = this.userProfileSignal()?.id;
    if (!userId) return;
    const { data: profs } = await this.supabase
      .from('professionals')
      .select('id, display_name, title, company_id')
      .eq('user_id', userId)
      .eq('is_active', true);
    const memberships = this.companyMemberships();
    const linked = (profs || []).map((p: any) => {
      const mem = memberships.find((m: any) => m.company_id === p.company_id);
      return {
        id: p.id,
        display_name: p.display_name,
        title: p.title ?? null,
        company_id: p.company_id,
        company_name: (mem as any)?.company?.name || '',
      } as LinkedProfessional;
    });
    this.linkedProfessionals.set(linked);
  }

  private _reapplyProfessionalModeIfNeeded(): void {
    try {
      const raw = sessionStorage.getItem('simplifica_professional_mode');
      if (!raw) return;
      const { professionalId, companyId, originalRole } = JSON.parse(raw) as {
        professionalId: string;
        originalRole: string;
        companyId?: string | null;
      };

      // 🛡️ GUARD: if the DB says the user is NOT a professional (owner/admin/etc),
      // clear the stale professional mode from sessionStorage.
      // This fixes a bug where an owner who previously switched to professional mode
      // would get stuck filtering the calendar to only their own professional's bookings.
      const currentRole = this.userRole();
      if (currentRole && currentRole !== 'professional') {
        sessionStorage.removeItem('simplifica_professional_mode');
        return;
      }

      // Save the stored originalRole as the one to restore when exiting pro mode.
      // Falls back to current userRole() for native professionals (where originalRole
      // may not have been explicitly stored yet).
      this._originalRole = originalRole || this.userRole();
      this._originalIsAdmin = this.isAdmin();
      this.isInProfessionalMode.set(true);
      this.activeProfessionalId.set(professionalId);
      // Restore company_id so callUpsertClientRpc has it immediately, before
      // the async linkedProfessionals query resolves (race-condition prevention).
      this.activeProfessionalCompanyId.set(companyId ?? null);
      this.userRole.set('professional');
      this.isAdmin.set(false);
    } catch { /* */ }
  }

  // FAVORITE PROFILE — star a company or professional for default selection on login
  /** Auto-select the user's favorite profile on the very first setCurrentUser of a session.
   *
   *  IMPORTANT: this runs INSIDE _doSetCurrentUser, so we cannot call switchCompany()
   *  here — it would re-enter setCurrentUser() and get short-circuited by the
   *  setCurrentUserPromise guard, leaving the outer call with the original (non-favorite)
   *  appUser. Instead we mutate signals + sessionStorage directly. The outer caller
   *  has not yet reached the LOGIN audit log, so the favorite company_id will be the
   *  one persisted. */
  private _autoSelectFavoriteProfile(appUser: AppUser): void {
    // Favorite company takes precedence over favorite professional
    if (appUser.favorite_company_id) {
      const membership = this.companyMemberships().find(
        (m) => m.company_id === appUser.favorite_company_id && m.status === 'active'
      );
      if (membership) {
        this._applyFavoriteCompanySelection(appUser, membership.company_id);
        return;
      }
    }

    // Fallback: favorite professional
    if (appUser.favorite_professional_id) {
      const linked = this.linkedProfessionals().find(
        (p) => p.id === appUser.favorite_professional_id
      );
      if (linked) {
        this._applyFavoriteProfessionalSelection(appUser, linked.id);
        return;
      }
    }
  }

  /** Switch the active company to the starred favorite without re-entering setCurrentUser.
   *  Mutates signals and sessionStorage in place so the outer _doSetCurrentUser
   *  continues with the favorite already applied. */
  private _applyFavoriteCompanySelection(appUser: AppUser, favoriteCompanyId: string): void {
    // Exit professional mode if the user was in it
    if (this.isInProfessionalMode()) {
      this.isInProfessionalMode.set(false);
      this.activeProfessionalId.set(null);
      this.userRole.set(this._originalRole || 'owner');
      this.isAdmin.set(this._originalIsAdmin);
      this._originalRole = '';
      this._originalIsAdmin = false;
      try { sessionStorage.removeItem('simplifica_professional_mode'); } catch { /* */ }
    }

    // Persist so future reloads (and the post-switch route reload) keep the favorite
    try { sessionStorage.setItem('last_active_company_id', favoriteCompanyId); } catch { /* quota */ }

    // Mutate the appUser object the outer _doSetCurrentUser is holding so the rest of
    // that flow (LOGIN audit, signals) reflects the favorite. This is safe because
    // _doSetCurrentUser has already extracted everything it needs from appUser except
    // for the post-auto-select LOGIN line.
    (appUser as { company_id: string | null }).company_id = favoriteCompanyId;

    // Update active signals immediately so any synchronous reads see the favorite
    this.companyId.set(favoriteCompanyId);
    this.currentCompanyId.set(favoriteCompanyId);

    // Audit
    this.logAuthEvent('COMPANY_SWITCH', {
      target_company_id: favoriteCompanyId,
      from_company_id: appUser.company_id, // already mutated above
    });

    // Trigger a clean state refresh once the outer _doSetCurrentUser finishes
    queueMicrotask(() => this.router.navigate(['/switching-company']));
  }

  /** Switch to a favorite professional profile. */
  private _applyFavoriteProfessionalSelection(appUser: AppUser, favoriteProfessionalId: string): void {
    this.userRole.set('professional');
    this.isInProfessionalMode.set(true);
    this.activeProfessionalId.set(favoriteProfessionalId);
    this.isAdmin.set(false);
    queueMicrotask(() => this.router.navigate(['/reservas']));
  }

  /** Set or clear a favorite company. Pass null to clear. Only one favorite at a time. */
  async setFavoriteCompany(companyId: string | null): Promise<void> {
    const currentUser = this.currentUserSubject.value;
    if (!currentUser) return;

    // Optimistic UI update
    this.favoriteCompanyId.set(companyId);
    this.favoriteProfessionalId.set(null);

    try {
      const { error } = await this.supabase
        .from('users')
        .update({
          favorite_company_id: companyId,
          favorite_professional_id: null, // clear professional when company is set
        })
        .eq('auth_user_id', currentUser.id);

      if (error) throw error;
    } catch (err) {
      console.warn('Failed to persist favorite company:', err);
      // Revert on failure
      const profile = this.userProfileSignal();
      this.favoriteCompanyId.set(profile?.favorite_company_id ?? null);
      this.favoriteProfessionalId.set(profile?.favorite_professional_id ?? null);
    }
  }

  /** Set or clear a favorite professional. Pass null to clear. Only one favorite at a time. */
  async setFavoriteProfessional(professionalId: string | null): Promise<void> {
    const currentUser = this.currentUserSubject.value;
    if (!currentUser) return;

    // Optimistic UI update
    this.favoriteProfessionalId.set(professionalId);
    this.favoriteCompanyId.set(null);

    try {
      const { error } = await this.supabase
        .from('users')
        .update({
          favorite_professional_id: professionalId,
          favorite_company_id: null, // clear company when professional is set
        })
        .eq('auth_user_id', currentUser.id);

      if (error) throw error;
    } catch (err) {
      console.warn('Failed to persist favorite professional:', err);
      // Revert on failure
      const profile = this.userProfileSignal();
      this.favoriteCompanyId.set(profile?.favorite_company_id ?? null);
      this.favoriteProfessionalId.set(profile?.favorite_professional_id ?? null);
    }
  }

  // Asegura que existe fila en public.users y enlaza auth_user_id
  private async ensureAppUser(authUser: User, companyName?: string, companyNif?: string): Promise<void> {
    try {
      if (!environment.production) { console.log('Ensuring app user exists'); }

      // PROTECCIÓN: Verificar si ya hay un registro en progreso para este usuario
      if (this.registrationInProgress.has(authUser.id)) {
        if (!environment.production) { console.log('Registration already in progress, skipping'); }
        return;
      }

      // Marcar como en progreso
      this.registrationInProgress.add(authUser.id);

      try {
        // 1. Buscar por auth_user_id
        const existing = await this.supabase
          .from('users')
          .select('id, auth_user_id, email, company_id')
          .eq('auth_user_id', authUser.id)
          .maybeSingle();

        if (existing.error) {
          console.warn('⚠️ Error checking existing user:', existing.error);
          throw existing.error;
        }

        if (existing.data) {
          // Check if user has active memberships
          const { count } = await this.supabase.from('company_members')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', existing.data.id)
            .eq('status', 'active');

          if (count && count > 0) {
            this.registrationInProgress.delete(authUser.id);
            return;
          }
        }

        const existingUserId = existing.data?.id;


        // 2. Si existe un registro pendiente, delegar en la función de confirmación (backend decide)
        // Solo si NO existe el usuario ya (si existe, asumimos que estamos completando perfil manualmente)
        if (!existingUserId) {
          const pendingRes = await this.supabase
            .from('pending_users')
            .select('company_name, confirmed_at, expires_at')
            .eq('auth_user_id', authUser.id)
            .order('created_at', { ascending: false })
            .maybeSingle();

          if (pendingRes.data && !pendingRes.error) {
            const { data: confirmData, error: confirmErr } = await this.supabase.rpc('confirm_user_registration', {
              p_auth_user_id: authUser.id
            });

            if (confirmErr) {
              console.warn('⚠️ Error in confirm_user_registration:', confirmErr);
            } else if (confirmData?.requires_invitation_approval) {
              return; // Esperar aprobación del owner
            } else if (confirmData?.success) {
              return; // El backend ya creó la empresa y el usuario
            }
            // Si falla, continuamos con la lógica local como fallback
          }
        }

        // 3. Determinar el nombre de empresa deseado (respetar el del formulario si existe)
        // Fix #12: Enforce max length to prevent oversized payloads
        const desiredCompanyName = (companyName ?? '').trim().substring(0, 200);

        // Si tenemos nombre de empresa, comprobar si ya existe para unir como miembro
        // Si tenemos nombre de empresa, comprobar si ya existe para unir como miembro
        if (desiredCompanyName) {
          const { data: existsData, error: existsError } = await this.supabase.rpc('check_company_exists', {
            p_company_name: desiredCompanyName
          });

          if (existsError) {
            console.warn('⚠️ Error checking company existence:', existsError);
            throw existsError;
          }

          const existsRow = Array.isArray(existsData) ? existsData[0] : existsData;

          if (existsRow?.company_exists && existsRow.company_id) {
            // La empresa ya existe: crear usuario como member
            const companyId = existsRow.company_id as string;

            await this.retryWithBackoff(async () => {
              const { data: joinResult, error: joinError } = await this.supabase.rpc('join_company_as_member', {
                p_company_id: companyId
              });

              if (joinError) throw joinError;
              if (joinResult?.success === false) throw new Error(joinResult.error || 'Failed to join company');
              return joinResult;
            });

            return;
          }

          // La empresa no existe: crearla via RPC (SECURITY DEFINER bypasses RLS)

          // Verificar sesión válida antes del RPC
          const { data: { session } } = await this.supabase.auth.getSession();
          if (!session?.access_token) {
            await this.supabase.auth.refreshSession();
          }

          const { data: rpcResult, error: rpcError } = await this.retryWithSession(async () => {
            return await this.supabase.rpc('create_company_with_owner', {
              p_name: desiredCompanyName,
              p_slug: this.generateSlug(desiredCompanyName),
              p_nif: companyNif || null
            });
          });

          if (rpcError) {
            console.warn('⚠️ Error in create_company_with_owner RPC:', rpcError);
            if (rpcError.message?.includes('unique constraint') || rpcError.code === '23505') {
              throw new Error('Ya existe una organización registrada con este nombre. Por favor, elige otro o contacta con soporte si te pertenece.');
            }
            throw rpcError;
          }

          if (rpcResult?.success === false) {
            console.warn('⚠️ RPC returned error:', rpcResult.error);
            throw new Error(rpcResult.error || 'Company creation failed');
          }

          return;

        }

        // 4. Sin nombre de empresa disponible: no crear empresa por defecto para evitar duplicados erróneos
        console.warn('⚠️ No company name provided. Skipping automatic company creation to avoid wrong data.');
        return;

      } finally {
        // Remover la marca de progreso
        this.registrationInProgress.delete(authUser.id);
      }

    } catch (e) {
      // Remover la marca de progreso también en caso de error
      this.registrationInProgress.delete(authUser.id);
      throw e;
    }
  }

  /**
   * Completa el perfil del usuario autenticado si no tiene registro en app/companies.
   * Utilizado en /complete-profile
   */
  async completeProfile(data: OnboardingSubmissionData): Promise<boolean> {
    const user = this.currentUserSubject.value;
    if (!user) return false;

    try {
      const submission = normalizeOnboardingSubmissionData(data);
      const name = submission.user.name ?? '';
      const surname = submission.user.surname ?? '';
      const companyName = submission.company.company_name ?? '';
      const companyNif = submission.company.company_nif ?? '';

      // Actualizar metadata del usuario en Auth (opcional pero útil)
      const { data: updatedAuthData, error: updateAuthError } = await this.supabase.auth.updateUser({
        data: {
          full_name: `${name} ${surname}`.trim(),
          given_name: name || undefined,
          surname: surname || undefined,
          company_name: companyName || undefined,
          onboarding_profile: submission,
          onboarding_sync_status: {
            user: Object.keys(submission.user).length === 0,
            client: Object.keys(submission.client).length === 0,
            company: Object.keys(submission.company).length === 0,
          },
        }
      });
      if (updateAuthError) {
        throw updateAuthError;
      }

      const authUser = updatedAuthData.user ?? user;

      // Asegurar creación de App User y Company
      // Pasamos el usuario actualizado (aunque ensureAppUser usa el ID)
      await this.ensureAppUser(authUser, companyName, companyNif);

      // Forzar recarga del perfil
      await this.setCurrentUser(authUser);

      return !!this.userProfileSubject.value;
    } catch (error) {
      console.warn('⚠️ Error in completeProfile:', error);
      return false;
    }
  }

  // ==========================================
  // MÉTODOS PÚBLICOS DE AUTENTICACIÓN
  // ==========================================



  /**
   * Registro de Passkey para usuario auntenticado
   */
  async registerPasskey() {
    try {
      // Iniciar proceso de registro de WebAuthn
      // Requiere que el usuario esté logueado
      const { data, error } = await this.supabase.auth.mfa.challengeAndVerify({
        factorId: '', // Se deja vacío para iniciar registro
      } as any); // Casting temporal si falta tipado en versión actual

      // NOTA: La implementación exacta puede variar según la versión del cliente de Supabase
      // En versiones recientes: supabase.auth.mfa.enroll({ factorType: 'totp' | 'phone' })
      // Para WebAuthn specifically, suele ser: update user factor.
      
      // Alternativa estándar para WebAuthn registration:
      const { data: webAuthnData, error: webAuthnError } = await this.supabase.auth.updateUser({
        data: {
            // metadata...
        }
      });
      // El soporte completo de registro de Passkeys suele requerir enlace desde el panel de usuario
      // Simplificaremos asumiendo que el login inicial crea el enlace si está habilitado en config

      // Si usamos el método signInWithWebAuthn en modo registro:
       const res = await (this.supabase.auth as any).signInWithWebAuthn({
         email: this.currentUserSubject.value?.email || ''
       });
       
       return { success: !res.error, error: res.error?.message };

    } catch (error: any) {
        return { success: false, error: error.message };
    }
  }

  /**
   * Opción B: Iniciar sesión con Magic Link
   * SECURITY: Enforced 'shouldCreateUser: false' to ensure only invited/existing users can sign in.
   */
  // Rate limiting for magic link: max 5 attempts per email per 60s window
  private magicLinkAttempts = new Map<string, { count: number; resetAt: number }>();

  async signInWithMagicLink(email: string) {
    try {
      // Proper email validation (RFC-lite)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      if (!email || !emailRegex.test(email.trim())) {
          return { success: false, error: 'Email inválido' };
      }

      // Client-side rate limiting per email
      const key = email.trim().toLowerCase();
      const now = Date.now();
      const attempt = this.magicLinkAttempts.get(key);
      if (attempt && now < attempt.resetAt && attempt.count >= 5) {
        const waitSec = Math.ceil((attempt.resetAt - now) / 1000);
        return { success: false, error: `Demasiados intentos. Espera ${waitSec}s.` };
      }
      if (!attempt || now >= attempt.resetAt) {
        this.magicLinkAttempts.set(key, { count: 1, resetAt: now + 60_000 });
      } else {
        attempt.count++;
      }

      // C-5: Generate a fresh PKCE-style state nonce for this login attempt.
      // We include it as a query param on emailRedirectTo so Supabase forwards
      // it to the magic link. The auth-callback component validates the state
      // matches what we stored here before calling setSession(). This blocks
      // session-fixation attacks where an attacker crafts a URL with their
      // own auth code and tricks a victim into visiting it.
      const state = this.generateAuthFlowState('magic_link');

      const { error } = await this.supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?state=${encodeURIComponent(state)}`,
          shouldCreateUser: false // CRITICAL: Solo usuarios existentes (invitados)
        }
      });

      // Anti-enumeration: always add random delay so timing doesn't reveal user existence
      await new Promise(r => setTimeout(r, 500 + Math.random() * 500));

      if (error) {
          // Anti-enumeration: treat all "user doesn't exist" responses as success
          // 422 = signups not allowed, 401 = user not found (shouldCreateUser:false)
          if (error.status === 422 || error.status === 401 ||
              error.message?.includes('Signups not allowed') ||
              error.message?.includes('not authorized')) {
             return { success: true };
          }
          throw error;
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: this.getErrorMessage(error.message) };
    }
  }

  async logout(): Promise<void> {
    try {
      // Audit: log logout before clearing state
      this.logAuthEvent('LOGOUT');
      // Fix #9: Cancel inactivity timer on explicit logout to prevent double-logout
      if (this.inactivityTimer) {
        clearTimeout(this.inactivityTimer);
        this.inactivityTimer = null;
      }
      // Fix #21: Clear registration-in-progress set so re-login works cleanly
      this.registrationInProgress.clear();
      // Clear security caches FIRST to prevent cross-user poisoning
      clearAalCache();
      // C-5: Clear any pending auth-flow state on logout
      this.clearAuthFlowState();
      this.currentCompanyId.set(null);
      try { sessionStorage.removeItem('last_active_company_id'); } catch { /* */ }
      // Clear local state immediately to avoid guards redirecting back to protected routes
      this.clearUserData();
      // Notify SW to purge sensitive API cache before session ends
      if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'LOGOUT' });
      }
      // F-4.2 Rafter v0.30: mark this tab as the logout initiator so the
      // BroadcastChannel listener (in the same tab) ignores its own message.
      this._logoutInProgress = true;
      // Notify sibling tabs BEFORE we tear down our own state so they have
      // a chance to navigate to /login while we still hold a valid session.
      // This is the only piece of state that intentionally escapes the
      // try/catch — a failed post must not block the local cleanup below.
      try {
        this.authBroadcast?.postMessage({ type: 'logout' });
      } catch (e) { /* broadcast optional */ }
      await this.supabase.auth.signOut();
      // F-4.2 Rafter v0.30: Sweep all app-namespaced storage + caches.
      // Done AFTER signOut so Supabase's own auth-token cleanup runs first
      // and we don't race with it. Best-effort: each block try/catches so a
      // single failure (e.g. quota, disabled storage) doesn't skip the rest.
      this.purgeAppStorageAndCaches();
      this.router.navigate(['/login']);
    } catch (error) {
      console.warn('⚠️ Error during logout:', error);
      // Best-effort cleanup even on failure path so we don't leave PII behind.
      try { this.purgeAppStorageAndCaches(); } catch { /* swallow */ }
      // Ensure we redirect even on error
      this.router.navigate(['/login']);
    }
  }

  /**
   * F-4.2 Rafter v0.30: clear every browser-side artifact the app created.
   * Namespaces (not a wholesale wipe — we MUST NOT nuke unrelated browser
   * extension data, Supabase auth cookies, or storage from other origins).
   *
   * localStorage keys cleared:
   *   - simplifica_*          (app cache, exports/imports, theme, secure-storage payloads, search history)
   *   - supabase. / sb-*      (Supabase JS auth tokens — defensive, signOut
   *                            normally removes these but be paranoid)
   *   - app_lang              (UI language)
   *   - company-default-language (admin-set default language)
   *   - sidebar-collapsed     (UI state)
   *   - pwaInstallShown       (PWA banner)
   *   - docs-sidebar-expanded (docs UI state)
   *
   * sessionStorage keys cleared:
   *   - simplifica_*          (professional mode, app user cache, modules cache,
   *                            secure-storage key)
   *   - mfa_stepup_*          (step-up auth timestamps)
   *   - oauth_csrf_nonce / email_oauth_csrf_nonce_* (OAuth + email OAuth CSRF nonces)
   *   - auth_return_to        (post-login redirect target)
   *   - current_company_id    (tenant context)
   *   - last_active_company_id (tenant context)
   *
   * NOTE: auth-flow state (simplifica_auth_flow_state) lives in localStorage
   * since the Rafter v0.25 hotfix — it is captured by the localStorage loop
   * above (matches the simplifica_* prefix).
   *
   * Cache Storage: deletes any cache whose name starts with `ngsw:` (Angular
   * Service Worker) or `simplifica-` (custom SW). Fires-and-forgets so it
   * does not block the navigation.
   */
  private purgeAppStorageAndCaches(): void {
    if (typeof window === 'undefined') return;

    // Collect keys first, mutate after — concurrent modification of
    // localStorage during iteration is a known browser gotcha.
    const lsToRemove: string[] = [];
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        if (
          key.startsWith('simplifica_') ||
          key.startsWith('simplifica-') ||
          key.startsWith('supabase.') ||
          key.startsWith('sb-') ||
          key === 'app_lang' ||
          key === 'company-default-language' ||
          key === 'sidebar-collapsed' ||
          key === 'pwaInstallShown' ||
          key === 'docs-sidebar-expanded'
        ) {
          lsToRemove.push(key);
        }
      }
      for (const k of lsToRemove) {
        try { window.localStorage.removeItem(k); } catch { /* quota / disabled */ }
      }
    } catch { /* localStorage unavailable (private mode, SSR) */ }

    const ssToRemove: string[] = [];
    try {
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i);
        if (!key) continue;
        if (
          key.startsWith('simplifica_') ||
          key.startsWith('simplifica-') ||
          key.startsWith('mfa_stepup_') ||
          key.startsWith('email_oauth_csrf_nonce_') ||
          key === 'oauth_csrf_nonce' ||
          key === 'auth_return_to' ||
          key === 'current_company_id' ||
          key === 'last_active_company_id'
        ) {
          ssToRemove.push(key);
        }
      }
      for (const k of ssToRemove) {
        try { window.sessionStorage.removeItem(k); } catch { /* quota / disabled */ }
      }
    } catch { /* sessionStorage unavailable */ }

    // Service Worker caches: page-side delete so the next page load doesn't
    // rehydrate sensitive API responses from disk. Fires-and-forgets.
    if (typeof caches !== 'undefined') {
      try {
        caches.keys().then((names) => {
          for (const name of names) {
            if (name.startsWith('ngsw:') || name.startsWith('simplifica-')) {
              try { void caches.delete(name); } catch { /* ignore */ }
            }
          }
        }).catch(() => { /* ignore */ });
      } catch { /* ignore */ }
    }
  }


  // ==========================================
  // GESTIÓN DE EMPRESA
  // ==========================================

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // ==========================================
  // UTILIDADES
  // ==========================================

  /** Fire-and-forget auth audit log — uses RPC directly to avoid circular DI */
  private logAuthEvent(action: string, details?: Record<string, any>) {
    const user = this.userProfileSubject.value;
    if (!user) return;
    this.supabase.rpc('gdpr_log_access', {
      user_id: user.id,
      company_id: user.company_id || null,
      action_type: action,
      table_name: 'auth',
      record_id: user.auth_user_id,
      subject_email: user.email,
      purpose: 'Auth audit',
      new_values: details || null
    }).then(({ error }) => {
      if (error && !environment.production) console.warn('Auth audit log failed:', error.message);
    });
  }

  private getErrorMessage(error: string): string {
    const errorMessages: { [key: string]: string } = {
      'Email not confirmed': 'Email no confirmado',
      'User already registered': 'El usuario ya está registrado',
      'Invalid email': 'Email inválido'
    };

    return errorMessages[error] || error;
  }

  // Getters para acceso directo
  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }


  get userProfile(): AppUser | null {
    return this.userProfileSubject.value;
  }

  /**
   * Returns true when the current user is a super-admin per the DB-backed
   * app_role join (public.users.app_role_id -> public.app_roles.name = 'super_admin').
   * SECURITY: no email-based bypass. The previous isRoberto() method was
   * removed because it granted super-admin purely by client-side email match,
   * which is a privilege-escalation vector.
   */
  isEmergencySuperAdmin(): boolean {
    return !!this.userProfileSignal()?.is_super_admin;
  }

  get isLoading(): boolean {
    return this.loadingSubject.value;
  }

  // Método para verificar permisos
  hasPermission(requiredRole: string): boolean {
    // Include 'none' and 'client' as lowest privilege roles
    const roleHierarchy = ['none', 'client', 'member', 'supervisor', 'admin', 'owner'];
    const userRoleIndex = roleHierarchy.indexOf(this.userRole());
    const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);
    return userRoleIndex >= requiredRoleIndex;
  }

  // Forzar recarga (callback auth)
  async refreshCurrentUser() {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (session?.user) await this.setCurrentUser(session.user);
  }

  // ==========================================
  // MÉTODOS DE CONFIRMACIÓN DE EMAIL
  // ==========================================

  /**
   * Confirma el email del usuario usando el token de confirmación
   */
  async confirmEmail(fragmentOrParams: string): Promise<{
    success: boolean;
    error?: string;
    requiresInvitationApproval?: boolean;
    companyName?: string;
    ownerEmail?: string;
    message?: string;
    isOwner?: boolean;
  }> {
    try {

      // Extraer parámetros del fragment o query string
      const params = new URLSearchParams(fragmentOrParams);
      const token = params.get('token');
      const type = params.get('type');

      if (type !== 'signup' || !token) {
        return { success: false, error: 'Token de confirmación inválido o faltante' };
      }

      // Verificar el token con Supabase Auth
      const { data, error } = await this.supabase.auth.verifyOtp({
        token_hash: token,
        type: 'signup'
      });

      if (error) {
        console.warn('⚠️ Email confirmation error:', error);
        return { success: false, error: this.getErrorMessage(error.message) };
      }

      if (!data.user) {
        return { success: false, error: 'No se pudo verificar el usuario' };
      }


      // Ahora confirmar la registración completa usando nuestra función de base de datos
      const { data: confirmResult, error: confirmErr } = await this.supabase
        .rpc('confirm_user_registration', {
          p_auth_user_id: data.user.id
        });

      if (confirmErr) {
        console.error('❌ Error confirming registration:', confirmErr);
        return { success: false, error: 'Error al completar el registro: ' + confirmErr.message };
      }

      const result = confirmResult as any;

      if (!result.success) {
        return { success: false, error: result.error || 'Error desconocido al confirmar registro' };
      }


      // Verificar si requiere aprobación de invitación
      if (result.requires_invitation_approval) {
        return {
          success: true,
          requiresInvitationApproval: true,
          companyName: result.company_name,
          ownerEmail: result.owner_email,
          message: result.message
        };
      }

      // Actualizar el estado de autenticación
      await this.setCurrentUser(data.user);

      return { success: true, isOwner: result.is_owner || false };

    } catch (error: any) {
      console.error('❌ Unexpected error during email confirmation:', error);
      return { success: false, error: error.message || 'Error inesperado' };
    }
  }

  /**
   * Reenvía el email de confirmación
   */
  async resendConfirmation(email?: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Si no se proporciona email, intentar obtenerlo del usuario actual
      const targetEmail = email || this.currentUser?.email;

      if (!targetEmail) {
        return { success: false, error: 'Email requerido para reenviar confirmación' };
      }

      // C-5: Generate state for the confirmation flow. Same defense as magic link —
      // the email-confirmation component validates the state matches what we
      // stored here before calling confirmEmail().
      const state = this.generateAuthFlowState('email_confirm');

      const { error } = await this.supabase.auth.resend({
        type: 'signup',
        email: targetEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?state=${encodeURIComponent(state)}`
        }
      });

      if (error) {
        console.warn('⚠️ Error resending confirmation:', error);
        return { success: false, error: this.getErrorMessage(error.message) };
      }

      return { success: true };

    } catch (error: any) {
      console.warn('⚠️ Unexpected error resending confirmation:', error);
      return { success: false, error: error.message || 'Error inesperado' };
    }
  }

  /**
   * Establecer/actualizar contraseña del usuario actual (cliente)
   * Fix #10: Validates password strength before sending to server.
   */
  async setPassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
    // Password strength validation: min 10 chars, at least one digit, one uppercase, one lowercase
    if (!newPassword || newPassword.length < 10) {
      return { success: false, error: 'La contraseña debe tener al menos 10 caracteres' };
    }
    if (!/[A-Z]/.test(newPassword)) {
      return { success: false, error: 'La contraseña debe contener al menos una letra mayúscula' };
    }
    if (!/[a-z]/.test(newPassword)) {
      return { success: false, error: 'La contraseña debe contener al menos una letra minúscula' };
    }
    if (!/[0-9]/.test(newPassword)) {
      return { success: false, error: 'La contraseña debe contener al menos un número' };
    }
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) return { success: false, error: 'No autenticado' };
      const { error } = await this.supabase.auth.updateUser({ password: newPassword });
      if (error) {
        return { success: false, error: this.getErrorMessage(error.message) };
      }
      this.logAuthEvent('PASSWORD_CHANGE', {});
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Error inesperado' };
    }
  }



  // ========================================
  // GESTIÓN DE INVITACIONES A EMPRESAS
  // ========================================

  /**
   * Verificar si una empresa existe por nombre
   */
  async checkCompanyExists(companyName: string): Promise<{
    exists: boolean;
    company?: {
      id: string;
      name: string;
    };
  }> {
    try {
      const { data, error } = await this.supabase
        .rpc('check_company_exists', {
          p_company_name: companyName
        });

      if (error) {
        console.warn('Error checking company:', error);
        return { exists: false };
      }

      const result = data?.[0];
      if (result?.company_exists) {
        return {
          exists: true,
          company: {
            id: result.company_id,
            name: result.company_name
          }
        };
      }

      return { exists: false };
    } catch (error) {
      console.warn('Error checking company existence:', error);
      return { exists: false };
    }
  }

  /**
   * Invitar usuario a una empresa
   */
  async inviteUserToCompany(data: {
    companyId: string;
    email: string;
    role?: string;
    message?: string;
  }): Promise<{ success: boolean; error?: string; invitationId?: string }> {
    try {
      const { data: result, error } = await this.supabase
        .rpc('invite_user_to_company', {
          p_company_id: data.companyId,
          p_email: data.email,
          p_role: data.role || 'member',
          p_message: data.message
        });

      if (error) {
        console.warn('⚠️ Error inviting user:', error);
        return { success: false, error: error.message };
      }

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return {
        success: true,
        invitationId: result.invitation_id
      };
    } catch (error: any) {
      console.warn('⚠️ Error inviting user:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Aceptar invitación a una empresa
   */
  async acceptInvitation(invitationToken: string, options?: { companyName?: string; companyNif?: string }): Promise<{
    success: boolean;
    error?: string;
    company?: {
      id: string;
      name: string;
    };
    role?: string;
  }> {
    try {
      // Obtener el usuario actual
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) {
        return { success: false, error: 'Usuario no autenticado' };
      }

      const companyName = options?.companyName?.trim() || null;
      const companyNif = options?.companyNif?.trim().toUpperCase() || null;

      const { data: result, error } = await (this.supabase as any)
        .rpc('accept_company_invitation', {
          p_invitation_token: invitationToken,
          p_auth_user_id: user.id,
          p_company_name: companyName,
          p_company_nif: companyNif,
        });

      if (error) {
        console.warn('⚠️ Error accepting invitation:', error);
        return { success: false, error: error.message };
      }

      if (!result.success) {
        // PR 2 (plans-pricing-freemium): translate the new SEAT_LIMIT_EXCEEDED
        // JSON envelope from migration 0003 into a friendly Spanish error
        // including the current/max counts (F-SEAT-003). The RPC preserves
        // the existing `error` field for legacy callers, so we discriminate
        // on the new `code` field instead of string-matching the message.
        if (result.code === 'SEAT_LIMIT_EXCEEDED') {
          const current = (result as any).current;
          const max = (result as any).max;
          return {
            success: false,
            error:
              `Has alcanzado el límite de plazas del plan (${current}/${max} ` +
              `usuarios no-cliente ocupados). Libera una plaza o amplía el plan.`,
          };
        }
        // Fallback: intentar aceptar por email del usuario autenticado
        // Cubre: token inválido/expirado Y usuario sin fila en public.users (new invite flow)
        if (result.error && (result.error.includes('Invalid or expired invitation') || result.error.includes('User not found'))) {
          const email = user.email || '';
          if (email) {
            const { data: res2, error: err2 } = await this.supabase
              .rpc('accept_company_invitation_by_email', {
                p_email: email,
                p_auth_user_id: user.id
              });
            if (!err2 && res2?.success) {
              await this.refreshCurrentUser();
              return {
                success: true,
                company: { id: res2.company_id, name: res2.company_name },
                role: res2.role
              };
            }
          }
        }
        return { success: false, error: result.error };
      }

      // Actualizar el estado del usuario actual
      await this.refreshCurrentUser();

      return {
        success: true,
        company: {
          id: result.company_id,
          name: result.company_name || companyName || ''
        },
        role: result.role
      };
    } catch (error: any) {
      console.warn('⚠️ Error accepting invitation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Enviar invitación por email usando Edge Function + SMTP de Supabase (SES)
   * Utiliza la sesión actual para autorizar y que la función valide owner/admin.
   *
   * `target_tier` solo aplica a invitaciones de `owner` enviadas por un
   * super_admin: hace que la nueva empresa se cree directamente en el plan
   * indicado en lugar de en 'free'. Para cualquier otro caso, el Edge
   * Function fuerza `target_tier = NULL` server-side, así que es seguro
   * enviarlo desde la UI siempre que el rol seleccionado sea 'owner'.
   */
  async sendCompanyInvite(params: { email: string; role?: string; message?: string; resend?: boolean; target_tier?: string }): Promise<{ success: boolean; error?: string; info?: string; token?: string }> {
    if (params.role === 'owner' && !this.userProfileSignal()?.is_super_admin) {
      return { success: false, error: 'No está permitido invitar a un Propietario por seguridad.' };
    }
    try {
      const inviteRole = params.role || 'member';
      // Only forward target_tier when role === 'owner'; the Edge Function
      // will additionally validate the caller is super_admin. Client-side
      // guard keeps the payload minimal and avoids surprising field noise.
      const targetTier = inviteRole === 'owner' && params.target_tier ? params.target_tier : undefined;
      const { data, error } = await this.supabase.functions.invoke('send-company-invite', {
        body: {
          email: params.email,
          role: inviteRole,
          message: params.message || null,
          resend: !!params.resend,
          ...(targetTier ? { target_tier: targetTier } : {}),
          // Pass the portal URL so the function can redirect client invites to the correct origin.
          // In dev this resolves to localhost:4201; in prod to portal.simplificacrm.es.
          ...(inviteRole === 'client' ? { portal_url: environment.portalUrl } : {}),
        },
      });
      if (error) {
        console.warn('⚠️ send-company-invite error:', error);
        const errorContext = (error as any)?.context;
        if (errorContext && typeof errorContext.json === 'function') {
          try {
            const payload = await errorContext.json();
            return {
              success: false,
              error: payload?.message || payload?.error || 'Edge Function error',
              info: payload?.info,
              token: payload?.token,
            };
          } catch {
            // Fall through to the generic error message below.
          }
        }
        // Intentar extraer cuerpo de error si viene del function
        const errMsg = (error as any)?.message || (error as any)?.error || 'Edge Function error';
        return { success: false, error: errMsg };
      }
      // La función ahora devuelve 200 siempre; success=false indica error no fatal
      if (!data?.success) {
        return { success: false, error: data?.message || data?.error || 'Invite failed', info: data?.info, token: data?.token };
      }
      return { success: true, info: data?.info, token: data?.token };
    } catch (e: any) {
      console.warn('⚠️ sendCompanyInvite exception:', e);
      return { success: false, error: e?.message || String(e) };
    }
  }

  /**
   * Recargar perfil de usuario forzando petición a red
   */



  /**
   * Obtener invitaciones pendientes para la empresa actual
   */
  async getCompanyInvitations(): Promise<{
    success: boolean;
    invitations?: any[];
    error?: string;
  }> {
    try {
      const profile = this.userProfile;
      if (!profile) {
        return { success: false, error: 'Usuario no autenticado' };
      }

      // Allow if company_id exists OR if user is admin/owner (Super Admin case)
      if (!profile.company_id && !['admin', 'owner'].includes(profile.role || '')) {
        return { success: false, error: 'Usuario sin empresa asignada' };
      }

      let query = this.supabase
        .from('company_invitations')
        .select('*');

      if (profile?.is_super_admin) {
        // Super Admins ven invitaciones de la empresa actual + invitaciones a Owners (company_id=null) que ellos mismos enviaron
        if (profile.company_id) {
          query = query.or(`company_id.eq.${profile.company_id},and(company_id.is.null,invited_by_user_id.eq.${profile.id})`);
        } else {
          query = query.eq('invited_by_user_id', profile.id);
        }
      } else if (profile?.company_id) {
        query = query.eq('company_id', profile.company_id);
      } else {
        query = query.eq('invited_by_user_id', profile.id);
      }

      const { data, error } = await query
        .neq('status', 'accepted')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('⚠️ Error fetching invitations:', error);
        return { success: false, error: error.message };
      }

      return { success: true, invitations: data || [] };
    } catch (error: any) {
      console.warn('⚠️ Error fetching invitations:', error);
      return { success: false, error: error.message };
    }
  }

  // ========================================
  // GESTIÓN DE USUARIOS DE EMPRESA (Owner/Admin)
  // ========================================

  /**
   * Listar usuarios de la empresa actual
   */
  async listCompanyUsers(): Promise<{ success: boolean; users?: any[]; error?: string }> {
    try {
      const profile = this.userProfileSubject.value;
      if (!profile?.company_id) return { success: false, error: 'Usuario sin empresa' };

      const { data, error } = await this.supabase.rpc('list_company_members', {
        p_company_id: profile.company_id,
      });

      if (error) return { success: false, error: error.message };

      const result = data as { success: boolean; users?: any[]; error?: string };
      return result;
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Actualizar rol o activo de un usuario de la empresa usando RPC con validaciones server-side
   * Reglas:
   * - Solo admin puede asignar rol admin
   * - Owner puede asignar member u owner, pero NO admin  
   * - Admin no puede asignar owner
   * - Nadie puede cambiar su propio rol
   * - Nadie puede desactivarse a sí mismo
   * - Admin no puede modificar roles/estado de owners
   */
  async updateCompanyUser(userId: string, patch: { role?: 'owner' | 'admin' | 'supervisor' | 'member'; active?: boolean }): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await this.supabase.rpc('update_company_user', {
        p_user_id: userId,
        p_role: patch.role ?? null,
        p_active: patch.active ?? null
      });

      if (error) return { success: false, error: error.message };

      // La función RPC devuelve JSON con success y error
      const result = data as { success: boolean; error?: string };
      return result;
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Obtener enlace directo de invitación por ID (usa helper RPC para token y compone URL)
   */
  async getInvitationLink(invitationId: string): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const { data: tokenData, error } = await this.supabase
        .rpc('get_company_invitation_token', { p_invitation_id: invitationId });
      if (error) return { success: false, error: error.message };
      const token = tokenData as string;
      if (!token) return { success: false, error: 'Token no disponible' };
      // Compose redirect URL using current location origin
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const url = `${origin}/invite?token=${encodeURIComponent(token)}`;
      return { success: true, url };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
  /**
   * Actualizar perfil de usuario (nombre, apellido)
   */
  async updateProfile(userId: string, data: { name?: string; surname?: string }): Promise<{ success: boolean; error?: string }> {
    try {
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.surname !== undefined) updateData.surname = data.surname;

      if (Object.keys(updateData).length === 0) return { success: true };

      const { error } = await this.supabase
        .from('users')
        .update(updateData)
        .eq('id', userId);

      if (error) throw error;

      // Actualizar estado local si es el usuario actual
      const current = this.userProfileSubject.value;
      if (current && current.id === userId) {
        this.userProfileSubject.next({ ...current, ...updateData });
      }

      return { success: true };
    } catch (e: any) {
      console.warn('⚠️ Error updating profile:', e);
      return { success: false, error: e?.message || String(e) };
    }
  }

  /**
   * Recargar perfil de usuario forzando petición a red
   */
  async reloadProfile(): Promise<AppUser | null> {
    let currentUser = this.currentUserSubject.value;

    if (!currentUser) {
      const { data } = await this.client.auth.getUser();
      if (data?.user) {
        currentUser = data.user;
        this.currentUserSubject.next(currentUser);
      }
    }

    if (!currentUser) return null;

    this.loadingSubject.next(true);
    try {
      // Invalidar caché (si existiera) y forzar petición
      const profile = await this.fetchAppUserByAuthId(currentUser.id);
      if (profile) {
        this.userProfileSubject.next(profile);
      }
      return profile;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  // =================================================================
  // REFACTOR HELPERS for fetchAppUserByAuthId
  // =================================================================

  private async _fetchCoreUserData(authId: string) {
    // Both queries run in parallel. The users query includes a nested
    // company_members select so we avoid a separate sequential round-trip.
    const [userRes, clientRes] = await Promise.all([
      this.supabase
        .from('users')
        .select(`id, company_id, email, name, surname, active, permissions, auth_user_id, app_role_id,
          favorite_company_id, favorite_professional_id, onboarding_completed,
          app_role:app_roles(name),
          company:companies!users_company_id_fkey(id, name, slug, nif, is_active, settings, logo_url),
          memberships:company_members(id, user_id, company_id, role_id, status, created_at,
            company:companies(id, name, slug, nif, is_active, settings, logo_url),
            role_data:app_roles!role_id(name)
          )`)
        .eq('auth_user_id', authId)
        .limit(1)
        .maybeSingle(),
      this.supabase
        .from('clients')
        .select(`id, auth_user_id, email, name, surname, company_id, is_active, company:companies(id, name, slug, nif, is_active, settings, logo_url)`)
        .eq('auth_user_id', authId)
    ]);

    if (userRes.error) {
      console.error('🔴 [AuthService] _fetchCoreUserData: users query FAILED', JSON.stringify(userRes.error));
    }
    if (!userRes.data) {
      console.warn('🟡 [AuthService] _fetchCoreUserData: users query returned no data for authId:', authId);
    }
    if (clientRes?.error) {
      console.warn('🟡 [AuthService] _fetchCoreUserData: clients query error', JSON.stringify(clientRes.error));
    }

    return { internalUser: userRes.data, clientRecords: clientRes.data || [] };
  }

  private _fetchAndBuildMemberships(internalUser: any, clientRecords: any[]): CompanyMembership[] {
    let allMemberships: CompanyMembership[] = [];

    // 1. Process Internal User Memberships (already fetched in the nested select)
    if (internalUser?.memberships) {
      const internalMemberships = (internalUser.memberships as any[])
        .filter((m: any) => m.status === 'active')
        .map((m: any) => {
          const roleData = Array.isArray(m.role_data) ? m.role_data[0] : m.role_data;
          return {
            id: m.id,
            user_id: m.user_id,
            company_id: m.company_id,
            role: roleData?.name || 'member',
            status: m.status,
            created_at: m.created_at,
            company: Array.isArray(m.company) ? m.company[0] : m.company
          };
        });
      allMemberships.push(...internalMemberships);
    }

    // 2. Process Client "Memberships"
    if (clientRecords.length > 0) {
      const clientMemberships = clientRecords
        .filter((c: any) => c.is_active)
        .map((c: any) => ({
          id: c.id,
          user_id: c.id,
          company_id: c.company_id,
          role: 'client' as 'client',
          status: 'active' as 'active',
          created_at: new Date().toISOString(),
          company: Array.isArray(c.company) ? c.company[0] : c.company
        }));
      allMemberships.push(...clientMemberships);
    }

    return allMemberships;
  }
  
  private _handleNoMemberships(allMemberships: CompanyMembership[], internalUser: any): CompanyMembership[] {
      const onInviteFlow = typeof window !== 'undefined' && window.location.pathname.startsWith('/invite');
      if (onInviteFlow) {
        return allMemberships;
      }
      
      // Legacy user with company_id but no explicit membership
      if (internalUser?.company_id) {
        console.warn('⚠️ User has company_id but no properties in company_members. Creating fallback shim.');
        const rawShimRole = internalUser.app_role;
        const shimRoleData = Array.isArray(rawShimRole) ? rawShimRole[0] : rawShimRole;
        const shimGlobalRole = shimRoleData?.name;
        
        allMemberships.push({
          id: 'legacy-shim-' + internalUser.company_id,
          user_id: internalUser.id,
          company_id: internalUser.company_id,
          role: shimGlobalRole === 'super_admin' ? 'super_admin' : 'member',
          status: 'active',
          created_at: new Date().toISOString(),
          company: {
            id: internalUser.company_id,
            name: 'Empresa (Recuperada)',
            is_active: true,
            slug: null
          } as any
        });
      }
      return allMemberships;
  }

  private _determineActiveMembership(memberships: CompanyMembership[]): CompanyMembership | undefined {
    if (memberships.length === 0) return undefined;

    const storedCid = sessionStorage.getItem('last_active_company_id');
    if (storedCid) {
      const active = memberships.find(m => m.company_id === storedCid);
      if (active) return active;
    }

    // Fallback: Prefer non-client roles first
    return memberships.find(m => m.role !== 'client') || memberships[0];
  }

  private _buildAppUserForContext(
    activeMembership: CompanyMembership,
    internalUser: any,
    clientRecords: any[]
  ): AppUser | null {
    
    if (activeMembership.role === 'client') {
      const clientRecord = clientRecords.find((c: any) => c.company_id === activeMembership.company_id);
      if (!clientRecord) {
        console.warn('⚠️ Critical Logic Error: Client record not found for active membership');
        return null;
      }
      const rawClientRole = internalUser?.app_role;
      const clientRoleData = Array.isArray(rawClientRole) ? rawClientRole[0] : rawClientRole;
      const globalRole = clientRoleData?.name;
      
      return {
        id: clientRecord.id,
        auth_user_id: clientRecord.auth_user_id,
        email: clientRecord.email,
        name: clientRecord.name,
        surname: clientRecord.surname,
        role: globalRole === 'super_admin' ? 'super_admin' : 'client',
        active: clientRecord.is_active,
        company_id: clientRecord.company_id,
        permissions: {},
        full_name: clientRecord.name,
        company: activeMembership.company || null,
        client_id: clientRecord.id,
        is_super_admin: globalRole === 'super_admin',
        app_role_id: internalUser?.app_role_id,
        onboarding_completed: internalUser?.onboarding_completed,
        favorite_company_id: internalUser?.favorite_company_id ?? null,
        favorite_professional_id: internalUser?.favorite_professional_id ?? null,
      };
    } else {
      if (!internalUser) {
        console.warn('⚠️ Critical Logic Error: Internal user data missing for non-client role');
        return null;
      }
      
      const rawAppRole = internalUser.app_role;
      const appRole = Array.isArray(rawAppRole) ? rawAppRole[0] : rawAppRole;
      const globalRoleName = appRole?.name;
      const companyRole = activeMembership.role;

      // SECURITY: super-admin (global, DB-backed) wins over any per-company
      // role. The real super-admin (roberto@simplificacrm.es) has
      // app_role_id pointing to the super_admin role in public.app_roles.
      // Without this precedence, an owner with company_members.role='owner'
      // would shadow the global super_admin and the sidebar would treat
      // them as a plain owner.
      let effectiveRole: string;
      if (globalRoleName === 'super_admin') {
        effectiveRole = 'super_admin';
      } else if (companyRole) {
        effectiveRole = companyRole;
      } else {
        effectiveRole = 'member';
      }

      const linkedClient = clientRecords.find((c: any) => c.auth_user_id === internalUser.auth_user_id);

      return {
        id: internalUser.id,
        auth_user_id: internalUser.auth_user_id,
        email: internalUser.email,
        name: internalUser.name,
        surname: internalUser.surname,
        permissions: internalUser.permissions,
        active: internalUser.active,
        role: effectiveRole as any,
        company_id: activeMembership.company_id || null,
        company: activeMembership.company || null,
        full_name: `${internalUser.name || ''} ${internalUser.surname || ''}`.trim() || internalUser.email,
        is_super_admin: globalRoleName === 'super_admin',
        app_role_id: internalUser.app_role_id,
        client_id: linkedClient?.id || null,
        onboarding_completed: internalUser.onboarding_completed,
        favorite_company_id: internalUser.favorite_company_id ?? null,
        favorite_professional_id: internalUser.favorite_professional_id ?? null,
      };
    }
  }

  private _createSuperAdminOrFallbackUser(internalUser: any): AppUser | null {
      if (!internalUser) return null;

      const rawAppRole = internalUser.app_role;
      const appRoleData = Array.isArray(rawAppRole) ? rawAppRole[0] : rawAppRole;
      const globalRole = appRoleData?.name;

      // SECURITY: super-admin determined solely by app_role.name === 'super_admin'.
      // No email-based bypass.
      const isSuperAdmin = globalRole === 'super_admin';

      if (isSuperAdmin) {
        return {
          id: internalUser.id,
          auth_user_id: internalUser.auth_user_id,
          email: internalUser.email,
          name: internalUser.name,
          surname: internalUser.surname,
          role: 'super_admin',
          active: true,
          company_id: internalUser.company_id || null,
          company: internalUser.company || null,
          permissions: { all: true },
          full_name: `${internalUser.name || ''} ${internalUser.surname || ''}`.trim() || internalUser.email,
          is_super_admin: true,
          app_role_id: internalUser.app_role_id,
          onboarding_completed: internalUser.onboarding_completed,
          favorite_company_id: internalUser.favorite_company_id ?? null,
          favorite_professional_id: internalUser.favorite_professional_id ?? null,
        };
      }

      if (internalUser && !internalUser.company_id) {
          return null; // Guard will handle redirect
      }

      console.warn('⚠️ [AuthService] User is NOT Super Admin and has no membership. Returning null.');
      return null;
  }
}
