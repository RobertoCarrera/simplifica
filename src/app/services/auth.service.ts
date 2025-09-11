import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { SupabaseClientService } from './supabase-client.service';

// AppUser refleja la fila de public.users + datos de compañía
export interface AppUser {
  id: string;              // id interno de public.users (no auth id)
  auth_user_id: string;    // id de auth.users
  email: string;
  name?: string | null;
  role: 'owner' | 'admin' | 'member';
  active: boolean;
  company_id?: string | null;
  permissions?: any;
  // Campos derivados
  full_name?: string | null; // compatibilidad legacy (sidebar, etc.)
  company?: Company | null;
}

export interface Company {
  id: string;
  name: string;
  slug: string | null;
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

export interface RegisterData {
  email: string;
  password: string;
  full_name: string;
  company_name?: string;
  autoLogin?: boolean; // por si se quiere desactivar en algún flujo futuro
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

  // Observables públicos
  currentUser$ = this.currentUserSubject.asObservable();
  userProfile$ = this.userProfileSubject.asObservable();
  loading$ = this.loadingSubject.asObservable();

  // Signals
  isAuthenticated = signal<boolean>(false);
  isAdmin = signal<boolean>(false);
  userRole = signal<string>('');
  companyId = signal<string>('');

  constructor(private sbClient: SupabaseClientService) {
    // Validar que las variables de entorno estén configuradas
    if (!environment.supabase.url || !environment.supabase.anonKey) {
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
      console.log('🔐 AuthService: Inicializando por primera vez...');
      
      // Inicializar estado de autenticación
      this.initializeAuth();

      // Escuchar cambios de sesión (solo una vez)
      this.supabase.auth.onAuthStateChange((event, session) => {
        console.log('🔐 AuthService: Auth state change:', event);
        this.handleAuthStateChange(event, session);
      });
    } else {
      console.log('🔐 AuthService: Ya inicializado, reutilizando instancia');
      this.loadingSubject.next(false);
    }
  }

