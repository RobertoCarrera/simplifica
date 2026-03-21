import { Injectable, inject, signal, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { RuntimeConfigService } from './runtime-config.service';
import { SupabaseClientService } from './supabase-client.service';
import { environment } from '../../environments/environment';

// AppUser refleja la fila de public.users + datos de compañía
export interface AppUser {
  id: string;              // id interno de public.users (no auth id), or client id for portal users
  auth_user_id: string;    // id de auth.users
  email: string;
  name?: string | null;
  surname?: string | null; // Added surname
  role: 'super_admin' | 'owner' | 'admin' | 'member' | 'client' | 'none';
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
}


// Joined data from company_members view or fetch
export interface CompanyMembership {
  id: string; // company_members.id
  user_id: string;
  company_id: string;
  role: 'super_admin' | 'owner' | 'admin' | 'member' | 'client';
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

export interface LoginCredentials {
  email: string;
  password: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient;
  private router = inject(Router);
  private static initializationStarted = false; // Guard para evitar múltiples inicializaciones
  private registrationInProgress = new Set<string>(); // Para evitar registros duplicados

  // Signals para estado reactivo
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  private userProfileSubject = new BehaviorSubject<AppUser | null>(null);
  private loadingSubject = new BehaviorSubject<boolean>(true);
  /** Guard against concurrent setCurrentUser calls (initializeAuth vs onAuthStateChange race). */
  private setCurrentUserInProgress = false;
  private ngZone = inject(NgZone);

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

      // FIX: Pause auto-refresh when tab is hidden to prevent multi-tab token race conditions
      // since we have locks disabled in SupabaseClientService.
      document.addEventListener('visibilitychange', async () => {
        if (document.hidden) {
          if (!environment.production) { console.log('⏸️ Pausing auth auto-refresh (tab hidden)'); }
          this.supabase.auth.stopAutoRefresh();
        } else {
          if (!environment.production) { console.log('▶️ Resuming auth auto-refresh (tab visible)'); }
          // Force check session from storage to ensure we have latest token (from other tabs)
          // before ensuring auto-refresh is running.
          // getSession() will read from localStorage and update internal state if needed.
          await this.supabase.auth.getSession();
          this.supabase.auth.startAutoRefresh();

          const { data } = await this.supabase.auth.getSession();
          if (!data.session) {
            if (!environment.production) { console.log('⚠️ No session found on tab resume - potential logout in other tab.'); }
          }
        }
      });
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

  async unenrollFactor(factorId: string) {
    const { data, error } = await this.supabase.auth.mfa.unenroll({ factorId });
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

  private async initializeAuth() {
    try {
      // Try to refresh session first (in case tokens need refresh after a reload)
      try {
        await this.supabase.auth.refreshSession();
      } catch (refreshErr) {
        console.warn('🔐 AuthService: refresh failed', refreshErr);
        // ignore refresh errors — we'll still try to read any existing session
      }

      const { data: { session } } = await this.supabase.auth.getSession();

      if (session?.user) {
        await this.setCurrentUser(session.user);
      } else {
        // No session found
        this.clearUserData();
      }
    } catch (error) {
      console.warn('⚠️ Error initializing auth:', error);
    } finally {
      // Only flip loading off if setCurrentUser is NOT still running from a
      // concurrent onAuthStateChange('SIGNED_IN') handler. Otherwise the
      // premature false causes guards/layout to evaluate with incomplete state,
      // potentially crashing the browser via redirect loops.
      if (!this.setCurrentUserInProgress) {
        this.loadingSubject.next(false);
      }
    }
  }

  private async handleAuthStateChange(event: string, session: Session | null) {
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
      await this.setCurrentUser(session.user);
    } else if (event === 'SIGNED_OUT') {
      // Debounce spurious SIGNED_OUT events (common with custom storage/migrations)
      // Wait 1s and check if we really have no session
      setTimeout(async () => {
        const { data } = await this.supabase.auth.getSession();
        if (!data.session) {
          console.log('🚪 Confirming SIGNED_OUT after grace period.');
          this.clearUserData();
        } else {
          console.log('⚠️ Ignored spurious SIGNED_OUT event - session is still active.');
        }
      }, 1000);
    }
  }

  private async setCurrentUser(user: User) {
    // Guard against concurrent calls (e.g. initializeAuth races onAuthStateChange).
    // JavaScript is single-threaded, so this check+set is atomic around async points.
    if (this.setCurrentUserInProgress) {
      console.log('🔐 [DEBUG] setCurrentUser already in progress — skipping concurrent call');
      return;
    }
    this.setCurrentUserInProgress = true;
    // Marcar carga mientras resolvemos el perfil de app
    this.loadingSubject.next(true);
    this.currentUserSubject.next(user);
    this.isAuthenticated.set(true);

    try {
    // Verificar si ya existe el usuario antes de llamar ensureAppUser
    const existingAppUser = await this.fetchAppUserByAuthId(user.id, user.email);

    // Evitar creación automática durante el flujo de invitación (/invite):
    // En este flujo, la creación/enlace del usuario la realiza el RPC accept_company_invitation.
    const onInviteFlow = typeof window !== 'undefined' && window.location.pathname.startsWith('/invite');
    if (!existingAppUser && !onInviteFlow) {
      console.log('🔄 User not found in app database, creating...');
      try {
        await this.ensureAppUser(user);
      } catch (error) {
        console.warn('⚠️ Error ensuring app user exists:', error);
        // No propagar el error para evitar bloqueos en login
      }
    }

      // Cargar datos finales
      const appUser = existingAppUser || await this.fetchAppUserByAuthId(user.id, user.email);
      console.log('📋 [DEBUG] Final appUser loaded:', !!appUser);
      
      if (appUser) {
        this.userProfileSubject.next(appUser);
        this.userProfileSignal.set(appUser);
        this.userRole.set(appUser.role);
        
        // CORRECCIÓN SEGURIDAD DOMINIOS:
        // isSuperAdmin SOLO debe ser true si el app_role es super_admin (global)
        this.isSuperAdmin.set(appUser.role === 'super_admin' || !!appUser.is_super_admin);
        
        if (appUser.company_id) {
          this.companyId.set(appUser.company_id);
          this.currentCompanyId.set(appUser.company_id);
        }

        // isAdmin es para permisos de compañía (Owners/Admins)
        this.isAdmin.set(['admin', 'owner', 'super_admin'].includes(appUser.role));
        
        console.log('✅ [DEBUG] isSuperAdmin:', this.isSuperAdmin());
        console.log('✅ [DEBUG] isAdmin:', this.isAdmin());
      } else {
      if (onInviteFlow) {
        console.log('ℹ️ [DEBUG] appUser is null during invite flow - expected until acceptance.');
      } else {
        console.warn('⚠️ [DEBUG] appUser is null - userProfileSubject NOT updated!');
      }
    }
  } finally {
    // Always release flag and loading state, even if an error occurs
    this.setCurrentUserInProgress = false;
    this.loadingSubject.next(false);
    console.log('🏁 [DEBUG] Loading finished: loadingSubject.next(false)');
  }
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
  }

  // Obtiene datos del usuario y sus membresías (Unified Owner + Client)
  private async fetchAppUserByAuthId(authId: string, emailCandidate?: string): Promise<AppUser | null> {
    try {
      console.log('🔄 Fetching app user & memberships');

      const { internalUser, clientRecords } = await this._fetchCoreUserData(authId);
      
      let allMemberships = await this._fetchAndBuildMemberships(internalUser, clientRecords);
      this.companyMemberships.set(allMemberships);
      console.log('🏢 [DEBUG] Unified Memberships count:', allMemberships.length);
      
      if (allMemberships.length === 0) {
        allMemberships = this._handleNoMemberships(allMemberships, internalUser);
      }

      const activeMembership = this._determineActiveMembership(allMemberships);

      let appUser: AppUser | null;

      if (activeMembership) {
        appUser = this._buildAppUserForContext(activeMembership, internalUser, clientRecords);
        console.log(`✅ Active Context: ${appUser?.role === 'client' ? 'CLIENT' : 'STAFF'}`, appUser?.company?.name);
      } else {
        appUser = this._createSuperAdminOrFallbackUser(internalUser);
         if (appUser) {
           console.log('✅ Active Context: SUPER ADMIN (Fallback)');
         }
      }

      // Update State Signals
      if (appUser) {
        this.currentCompanyId.set(appUser.company_id || null);
        this.companyId.set(appUser.company_id || '');
        if (appUser.company_id) {
            localStorage.setItem('last_active_company_id', appUser.company_id);
        } else {
            localStorage.removeItem('last_active_company_id');
        }
      }
      
      return appUser;

    } catch (error) {
      console.warn('⚠️ [AuthService] Error in fetchAppUserByAuthId:', error);
      return null;
    }
  }

  // SWITCH COMPANY CONTEXT
  async switchCompany(targetCompanyId: string): Promise<boolean> {
    const memberships = this.companyMemberships();
    const target = memberships.find(m => m.company_id === targetCompanyId);

    if (!target) {
      console.warn('⚠️ Cannot switch to company: Membership not found', targetCompanyId);
      return false;
    }

    // Update Local Storage
    localStorage.setItem('last_active_company_id', targetCompanyId);

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

  // Asegura que existe fila en public.users y enlaza auth_user_id
  private async ensureAppUser(authUser: User, companyName?: string, companyNif?: string): Promise<void> {
    try {
      console.log('🔄 Ensuring app user exists');

      // PROTECCIÓN: Verificar si ya hay un registro en progreso para este usuario
      if (this.registrationInProgress.has(authUser.id)) {
        console.log('⏳ Registration already in progress for this user, skipping...');
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
            console.log('✅ User already exists and has active memberships');
            this.registrationInProgress.delete(authUser.id);
            return;
          }
          console.log('⚠️ User exists in users table but has no active memberships. Proceeding to ensure links...');
        }

        const existingUserId = existing.data?.id;

        console.log('➕ Ensuring app user and company links...');

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
            console.log('📨 Pending registration found, confirming via RPC...');
            const { data: confirmData, error: confirmErr } = await this.supabase.rpc('confirm_user_registration', {
              p_auth_user_id: authUser.id
            });

            if (confirmErr) {
              console.warn('⚠️ Error in confirm_user_registration:', confirmErr);
            } else if (confirmData?.requires_invitation_approval) {
              console.log(' Invitation approval required. Not creating user/company client-side.');
              return; // Esperar aprobación del owner
            } else if (confirmData?.success) {
              console.log('✅ Registration completed via RPC');
              return; // El backend ya creó la empresa y el usuario
            }
            // Si falla, continuamos con la lógica local como fallback
          }
        }

        // 3. Determinar el nombre de empresa deseado (respetar el del formulario si existe)
        const desiredCompanyName = (companyName ?? '').trim();

        // Si tenemos nombre de empresa, comprobar si ya existe para unir como miembro
        // Si tenemos nombre de empresa, comprobar si ya existe para unir como miembro
        if (desiredCompanyName) {
          console.log('🔎 Checking company existence for:', desiredCompanyName);
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
            console.log('🤝 Company exists. Linking user as member to:', companyId);

            await this.retryWithBackoff(async () => {
              const { data: joinResult, error: joinError } = await this.supabase.rpc('join_company_as_member', {
                p_company_id: companyId
              });

              if (joinError) throw joinError;
              if (joinResult?.success === false) throw new Error(joinResult.error || 'Failed to join company');
              return joinResult;
            });

            console.log('✅ App user created/linked as member via RPC');
            return;
          }

          // La empresa no existe: crearla via RPC (SECURITY DEFINER bypasses RLS)
          console.log('🏢 Creating company via RPC:', desiredCompanyName);

          // Verificar sesión válida antes del RPC
          await new Promise(resolve => setTimeout(resolve, 300));
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
            throw rpcError;
          }

          if (rpcResult?.success === false) {
            console.warn('⚠️ RPC returned error:', rpcResult.error);
            throw new Error(rpcResult.error || 'Company creation failed');
          }

          console.log('✅ Company created via RPC:', rpcResult);
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
  async completeProfile(data: { name: string; surname?: string; companyName: string }): Promise<boolean> {
    const user = this.currentUserSubject.value;
    if (!user) return false;

    try {
      console.log('📝 Completing profile');
      // Actualizar metadata del usuario en Auth (opcional pero útil)
      await this.supabase.auth.updateUser({
        data: {
          full_name: `${data.name} ${data.surname || ''}`.trim(),
          given_name: data.name,
          surname: data.surname,
          company_name: data.companyName
        }
      });

      // Asegurar creación de App User y Company
      // Pasamos el usuario actualizado (aunque ensureAppUser usa el ID)
      await this.ensureAppUser(user, data.companyName);

      // Forzar recarga del perfil
      await this.setCurrentUser(user);

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
  async signInWithMagicLink(email: string) {
    try {
      // NOTE: Do NOT toggle loadingSubject here. The global loading$ controls the
      // responsive-layout @if branch that owns the <router-outlet>. Setting it to
      // true removes the outlet and DESTROYS the calling LoginComponent mid-request,
      // causing the success message to be lost on the destroyed instance.
      // The LoginComponent already has its own local `loading` signal for UI state.

      // Basic client-side email non-empty check
      if (!email || !email.includes('@')) {
          return { success: false, error: 'Email inválido' };
      }

      const { error } = await this.supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: false // CRITICAL: Solo usuarios existentes (invitados)
        }
      });
      if (error) {
          // console.error('Magic Link Error:', error); // Sileced to avoid leaking user existence
          
          // If signups not allowed (422), we return success anyway to not leak info
          // Supabase returns 'Signups not allowed for otp' (422) if user doesn't exist and signups disabled
          if (error.status === 422 || error.message?.includes('Signups not allowed')) {
             return { success: true };
          }
          throw error;
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: this.getErrorMessage(error.message) };
    }
  }

  async login(credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('🔐 Attempting login');
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password
      });

      if (error) throw error;

      console.log('✅ Login success');
      return { success: true };
    } catch (error: any) {
      // console.error('🔐 Login error raw:', error); // Removed to avoid cluttering console on user error
      return {
        success: false,
        error: this.getErrorMessage(error.message)
      };
    }
  }

  async logout(): Promise<void> {
    try {
      // Clear local state immediately to avoid guards redirecting back to protected routes
      // if checking currentUser$ before the debounce fires.
      this.clearUserData();
      // Notify SW to purge sensitive API cache before session ends
      if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'LOGOUT' });
      }
      await this.supabase.auth.signOut();
      this.currentCompanyId.set(null); // Reset company signal
      this.router.navigate(['/login']);
    } catch (error) {
      console.warn('⚠️ Error during logout:', error);
      // Ensure we redirect even on error
      this.router.navigate(['/login']);
    }
  }

  async resetPassword(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: this.getErrorMessage(error.message)
      };
    }
  }

  async updatePassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: this.getErrorMessage(error.message)
      };
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
      .replace(/^-|-$/g, '') + '-' + Date.now();
  }

  // ==========================================
  // UTILIDADES
  // ==========================================

  private getErrorMessage(error: string): string {
    const errorMessages: { [key: string]: string } = {
      'Invalid login credentials': 'Credenciales incorrectas',
      'Email not confirmed': 'Email no confirmado',
      'User already registered': 'El usuario ya está registrado',
      'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres',
      'Password should be at least 6 characters long': 'La contraseña debe tener al menos 6 caracteres',
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

  get isLoading(): boolean {
    return this.loadingSubject.value;
  }

  // Método para verificar permisos
  hasPermission(requiredRole: string): boolean {
    // Include 'none' and 'client' as lowest privilege roles
    const roleHierarchy = ['none', 'client', 'member', 'admin', 'owner'];
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
      console.log('📧 Confirming email with params:', fragmentOrParams);

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

      console.log('✅ Email confirmed');

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

      console.log('✅ Registration confirmed successfully:', result);

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

      const { error } = await this.supabase.auth.resend({
        type: 'signup',
        email: targetEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`
        }
      });

      if (error) {
        console.warn('⚠️ Error resending confirmation:', error);
        return { success: false, error: this.getErrorMessage(error.message) };
      }

      console.log('✅ Confirmation email resent');
      return { success: true };

    } catch (error: any) {
      console.warn('⚠️ Unexpected error resending confirmation:', error);
      return { success: false, error: error.message || 'Error inesperado' };
    }
  }

  /**
   * Establecer/actualizar contraseña del usuario actual (cliente)
   */
  async setPassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) return { success: false, error: 'No autenticado' };
      const { error } = await this.supabase.auth.updateUser({ password: newPassword });
      if (error) {
        return { success: false, error: this.getErrorMessage(error.message) };
      }
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
  async acceptInvitation(invitationToken: string): Promise<{
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

      const { data: result, error } = await this.supabase
        .rpc('accept_company_invitation', {
          p_invitation_token: invitationToken,
          p_auth_user_id: user.id
        });

      if (error) {
        console.warn('⚠️ Error accepting invitation:', error);
        return { success: false, error: error.message };
      }

      if (!result.success) {
        // Fallback: intentar aceptar por email del usuario autenticado (por si el token se perdió en el redirect)
        if (result.error && result.error.includes('Invalid or expired invitation')) {
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
          name: result.company_name
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
   */
  async sendCompanyInvite(params: { email: string; role?: string; message?: string }): Promise<{ success: boolean; error?: string; info?: string; token?: string }> {
    if (params.role === 'owner' && !this.userProfileSignal()?.is_super_admin) {
      return { success: false, error: 'No está permitido invitar a un Propietario por seguridad.' };
    }
    try {
      const { data, error } = await this.supabase.functions.invoke('send-company-invite', {
        body: {
          email: params.email,
          role: params.role || 'member',
          message: params.message || null,
        },
      });
      if (error) {
        console.warn('⚠️ send-company-invite error:', error);
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
      // Query using app_roles relation
      const validRoles = ['owner', 'admin', 'member', 'professional', 'agent'];
      
      const { data, error } = await this.supabase
        .from('users')
        .select(`
          id, 
          email, 
          name, 
          surname,
          active, 
          company_id,
          app_role:app_roles!inner(name)
        `)
        .eq('company_id', profile.company_id)
        .in('app_roles.name', validRoles)
        .order('name', { ascending: true });

      if (error) return { success: false, error: error.message };
      
      // Transform result to include flattened role property for compatibility
      const users = (data || []).map((u: any) => ({
        ...u,
        role: u.app_role?.name
      }));
      
      return { success: true, users };
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
  async updateCompanyUser(userId: string, patch: { role?: 'owner' | 'admin' | 'member'; active?: boolean }): Promise<{ success: boolean; error?: string }> {
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
    const [userRes, clientRes] = await Promise.all([
      this.supabase
        .from('users')
        .select(`id, company_id, email, name, surname, active, permissions, auth_user_id, app_role_id, app_role:app_roles(*)`)
        .eq('auth_user_id', authId)
        .limit(1)
        .maybeSingle(),
      this.supabase
        .from('clients')
        .select(`id, auth_user_id, email, name, surname, company_id, is_active, company:companies(id, name, slug, nif, is_active, settings)`)
        .eq('auth_user_id', authId)
    ]);

    return { internalUser: userRes.data, clientRecords: clientRes.data || [] };
  }

  private async _fetchAndBuildMemberships(internalUser: any, clientRecords: any[]): Promise<CompanyMembership[]> {
    let allMemberships: CompanyMembership[] = [];

    // 1. Process Internal User Memberships
    if (internalUser?.id) {
      const { data: membersData } = await this.supabase
        .from('company_members')
        .select(`id, user_id, company_id, role_id, status, created_at, company:companies(*), role_data:app_roles!role_id(name)`)
        .eq('user_id', internalUser.id)
        .eq('status', 'active');

      const internalMemberships = (membersData || []).map((m: any) => {
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

    const storedCid = localStorage.getItem('last_active_company_id');
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
        app_role_id: internalUser?.app_role_id
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
      
      const effectiveRole = (companyRole && companyRole !== 'super_admin')
        ? companyRole
        : (globalRoleName === 'super_admin' ? 'super_admin' : (companyRole || 'member'));
        
      const linkedClient = clientRecords.find((c: any) => c.auth_user_id === internalUser.auth_user_id);

      return {
        id: internalUser.id,
        auth_user_id: internalUser.auth_user_id,
        email: internalUser.email,
        name: internalUser.name,
        surname: internalUser.surname,
        permissions: internalUser.permissions,
        active: internalUser.active,
        role: effectiveRole,
        company_id: activeMembership.company_id || null,
        company: activeMembership.company || null,
        full_name: `${internalUser.name || ''} ${internalUser.surname || ''}`.trim() || internalUser.email,
        is_super_admin: globalRoleName === 'super_admin',
        app_role_id: internalUser.app_role_id,
        client_id: linkedClient?.id || null
      };
    }
  }

  private _createSuperAdminOrFallbackUser(internalUser: any): AppUser | null {
      if (!internalUser) return null;
      
      const rawAppRole = internalUser.app_role;
      const appRoleData = Array.isArray(rawAppRole) ? rawAppRole[0] : rawAppRole;
      const globalRole = appRoleData?.name;
      
      const isSuperAdmin = globalRole === 'super_admin';
      const isEmergency = internalUser.email === 'roberto@simplificacrm.es';

      if (isSuperAdmin || isEmergency) {
        if(isEmergency && !isSuperAdmin) console.warn('🚨 [AuthService] EMERGENCY OVERRIDE: Forcing Super Admin for roberto@simplificacrm.es');
        
        return {
          id: internalUser.id,
          auth_user_id: internalUser.auth_user_id,
          email: internalUser.email,
          name: internalUser.name,
          surname: internalUser.surname,
          role: 'super_admin',
          active: true,
          company_id: null,
          company: null,
          permissions: { all: true },
          full_name: `${internalUser.name || ''} ${internalUser.surname || ''}`.trim() || internalUser.email,
          is_super_admin: true,
          app_role_id: internalUser.app_role_id
        };
      }
      
      if (internalUser && !internalUser.company_id) {
          console.log('ℹ️ User has a profile but no company_id and no memberships. Redirecting to CompleteProfileComponent.');
          return null; // Guard will handle redirect
      }

      console.warn('⚠️ [AuthService] User is NOT Super Admin and has no membership. Returning null.');
      return null;
  }
}