  // Exponer cliente supabase directamente para componentes de callback/reset
  get client() { return this.supabase; }

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
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session?.user) {
        await this.setCurrentUser(session.user);
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
    } finally {
      this.loadingSubject.next(false);
    }
  }

  private async handleAuthStateChange(event: string, session: Session | null) {
    if (event === 'SIGNED_IN' && session?.user) {
      await this.setCurrentUser(session.user);
    } else if (event === 'SIGNED_OUT') {
      this.clearUserData();
    }
  }

  private async setCurrentUser(user: User) {
    this.currentUserSubject.next(user);
    this.isAuthenticated.set(true);

    // Aseguramos existencia de fila app (sin crear empresa, ya existe)
    await this.ensureAppUser(user);
    // Cargar datos finales
    const appUser = await this.fetchAppUserByAuthId(user.id);
    if (appUser) {
      this.userProfileSubject.next(appUser);
      this.userRole.set(appUser.role);
      if (appUser.company_id) this.companyId.set(appUser.company_id);
  // Sólo admin es considerado admin; owner es rol de negocio sin privilegios dev
  this.isAdmin.set(appUser.role === 'admin');
    }
  }

  private clearUserData() {
    this.currentUserSubject.next(null);
    this.userProfileSubject.next(null);
    this.isAuthenticated.set(false);
    this.isAdmin.set(false);
    this.userRole.set('');
    this.companyId.set('');
  }

  // Obtiene la fila de public.users + compañía
  private async fetchAppUserByAuthId(authId: string): Promise<AppUser | null> {
    try {
      console.log('🔍 Fetching app user for auth ID:', authId);
      const { data, error } = await this.supabase
        .from('users')
        .select(`id, auth_user_id, email, name, role, active, company_id, permissions, company:companies(id, name, slug, is_active, settings)`) // company join via foreign key name assumption
        .eq('auth_user_id', authId)
        .single();
      
      if (error) {
        console.error('❌ Error fetching app user:', error);
        return null;
      }
      if (!data) {
        console.warn('⚠️ No app user found for auth ID:', authId);
        return null;
      }
      
      console.log('✅ App user fetched successfully:', data);
      const company = Array.isArray((data as any).company) ? (data as any).company[0] : (data as any).company;
      const appUser: AppUser = {
        id: (data as any).id,
        auth_user_id: (data as any).auth_user_id,
        email: (data as any).email,
        name: (data as any).name,
        role: (data as any).role,
        active: (data as any).active,
        company_id: (data as any).company_id,
        permissions: (data as any).permissions,
        full_name: (data as any).name || (data as any).email,
        company: company || null
      };
      return appUser;
    } catch (e) {
      return null;
    }
  }

  // Asegura que existe fila en public.users y enlaza auth_user_id
  private async ensureAppUser(authUser: User, companyName?: string): Promise<void> {
    try {
      console.log('🔄 Ensuring app user exists for:', authUser.email);
      
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
          .select('id, auth_user_id, email, role, company_id')
          .eq('auth_user_id', authUser.id)
          .maybeSingle();
      
      if (existing.error) {
        console.error('❌ Error checking existing user:', existing.error);
        throw existing.error;
      }
      
      if (existing.data) {
        console.log('✅ User already exists in app database');
        this.registrationInProgress.delete(authUser.id);
        return; // ya está enlazado
      }

      console.log('➕ Creating new app user...');

      // 2. Crear empresa con el nombre proporcionado o uno por defecto
      let companyId: string | null = null;
      const finalCompanyName = companyName || (authUser.email || 'Mi Empresa').split('@')[0];
      
      console.log('🏢 Creating company:', finalCompanyName);
      
      // DIAGNÓSTICO: Verificar estado de autenticación antes de crear empresa
      // Dar tiempo a que la sesión se establezca
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const { data: { session } } = await this.supabase.auth.getSession();
      console.log('🔍 Session before company creation:', {
        hasSession: !!session,
        userId: session?.user?.id,
        email: session?.user?.email,
        accessToken: session?.access_token ? 'present' : 'missing'
      });
      
      if (!session || !session.access_token) {
        console.error('🚨 No valid session - attempting to refresh...');
        
        // Intentar refrescar la sesión
        const { data: refreshData, error: refreshError } = await this.supabase.auth.refreshSession();
        
        if (refreshError || !refreshData.session) {
          throw new Error('No valid session found when trying to create company and refresh failed');
        }
        
        console.log('✅ Session refreshed successfully');
      }
      
      // Usar retry con validación de sesión para operaciones críticas
      const company = await this.retryWithSession(async () => {
        const { data, error } = await this.supabase
          .from('companies')
          .insert({ name: finalCompanyName, slug: this.generateSlug(finalCompanyName) })
          .select()
          .single();
        
        if (error) {
          console.error('❌ Error creating company:', error);
          
          // Diagnóstico específico para errores RLS
          if (error.code === '42501') {
            console.error('🚨 RLS POLICY VIOLATION: Las políticas RLS están bloqueando la creación de empresa');
            console.error('Ejecuta el script database/fix-rls-simple.sql en Supabase Dashboard');
          }
          
          if (error.message?.includes('JWT') || error.message?.includes('authorization')) {
            console.error('🚨 AUTH TOKEN ISSUE: Problema con el token de autenticación');
          }
          
          throw error;
        }
        
        return data;
      });
      
      if (!company) {
        throw new Error('Company creation returned no data');
      }
      
      if (!company) {
        throw new Error('Company creation returned no data');
      }
      
      companyId = company.id;
      console.log('✅ Company created with ID:', companyId);

      // 4. Crear fila usuario (companyId ya tiene valor garantizado)
      if (!companyId) {
        throw new Error('Company ID is required but was not created');
      }
      
      console.log('👤 Creating user with company_id:', companyId);
      
      // Usar retry para la creación del usuario también
      await this.retryWithBackoff(async () => {
        const insertResult = await this.supabase.from('users').insert({
          email: authUser.email,
          name: (authUser.user_metadata && (authUser.user_metadata as any)['full_name']) || authUser.email?.split('@')[0] || 'Usuario',
          role: 'owner', // Siempre owner ya que cada usuario crea su propia empresa
          active: true,
          company_id: companyId, // Garantizado que no es null
          auth_user_id: authUser.id,
          permissions: {}
        });
        
        if (insertResult.error) {
          console.error('❌ Error creating app user:', insertResult.error);
          throw insertResult.error;
        }
        
        return insertResult;
      });
      
        console.log('✅ App user created successfully');
        
      } finally {
        // Remover la marca de progreso
        this.registrationInProgress.delete(authUser.id);
      }
      
    } catch (e) {
      console.error('❌ Error in ensureAppUser:', e);
      // Remover la marca de progreso también en caso de error
      this.registrationInProgress.delete(authUser.id);
      throw e;
    }
  }

  // ==========================================
  // MÉTODOS PÚBLICOS DE AUTENTICACIÓN
  // ==========================================

  async login(credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('🔐 Attempting login (email):', credentials.email);
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password
      });

      if (error) throw error;

      console.log('✅ Login success, session user id:', data.user?.id);
      return { success: true };
    } catch (error: any) {
      console.error('🔐 Login error raw:', error);
      return {
        success: false,
        error: this.getErrorMessage(error.message)
      };
    }
  }

  async register(registerData: RegisterData): Promise<{ success: boolean; pendingConfirmation?: boolean; error?: string }> {
    try {
      console.log('🚀 Starting registration process...', { email: registerData.email, company: registerData.company_name });
      
      // PROTECCIÓN: Verificar si ya hay un registro en progreso para este email
      if (this.registrationInProgress.has(registerData.email)) {
        console.log('⏳ Registration already in progress for this email, skipping...');
        return { success: false, error: 'Registration already in progress for this email' };
      }
      
      // Marcar como en progreso
      this.registrationInProgress.add(registerData.email);
      
      try {
        // Usar retry para el signup también
      const { data, error } = await this.retryWithBackoff(async () => {
        return await this.supabase.auth.signUp({
          email: registerData.email,
          password: registerData.password,
          options: {
            data: { full_name: registerData.full_name },
            emailRedirectTo: `${window.location.origin}/auth/callback`
          }
        });
      });
      
      if (error) throw error;
      const autoLogin = registerData.autoLogin !== false; // por defecto true

      // Si el proyecto requiere confirmación de email, data.session será null
      const requiresEmailConfirm = !data.session;

      if (data.user) {
        console.log('✅ Auth user created, now creating app user...');
        
        // Si requiere confirmación de email, crear registro pendiente
        if (requiresEmailConfirm) {
          console.log('📧 Email confirmation required, creating pending user record...');
          await this.createPendingUser(data.user, registerData);
          console.log('✅ Pending user record created, waiting for email confirmation...');
          return { success: true, pendingConfirmation: true };
        }
        
        // Si no requiere confirmación, proceder con el flujo normal
        // Si no hay sesión automática, necesitamos establecer una manualmente para crear la empresa
        if (!data.session) {
          console.log('⚠️ No automatic session, attempting manual login...');
          
          // Intentar hacer login automático para establecer la sesión
          const { data: loginData, error: loginError } = await this.retryWithBackoff(async () => {
            return await this.supabase.auth.signInWithPassword({
              email: registerData.email,
              password: registerData.password
            });
          });
          
          if (loginError) {
            console.error('❌ Failed to establish session after registration:', loginError);
            throw loginError;
          }
          
          if (loginData.session) {
            console.log('✅ Session established after manual login');
          }
        }
        
        // Crear fila app con empresa (si se proporciona nombre)
        await this.ensureAppUser(data.user, registerData.company_name);
        console.log('✅ App user created successfully');
      }

      // Si llegamos aquí, el registro se completó sin confirmación de email

      if (autoLogin) {
        // Si ya hay sesión onAuthStateChange disparará setCurrentUser
        // En algunos casos raros: intentar login explícito si no hay session
        if (!data.session) {
          const { error: loginErr } = await this.supabase.auth.signInWithPassword({
            email: registerData.email,
            password: registerData.password
          });
          if (loginErr && loginErr.message !== 'Email not confirmed') throw loginErr;
        }
      }

        return { success: true, pendingConfirmation: false };
      } finally {
        // Remover la marca de progreso
        this.registrationInProgress.delete(registerData.email);
      }
    } catch (e: any) {
      // Remover la marca de progreso también en caso de error
      this.registrationInProgress.delete(registerData.email);
      return { success: false, error: this.getErrorMessage(e.message) };
    }
  }

  async logout(): Promise<void> {
    try {
      await this.supabase.auth.signOut();
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error during logout:', error);
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
    const roleHierarchy = ['member', 'admin', 'owner'];
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
        console.error('❌ Email confirmation error:', error);
        return { success: false, error: this.getErrorMessage(error.message) };
      }
      
      if (!data.user) {
        return { success: false, error: 'No se pudo verificar el usuario' };
      }
      
      console.log('✅ Email confirmed, user:', data.user.id);
      
      // Ahora confirmar la registración completa usando nuestra función de base de datos
      const { data: confirmResult, error: confirmError } = await this.supabase
        .rpc('confirm_user_registration', {
          p_auth_user_id: data.user.id
        });
      
      if (confirmError) {
        console.error('❌ Error confirming registration:', confirmError);
        return { success: false, error: 'Error al completar el registro: ' + confirmError.message };
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
        console.error('❌ Error resending confirmation:', error);
        return { success: false, error: this.getErrorMessage(error.message) };
      }
      
      console.log('✅ Confirmation email resent to:', targetEmail);
      return { success: true };
      
    } catch (error: any) {
      console.error('❌ Unexpected error resending confirmation:', error);
      return { success: false, error: error.message || 'Error inesperado' };
    }
  }

  /**
   * Crea un registro pendiente de confirmación
   */
  private async createPendingUser(authUser: any, registerData: RegisterData): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('pending_users')
        .insert({
          email: registerData.email,
          full_name: registerData.full_name,
          company_name: registerData.company_name,
          auth_user_id: authUser.id,
          confirmation_token: crypto.randomUUID()
        });
      
      if (error) {
        console.error('❌ Error creating pending user:', error);
        throw error;
      }
      
      console.log('✅ Pending user record created');
    } catch (error) {
      console.error('❌ Failed to create pending user:', error);
      throw error;
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
      owner_email: string;
      owner_name: string;
    };
  }> {
    try {
      const { data, error } = await this.supabase
        .rpc('check_company_exists', {
          p_company_name: companyName
        });

      if (error) {
        console.error('❌ Error checking company:', error);
        return { exists: false };
      }

      const result = data?.[0];
      if (result?.company_exists) {
        return {
          exists: true,
          company: {
            id: result.company_id,
            name: result.company_name,
            owner_email: result.owner_email,
            owner_name: result.owner_name
          }
        };
      }

      return { exists: false };
    } catch (error) {
      console.error('❌ Error checking company existence:', error);
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
        console.error('❌ Error inviting user:', error);
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
      console.error('❌ Error inviting user:', error);
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
        console.error('❌ Error accepting invitation:', error);
        return { success: false, error: error.message };
      }

      if (!result.success) {
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
      console.error('❌ Error accepting invitation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener invitaciones pendientes para la empresa actual
   */
  async getCompanyInvitations(): Promise<{
    success: boolean;
    invitations?: any[];
    error?: string;
  }> {
    try {
      const userProfile = this.userProfile;
      if (!userProfile?.company_id) {
        return { success: false, error: 'Usuario sin empresa asignada' };
      }

      const { data, error } = await this.supabase
        .from('admin_company_invitations')
        .select('*')
        .eq('company_id', userProfile.company_id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching invitations:', error);
        return { success: false, error: error.message };
      }

      return { success: true, invitations: data || [] };
    } catch (error: any) {
      console.error('❌ Error fetching invitations:', error);
      return { success: false, error: error.message };
    }
  }
}
